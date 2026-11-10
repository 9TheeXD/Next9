"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { formatWeekRanges } from "./pinkbook";

// Submission history drawer: GET /api/pinkbook/history?name=… → { success, names: [{name, n}], data }.
type Row = {
  action: string;
  created_at: string;
  grade: string;
  room: string;
  group_name: string;
  inspected_week: number;
  status: string;
  issues: string;
  unsubmitted_weeks: string;
  action_by: string;
  diff_summary?: string;
};

const ACTIONS: Record<string, { label: string; icon: string; cls: string }> = {
  submit: { label: "ส่งผลการตรวจ", icon: "fa-paper-plane", cls: "is-submit" },
  edit: { label: "แก้ไขข้อมูล", icon: "fa-pen", cls: "is-edit" },
  delete: { label: "ลบข้อมูล", icon: "fa-trash", cls: "is-delete" },
  revert: { label: "ย้อนกลับ", icon: "fa-rotate-left", cls: "is-revert" },
};

// created_at is SQLite's CURRENT_TIMESTAMP: UTC without a zone marker.
const parseTime = (s: string) => new Date(String(s || "").replace(" ", "T") + "Z");
function thaiDay(d: Date) {
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "วันนี้";
  if (d.toDateString() === y.toDateString()) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function History({ open, me, onClose, refreshRef }: { open: boolean; me: string; onClose: () => void; refreshRef: MutableRefObject<() => void> }) {
  const [name, setName] = useState<string | null>(null);
  const [names, setNames] = useState<{ name: string; n: number }[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  const load = useCallback(async (who: string, quiet?: boolean) => {
    const top = body.current?.scrollTop ?? 0;
    if (!quiet) {
      setRows(null);
      setError(false);
    }
    try {
      const j = await (await fetch(`/api/pinkbook/history?name=${encodeURIComponent(who)}&t=${Date.now()}`)).json();
      if (!j.success) throw new Error();
      setNames(j.names || []);
      setRows(j.data || []);
      setError(false);
      if (quiet) requestAnimationFrame(() => body.current && (body.current.scrollTop = top));
    } catch {
      if (!quiet) setError(true);
    }
  }, []);

  // First open: this inspector's own history if they have typed their name.
  useEffect(() => {
    if (!open) return;
    const who = name ?? me;
    const t = setTimeout(() => {
      if (name === null) setName(me);
      load(who);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    refreshRef.current = () => load(name ?? "", true);
  }, [refreshRef, load, name]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const current = name ?? "";
  const options = names.some((n) => n.name === current) || !current ? names : [{ name: current, n: 0 }, ...names];
  let lastDay = "";

  return (
    <>
      <div className={`pb-drawer-overlay${open ? " is-open" : ""}`} onClick={onClose} />
      <aside className={`pb-drawer${open ? " is-open" : ""}`} aria-hidden={!open} aria-label="ประวัติการส่ง">
        <div className="pb-drawer-head">
          <div>
            <h3><i className="fas fa-clock-rotate-left" aria-hidden /> ประวัติการส่ง</h3>
            <p className="t-muted">{rows === null ? "กำลังโหลด…" : rows.length ? `${rows.length} รายการล่าสุด${current ? " · " + current : ""}` : "ไม่มีประวัติ"}</p>
          </div>
          <button type="button" className="t-icon-btn" onClick={onClose} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
        </div>
        <div className="pb-drawer-filter">
          <select
            className="t-input"
            value={current}
            onChange={(e) => {
              setName(e.target.value);
              load(e.target.value);
            }}
            aria-label="เลือกชื่อผู้ตรวจ"
          >
            <option value="">ทุกคน</option>
            {options.map((n) => (
              <option key={n.name} value={n.name}>{n.name}{n.n ? ` (${n.n})` : ""}</option>
            ))}
          </select>
          {current && <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={() => { setName(""); load(""); }}>ล้าง</button>}
        </div>
        <div className="pb-drawer-body" ref={body}>
          {error ? (
            <div className="t-empty">
              <i className="fas fa-triangle-exclamation" aria-hidden />
              โหลดประวัติไม่สำเร็จ
              <br />
              <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={() => load(current)}>ลองใหม่</button>
            </div>
          ) : rows === null ? (
            <div className="t-empty"><i className="fas fa-spinner fa-spin" aria-hidden />กำลังโหลดประวัติ…</div>
          ) : rows.length === 0 ? (
            <div className="t-empty"><i className="far fa-calendar-xmark" aria-hidden />ยังไม่มีประวัติการส่ง</div>
          ) : (
            rows.map((r, i) => {
              const d = parseTime(r.created_at);
              const day = thaiDay(d);
              const showDay = day !== lastDay;
              lastDay = day;
              const m = ACTIONS[r.action] || { label: r.action, icon: "fa-circle", cls: "" };
              let unsub: number[] = [];
              try {
                const w = JSON.parse(r.unsubmitted_weeks || "[]");
                if (Array.isArray(w)) unsub = w;
              } catch {}
              return (
                <div key={i}>
                  {showDay && <h4 className="pb-tl-day">{day}</h4>}
                  <div className={`pb-tl ${m.cls}`}>
                    <span className="pb-tl-dot"><i className={`fas ${m.icon}`} aria-hidden /></span>
                    <div className="pb-tl-card">
                      <div className="pb-tl-top">
                        <b>{m.label}</b>
                        <time>{d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</time>
                      </div>
                      <div className="pb-tl-room">
                        <b>{r.grade}/{r.room}{r.group_name && r.group_name !== "-" ? ` กลุ่ม ${r.group_name}` : ""}</b>
                        <span className="pb-tl-week">สัปดาห์ {r.inspected_week}</span>
                        {r.status && <span className={`pb-status ${r.status === "เรียบร้อย" ? "is-neat" : "is-messy"}`}>{r.status}</span>}
                      </div>
                      {r.issues && r.issues !== "-" && <div className="pb-tl-issues">{String(r.issues).split(",<br>").join(" · ")}</div>}
                      {unsub.length > 0 && <div className="t-muted pb-tl-meta"><i className="far fa-calendar-xmark" aria-hidden /> ยังไม่ส่งสัปดาห์ {formatWeekRanges(unsub)}</div>}
                      <div className="t-muted pb-tl-meta"><i className="fas fa-user" aria-hidden /> {r.action_by}{r.diff_summary && r.action !== "submit" ? ` · ${r.diff_summary}` : ""}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
