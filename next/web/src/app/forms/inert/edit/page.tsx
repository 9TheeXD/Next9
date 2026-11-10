import type { Metadata } from "next";
import { InertEdit } from "./InertEdit";
import "../inert.css";
import "./edit.css";

export const metadata: Metadata = {
  title: { absolute: "ตั้งค่าฟิลด์แบบฟอร์มเฉื่อย - สภานักเรียน" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/inert.svg" },
};

export default function InertEditPage() {
  return <InertEdit />;
}
