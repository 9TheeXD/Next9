// Types of the /links/ hub. The sections themselves are settings (server/settings.mjs, "links").
export type LinkItem = { href: string; title: string; text: string; icon: string; lock?: string; external?: boolean };
export type LinkSection = { key: string; title: string; text: string; icon: string; items: LinkItem[]; restricted?: boolean };
