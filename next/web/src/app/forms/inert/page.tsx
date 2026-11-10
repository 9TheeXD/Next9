import type { Metadata } from "next";
import { InertForm } from "./InertForm";
import "./inert.css";

export const metadata: Metadata = {
  title: { absolute: "แบบฟอร์มลงชื่อ สาย - เฉื่อย | สภานักเรียน" },
  description: "แบบฟอร์มลงชื่อนักเรียนสาย-เฉื่อย สภานักเรียนโรงเรียนสิรินธร",
  icons: { icon: "/assets/icons/inert.svg" },
};

export default function InertPage() {
  return <InertForm />;
}
