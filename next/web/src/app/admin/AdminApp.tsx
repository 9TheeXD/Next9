"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/tool/Tool";
import { AuthError, adminFetch, getToken, setToken } from "./api";
import { FieldEditor } from "./fields";
import { PAGES, type PageDef, type Part } from "./pages";
import { AllLinks, Dashboard, Handover, Passwords, Secrets } from "./special";
import { Classes, Council, Terms } from "./central";
import { AssessAccounts, AssessLock, AssessPeople, AssessTime } from "./assess";

// /admin/: sign in with the admin password, then one page per system (pages.ts). The page shown
// is in the URL hash (#site, #building …) so a link can point straight at it.

export function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pageId, setPageId] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const toast = useToast();

  useEffect(() => {
    const read = () => setPageId(location.hash.slice(1) || "dashboard");
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      const t = setTimeout(() => setAuthed(false), 0);
      return () => clearTimeout(t);
    }
    adminFetch("/api/admin/me")
      .then(() => setAuthed(true))
      .catch(() => {
        setToken(null);
        setAuthed(false);
      });
  }, []);

  const onAuthError = useCallback(() => {
    setToken(null);
    setAuthed(false);
  }, []);

  const page = PAGES.find((p) => p.id === pageId) || PAGES[0];
  const groups = useMemo(() => {
    const g: { name: string; pages: PageDef[] }[] = [];
    for (const p of PAGES) {
      const last = g[g.length - 1];
      if (last && last.name === p.group) last.pages.push(p);
      else g.push({ name: p.group, pages: [p] });
    }
    return g;
  }, []);

  if (authed === null) return <div className="a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></div>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  return (
    <div className="a-app">
      <aside className={`a-side${menuOpen ? " is-open" : ""}`}>
        <div className="a-brand">
          <i className="fas fa-gears" aria-hidden /> หน้าจัดการระบบ
        </div>
        <nav>
          {groups.map((g) => (
            <div key={g.name} className="a-nav-group">
              <div className="a-nav-title">{g.name}</div>
              {g.pages.map((p) => (
                <a key={p.id} href={`#${p.id}`} className={p.id === page.id ? "is-on" : undefined} onClick={() => setMenuOpen(false)}>
                  <i className={p.icon} aria-hidden /> {p.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="a-side-foot">
          <a href="/links/"><i className="fas fa-arrow-left" aria-hidden /> หน้ารวมลิงก์</a>
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setAuthed(false);
            }}
          >
            <i className="fas fa-right-from-bracket" aria-hidden /> ออกจากระบบ
          </button>
        </div>
      </aside>
      {menuOpen && <div className="a-scrim" onClick={() => setMenuOpen(false)} />}
      <main className="a-main">
        <header className="a-top">
          <button type="button" className="t-icon-btn a-burger" onClick={() => setMenuOpen(true)} aria-label="เมนู">
            <i className="fas fa-bars" aria-hidden />
          </button>
          <h1>
            <i className={page.icon} aria-hidden /> {page.title}
          </h1>
        </header>
        {page.intro && <p className="a-intro">{page.intro}</p>}
        {page.links && (
          <div className="a-links">
            {page.links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="t-btn t-btn-sm t-btn-ghost">
                <i className={l.icon || "fas fa-arrow-up-right-from-square"} aria-hidden /> {l.label}
              </a>
            ))}
          </div>
        )}
        <div key={page.id} className={page.preview ? "a-split" : undefined}>
          <div className="a-split-main">
            {page.custom === "dashboard" && <Dashboard toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "handover" && <Handover />}
            {page.custom === "passwords" && <Passwords toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "secrets" && <Secrets toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "terms" && <Terms toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "classes" && <Classes toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "council" && <Council toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "all_links" && <AllLinks toast={toast.show} />}
            {page.custom === "assess_lock" && <AssessLock toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "assess_time" && <AssessTime toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "assess_people" && <AssessPeople toast={toast.show} onAuthError={onAuthError} />}
            {page.custom === "assess_accounts" && <AssessAccounts toast={toast.show} onAuthError={onAuthError} />}
            {page.parts?.map((part, i) => (
              <PartEditor key={i} part={part} toast={toast.show} onAuthError={onAuthError} onSaved={() => setPreviewKey((k) => k + 1)} />
            ))}
          </div>
          {page.preview && (
            <aside className="a-preview">
              <div className="a-preview-bar">
                <span><i className="fas fa-eye" aria-hidden /> ตัวอย่าง {page.preview}</span>
                <button type="button" className="t-icon-btn" onClick={() => setPreviewKey((k) => k + 1)} aria-label="โหลดใหม่"><i className="fas fa-rotate" aria-hidden /></button>
                <a className="t-icon-btn" href={page.preview} target="_blank" rel="noopener noreferrer" aria-label="เปิดแท็บใหม่"><i className="fas fa-up-right-from-square" aria-hidden /></a>
              </div>
              <iframe key={previewKey} src={`${page.preview}${page.preview.includes("?") ? "&" : "?"}preview=${previewKey}`} title="ตัวอย่างหน้าเว็บ" />
            </aside>
          )}
        </div>
      </main>
      {toast.node}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="t-page">
      <div className="t-center">
        <form
          className="t-login"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
              const j = await r.json().catch(() => ({}));
              if (!r.ok || !j.token) throw new Error(j.message || "รหัสผ่านไม่ถูกต้อง");
              setToken(j.token);
              onDone();
            } catch (err) {
              setError((err as Error).message);
              setPassword("");
            }
            setBusy(false);
          }}
        >
          <i className="fas fa-user-shield t-login-icon" aria-hidden />
          <h2>หน้าจัดการระบบ</h2>
          <p className="t-muted">ใส่รหัสผ่านผู้ดูแล</p>
          <input type="password" className="t-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="รหัสผ่าน" autoFocus />
          {error && <span className="t-login-error">{error}</span>}
          <button type="submit" className="t-btn t-btn-block" disabled={busy || !password}>
            {busy ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}

function sourceUrl(part: Part) {
  return part.source.kind === "settings" ? `/api/admin/settings/${part.source.name}` : `/api/admin/doc/${part.source.name}`;
}

function PartEditor({ part, toast, onAuthError, onSaved }: { part: Part; toast: (t: string, k?: "success" | "error") => void; onAuthError: () => void; onSaved?: () => void }) {
  const [stored, setStored] = useState<any>(undefined);
  const [form, setForm] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await adminFetch(sourceUrl(part));
      setStored(j.value);
      setForm(part.toForm ? part.toForm(j.value) : j.value);
      setDirty(false);
      setError("");
    } catch (e) {
      if (e instanceof AuthError) return onAuthError();
      setError((e as Error).message);
    }
  }, [part, onAuthError]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function save() {
    setSaving(true);
    try {
      const body = part.fromForm ? part.fromForm(form, stored) : form;
      const j = await adminFetch(sourceUrl(part), { method: "PUT", body: JSON.stringify(body) });
      setStored(j.value);
      setForm(part.toForm ? part.toForm(j.value) : j.value);
      setDirty(false);
      toast("บันทึกแล้ว");
      onSaved?.();
    } catch (e) {
      if (e instanceof AuthError) return onAuthError();
      toast((e as Error).message, "error");
    }
    setSaving(false);
  }

  if (error) return <div className="t-card a-part"><p className="a-error">โหลดไม่สำเร็จ: {error}</p><button type="button" className="t-btn t-btn-sm" onClick={load}>ลองใหม่</button></div>;
  if (form == null) return <div className="t-card a-part a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></div>;

  return (
    <section className="t-card a-part">
      {part.title && <h2 className="a-part-title">{part.title}</h2>}
      {part.help && <p className="a-help a-part-help">{part.help}</p>}
      {part.fields.map((f) => (
        <FieldEditor
          key={f.key}
          field={f}
          value={form?.[f.key]}
          onChange={(v) => {
            setForm((cur: any) => ({ ...cur, [f.key]: v }));
            setDirty(true);
          }}
        />
      ))}
      {dirty && (
      <div className="a-save is-dirty">
        <span>มีการแก้ไขที่ยังไม่บันทึก{part.title ? ` (${part.title})` : ""}</span>
        <button type="button" className="t-btn t-btn-ghost t-btn-sm" disabled={!dirty || saving} onClick={load}>
          ยกเลิกการแก้ไข
        </button>
        <button type="button" className="t-btn" disabled={!dirty || saving} onClick={save}>
          <i className={saving ? "fas fa-spinner fa-spin" : "fas fa-floppy-disk"} aria-hidden /> บันทึก
        </button>
      </div>
      )}
    </section>
  );
}
