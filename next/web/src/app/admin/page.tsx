import type { Metadata } from "next";
import { AdminApp } from "./AdminApp";
import "./admin.css";

export const metadata: Metadata = {
  title: "หน้าจัดการระบบ",
  robots: { index: false, follow: false },
};

// Everything the council changes without touching code: settings, forms, passwords, keys.
export default function AdminPage() {
  return <AdminApp />;
}
