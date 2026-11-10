import type { Metadata, Viewport } from "next";
import { LinksHub } from "./LinksHub";
import "./links.css";

export const metadata: Metadata = {
  title: { absolute: "NEXT9 · ศูนย์รวมระบบภายใน สภานักเรียน" },
  description: "ศูนย์รวมลิงก์ระบบภายในของสภานักเรียนโรงเรียนสิรินธร สำหรับสมาชิกสภานักเรียน",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    url: "https://next9-web.vercel.app/links/",
    title: "NEXT9 · ศูนย์รวมระบบภายใน",
    description: "ลิงก์ระบบทั้งหมดสำหรับสมาชิกสภานักเรียน",
    images: ["https://cdn.yumistack.net/next9/logo01.webp"],
  },
};

export const viewport: Viewport = { themeColor: "#140808" };

export default function LinksPage() {
  return <LinksHub />;
}
