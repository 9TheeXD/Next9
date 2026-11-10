import type { Metadata } from "next";
import { SubmitInert } from "./SubmitInert";
import "../inert/inert.css";
import "./submit.css";

export const metadata: Metadata = {
  title: { absolute: "รายงานส่งเล่มตรวจสาย-เฉื่อย - สภานักเรียน" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/inert.svg" },
};

export default function SubmitInertPage() {
  return <SubmitInert />;
}
