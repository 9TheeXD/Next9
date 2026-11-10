import type { Metadata } from "next";
import { EditorApp } from "./EditorApp";
import "./editor.css";

export const metadata: Metadata = {
  title: "ระบบจัดการสมาชิก",
  robots: { index: false, follow: false },
};

// The member editor (was /member/editor.html, opened as /assets/members/editor). It reads
// members.json from the CDN and writes through server.js: /api/verify-auth, /api/save-member and
// /api/member-photo, all guarded by the editor password.
export default function EditorPage() {
  return <EditorApp />;
}
