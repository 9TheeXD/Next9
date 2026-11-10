"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppLink } from "@/components/AppLink";
import { SECTIONS, type LinkItem } from "./data";

const ALL = SECTIONS.flatMap((s) => s.items);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function absolute(href: string) {
  return new URL(href, typeof window === "undefined" ? "https://next9-web.vercel.app" : location.href).href;
}

function greeting(now: Date) {
  const h = now.getHours();
  const hello = h < 5 ? "ดึกแล้ว พักผ่อนด้วยนะ" : h < 12 ? "สวัสดีตอนเช้า" : h < 13 ? "สวัสดีตอนเที่ยง" : h < 17 ? "สวัสดีตอนบ่าย" : h < 19 ? "สวัสดีตอนเย็น" : "สวัสดีตอนค่ำ";
  return `${hello} · ${new Intl.DateTimeFormat("th-TH", { dateStyle: "full" }).format(now)}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

// The internal systems hub (/links/): search, category filter, copy or share any link.
export function LinksHub() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  // "/" focuses the search, Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current) {
        e.preventDefault();
        input.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === input.current) {
        setQuery("");
        input.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const say = (text: string, ok = true) => {
    setToast({ text, ok });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  };

  const terms = norm(query).split(" ").filter(Boolean);
  const hit = (it: LinkItem) => terms.every((t) => norm(`${it.title} ${it.text} ${it.href} ${it.lock ?? ""}`).includes(t));
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const s of SECTIONS) {
      c[s.key] = s.items.filter((it) => terms.every((t) => norm(`${it.title} ${it.text} ${it.href} ${it.lock ?? ""}`).includes(t))).length;
      c.all += c[s.key];
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const visible = SECTIONS.filter((s) => filter === "all" || filter === s.key)
    .map((s) => ({ ...s, items: s.items.filter(hit) }))
    .filter((s) => s.items.length > 0);

  async function copy(href: string) {
    if (!(await copyText(absolute(href)))) return say("คัดลอกไม่สำเร็จ", false);
    setCopied(href);
    setTimeout(() => setCopied((c) => (c === href ? null : c)), 1500);
    say("คัดลอกลิงก์แล้ว");
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url: location.href });
      } catch {}
      return;
    }
    say((await copyText(location.href)) ? "คัดลอกลิงก์หน้านี้แล้ว" : "คัดลอกไม่สำเร็จ");
  }

  return (
    <div className="l-page">
      <div className="l-glow" aria-hidden />
      <div className="l-top">
        <AppLink href="/" className="l-pill" aria-label="ไปเว็บไซต์หลัก NEXT9">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://cdn.yumistack.net/next9/logo01.webp" alt="" width={26} height={26} />
          NEXT9 <span>/ INTERNAL</span>
        </AppLink>
        <div className="l-top-right">
          <span className="l-pill l-clock">
            <i className="fas fa-circle" aria-hidden />
            {now ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now) : "--:--:--"}
          </span>
          <button type="button" className="l-icon-btn" onClick={share} aria-label="แชร์หน้านี้">
            <i className="fas fa-share-nodes" aria-hidden />
          </button>
        </div>
      </div>

      <header className="l-hero">
        <span className="l-live"><span /> พื้นที่สำหรับสมาชิกสภานักเรียน</span>
        <h1>ศูนย์รวมระบบภายใน</h1>
        <p className="l-sub">สภานักเรียนโรงเรียนสิรินธร</p>
        <p className="l-greet">{now ? greeting(now) : " "}</p>
        <div className="l-stats">
          <div><b>{ALL.length}</b><span>ระบบทั้งหมด</span></div>
          <div><b>{SECTIONS.length}</b><span>หมวดหมู่</span></div>
          <div><b>{ALL.filter((i) => i.lock).length}</b><span>ต้องยืนยันตัวตน</span></div>
        </div>
      </header>

      <div className="l-command">
        <div className="l-command-inner">
          <label className="l-search">
            <i className="fas fa-magnifying-glass" aria-hidden />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาระบบ เช่น ตรวจอาคาร, ห้องน้ำ"
              autoComplete="off"
              enterKeyHint="search"
              aria-label="ค้นหาระบบ"
            />
            <kbd>/</kbd>
          </label>
          <div className="l-chips" role="tablist" aria-label="กรองตามหมวดหมู่">
            <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "is-on" : undefined} onClick={() => setFilter("all")}>
              ทั้งหมด <span>{counts.all}</span>
            </button>
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={filter === s.key} className={filter === s.key ? "is-on" : undefined} onClick={() => setFilter(s.key)}>
                <i className={s.icon} aria-hidden /> {s.title.replace("ของ NEXT9", "").replace("แบบฟอร์มงานสภานักเรียน", "แบบฟอร์ม").replace("สำหรับผู้ดูแล", "ผู้ดูแล")} <span>{counts[s.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="l-main">
        {visible.map((s, n) => (
          <section key={s.key} className={`l-section l-s-${s.key}`}>
            <div className="l-sec-head">
              <span className="l-sec-num">{String(SECTIONS.indexOf(SECTIONS.find((x) => x.key === s.key)!) + 1).padStart(2, "0")}</span>
              <div>
                <h2>{s.title} <small>{s.items.length}</small></h2>
                <p>{s.text}</p>
              </div>
            </div>
            {s.restricted && (
              <div className="l-restricted">
                <i className="fas fa-shield-halved" aria-hidden /> ทุกหน้าในหมวดนี้ต้องใช้รหัสผ่านหรือบัญชีผู้ดูแล กรุณาอย่าเผยแพร่ลิงก์ต่อ
              </div>
            )}
            <div className="l-grid">
              {s.items.map((it) => {
                const url = new URL(it.href, "https://next9-web.vercel.app");
                const body = (
                  <>
                    <span className="l-card-top">
                      <span className="l-ico"><i className={it.icon} aria-hidden /></span>
                      {it.lock && <span className="l-badge"><i className="fas fa-lock" aria-hidden /> {it.lock}</span>}
                    </span>
                    <b>{it.title}</b>
                    <span className="l-card-text">{it.text}</span>
                    <span className="l-url">
                      <em>{url.host}</em>
                      {(url.pathname + url.search).replace(/\/$/, "")}
                      <i className={it.external ? "fas fa-arrow-up-right-from-square" : "fas fa-arrow-right"} aria-hidden />
                    </span>
                  </>
                );
                return (
                  <div key={it.href} className="l-card" style={{ animationDelay: `${n * 40}ms` }}>
                    {it.external ? (
                      <a href={it.href} target="_blank" rel="noopener noreferrer" className="l-card-link">{body}</a>
                    ) : (
                      <AppLink href={it.href} className="l-card-link">{body}</AppLink>
                    )}
                    <button type="button" className={`l-copy${copied === it.href ? " is-done" : ""}`} onClick={() => copy(it.href)} aria-label={`คัดลอกลิงก์ ${it.title}`}>
                      <i className={copied === it.href ? "fas fa-check" : "far fa-copy"} aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {visible.length === 0 && (
          <div className="l-empty">
            <i className="fas fa-magnifying-glass" aria-hidden />
            <p>ไม่พบระบบที่ค้นหา</p>
            <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>ล้างการค้นหา</button>
          </div>
        )}
      </main>

      <footer className="l-footer">
        <AppLink href="/"><i className="fas fa-arrow-left" aria-hidden /> เว็บไซต์หลัก</AppLink>
      </footer>

      {toast && (
        <div className="l-toast">
          <i className={toast.ok ? "fas fa-check-circle" : "fas fa-circle-exclamation"} aria-hidden /> {toast.text}
        </div>
      )}
    </div>
  );
}
