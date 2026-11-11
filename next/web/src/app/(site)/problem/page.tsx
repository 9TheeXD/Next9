import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "แจ้งปัญหา", icons: { icon: "/assets/icons/problem.svg" } };
// Texts: admin → หน้าแจ้งปัญหา; the form link: admin → เว็บไซต์.
export const revalidate = 3600;

export default async function ProblemPage() {
  const [site, problem] = await Promise.all([getSettings("site"), getSettings("problem")]);
  return (
    <main>
      <section className="s-page-hero">
        <p className="s-eyebrow">{problem.eyebrow}</p>
        <h1>{problem.title}</h1>
        <p className="s-lead">{problem.lead}</p>
        {site.problem_form_url && (
          <a href={site.problem_form_url} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-lg">
            <i className="fas fa-bullhorn" aria-hidden /> {problem.button}
          </a>
        )}
      </section>

      <section className="s-section">
        <div className="s-steps">
          {problem.steps.map((s, i) => (
            <div key={s.title + i} className="s-step">
              <span className="s-step-n">{i + 1}</span>
              <i className={s.icon} aria-hidden />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
        {problem.note && (
          <p className="s-note">
            <i className="fas fa-restroom" aria-hidden /> {problem.note}
          </p>
        )}
      </section>
    </main>
  );
}
