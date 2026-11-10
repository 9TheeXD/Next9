import type { Metadata } from "next";
import { PinkbookForm } from "./PinkbookForm";
import "@/components/tool/tool.css";
import "../inert/inert.css";
import "./pinkbook.css";

export const metadata: Metadata = {
  title: { absolute: "บันทึกการตรวจเล่มชมพู | สภานักเรียน" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/pinkbook.svg" },
};

export default function PinkbookPage() {
  return <PinkbookForm />;
}
