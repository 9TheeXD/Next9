import type { Metadata } from "next";
import { ViewPinkbook } from "./ViewPinkbook";
import "@/components/tool/tool.css";
import "../../forms/inert/inert.css";
import "../../forms/pinkbook/pinkbook.css";
import "../viewforms.css";

export const metadata: Metadata = {
  title: { absolute: "สรุปผลการตรวจเล่มชมพู | สภานักเรียน" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/pinkbook.svg" },
};

export default function ViewPinkbookPage() {
  return <ViewPinkbook />;
}
