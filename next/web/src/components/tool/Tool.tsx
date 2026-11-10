"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./tool.css";

// Shared pieces for the council's tool pages (forms, dashboards, admin screens): page shell, toast,
// password gate and confirm dialog. Native alert()/confirm() are not used; LINE's in-app browser
// shows them with the site's URL as the title and some phones block them outright.

export function ToolShell({ title, icon, sub, children, wide }: { title: string; icon: string; sub?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="t-page">
      <header className="t-head">
        <div className={`t-head-inner${wide ? " is-wide" : ""}`}>
          <h1>
            <i className={icon} aria-hidden /> {title}
          </h1>
          {sub && <div className="t-head-sub">{sub}</div>}
        </div>
      </header>
      <main className={`t-main${wide ? " is-wide" : ""}`}>{children}</main>
    </div>
  );
}

export type ToastKind = "success" | "error";

export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string, kind: ToastKind = "success") => {
    setToast({ text, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  const node = toast ? (
    <div className={`t-toast is-${toast.kind}`} role="status">
      <i className={toast.kind === "success" ? "fas fa-check-circle" : "fas fa-circle-exclamation"} aria-hidden /> {toast.text}
    </div>
  ) : null;
  return { show, node };
}

export function useConfirm() {
  const [state, setState] = useState<{ text: string; ok: string; resolve: (v: boolean) => void } | null>(null);
  const ask = useCallback((text: string, ok = "ยืนยัน") => new Promise<boolean>((resolve) => setState({ text, ok, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const node = state ? (
    <div className="t-modal t-confirm" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && done(false)}>
      <div className="t-modal-card">
        <p>{state.text}</p>
        <div className="t-modal-actions">
          <button type="button" className="t-btn t-btn-ghost" onClick={() => done(false)}>ยกเลิก</button>
          <button type="button" className="t-btn" onClick={() => done(true)} autoFocus>{state.ok}</button>
        </div>
      </div>
    </div>
  ) : null;
  return { ask, node };
}

export function readStored(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

// Password gate. `verify` returns true for a good password; `storageKey` is the localStorage key the
// old page used, so people who signed in before stay signed in.
export function useStoredPassword(storageKey: string) {
  const [password, setPassword] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setPassword(readStored(storageKey)), 0);
    return () => clearTimeout(t);
  }, [storageKey]);
  const save = useCallback(
    (pw: string) => {
      writeStored(storageKey, pw || null);
      setPassword(pw);
    },
    [storageKey],
  );
  return [password, save] as const;
}

export function LoginCard({
  title,
  sub,
  icon,
  verify,
  onDone,
}: {
  title: string;
  sub: string;
  icon: string;
  verify: (pw: string) => Promise<"ok" | "bad" | "offline">;
  onDone: (pw: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="t-center">
      <form
        className="t-login"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value) return;
          setBusy(true);
          const r = await verify(value);
          setBusy(false);
          if (r === "ok") onDone(value);
          else setError(r === "bad" ? "รหัสผ่านไม่ถูกต้อง" : "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์");
        }}
      >
        <i className={`${icon} t-login-icon`} aria-hidden />
        <h1>{title}</h1>
        <p>{sub}</p>
        <input type="password" value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} placeholder="รหัสผ่าน" autoFocus />
        {error && <span className="t-login-error">{error}</span>}
        <button type="submit" className="t-btn t-btn-block" disabled={busy || !value}>
          {busy ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-right-to-bracket" aria-hidden />} เข้าสู่ระบบ
        </button>
      </form>
    </div>
  );
}

export function StateCard({ icon, title, children, tone }: { icon: string; title: string; children?: React.ReactNode; tone?: "ok" | "bad" }) {
  return (
    <div className="t-center">
      <div className="t-state">
        <span className={`t-state-icon${tone ? ` is-${tone}` : ""}`}><i className={icon} aria-hidden /></span>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
