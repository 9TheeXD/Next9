import type { Metadata } from "next";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { fileUrl, getSettings } from "@/lib/settings";
import "./member.css";

export const metadata: Metadata = {
  title: "สมาชิกสภานักเรียน",
  icons: { icon: "/assets/icons/member.svg" },
};

export default async function MemberLayout({ children }: LayoutProps<"/member">) {
  const site = await getSettings("site");
  return (
    <div className="m-page">
      <SiteNav links={site.nav} logo={fileUrl(site.logo)} name={site.name} />
      {children}
      <SiteFooter />
    </div>
  );
}
