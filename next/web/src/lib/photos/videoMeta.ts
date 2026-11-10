// Size, length and a still frame of a video, read in the browser before upload. The server used to
// get these from ffprobe/ffmpeg; serverless hosting has neither, so the uploading page sends them.
//
// The still is the first of a few points through the clip (10%, 25%, 50%) that is neither black nor a
// flat colour, as the server's picker did; failing that, the most detailed one.

export type VideoMeta = { width: number; height: number; duration: number; poster: string | null };

const MAX_EDGE = 1600;
const MIN_MEAN = 24; // average brightness 0-255 below this reads as black
const MIN_STDEV = 12; // less variation than this is a flat colour

function once(el: HTMLMediaElement, event: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`video ${event} timeout`)), ms);
    el.addEventListener(event, () => { clearTimeout(t); resolve(); }, { once: true });
    el.addEventListener("error", () => { clearTimeout(t); reject(new Error("video error")); }, { once: true });
  });
}

function frameStats(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const data = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, sumSq = 0, n = 0;
  // Every 16th pixel is plenty for a brightness estimate.
  for (let i = 0; i < data.length; i += 64) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += y; sumSq += y * y; n++;
  }
  const mean = n ? sum / n : 0;
  return { mean, stdev: n ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0 };
}

export async function readVideoMeta(file: File): Promise<VideoMeta | null> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await once(v, "loadedmetadata", 15000);
    const width = v.videoWidth, height = v.videoHeight, duration = Number.isFinite(v.duration) ? v.duration : 0;
    if (!width || !height) return { width: 0, height: 0, duration, poster: null };
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const cw = Math.max(1, Math.round(width * scale)), ch = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { width, height, duration, poster: null };
    let best: { url: string; score: number } | null = null;
    for (const frac of duration > 0 ? [0.1, 0.25, 0.5] : [0]) {
      try {
        v.currentTime = Math.min(Math.max(0.05, duration * frac), Math.max(0, duration - 0.05));
        await once(v, "seeked", 8000);
        ctx.drawImage(v, 0, 0, cw, ch);
        const st = frameStats(ctx, cw, ch);
        const shot = canvas.toDataURL("image/jpeg", 0.85);
        if (st.mean >= MIN_MEAN && st.stdev >= MIN_STDEV) return { width, height, duration, poster: shot };
        if (!best || st.stdev > best.score) best = { url: shot, score: st.stdev };
      } catch {
        // seeking failed (some formats in some browsers): try the next point
      }
    }
    return { width, height, duration, poster: best ? best.url : null };
  } catch {
    return null;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}
