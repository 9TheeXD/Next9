import { AppLink } from "@/components/AppLink";
import { HeroSlider } from "./HeroSlider";
import { POLICIES, PROBLEM_FORM } from "./policies";

const QUICK = [
  { href: "/member/", icon: "fas fa-users", title: "สมาชิกสภา", text: "รู้จักทีม NEXT9 ทุกฝ่าย" },
  { href: "/member/grade/", icon: "fas fa-layer-group", title: "งานระดับชั้น", text: "ทีมประจำ ม.1 – ม.6" },
  { href: "/policy/", icon: "fas fa-list-check", title: "นโยบาย", text: "7 นโยบายที่ทำได้จริง" },
  { href: "/problem/", icon: "fas fa-comment-dots", title: "แจ้งปัญหา", text: "ส่งเรื่องถึงสภาได้ทันที" },
];

export default function HomePage() {
  return (
    <main>
      <section className="s-hero-banner">
        <HeroSlider />
      </section>

      <section className="s-intro">
        <p className="s-eyebrow">สภานักเรียนโรงเรียนสิรินธร</p>
        <h1 className="s-intro-title">
          ก้าวใหม่ ก้าวต่อไป <span>กับ NEXT9</span>
        </h1>
        <p className="s-intro-motto">“ทุกทางเพื่อสิรินธร ทุกทางเพื่อเกียรติกำจร”</p>
      </section>

      <section className="s-section">
        <div className="s-quick">
          {QUICK.map((q) => (
            <AppLink key={q.href} href={q.href} className="s-quick-card">
              <i className={q.icon} aria-hidden />
              <b>{q.title}</b>
              <span>{q.text}</span>
            </AppLink>
          ))}
        </div>
      </section>

      <section className="s-dark">
        <div className="s-section">
          <div className="s-head s-head-light">
            <h2>นโยบายหลักของเรา</h2>
            <p>มุ่งเน้นความสะอาด สุขอนามัย และพื้นที่สร้างสรรค์เพื่อทุกคน</p>
          </div>
          <div className="s-policy-grid">
            {POLICIES.slice(0, 4).map((p) => (
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

      <section className="s-section">
        <div className="s-cta">
          <div>
            <h2>พบปัญหาในโรงเรียน?</h2>
            <p>บอกเราได้เลย ทุกเรื่องถูกส่งถึงทีม NEXT9 โดยตรง</p>
          </div>
          <a href={PROBLEM_FORM} target="_blank" rel="noopener noreferrer" className="s-btn">
            แจ้งปัญหา <i className="fas fa-arrow-up-right-from-square" aria-hidden />
          </a>
        </div>
      </section>
    </main>
  );
}
