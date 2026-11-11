import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { fileUrl, getSettings } from "@/lib/settings";
import "./site.css";

// The public pages: home, about, policy, problem.
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSettings("site");
  return (
    <div className="s-page">
      <SiteNav links={site.nav} logo={fileUrl(site.logo)} name={site.name} />
      {children}
      <SiteFooter />
    </div>
  );
}
