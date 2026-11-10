import type { Metadata } from "next";
import { ViewSubmitInert } from "./ViewSubmitInert";
import "@/components/tool/tool.css";
import "../../forms/inert/inert.css";
import "../../forms/submit_inert/submit.css";
import "../../forms/building/building.css";
import "../viewforms.css";

export const metadata: Metadata = {
  title: { absolute: "สรุปการส่งเล่มตรวจสาย-เฉื่อย | สภานักเรียน" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/inert.svg" },
};

export default function ViewSubmitInertPage() {
  return <ViewSubmitInert />;
}
