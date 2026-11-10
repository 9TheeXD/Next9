// Small helpers shared by the photos pages, ported from the legacy photos pages and folders.js.

export const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString("th-TH");

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const v = document.cookie.match("(^|;) ?" + name + "=([^;]*)(;|$)");
  return v ? decodeURIComponent(v[2]) : null;
}

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export const authToken = () => getCookie("photos_token") || lsGet("photos_token") || "";

export function formatShortDate(ts: number | null | undefined) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export function timeAgo(ts: number | null | undefined) {
  if (!ts) return "";
  const now = Date.now();
  const diff = Math.max(0, now - ts);
  const day = 24 * 60 * 60 * 1000,
    month = 30 * day,
    year = 365 * day;
  if (diff < day) {
    if (new Date(now).toDateString() === new Date(ts).toDateString()) return "แก้ไขล่าสุด วันนี้";
    return "แก้ไขล่าสุด 1 วันที่แล้ว";
  }
  if (diff < month) return `แก้ไขล่าสุด ${Math.max(1, Math.floor(diff / day))} วันที่แล้ว`;
  if (diff < year) return `แก้ไขล่าสุด ${Math.max(1, Math.floor(diff / month))} เดือนที่แล้ว`;
  return `แก้ไขล่าสุด ${Math.max(1, Math.floor(diff / year))} ปีที่แล้ว`;
}

// Longest edge (px) -> small grid badge label
export function resBadgeLabel(w?: number | null, h?: number | null) {
  const m = Math.max(w || 0, h || 0);
  if (m >= 7680) return "8K";
  if (m >= 5120) return "5K";
  if (m >= 3840) return "4K";
  if (m >= 1920) return "FHD";
  if (m >= 1600) return "HD+";
  if (m >= 1280) return "HD";
  return "SD";
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const BYTE_UNIT_DECIMALS = [0, 0, 1, 2, 2];
// Picks the unit that fits the value (850 KB, not 0.85 MB; 2.3 GB, not 2355 MB).
export function fmtBytes(bytes: number) {
  bytes = Math.max(0, bytes || 0);
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < BYTE_UNITS.length - 1) {
    val /= 1024;
    i++;
  }
  return val.toFixed(BYTE_UNIT_DECIMALS[i]) + " " + BYTE_UNITS[i];
}
export const fmtSpeed = (bps: number) => fmtBytes(bps) + "/s";

export function fmtVideoTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60);
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
}

// Discreet haptic feedback; degrades silently where unsupported. Ticks per selected item, a firmer
// bump when a hold gesture arms, a double tap for completed jobs, a long pulse for errors.
export const HAPTIC = { tick: 22, hold: 48, success: [35, 60, 35], error: 70 } as const;
export function haptic(pattern: number | readonly number[]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern as number | number[]);
  } catch {}
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

export const canDragWithMouse = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// "45.6 / 120 MB": one unit for both figures, picked from the total. Formatting each on its own
// switched units mid-upload ("980 KB / 1.2 GB" becoming "1.0 MB / 1.2 GB"), which read as the
// numbers jumping around.
export function fmtBytePair(done: number, total: number) {
  done = Math.max(0, done || 0);
  total = Math.max(0, total || 0);
  let i = 0;
  let scale = 1;
  while (total / scale >= 1024 && i < BYTE_UNITS.length - 1) {
    scale *= 1024;
    i++;
  }
  const dec = BYTE_UNIT_DECIMALS[i];
  return { done: (done / scale).toFixed(dec), total: (total / scale).toFixed(dec), unit: BYTE_UNITS[i] };
}

// Time left. Under a minute it counts the seconds down; above it, m:ss keeps the width steady while
// still moving every second.
export function fmtEta(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "1 วิ";
  const s = Math.max(1, Math.round(sec));
  if (s < 60) return s + " วิ";
  const m = Math.floor(s / 60);
  if (m < 60) return m + ":" + String(s % 60).padStart(2, "0") + " น.";
  return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") + " ชม.";
}

// ---- Keyboard shortcuts that survive a change of keyboard layout ----
//
// `e.key` is the CHARACTER the layout produced. With a Thai layout the key marked A produces "ฟ", so
// `e.key === "a"` never matches and Ctrl+A stops selecting — the same for Russian, Greek, Hebrew,
// Arabic and every other non-Latin layout. `e.code` names the physical key and ignores the layout
// entirely, but it describes a US QWERTY position, which is the wrong key for someone on Dvorak or
// AZERTY who is reading the letters printed on their own keyboard.
//
// So a shortcut matches EITHER: the character the layout produced, or the key in the US position.
// A Thai typist gets Ctrl+A back through the physical key; a Dvorak typist keeps it through the
// character. Modifiers (ctrlKey, shiftKey…) are the caller's business — they never vary by layout.
const CODE_CHAR: Record<string, string> = {
  Equal: "=",
  Minus: "-",
  Slash: "/",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Backquote: "`",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadDivide: "/",
  NumpadDecimal: ".",
  Space: " ",
};

function physicalKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  return CODE_CHAR[code] ?? null;
}

// hotkey(e, "a") — true for A on any layout. Several names mean "any of these": hotkey(e, "=", "+").
export function hotkey(e: { key?: string; code?: string } | null | undefined, ...names: string[]): boolean {
  if (!e) return false;
  const typed = typeof e.key === "string" ? e.key.toLowerCase() : "";
  const physical = physicalKey(typeof e.code === "string" ? e.code : "");
  for (const name of names) {
    const want = name.toLowerCase();
    if (typed && typed === want) return true;
    if (physical !== null && physical === want) return true;
  }
  return false;
}
