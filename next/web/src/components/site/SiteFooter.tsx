import { AppLink } from "@/components/AppLink";
import { fileUrl, getSettings } from "@/lib/settings";

// Name, logo, menu, social links and motto: admin → เว็บไซต์.
export async function SiteFooter() {
  const site = await getSettings("site");
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(site.logo)} alt="" width={40} height={40} />
          <div>
            <b>{site.name}</b>
            <span>{site.council}</span>
          </div>
        </div>
        <nav className="site-footer-links">
          {site.nav
            .filter((l) => l.href !== "/")
            .map((l) => (
              <AppLink key={l.href} href={l.href}>
                {l.label}
              </AppLink>
            ))}
        </nav>
        <div className="site-footer-social">
          {site.social.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
              <i className={s.icon} aria-hidden />
            </a>
          ))}
        </div>
      </div>
      {site.motto && <p className="site-footer-motto">“{site.motto}”</p>}
    </footer>
  );
}
