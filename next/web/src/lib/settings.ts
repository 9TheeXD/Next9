// Typed access to the site settings (server/settings.mjs) for server components, and a hook for
// client components that need public sections.
import { DEFAULTS, fileUrl, getSettings as getRaw } from "../../server/settings.mjs";

export type Settings = typeof DEFAULTS;
export type SectionName = keyof Settings;

export async function getSettings<K extends SectionName>(section: K): Promise<Settings[K]> {
  return (await getRaw(section)) as Settings[K];
}

export { fileUrl };

// Pages built from settings are regenerated when an admin saves (server/admin.mjs revalidates
// them), and at most this often otherwise.
export const SETTINGS_REVALIDATE = 3600;
