import type { Metadata } from "next";
import { Suspense } from "react";
import { StateCard } from "@/components/tool/Tool";
import { ToiletReport } from "./ToiletReport";

export const metadata: Metadata = {
  title: { absolute: "แจ้งปัญหาห้องน้ำ - สภานักเรียน" },
  description: "แบบฟอร์มแจ้งปัญหาห้องน้ำ โดยพรรค NEXT9",
  icons: { icon: "/assets/icons/toilet.svg" },
};

export default function ToiletPage() {
  return (
    <Suspense fallback={<StateCard icon="fas fa-spinner fa-spin" title="กำลังโหลด..." />}>
      <ToiletReport />
    </Suspense>
  );
}
