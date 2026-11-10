import type { Metadata } from "next";
import { Suspense } from "react";
import { StateCard } from "@/components/tool/Tool";
import { ToiletManage } from "./ToiletManage";
import "../toilet.css";

export const metadata: Metadata = {
  title: { absolute: "จัดการแบบฟอร์มห้องน้ำ - NEXT9" },
  robots: { index: false, follow: false },
  icons: { icon: "/assets/icons/toilet.svg" },
};

export default function ToiletManagePage() {
  return (
    <Suspense fallback={<StateCard icon="fas fa-spinner fa-spin" title="กำลังโหลด..." />}>
      <ToiletManage />
    </Suspense>
  );
}
