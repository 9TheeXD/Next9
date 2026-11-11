import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "นโยบาย", icons: { icon: "/assets/icons/policy.svg" } };
// Admin → นโยบาย.
export const revalidate = 3600;

export default async function PolicyPage() {
  const policies = await getSettings("policies");
  const items = policies.items;
  return (
    <main>
      <section className="s-page-hero">
        <p className="s-eyebrow">{items.length} {policies.eyebrow_suffix}</p>
        <h1>{policies.title}</h1>
        <p className="s-lead">{policies.lead}</p>
        <nav className="s-policy-jump" aria-label="ไปยังนโยบาย">
          {items.map((p, i) => (
            <a key={p.title + i} href={`#p${i + 1}`}>
              {String(i + 1).padStart(2, "0")} {p.title}
            </a>
          ))}
        </nav>
      </section>

      <section className="s-section s-policies">
        {items.map((p, i) => (
          <article key={p.title + i} id={`p${i + 1}`} className="s-policy">
            <div className="s-policy-num">{String(i + 1).padStart(2, "0")}</div>
            <div className="s-policy-body">
              <div className="s-policy-top">
                <span className="s-policy-icon"><i className={p.icon} aria-hidden /></span>
                {p.tag && <span className="s-policy-tag">{p.tag}</span>}
              </div>
              <h2>{p.title}</h2>
              <p>{p.text}</p>
              {p.points && p.points.filter(Boolean).length > 0 && (
                <ul>
                  {p.points.filter(Boolean).map((pt, j) => (
                    <li key={j}>{pt}</li>
                  ))}
                </ul>
              )}
              {p.note && <p className="s-policy-note">*{p.note}</p>}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
