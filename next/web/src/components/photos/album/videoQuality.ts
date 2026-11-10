// Video quality ladder for the viewer's player (server: "Video renditions" in server.js).
//
// Each quality is a separate MP4; picking one swaps the player's source and carries on from the same
// moment. Auto chooses the best one the screen can show and the connection can carry:
//   - never taller than the viewport needs (in device pixels), since more would only cost data;
//   - the highest whose bitrate fits within the measured bandwidth with headroom;
//   - a stall steps down one rung; a well-filled buffer on a fast link steps back up.
// Bandwidth is measured from how fast the buffer grows while the video downloads, and remembered
// between videos (and visits) so the next one starts at a sensible quality.

import { lsGet, lsSet } from "@/lib/photos/util";

export type Rung = {
  variant: string; // "original" | "v720" ...
  height: number | null;
  fps: number | null;
  label: string | null; // "1080p60"
  badge: string | null; // "HD" | "2K" | "4K" | "8K" | null
  status?: "ready" | "queued";
  size_bytes: number | null;
};
export type QualityList = { duration: number | null; original: Rung; renditions: Rung[] };
export type QualityPref = "auto" | "original" | number; // number = a rung height

const PREF_KEY = "next9.videoQuality";
const BW_KEY = "next9.videoBandwidth";

export function readPref(): QualityPref {
  const v = lsGet(PREF_KEY);
  if (!v || v === "auto") return "auto";
  if (v === "original") return "original";
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : "auto";
}
export function writePref(p: QualityPref) {
  lsSet(PREF_KEY, String(p));
}

// Bits per second, from the file size when known, else a typical figure for the rung.
const TYPICAL_MBPS: Record<number, number> = { 144: 0.2, 360: 0.8, 720: 2.5, 1080: 5, 1440: 10, 2160: 20, 4320: 50 };
export function bitrate(r: Rung, duration: number | null) {
  if (r.size_bytes && duration && duration > 0) return (r.size_bytes * 8) / duration;
  const h = r.height || 1080;
  const near = Object.keys(TYPICAL_MBPS)
    .map(Number)
    .reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a));
  return TYPICAL_MBPS[near] * 1e6 * ((r.fps || 30) > 31 ? 1.5 : 1);
}

export function readBandwidth(): number {
  const saved = Number(lsGet(BW_KEY));
  if (saved > 0) return saved;
  const c = (navigator as unknown as { connection?: { downlink?: number } }).connection;
  if (c?.downlink) return c.downlink * 1e6;
  return 4e6;
}
export function saveBandwidth(bps: number) {
  if (bps > 0 && Number.isFinite(bps)) lsSet(BW_KEY, String(Math.round(bps)));
}

// Playable qualities, highest first: the finished rungs plus the original.
export function playable(list: QualityList): Rung[] {
  const ready = list.renditions.filter((r) => r.status === "ready");
  return [list.original, ...ready].sort((a, b) => (b.height || 99999) - (a.height || 99999));
}

// Shortest side the player needs, in device pixels (the viewer fills the window).
export function neededShortSide() {
  return Math.min(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
}

export function pickAuto(list: QualityList, bw: number): Rung {
  const all = playable(list);
  const need = neededShortSide();
  // Tallest the screen can use: the smallest rung at least as tall as needed, or the top one.
  const fitting = all.filter((r) => !r.height || r.height <= need * 1.15);
  const screenCap = fitting.length ? fitting : [all[all.length - 1]];
  const affordable = screenCap.filter((r) => bitrate(r, list.duration) * 1.4 <= bw);
  return affordable[0] || screenCap[screenCap.length - 1];
}

export function pickFixed(list: QualityList, pref: QualityPref): Rung {
  const all = playable(list);
  if (pref === "original") return list.original;
  if (typeof pref === "number") {
    // The chosen height, else the nearest lower one available, else the lowest.
    return all.find((r) => (r.height || 0) <= pref) || all[all.length - 1];
  }
  return list.original;
}

// One step down/up the playable ladder from the current rung.
export function neighbour(list: QualityList, cur: Rung, dir: -1 | 1): Rung | null {
  const all = playable(list); // highest first
  const i = all.findIndex((r) => r.variant === cur.variant);
  if (i < 0) return null;
  const j = dir === -1 ? i + 1 : i - 1;
  return all[j] || null;
}

export function rungTitle(r: Rung) {
  return r.label || (r.variant === "original" ? "ต้นฉบับ" : r.variant);
}
