import type { Metadata } from "next";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import "./member.css";

export const metadata: Metadata = {
  title: "สมาชิกสภานักเรียน",
  icons: { icon: "/assets/icons/member.svg" },
};

export default function MemberLayout({ children }: LayoutProps<"/member">) {
  return (
    <div className="m-page">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
