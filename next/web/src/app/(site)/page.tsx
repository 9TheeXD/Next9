import { AppLink } from "@/components/AppLink";
import { fileUrl, getSettings } from "@/lib/settings";
import { HeroSlider } from "./HeroSlider";

// Every text and picture here: admin → หน้าแรก / นโยบาย / เว็บไซต์.
export const revalidate = 3600;

export default async function HomePage() {
  const [site, home, policies] = await Promise.all([getSettings("site"), getSettings("home"), getSettings("policies")]);
  const slides = (home.slides || []).filter((s) => s.image).map((s) => ({ src: fileUrl(s.image), alt: s.alt || "" }));
  return (
    <main>
      {slides.length > 0 && (
        <section className="s-hero-banner">
          <HeroSlider slides={slides} />
        </section>
      )}

      <section className="s-intro">
        <p className="s-eyebrow">{home.eyebrow}</p>
        <h1 className="s-intro-title">
          {home.title} {home.title_highlight && <span>{home.title_highlight}</span>}
        </h1>
        {site.motto && <p className="s-intro-motto">“{site.motto}”</p>}
      </section>

      {home.quick.length > 0 && (
        <section className="s-section">
          <div className="s-quick">
            {home.quick.map((q) => (
              <AppLink key={q.href + q.title} href={q.href} className="s-quick-card">
                <i className={q.icon} aria-hidden />
                <b>{q.title}</b>
                <span>{q.text}</span>
              </AppLink>
            ))}
          </div>
        </section>
      )}

      {policies.items.length > 0 && (
        <section className="s-dark">
          <div className="s-section">
            <div className="s-head s-head-light">
              <h2>{home.policy_title}</h2>
              <p>{home.policy_text}</p>
            </div>
            <div className="s-policy-grid">
              {policies.items.slice(0, Number(home.policy_count) || 4).map((p) => (
                <div key={p.title} className="s-policy-mini">
                  <i className={p.icon} aria-hidden />
                  <h3>{p.title}</h3>
                  <p>{p.summary}</p>
                </div>
              ))}
            </div>
            <div className="s-center">
              <AppLink href="/policy/" className="s-btn s-btn-light">
                อ่านนโยบายทั้งหมด <i className="fas fa-arrow-right" aria-hidden />
              </AppLink>
            </div>
          </div>
        </section>
      )}

      {site.problem_form_url && (
        <section className="s-section">
          <div className="s-cta">
            <div>
              <h2>{home.cta_title}</h2>
              <p>{home.cta_text}</p>
            </div>
            <a href={site.problem_form_url} target="_blank" rel="noopener noreferrer" className="s-btn">
              แจ้งปัญหา <i className="fas fa-arrow-up-right-from-square" aria-hidden />
            </a>
          </div>
        </section>
      )}
    </main>
  );
}
