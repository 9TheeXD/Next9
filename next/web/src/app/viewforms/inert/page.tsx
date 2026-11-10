import type { Metadata } from "next";
import Script from "next/script";
import { ViewInert } from "./ViewInert";
import "@/components/tool/tool.css";
import "../viewforms.css";

export const metadata: Metadata = {
  title: { absolute: "สรุปรายชื่อสาย - เฉื่อย | สภานักเรียน" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/inert.svg" },
};

export default function ViewInertPage() {
  return (
    <>
      {/* The Word export library, the same build the old page used. */}
      <Script src="https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js" strategy="lazyOnload" />
      <ViewInert />
    </>
  );
}
