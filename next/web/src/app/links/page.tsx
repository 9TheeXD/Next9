import type { Metadata, Viewport } from "next";
import { fileUrl, getSettings } from "@/lib/settings";
import { LinksHub } from "./LinksHub";
import "./links.css";

// Sections: admin → หน้ารวมลิงก์.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [site, links] = await Promise.all([getSettings("site"), getSettings("links")]);
  const origin = (process.env.SITE_ORIGIN || "").replace(/\/+$/, "");
  const logo = fileUrl(site.logo);
  return {
    title: { absolute: `${site.name} · ${links.title}` },
    description: `ศูนย์รวมลิงก์ระบบภายในของ${site.council} สำหรับสมาชิกสภานักเรียน`,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      url: `${origin}/links/`,
      title: `${site.name} · ${links.title}`,
      description: "ลิงก์ระบบทั้งหมดสำหรับสมาชิกสภานักเรียน",
      images: [logo.startsWith("/") ? origin + logo : logo],
    },
  };
}

export const viewport: Viewport = { themeColor: "#140808" };

export default async function LinksPage() {
  const [site, links] = await Promise.all([getSettings("site"), getSettings("links")]);
  const origin = (process.env.SITE_ORIGIN || "https://next9-web.vercel.app").replace(/\/+$/, "");
  return <LinksHub sections={links.sections} logo={fileUrl(site.logo)} name={site.name} council={site.council} title={links.title} origin={origin} />;
}
