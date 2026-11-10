import type { Metadata } from "next";
import { BuildingForm } from "./BuildingForm";
import "../inert/inert.css";
import "./building.css";

export const metadata: Metadata = {
  title: { absolute: "แบบฟอร์มตรวจอาคาร | สภานักเรียน" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/building.svg" },
};

export default function BuildingPage() {
  return <BuildingForm />;
}
