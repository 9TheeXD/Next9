import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import "./site.css";

// The public pages: home, about, policy, problem.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="s-page">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
