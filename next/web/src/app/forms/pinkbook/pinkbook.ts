// Pinkbook form logic shared by the page: the same rules and data shapes as the old
// forms/pinkbook/app.js, so records, drafts and the database stay exactly as before.

export type Item = { title: string; allow_week?: boolean } | string;
export type Selected = Record<string, { label: string; weeks: number[]; allow_week: boolean }>;
export type RoomRecord = {
  id: string;
  grade: string;
  room: string;
  group_name: string;
  status: string;
  issues: string;
  raw_issues: Selected;
  unsubmitted_weeks: number[];
  updatedAt?: number;
};
export type RoomsConfig = Record<string, Record<string, { sub?: boolean }>>;

export const TERM = "2/2569";
export const DEFAULT_ITEMS: Item[] = [
  { title: "ไม่วงกลม กและข หน้าปก", allow_week: false },
  { title: "ไม่เขียนที่อยู่", allow_week: false },
  { title: "ไม่เขียนตารางเรียนนักเรียน", allow_week: false },
  { title: "ไม่เขียนตารางสอนครูที่ปรึกษา", allow_week: false },
  { title: "ไม่เขียนสัปดาห์", allow_week: true },
  { title: "ไม่เขียนวันที่/เดือน/ปี", allow_week: true },
  { title: "ไม่ได้เขียนยอดรวมขาด / ลา", allow_week: true },
  { title: "ไม่เขียนเรื่องที่อบรมแต่ละวัน", allow_week: true },
  { title: "ไม่มีลายเซ็นครูที่ปรึกษา", allow_week: true },
];

export const itemTitle = (it: Item) => (typeof it === "string" ? it : it.title || "");
export const itemAllowWeek = (it: Item) => (typeof it === "object" ? it.allow_week !== false : true);

export function calculateCurrentWeek(week1DateStr?: string) {
  const dateStr = week1DateStr && week1DateStr >= "2026-10-01" ? week1DateStr : "2026-10-26";
  const target = new Date();
  const w1 = new Date(dateStr);
  const w1Sunday = new Date(w1);
  w1Sunday.setDate(w1.getDate() - w1.getDay());
  w1Sunday.setHours(0, 0, 0, 0);
  const targetSunday = new Date(target);
  targetSunday.setDate(target.getDate() - target.getDay());
  targetSunday.setHours(0, 0, 0, 0);
  const diffWeeks = Math.round((targetSunday.getTime() - w1Sunday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(22, diffWeeks + 1));
}

export function isRoomSub(rooms: RoomsConfig, grade: string, room: string) {
  const g = String(grade || "").replace(/\D/g, "");
  const r = String(room);
  if (rooms[g] && rooms[g][r] !== undefined) return !!rooms[g][r].sub;
  return true;
}

export function roomOptions(rooms: RoomsConfig, grade: string) {
  const g = grade.replace(/\D/g, "");
  const configured = rooms[g] ? Object.keys(rooms[g]).map(Number).sort((a, b) => a - b) : null;
  const max = configured ? configured[configured.length - 1] : ["ม.1", "ม.2", "ม.3"].includes(grade) ? 14 : 16;
  return (configured || Array.from({ length: max }, (_, i) => i + 1)).map(String);
}

export function formatWeekRanges(weeks?: number[]) {
  if (!weeks || weeks.length === 0) return "-";
  const sorted = [...weeks].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) end = sorted[i];
    else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(", ");
}

// When a room was added to the table or last edited (older rows: the id, their add time).
export const roomTime = (r: RoomRecord) => Number(r.updatedAt) || Number(r.id) || 0;

// Today: "17:31". Earlier: "1/11/69 17:31".
export function formatRoomTime(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (d.toDateString() === new Date().toDateString()) return hm;
  const by = String((d.getFullYear() + 543) % 100).padStart(2, "0");
  return `${d.getDate()}/${d.getMonth() + 1}/${by} ${hm}`;
}

// Newest first, as the old table kept addedRooms.
export const sortRooms = (list: RoomRecord[]) => [...list].sort((a, b) => roomTime(b) - roomTime(a));

// ----- Draft identity (same keys as the old page) -----
const ID_KEY = "pinkbook_draft_id";
export const LOCAL_KEY = "pinkbook_draft";
const COOKIE = "pb_draft";
const okId = (v: string) => /^[A-Za-z0-9_-]{16,64}$/.test(v || "");

export function draftId() {
  const readCookie = () => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  };
  const newId = () =>
    crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  let id = "";
  try {
    id = localStorage.getItem(ID_KEY) || "";
  } catch {}
  if (!okId(id)) id = readCookie();
  if (!okId(id)) id = newId();
  try {
    localStorage.setItem(ID_KEY, id);
  } catch {}
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; Max-Age=${400 * 24 * 3600}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return id;
}

export type Draft = {
  v: 1;
  inspector: string;
  week: string;
  grade: string;
  room: string;
  group: string;
  status: string;
  selectedData: Selected;
  unsubmittedWeeks: number[];
  addedRooms: RoomRecord[];
  editingId: string | null;
  savedAt?: number;
};

export function draftIsEmpty(d: Draft) {
  return !d.addedRooms.length && !d.grade && !d.room && !Object.keys(d.selectedData || {}).length && !(d.unsubmittedWeeks || []).length;
}
