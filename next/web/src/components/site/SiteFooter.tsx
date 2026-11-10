import { AppLink } from "@/components/AppLink";

export const SOCIAL = [
  { href: "https://www.facebook.com/SirindhornStudentCouncil", label: "Facebook", icon: "fab fa-facebook-f" },
  { href: "https://www.instagram.com/sdh.studentcouncil", label: "Instagram", icon: "fab fa-instagram" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://cdn.yumistack.net/next9/logo01.webp" alt="" width={40} height={40} />
          <div>
            <b>NEXT9</b>
            <span>สภานักเรียนโรงเรียนสิรินธร</span>
          </div>
        </div>
        <nav className="site-footer-links">
          <AppLink href="/about/">เกี่ยวกับ</AppLink>
          <AppLink href="/policy/">นโยบาย</AppLink>
          <AppLink href="/member/">สมาชิก</AppLink>
          <AppLink href="/problem/">แจ้งปัญหา</AppLink>
        </nav>
        <div className="site-footer-social">
          {SOCIAL.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
              <i className={s.icon} aria-hidden />
            </a>
          ))}
        </div>
      </div>
      <p className="site-footer-motto">“ทุกทางเพื่อสิรินธร ทุกทางเพื่อเกียรติกำจร”</p>
    </footer>
  );
}
