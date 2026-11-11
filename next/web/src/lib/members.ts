import { readFile } from "node:fs/promises";
import { downloadMembers } from "../../server/api.mjs";
import { getSettings } from "@/lib/settings";

// The member list lives in R2 as next9/members/members.json. The editor (/member/editor/) writes it
// through POST /api/save-member; these pages read it on every request, so an edit shows up on the
// next page load with no rebuild. MEMBERS_FILE points at a local copy instead (development and testing).
// Photos are served through /api/file/ (a redirect to R2).
export const PHOTO_BASE = "/api/file/next9/members/";

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
  return (await downloadMembers()) as Member[];
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

// Departments, the executive board and the grades: admin → สมาชิก (โครงสร้าง).
export async function loadLayout() {
  const [m, school] = await Promise.all([getSettings("members"), getSettings("school")]);
  const depts: DeptDef[] = (m.depts || []).map((d) => ({
    key: d.key,
    dataDept: (d.data_dept || undefined) as DeptKey | undefined,
    name: d.name,
    short: d.short,
    tagline: d.tagline,
    units: d.units || [],
  }));
  // Grade numbers (1 for "ม.1"): the member positions use units m1 … m6.
  const grades = (school.grades || []).map((g, i) => Number(String(g.name).match(/\d+/)?.[0]) || i + 1);
  return { ...m, depts, grades };
}

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
