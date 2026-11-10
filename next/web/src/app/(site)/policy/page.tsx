import type { Metadata } from "next";
import { POLICIES } from "../policies";

export const metadata: Metadata = { title: "นโยบาย", icons: { icon: "/assets/icons/policy.svg" } };

export default function PolicyPage() {
  return (
    <main>
      <section className="s-page-hero">
        <p className="s-eyebrow">{POLICIES.length} นโยบาย · ทำได้จริง</p>
        <h1>นโยบายของเรา</h1>
        <p className="s-lead">ก้าวใหม่ก้าวต่อไปกับ NEXT9 — พัฒนาโรงเรียนเพื่อทุกคน</p>
        <nav className="s-policy-jump" aria-label="ไปยังนโยบาย">
          {POLICIES.map((p, i) => (
            <a key={p.title} href={`#p${i + 1}`}>
              {String(i + 1).padStart(2, "0")} {p.title}
            </a>
          ))}
        </nav>
      </section>

      <section className="s-section s-policies">
        {POLICIES.map((p, i) => (
          <article key={p.title} id={`p${i + 1}`} className="s-policy">
            <div className="s-policy-num">{String(i + 1).padStart(2, "0")}</div>
            <div className="s-policy-body">
              <div className="s-policy-top">
                <span className="s-policy-icon"><i className={p.icon} aria-hidden /></span>
                <span className="s-policy-tag">{p.tag}</span>
              </div>
              <h2>{p.title}</h2>
              <p>{p.text}</p>
              {p.points && (
                <ul>
                  {p.points.map((pt) => (
                    <li key={pt}>{pt}</li>
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
