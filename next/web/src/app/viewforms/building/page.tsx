import type { Metadata } from "next";
import { ViewBuilding } from "./ViewBuilding";
import "@/components/tool/tool.css";
import "../../forms/inert/inert.css";
import "../../forms/building/building.css";
import "../../forms/pinkbook/pinkbook.css";
import "../viewforms.css";

export const metadata: Metadata = {
  title: { absolute: "สรุปผลการตรวจอาคาร | สภานักเรียน" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/building.svg" },
};

export default function ViewBuildingPage() {
  return <ViewBuilding />;
}
