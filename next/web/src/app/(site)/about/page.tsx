import type { Metadata } from "next";
import { AppLink } from "@/components/AppLink";
import { SOCIAL } from "@/components/site/SiteFooter";

export const metadata: Metadata = { title: "เกี่ยวกับ", icons: { icon: "/assets/icons/about.svg" } };

const CARDS = [
  { href: "/member/", icon: "fas fa-users", title: "สมาชิกพรรค", action: "ดูรายชื่อ" },
  { href: "/policy/", icon: "fas fa-list-check", title: "นโยบาย", action: "ดูนโยบาย" },
  { href: "/problem/", icon: "fas fa-comment-dots", title: "แจ้งปัญหา", action: "ระบบแจ้งเรื่อง" },
];

export default function AboutPage() {
  return (
    <main>
      <section className="s-about-hero">
        <p className="s-eyebrow">ขอขอบคุณสำหรับทุกคะแนนเสียง</p>
        <h1 className="s-about-title">
          <span>ก้าวใหม่</span> <span>ก้าวต่อไป</span> <span>กับ</span> <span className="is-stroke">NEXT9</span>
        </h1>
        <p className="s-lead">พรรคสภานักเรียนโรงเรียนสิรินธร ที่พร้อมพัฒนาโรงเรียนในทุกด้าน เพื่อเพื่อน พี่ และน้องทุกคน</p>
      </section>

      <section className="s-section">
        <div className="s-nav-cards">
          {CARDS.map((c) => (
            <AppLink key={c.href} href={c.href} className="s-nav-card">
              <i className={c.icon} aria-hidden />
              <h3>{c.title}</h3>
              <span className="s-btn s-btn-sm">{c.action}</span>
            </AppLink>
          ))}
        </div>
      </section>

      <section className="s-section s-center">
        <div className="s-head">
          <h2>ติดตามเราได้ที่</h2>
          <p>อัปเดตความเคลื่อนไหวและนโยบายล่าสุด</p>
        </div>
        <div className="s-social">
          {SOCIAL.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer">
              <i className={s.icon} aria-hidden /> {s.label}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
