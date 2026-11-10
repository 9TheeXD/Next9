"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import "./site-nav.css";
import { AppLink } from "@/components/AppLink";

const LINKS = [
  { href: "/", label: "หน้าแรก" },
  { href: "/about/", label: "เกี่ยวกับ" },
  { href: "/policy/", label: "นโยบาย" },
  { href: "/member/", label: "สมาชิก" },
  { href: "/problem/", label: "แจ้งปัญหา" },
];

// The legacy site's navbar (style.css + main.js) as one component: hamburger menu on phones, and the
// bar slides away while scrolling down past 500px and comes back on the way up.
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname() ?? "";

  useEffect(() => {
    let last = 0;
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > last && y > 500);
      last = Math.max(0, y);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);

  return (
    <>
      <nav className={`site-nav${hidden && !open ? " is-hidden" : ""}`}>
        <AppLink href="/" className="site-nav-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://cdn.yumistack.net/next9/logo01.webp" alt="NEXT9" />
        </AppLink>
        <button
          type="button"
          className={`site-nav-burger${open ? " is-open" : ""}`}
          aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </nav>
      <div className={`site-nav-links${open ? " is-open" : ""}`}>
        {LINKS.map((l) => (
          <AppLink
            key={l.href}
            href={l.href}
            className={l.href !== "/" && pathname.startsWith(l.href) ? "is-current" : undefined}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </AppLink>
        ))}
      </div>
      <div className="site-nav-spacer" />
    </>
  );
}
