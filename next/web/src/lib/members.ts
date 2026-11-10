import { readFile } from "node:fs/promises";

// The member list lives on R2 as next9/members/members.json (served by the CDN). The editor
// (/assets/members/editor) writes it through POST /api/save-member in server.js; these pages read it
// on every request, so an edit shows up on the next page load with no rebuild.
// MEMBERS_FILE points at a local copy instead (development and testing).
const MEMBERS_URL = "https://cdn.yumistack.net/next9/members/members.json";
export const PHOTO_BASE = "https://cdn.yumistack.net/next9/members/";

export type DeptKey = "executive" | "academic" | "affairs" | "general" | "grade";

export type Position = {
  dept: DeptKey;
  unit: string;
  // "หัวหน้า" | "ผู้ช่วย" | "ผู้ช่วยและเลขานุการ", or a named office such as "ประธานสภา".
  title: string;
  label: string;
};

export type Member = {
  slug: string;
  nickname: string;
  name: string;
  role: string;
  roles?: string[];
  room?: string;
  img?: string;
  contacts?: { ig?: string; line?: string; call?: string };
  bio?: string;
  positions?: Position[];
};

export async function loadMembers(): Promise<Member[]> {
  if (process.env.MEMBERS_FILE) return JSON.parse(await readFile(process.env.MEMBERS_FILE, "utf8"));
  const res = await fetch(`${MEMBERS_URL}?${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`members.json: HTTP ${res.status}`);
  return res.json();
}

export function photoOf(m: Member) {
  return `${PHOTO_BASE}${m.img || `2/${m.slug}.webp`}`;
}

// The name without its title, as the site shows it under a photo.
export function shortName(m: Member) {
  return m.name.replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง)\s*/, "");
}

export type UnitDef = { key: string; name: string };
// key is the route and CSS name; positions are stored under dataDept (default: key). The secretary and
// treasurer offices sit under "executive" in the data, so their pages point there.
export type DeptDef = { key: string; dataDept?: DeptKey; name: string; short: string; tagline: string; units: UnitDef[] };

export const DEPTS: DeptDef[] = [
  {
    key: "academic",
    name: "ฝ่ายบริหารวิชาการ",
    short: "วิชาการ",
    tagline: "ดูแลการเรียนรู้ ข้อมูล และระเบียบของสภานักเรียน",
    units: [
      { key: "head", name: "หัวหน้าฝ่าย" },
      { key: "evaluation", name: "งานรับการประเมิน/นิเทศ/ติดตาม" },
      { key: "it", name: "งานวางแผนสารสนเทศ" },
      { key: "attendance", name: "งานขอเวลาเรียน" },
      { key: "charter", name: "งานจัดทำธรรมนูญ/คู่มือสภานักเรียน" },
    ],
  },
  {
    key: "affairs",
    name: "ฝ่ายบริหารกิจการนักเรียน",
    short: "กิจการนักเรียน",
    tagline: "ดูแลกิจกรรม ระเบียบวินัย และนักเรียนทุกระดับชั้น",
    units: [
      { key: "head", name: "หัวหน้าฝ่าย" },
      { key: "grade", name: "งานระดับชั้น" },
      { key: "discipline", name: "งานระเบียบวินัย" },
      { key: "whiteclass", name: "งานห้องเรียนสีขาว" },
      { key: "activity", name: "งานกิจกรรม" },
    ],
  },
  {
    key: "general",
    name: "ฝ่ายบริหารทั่วไป",
    short: "บริหารทั่วไป",
    tagline: "ดูแลการสื่อสาร สถานที่ และการต้อนรับ",
    units: [
      { key: "head", name: "หัวหน้าฝ่าย" },
      { key: "pr", name: "งานประชาสัมพันธ์" },
      { key: "building", name: "งานอาคารสถานที่และอนุรักษ์สิ่งแวดล้อม" },
      { key: "reception", name: "งานปฏิคม" },
      { key: "fieldtrip", name: "งานทัศนศึกษาดูงาน" },
    ],
  },
  {
    key: "secretary",
    dataDept: "executive",
    name: "ฝ่ายเลขานุการ",
    short: "เลขานุการ",
    tagline: "ดูแลเอกสาร บันทึกการประชุม และงานธุรการของสภานักเรียน",
    units: [{ key: "secretary", name: "เลขานุการ" }],
  },
  {
    key: "treasurer",
    dataDept: "executive",
    name: "ฝ่ายเหรัญญิก",
    short: "เหรัญญิก",
    tagline: "ดูแลการเงิน งบประมาณ และบัญชีของสภานักเรียน",
    units: [{ key: "treasurer", name: "เหรัญญิก" }],
  },
];

export const GRADES = [1, 2, 3, 4, 5, 6] as const;

const TITLE_ORDER = ["หัวหน้า", "ผู้ช่วย", "ผู้ช่วยและเลขานุการ"];
function titleRank(title: string) {
  const i = TITLE_ORDER.indexOf(title);
  return i === -1 ? -1 : i; // named offices (หัวหน้าฝ่าย…, เลขานุการ, เหรัญญิก) come first
}

export type Seat = { member: Member; position: Position };

// Everyone holding a position in one unit, heads first, in the order the sheet lists them.
export function seatsOf(members: Member[], dept: DeptKey, unit: string): Seat[] {
  const seats: Seat[] = [];
  for (const member of members)
    for (const position of member.positions ?? [])
      if (position.dept === dept && position.unit === unit) seats.push({ member, position });
  return seats.sort((a, b) => titleRank(a.position.title) - titleRank(b.position.title));
}

export function bySlug(members: Member[], slug: string) {
  return members.find((m) => m.slug === slug);
}
