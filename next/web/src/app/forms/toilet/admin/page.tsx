import type { Metadata } from "next";
import { ToiletAdmin } from "./ToiletAdmin";
import "../toilet.css";

export const metadata: Metadata = {
  title: { absolute: "ตั้งค่าระบบห้องน้ำ - NEXT9" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/toilet.svg" },
};

export default function ToiletAdminPage() {
  return <ToiletAdmin />;
}
