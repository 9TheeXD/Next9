// The numbers shown while an upload runs: size sent / total, speed, time left.
//
// These used to be computed inside the XHR progress events from whatever happened to be known at
// that instant, and a figure was only in the markup when it could be computed. So the total was the
// sum of the ORIGINAL file sizes and was rewritten every time a file finished compressing, the speed
// only existed once two samples were far enough apart, and every figure vanished from the row while
// a file was being prepared. Figures appearing and disappearing is what made the panel flicker.
//
// This holds one set of numbers and only ever overwrites them:
//   - the total is estimated from the picked files before anything is compressed, and corrected as
//     the real compressed sizes arrive;
//   - the speed is a smoothed rate and is allowed to read 0 while nothing is on the wire;
//   - the time left keeps running off the last rate that was actually observed, so the pause while a
//     file is compressed leaves it counting down instead of blanking it.
// A ticker emits on a fixed beat rather than once per progress event, so the panel re-renders at a
// steady cadence and every field is always present.
//
// A meter belongs to ONE upload run and is thrown away with it. It used to live as long as the album
// page did, so a run that ended without clearing it left its files sitting in the next run's total —
// one of the ways the total could read tens of megabytes more than the files being sent.

const TICK_MS = 500;
// Rate window. Long enough that one slow chunk does not swing the figure, short enough that the
// speed still reacts when the connection changes.
const RATE_WINDOW_MS = 4000;
// The speed the very first time-left estimate is based on, before any byte has moved. The measured
// rate of the last upload from this browser is a far better guess than a constant, so it is kept.
const BOOTSTRAP_BPS_KEY = "photos_upload_bps";
const BOOTSTRAP_BPS_DEFAULT = 1.5 * 1024 * 1024;

// Expected size after compression, as a share of the picked file, per quality/format answer. Rough
// on purpose: it only has to put the total in the right place until files have actually been
// compressed, after which the real sizes take over.
const QUALITY_RATIO: Record<string, number> = { original: 1, fhd: 0.34, hd: 0.17 };
const FORMAT_RATIO: Record<string, number> = { keep: 1, jpg: 0.92, webp: 0.62, png: 2.4 };
// What a photo re-encoded to that long edge actually tends to weigh. Past a point the source size
// stops predicting the result — a 6 MB camera JPEG and a 20 MB one both come out of a 1920 px resize
// at much the same weight — so the share above is capped by it.
const QUALITY_TARGET_BYTES: Record<string, number> = { fhd: 800 * 1024, hd: 360 * 1024 };

export function estimateUploadBytes(rawBytes: number, quality: string, format: string, isVideo: boolean) {
  if (isVideo) return rawBytes;
  if (quality === "original" && format === "keep") return rawBytes;
  let est = rawBytes * (QUALITY_RATIO[quality] ?? 1);
  const cap = QUALITY_TARGET_BYTES[quality];
  if (cap) est = Math.min(est, cap);
  est *= FORMAT_RATIO[format] ?? 1;
  // Never guess that a file will grow. Re-encoding sometimes does come out larger than what was
  // picked, but a guess that says so only inflates the total, and the real size lands moments later.
  return Math.max(1, Math.round(Math.min(est, rawBytes)));
}

export function willCompress(quality: string, format: string, isVideo: boolean) {
  return !isVideo && !(quality === "original" && format === "keep");
}

// How many files must be measured before the projected total is trusted enough to be shown as a
// number rather than a spinner...
const CALIBRATION_FILES = 3;
// ...and how closely those measurements have to agree. One file that compresses to nothing like the
// others (an image the browser could not decode, so it goes up exactly as it was picked) must not
// drag every remaining file's estimate with it; with a spread this wide the total stays a spinner.
const CALIBRATION_SPREAD = 2.5;

export type MeterView = {
  sent: number;
  total: number;
  // True while the total is still being worked out. The panel then shows a spinner where the total
  // goes: a number that is about to change is exactly what must never be on screen.
  provisional: boolean;
  bps: number;
  etaSec: number;
};

type Entry = { raw: number; est: number; actual: number | null; loaded: number; done: boolean; guessed: boolean };

export function createUploadMeter(emit: (v: MeterView) => void) {
  const files = new Map<string, Entry>();
  // Compression ratios actually achieved, so files not yet prepared can be estimated from this
  // upload's own photos. The MEDIAN is used, never the mean: a run is usually one folder from one
  // camera, so the middle measurement describes the rest, while a single file that failed to
  // compress (ratio 1) pulls a mean up far enough to multiply the whole total on its own.
  const ratios: number[] = [];
  const samples: { t: number; b: number }[] = [];
  let bps = 0;
  // The last rate that was really observed. Time left is computed from this, never from the
  // displayed speed, so it keeps counting while a file is being compressed and nothing is moving.
  let etaBps = 0;
  let etaSec = 0;
  let lastTick = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let bestBps = 0;

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  // Null until enough files agree. Each ratio is capped at 1 first: a file that grew under
  // re-encoding says nothing about how far the others will shrink.
  const projection = () => {
    if (ratios.length < CALIBRATION_FILES) return null;
    const capped = ratios.map((r) => Math.min(1, r));
    const lo = Math.min(...capped),
      hi = Math.max(...capped);
    if (hi > Math.max(lo, 1e-6) * CALIBRATION_SPREAD) return null;
    return median(capped);
  };

  const totals = () => {
    const proj = projection();
    let total = 0,
      sent = 0,
      unmeasured = false;
    files.forEach((f) => {
      let size: number;
      if (f.actual !== null) size = f.actual;
      else {
        if (f.guessed) unmeasured = true;
        // A projection from this run's own files beats the table, but every file is still capped at
        // what was picked, so no measurement can make the total run away.
        size = f.guessed && proj !== null ? Math.max(1, Math.min(f.raw, Math.round(f.raw * proj))) : f.est;
      }
      total += size;
      sent += f.done ? size : Math.min(f.loaded, size);
    });
    return { total, sent, provisional: unmeasured && proj === null };
  };

  const view = (): MeterView => ({ ...totals(), bps, etaSec });
  const push = () => emit(view());

  function bootstrapBps() {
    try {
      const v = parseFloat(localStorage.getItem(BOOTSTRAP_BPS_KEY) || "");
      if (isFinite(v) && v > 1024) return v;
    } catch {}
    return BOOTSTRAP_BPS_DEFAULT;
  }

  const tick = () => {
    const now = Date.now();
    const dt = lastTick ? (now - lastTick) / 1000 : 0;
    lastTick = now;
    const { total, sent } = totals();

    samples.push({ t: now, b: sent });
    while (samples.length > 2 && now - samples[0].t > RATE_WINDOW_MS) samples.shift();
    const first = samples[0],
      last = samples[samples.length - 1];
    const span = (last.t - first.t) / 1000;
    if (span >= 0.6) {
      const measured = Math.max(0, (last.b - first.b) / span);
      // Smoothed both ways, so the figure settles instead of stepping around with every window.
      bps = bps ? bps * 0.6 + measured * 0.4 : measured;
      if (measured > 0) {
        etaBps = etaBps ? etaBps * 0.7 + measured * 0.3 : measured;
        bestBps = Math.max(bestBps, etaBps);
      }
    }

    // Time left: it always runs down on its own, and a fresh estimate eases it rather than replacing
    // it, so the figure moves like a clock instead of jumping every time the rate is re-measured.
    if (dt > 0 && etaSec > 0) etaSec = Math.max(1, etaSec - dt);
    const rate = etaBps || bootstrapBps();
    if (rate > 0) {
      const target = Math.max(1, (total - sent) / rate);
      if (!etaSec) etaSec = target;
      else if (Math.abs(target - etaSec) > Math.max(3, etaSec * 0.25)) etaSec = etaSec * 0.45 + target * 0.55;
    }
    push();
  };

  return {
    // Every picked file, with what it is expected to weigh once prepared. Called again for files
    // dropped onto a running upload; the total grows, it is never rebuilt.
    addFiles(list: { key: string; raw: number; quality: string; format: string; isVideo: boolean }[]) {
      list.forEach((f) => {
        if (files.has(f.key)) return;
        files.set(f.key, {
          raw: f.raw,
          est: estimateUploadBytes(f.raw, f.quality, f.format, f.isVideo),
          actual: null,
          loaded: 0,
          done: false,
          guessed: willCompress(f.quality, f.format, f.isVideo),
        });
      });
      if (timer) push();
    },
    // A file has been prepared and its real size is known. It replaces that file's own guess and
    // joins the sample the others are projected from; it never rewrites their estimates directly.
    noteCompressed(key: string, bytes: number) {
      const f = files.get(key);
      if (!f || f.actual !== null) return;
      f.actual = Math.max(0, bytes);
      if (f.guessed && f.raw > 0) ratios.push(f.actual / f.raw);
      push();
    },
    setLoaded(key: string, bytes: number) {
      const f = files.get(key);
      if (f) f.loaded = bytes;
    },
    finish(key: string) {
      const f = files.get(key);
      if (!f) return;
      f.done = true;
      f.loaded = f.actual ?? f.est;
      push();
    },
    // A file that will not be sent after all is no longer part of the job: it must not sit in the
    // total as bytes that will never arrive, or the readout can never reach its own total.
    drop(key: string) {
      files.delete(key);
      push();
    },
    view,
    start() {
      if (timer) return;
      lastTick = Date.now();
      samples.length = 0;
      samples.push({ t: lastTick, b: totals().sent });
      timer = setInterval(tick, TICK_MS);
      tick();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      // Remembered for the next upload's opening estimate.
      try {
        if (bestBps > 1024) localStorage.setItem(BOOTSTRAP_BPS_KEY, String(Math.round(bestBps)));
      } catch {}
      files.clear();
      samples.length = 0;
      ratios.length = 0;
      bps = etaBps = etaSec = 0;
      bestBps = 0;
    },
  };
}

export type UploadMeter = ReturnType<typeof createUploadMeter>;
