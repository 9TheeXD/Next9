// Typed access to the site settings (server/settings.mjs) for server components, and a hook for
// client components that need public sections. "school" is computed (terms + classes from the
// student list), not stored.
import { DEFAULTS, fileUrl, getSettings as getRaw } from "../../server/settings.mjs";

export type Term = { id: string; semester: number; year: number; start: string; end: string };
export type ClassRoom = { room: number; groups: string[]; students: number };
export type School = {
  today: string;
  mode: string;
  current: (Term & { week1: string }) | null;
  year: string;
  term: string;
  terms: string[];
  termList: Term[];
  classesFrom: "students" | "fallback";
  grades: { grade: number; name: string; rooms: number; roomList: ClassRoom[] }[];
};
export type Settings = typeof DEFAULTS & { school: School };
export type SectionName = keyof Settings;

export async function getSettings<K extends SectionName>(section: K): Promise<Settings[K]> {
  return (await getRaw(section)) as Settings[K];
}

export { fileUrl };

// Pages built from settings are regenerated when an admin saves (server/admin.mjs revalidates
// them), and at most this often otherwise.
export const SETTINGS_REVALIDATE = 3600;
