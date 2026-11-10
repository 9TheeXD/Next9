// How many files go up at once, found by measuring rather than fixed.
//
// Each upload request sits for a second or two after its last byte while the server stores the file in
// R2, and nothing moves on that request meanwhile. With a fixed three in flight, a fast connection
// spent much of its time with all three waiting on the server. How many it takes to keep the wire busy
// depends on the connection and the files, so this hill-climbs: it measures the bytes actually sent
// over a few seconds, tries one more file at a time, keeps the change while the rate keeps rising, and
// steps back to the best count it has seen once it stops. While holding it re-probes now and then,
// upwards and downwards, so a connection that gets faster or slower mid-run is followed.
//
// Only windows in which the limit was actually the thing holding uploads back are measured; a window
// spent waiting for files to be prepared, or at the tail of a run with nothing left to start, says
// nothing about the count.

const MIN = 2;
const MAX = 12;
const START = 3;
const WINDOW_MS = 4000;
// After the count changes, the files already in flight were started under the old count; give the
// change this long to show up before measuring it.
const SETTLE_MS = 1500;
// A step up is kept only if it beats the best rate by this much: a gain inside the noise is just more
// requests for nothing.
const GAIN = 1.08;
// A step down is kept if it loses no more than this: the same speed over fewer requests is better.
const KEEP_DOWN = 0.97;
const HOLD_WINDOWS = 5;
// While holding, a window this far below the best rate means the network changed, and the search
// restarts from the current count.
const COLLAPSE = 0.6;
const SATURATED_SHARE = 0.75;
const STORE_KEY = "photos_upload_concurrency";

type Phase = "probe-up" | "probe-down" | "hold";

export function createConcurrencyTuner() {
  let limit = START;
  try {
    const saved = Number(localStorage.getItem(STORE_KEY));
    if (saved >= MIN && saved <= MAX) limit = Math.round(saved);
  } catch {}
  let phase: Phase = "probe-up";
  let best: { limit: number; rate: number } | null = null;
  let holds = 0;
  let nextProbeDown = false;

  let windowStart = 0;
  let measureFrom = 0;
  let bytes = 0;
  let ticks = 0;
  let saturatedTicks = 0;

  const restartWindow = (now: number, settle: boolean) => {
    windowStart = now;
    measureFrom = now + (settle ? SETTLE_MS : 0);
    bytes = 0;
    ticks = 0;
    saturatedTicks = 0;
  };
  const setLimit = (n: number, now: number) => {
    const clamped = Math.max(MIN, Math.min(MAX, n));
    const changed = clamped !== limit;
    limit = clamped;
    restartWindow(now, changed);
    return changed;
  };
  const remember = () => {
    try {
      localStorage.setItem(STORE_KEY, String(best ? best.limit : limit));
    } catch {}
  };

  const decide = (rate: number, now: number) => {
    if (phase === "hold") {
      if (best && rate < best.rate * COLLAPSE) {
        // The connection is not what it was: measure this count afresh and search from here.
        best = { limit, rate };
        phase = "probe-up";
        holds = 0;
        if (!setLimit(limit + 1, now)) phase = "hold";
        return;
      }
      if (best) best.rate = best.rate * 0.5 + rate * 0.5;
      if (++holds < HOLD_WINDOWS) return restartWindow(now, false);
      holds = 0;
      const down = nextProbeDown;
      nextProbeDown = !nextProbeDown;
      phase = down ? "probe-down" : "probe-up";
      if (!setLimit(limit + (down ? -1 : 1), now)) phase = "hold";
      return;
    }
    if (!best) {
      best = { limit, rate };
      if (!setLimit(limit + 1, now)) phase = "hold";
      return;
    }
    const better = phase === "probe-up" ? rate > best.rate * GAIN : rate >= best.rate * KEEP_DOWN;
    if (better) {
      best = { limit, rate };
      remember();
      // Keep going the same way while it pays.
      if (!setLimit(limit + (phase === "probe-up" ? 1 : -1), now)) phase = "hold";
      return;
    }
    phase = "hold";
    holds = 0;
    setLimit(best.limit, now);
    remember();
  };

  return {
    get limit() {
      return limit;
    },
    // Bytes that left the browser, from the XHR progress events of every file in flight.
    sent(n: number) {
      if (n > 0 && Date.now() >= measureFrom) bytes += n;
    },
    // Called on a steady beat. `saturated` is whether, at this moment, more files were waiting to
    // start and every slot was taken with bytes ready to send — the only state the count is the
    // bottleneck in.
    tick(saturated: boolean) {
      const now = Date.now();
      if (!windowStart) return restartWindow(now, false);
      if (now < measureFrom) return;
      ticks++;
      if (saturated) saturatedTicks++;
      if (now - measureFrom < WINDOW_MS) return;
      const rate = bytes / ((now - measureFrom) / 1000);
      if (ticks && saturatedTicks / ticks >= SATURATED_SHARE) decide(rate, now);
      else restartWindow(now, false);
    },
  };
}
