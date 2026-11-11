import type { Metadata } from "next";
import { AppLink } from "@/components/AppLink";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "เกี่ยวกับ", icons: { icon: "/assets/icons/about.svg" } };
// Texts: admin → หน้าเกี่ยวกับ; social links: admin → เว็บไซต์.
export const revalidate = 3600;

export default async function AboutPage() {
  const [site, about] = await Promise.all([getSettings("site"), getSettings("about")]);
  return (
    <main>
      <section className="s-about-hero">
        <p className="s-eyebrow">{about.eyebrow}</p>
        <h1 className="s-about-title">
          {about.title.split(/\s+/).filter(Boolean).map((w, i) => (
            <span key={i}>{w} </span>
          ))}
          {about.title_highlight && <span className="is-stroke">{about.title_highlight}</span>}
        </h1>
        <p className="s-lead">{about.lead}</p>
      </section>

      {about.cards.length > 0 && (
        <section className="s-section">
          <div className="s-nav-cards">
            {about.cards.map((c) => (
              <AppLink key={c.href + c.title} href={c.href} className="s-nav-card">
                <i className={c.icon} aria-hidden />
                <h3>{c.title}</h3>
                <span className="s-btn s-btn-sm">{c.action}</span>
              </AppLink>
            ))}
          </div>
        </section>
      )}

      {site.social.length > 0 && (
        <section className="s-section s-center">
          <div className="s-head">
            <h2>{about.social_title}</h2>
            <p>{about.social_text}</p>
          </div>
          <div className="s-social">
            {site.social.map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer">
                <i className={s.icon} aria-hidden /> {s.label}
              </a>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
