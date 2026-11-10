"use client";

import { useEffect, useState } from "react";
import { StateCard, ToolShell, useToast } from "@/components/tool/Tool";

// Google Sheets settings of the inert form (/forms/inert/edit/). Same requests as the old page:
// GET /api/inert/config, POST /api/inert/config (Authorization: editor password) with
// { COLUMNS, SHEET_ID, SHEET_RANGE, SHEET_JUNIOR_RANGE, SHEET_HIGH_RANGE, terms }. The password is
// remembered in the same cookie (inert_admin_pwd, 30 days) after a successful save.

type Column = { id: number; header: string; source: string };
type TermCfg = { SHEET_ID: string; SHEET_RANGE: string; SHEET_JUNIOR_RANGE: string; SHEET_HIGH_RANGE: string };

const SOURCES = [
  { value: "timestamp", label: "ประทับเวลา (Timestamp)" },
  { value: "dateFormatted", label: "วันที่ (Date)" },
  { value: "inspector", label: "ชื่อผู้ตรวจ (Inspector)" },
  { value: "studentId", label: "รหัสนักเรียน (Student ID)" },
  { value: "name", label: "ชื่อ-สกุล (Name)" },
  { value: "cls", label: "ชั้น (Class)" },
  { value: "room", label: "ห้อง (Room)" },
  { value: "number", label: "เลขที่ (Number)" },
  { value: "typeVal", label: "สาย/เฉื่อย (Type)" },
  { value: "violations", label: "รายการผิดระเบียบ (Violations)" },
  { value: "", label: "-- ว่างเปล่า (Empty) --" },
];
const EMPTY_TERM: TermCfg = { SHEET_ID: "", SHEET_RANGE: "Sheet1", SHEET_JUNIOR_RANGE: "ม.ต้น", SHEET_HIGH_RANGE: "ม.ปลาย" };

let colSeq = 0;
const col = (header: string, source: string): Column => ({ id: ++colSeq, header, source });

function parseSpreadsheetId(val: string) {
  if (!val) return "";
  val = val.trim();
  const m = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : val;
}

// The values the old page stored for a term: id parsed out of a URL, empty tab names back to defaults.
function cleanTerm(t: TermCfg): TermCfg {
  return {
    SHEET_ID: parseSpreadsheetId(t.SHEET_ID),
    SHEET_RANGE: t.SHEET_RANGE.trim() || "Sheet1",
    SHEET_JUNIOR_RANGE: t.SHEET_JUNIOR_RANGE.trim() || "ม.ต้น",
    SHEET_HIGH_RANGE: t.SHEET_HIGH_RANGE.trim() || "ม.ปลาย",
  };
}

function letter(i: number) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "";
  for (let t = i; t >= 0; t = Math.floor(t / 26) - 1) s = A[t % 26] + s;
  return s;
}

function getCookie(name: string) {
  const v = document.cookie.match("(^|;) ?" + name + "=([^;]*)(;|$)");
  return v ? v[2] : "";
}

function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setTime(d.getTime() + 24 * 60 * 60 * 1000 * days);
  document.cookie = name + "=" + value + ";path=/;expires=" + d.toUTCString();
}

export function InertEdit() {
  const [loaded, setLoaded] = useState(false);
  const [term, setTerm] = useState<"1" | "2">("2");
  const [terms, setTerms] = useState<Record<"1" | "2", TermCfg>>({ "1": { ...EMPTY_TERM }, "2": { ...EMPTY_TERM } });
  const [columns, setColumns] = useState<Column[]>([]);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const say = toast.show;

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => setPassword(getCookie("inert_admin_pwd")), 0);
    (async () => {
      try {
        const data = await (await fetch("/api/inert/config")).json();
        if (!alive || !data.success) return;
        const cfg = data.config;
        if (cfg.COLUMNS) setColumns(cfg.COLUMNS.map((c: { header: string; source: string }) => col(c.header, c.source)));
        else if (cfg.HEADERS) setColumns(cfg.HEADERS.map((h: string, i: number) => col(h, SOURCES[i] ? SOURCES[i].value : "")));
        const base: TermCfg = {
          SHEET_ID: cfg.SHEET_ID || "",
          SHEET_RANGE: cfg.SHEET_RANGE || "Sheet1",
          SHEET_JUNIOR_RANGE: cfg.SHEET_JUNIOR_RANGE || "ม.ต้น",
          SHEET_HIGH_RANGE: cfg.SHEET_HIGH_RANGE || "ม.ปลาย",
        };
        setTerms({ "1": { ...base, ...(cfg.terms?.["1"] || {}) }, "2": { ...base, ...(cfg.terms?.["2"] || {}) } });
        setLoaded(true);
      } catch {
        if (alive) say("ไม่สามารถโหลดข้อมูลได้", "error");
      }
    })();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [say]);

  const cur = terms[term];
  const setCur = (patch: Partial<TermCfg>) => setTerms((t) => ({ ...t, [term]: { ...t[term], ...patch } }));

  // Switching terms keeps what was typed in the other one, cleaned up the way the old page did.
  function switchTerm(next: "1" | "2") {
    setTerms((t) => ({ ...t, [term]: cleanTerm(t[term]) }));
    setTerm(next);
  }

  function move(i: number, d: number) {
    setColumns((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    const pwd = password.trim();
    if (!pwd) return say("กรุณากรอกรหัสผ่านแอดมินเพื่อบันทึกข้อมูล", "error");
    const allTerms = { ...terms, [term]: cleanTerm(terms[term]) };
    setTerms(allTerms);
    const active = allTerms[term];
    const payload = {
      COLUMNS: columns.map((c) => ({ header: c.header.trim(), source: c.source })),
      SHEET_ID: active.SHEET_ID || allTerms["2"].SHEET_ID || allTerms["1"].SHEET_ID,
      SHEET_RANGE: active.SHEET_RANGE || "Sheet1",
      SHEET_JUNIOR_RANGE: active.SHEET_JUNIOR_RANGE || "ม.ต้น",
      SHEET_HIGH_RANGE: active.SHEET_HIGH_RANGE || "ม.ปลาย",
      terms: allTerms,
    };
    setSaving(true);
    try {
      const res = await fetch("/api/inert/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: pwd },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) say("รหัสผ่านแอดมินไม่ถูกต้อง!", "error");
      else {
        const data = await res.json();
        if (data.success) {
          setCookie("inert_admin_pwd", pwd, 30);
          say("บันทึกข้อมูลการตั้งค่าเรียบร้อยแล้ว!");
        } else say(data.message || "บันทึกข้อมูลล้มเหลว", "error");
      }
    } catch {
      say("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
    }
    setSaving(false);
  }

  if (!loaded) return <StateCard icon="fas fa-spinner fa-spin" title="กำลังโหลด..." />;

  return (
    <ToolShell title="ตั้งค่าแบบฟอร์มสาย - เฉื่อย" icon="fas fa-sliders" sub="กำหนด Google Sheets แยกตามภาคเรียน และจัดเรียงคอลัมน์ที่บันทึกลงชีต">
      <section className="t-card">
        <div className="edit-head">
          <h2 className="t-card-title"><i className="fas fa-table" aria-hidden /> Google Sheets</h2>
          <div className="edit-terms" role="tablist">
            <button type="button" role="tab" aria-selected={term === "2"} className={term === "2" ? "is-on" : undefined} onClick={() => switchTerm("2")}>ภาคเรียนที่ 2 (ปัจจุบัน)</button>
            <button type="button" role="tab" aria-selected={term === "1"} className={term === "1" ? "is-on" : undefined} onClick={() => switchTerm("1")}>ภาคเรียนที่ 1</button>
          </div>
        </div>
        <label className="inert-field">
          <span className="t-label">Spreadsheet ID หรือ URL ลิงก์ของชีต <span className="t-req">*</span></span>
          <input
            className="t-input"
            value={cur.SHEET_ID}
            onChange={(e) => setCur({ SHEET_ID: e.target.value })}
            onBlur={(e) => {
              const p = parseSpreadsheetId(e.target.value);
              if (p && p !== e.target.value) setCur({ SHEET_ID: p });
            }}
            placeholder="วางลิงก์ Google Sheets หรือ ID"
          />
          <span className="inert-hint">วางทั้งลิงก์ได้ ระบบดึงเฉพาะ Spreadsheet ID ให้อัตโนมัติ</span>
        </label>
        {cur.SHEET_ID && (
          <a className="edit-open" href={`https://docs.google.com/spreadsheets/d/${parseSpreadsheetId(cur.SHEET_ID)}`} target="_blank" rel="noopener noreferrer">
            <i className="fas fa-arrow-up-right-from-square" aria-hidden /> เปิดชีตนี้
          </a>
        )}
        <div className="edit-tabs">
          <label className="inert-field">
            <span className="t-label">ชื่อแท็บชีตรวม</span>
            <input className="t-input" value={cur.SHEET_RANGE} onChange={(e) => setCur({ SHEET_RANGE: e.target.value })} placeholder="เช่น Sheet1 หรือ รวม" />
          </label>
          <label className="inert-field">
            <span className="t-label">ชื่อแท็บ ม.ต้น</span>
            <input className="t-input" value={cur.SHEET_JUNIOR_RANGE} onChange={(e) => setCur({ SHEET_JUNIOR_RANGE: e.target.value })} placeholder="เช่น ม.ต้น" />
          </label>
          <label className="inert-field">
            <span className="t-label">ชื่อแท็บ ม.ปลาย</span>
            <input className="t-input" value={cur.SHEET_HIGH_RANGE} onChange={(e) => setCur({ SHEET_HIGH_RANGE: e.target.value })} placeholder="เช่น ม.ปลาย" />
          </label>
        </div>
      </section>

      <section className="t-card">
        <div className="edit-head">
          <h2 className="t-card-title"><i className="fas fa-table-columns" aria-hidden /> คอลัมน์ในชีต ({columns.length})</h2>
          <button type="button" className="t-btn t-btn-sm t-btn-ghost" onClick={() => setColumns((l) => [...l, col("", "")])}>
            <i className="fas fa-plus" aria-hidden /> เพิ่มคอลัมน์
          </button>
        </div>
        <div className="t-list">
          {columns.map((c, i) => (
            <div key={c.id} className="t-row edit-col">
              <span className="edit-letter">{letter(i)}</span>
              <div className="edit-col-inputs">
                <input className="t-input" value={c.header} onChange={(e) => setColumns((l) => l.map((x) => (x.id === c.id ? { ...x, header: e.target.value } : x)))} placeholder="ชื่อหัวคอลัมน์" aria-label={`ชื่อคอลัมน์ ${letter(i)}`} />
                <select className="t-input" value={c.source} onChange={(e) => setColumns((l) => l.map((x) => (x.id === c.id ? { ...x, source: e.target.value } : x)))} aria-label={`ข้อมูลคอลัมน์ ${letter(i)}`}>
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="edit-col-actions">
                <button type="button" className="t-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น"><i className="fas fa-arrow-up" aria-hidden /></button>
                <button type="button" className="t-icon-btn" onClick={() => move(i, 1)} disabled={i === columns.length - 1} aria-label="เลื่อนลง"><i className="fas fa-arrow-down" aria-hidden /></button>
                <button type="button" className="t-icon-btn" onClick={() => setColumns((l) => l.filter((x) => x.id !== c.id))} aria-label="ลบคอลัมน์"><i className="fas fa-trash-alt" aria-hidden /></button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="t-bar edit-bar">
        <input
          type="password"
          className="t-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="รหัสผ่านแอดมิน"
          aria-label="รหัสผ่านแอดมิน"
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button type="button" className="t-btn" onClick={save} disabled={saving}>
          {saving ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-save" aria-hidden />} บันทึก
        </button>
      </div>
      {toast.node}
    </ToolShell>
  );
}
