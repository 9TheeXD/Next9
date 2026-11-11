"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import { AuthError, getToken } from "./api";
import { SortableList } from "./Sortable";
import { Chips } from "./fields";

// The assessment system's (assessRow) admin settings, through NEXT9's server (/api/admin/assess/*,
// server/admin.mjs), which calls assessRow's own admin APIs with the shared secret.

type Toast = (t: string, k?: "success" | "error") => void;
type Props = { toast: Toast; onAuthError: () => void };

async function assess(path: string, init: RequestInit = {}) {
  const res = await fetch(`/api/admin/assess/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(init.headers || {}) },
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 && j.message === "กรุณาเข้าสู่ระบบใหม่") throw new AuthError(j.message);
  if (!res.ok || j.success === false) throw new Error(j.message || j.error || `HTTP ${res.status}`);
  return j;
}

function useLoad<T>(path: string, onAuthError: () => void, toast: Toast) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await assess(path));
      setError("");
    } catch (e) {
      if (e instanceof AuthError) return onAuthError();
      setError((e as Error).message);
    }
  }, [path, onAuthError]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  const run = useCallback(
    async (p: string, init: RequestInit, ok?: string) => {
      try {
        const j = await assess(p, init);
        if (ok || j.message) toast(ok || j.message);
        await load();
        return j;
      } catch (e) {
        if (e instanceof AuthError) return onAuthError();
        toast((e as Error).message, "error");
      }
    },
    [load, onAuthError, toast],
  );
  return { data, error, load, run };
}

function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <section className="t-card a-part">
      <p className="a-error">ติดต่อระบบประเมินไม่ได้: {error}</p>
      <button type="button" className="t-btn t-btn-sm" onClick={retry}>ลองใหม่</button>
    </section>
  );
}
const Loading = () => <p className="a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></p>;

// ---------------- Lock ----------------
export function AssessLock({ toast, onAuthError }: Props) {
  const { data, error, load, run } = useLoad<any>("settings/lock", onAuthError, toast);
  const [form, setForm] = useState<{ target: string; until: string; title: string; message: string } | null>(null);
  useEffect(() => {
    if (data && !form) {
      const t = setTimeout(() => setForm({ target: data.target || "all", until: "", title: data.title || "", message: data.message || "" }), 0);
      return () => clearTimeout(t);
    }
  }, [data, form]);
  if (error) return <Failed error={error} retry={load} />;
  if (!data || !form) return <Loading />;
  const post = (body: any) => run("settings/lock", { method: "POST", body: JSON.stringify(body) });
  return (
    <section className="t-card a-part">
      <div className={`a-bigstate${data.locked ? " is-bad" : " is-ok"}`}>
        <i className={data.locked ? "fas fa-lock" : "fas fa-lock-open"} aria-hidden />
        <div>
          <b>{data.locked ? "ระบบปิดอยู่" : "ระบบเปิดใช้งาน"}</b>
          {data.locked && <small>{data.target === "student" ? "ปิดเฉพาะนักเรียน" : "ปิดทุกคน (ยกเว้นแอดมิน)"}{data.lockUntil ? ` · เปิดเองเมื่อ ${new Date(data.lockUntil).toLocaleString("th-TH")}` : ""}</small>}
        </div>
        {data.locked && <button type="button" className="t-btn" onClick={() => post({ action: "unlock" })}>เปิดระบบ</button>}
      </div>
      <div className="a-field">
        <span className="t-label">ปิดสำหรับ</span>
        <div className="a-seg">
          <button type="button" className={form.target === "all" ? "is-on" : undefined} onClick={() => setForm({ ...form, target: "all" })}>ทุกคน</button>
          <button type="button" className={form.target === "student" ? "is-on" : undefined} onClick={() => setForm({ ...form, target: "student" })}>เฉพาะนักเรียน</button>
        </div>
      </div>
      <label className="a-field">
        <span className="t-label">เปิดเองอัตโนมัติเมื่อ (เว้นว่าง = ปิดจนกว่าจะกดเปิด)</span>
        <input className="t-input" type="datetime-local" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />
      </label>
      <label className="a-field">
        <span className="t-label">หัวข้อที่ผู้ใช้เห็น (เว้นว่าง = ข้อความมาตรฐาน)</span>
        <input className="t-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label className="a-field">
        <span className="t-label">ข้อความ</span>
        <textarea className="t-input a-textarea" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </label>
      <div className="a-links">
        <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={() => post({ action: "text", title: form.title, message: form.message })}>บันทึกข้อความ</button>
        <button type="button" className="t-btn" onClick={() => post({ action: "lock", target: form.target, until: form.until ? new Date(form.until).toISOString() : undefined, title: form.title, message: form.message })}>
          <i className="fas fa-lock" aria-hidden /> {data.locked ? "ปิดระบบด้วยค่าใหม่" : "ปิดระบบ"}
        </button>
      </div>
    </section>
  );
}

// ---------------- Time and days ----------------
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
type DayNote = { date: string; note: string };

function DateList({ label, help, value, onChange }: { label: string; help: string; value: DayNote[]; onChange: (v: DayNote[]) => void }) {
  const [d, setD] = useState("");
  const [n, setN] = useState("");
  return (
    <div className="a-field">
      <span className="t-label">{label} <em className="a-count">{value.length} วัน</em></span>
      <small className="a-help">{help}</small>
      <div className="a-daylist">
        {[...value].sort((a, b) => a.date.localeCompare(b.date)).map((x) => (
          <span key={x.date} className="a-day">
            <b>{new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "2-digit" }).format(new Date(x.date + "T00:00:00"))}</b>
            {x.note && <small>{x.note}</small>}
            <button type="button" onClick={() => onChange(value.filter((y) => y.date !== x.date))} aria-label="ลบ"><i className="fas fa-xmark" aria-hidden /></button>
          </span>
        ))}
      </div>
      <div className="a-inline">
        <input className="t-input" type="date" value={d} onChange={(e) => setD(e.target.value)} />
        <input className="t-input" placeholder="หมายเหตุ (เช่น วันหยุด, สอบ)" value={n} onChange={(e) => setN(e.target.value)} />
        <button type="button" className="t-btn t-btn-sm" disabled={!d} onClick={() => { onChange([...value.filter((y) => y.date !== d), { date: d, note: n.trim() }]); setD(""); setN(""); }}>
          <i className="fas fa-plus" aria-hidden /> เพิ่ม
        </button>
      </div>
    </div>
  );
}

export function AssessTime({ toast, onAuthError }: Props) {
  const { data, error, load, run } = useLoad<any>("settings/eval-time", onAuthError, toast);
  const [win, setWin] = useState<{ from: string; to: string } | null>(null);
  const [daysCfg, setDays] = useState<{ weekdays: number[]; closed: DayNote[]; open: DayNote[] } | null>(null);
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      setWin({ from: data.from, to: data.to });
      setDays({ weekdays: data.days?.weekdays ?? [1, 2, 3, 4, 5], closed: data.days?.closed ?? [], open: data.days?.open ?? [] });
    }, 0);
    return () => clearTimeout(t);
  }, [data]);
  if (error) return <Failed error={error} retry={load} />;
  if (!win || !daysCfg) return <Loading />;
  return (
    <>
      <section className="t-card a-part">
        <h2 className="a-part-title">ช่วงเวลาที่กรอกคะแนนได้ (เวลาไทย)</h2>
        <div className="a-inline">
          <label><span className="t-label">ตั้งแต่</span><input className="t-input" type="time" value={win.from} onChange={(e) => setWin({ ...win, from: e.target.value })} /></label>
          <label><span className="t-label">ถึง</span><input className="t-input" type="time" value={win.to} onChange={(e) => setWin({ ...win, to: e.target.value })} /></label>
          <button type="button" className="t-btn" onClick={() => run("settings/eval-time", { method: "POST", body: JSON.stringify(win) })}>
            <i className="fas fa-floppy-disk" aria-hidden /> บันทึกเวลา
          </button>
        </div>
      </section>
      <section className="t-card a-part">
        <h2 className="a-part-title">วันที่เปิดให้ประเมิน</h2>
        <div className="a-field">
          <span className="t-label">วันในสัปดาห์</span>
          <div className="a-seg">
            {WEEKDAYS.map((w, i) => (
              <button key={i} type="button" className={daysCfg.weekdays.includes(i) ? "is-on" : undefined} onClick={() => setDays({ ...daysCfg, weekdays: daysCfg.weekdays.includes(i) ? daysCfg.weekdays.filter((x) => x !== i) : [...daysCfg.weekdays, i].sort() })}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <DateList label="วันปิด (วันหยุด/งดกิจกรรม)" help="วันที่ปกติเปิด แต่ไม่ต้องประเมิน" value={daysCfg.closed} onChange={(v) => setDays({ ...daysCfg, closed: v })} />
        <DateList label="วันเปิดพิเศษ (วันชดเชย)" help="วันที่ปกติปิด แต่ต้องประเมิน" value={daysCfg.open} onChange={(v) => setDays({ ...daysCfg, open: v })} />
        <div className="a-links">
          <button type="button" className="t-btn" onClick={() => run("settings/eval-time", { method: "POST", body: JSON.stringify({ days: daysCfg }) })}>
            <i className="fas fa-floppy-disk" aria-hidden /> บันทึกวัน
          </button>
        </div>
      </section>
    </>
  );
}

// ---------------- People and rules ----------------
const ROLE_LABEL: Record<string, string> = { admin: "แอดมิน", teacher: "ครู", council: "สภานักเรียน", student: "นักเรียน", deny: "ห้ามเข้าใช้" };
const KIND_LABEL: Record<string, string> = { digits: "ชื่ออีเมลเป็นตัวเลขล้วน", letters: "ชื่ออีเมลเป็นตัวอักษร", any: "ทุกอีเมล", starts: "ขึ้นต้นด้วย", contains: "มีคำว่า" };

export function AssessPeople({ toast, onAuthError }: Props) {
  const wl = useLoad<any>("admin/whitelist", onAuthError, toast);
  const rules = useLoad<any>("admin/email-rules", onAuthError, toast);
  const [adding, setAdding] = useState<string[]>([]);
  const [role, setRole] = useState("teacher");
  const [q, setQ] = useState("");
  const [test, setTest] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [newRule, setNewRule] = useState({ local_kind: "digits", local_value: "", role: "student" });

  if (wl.error) return <Failed error={wl.error} retry={wl.load} />;
  const list: any[] = wl.data?.whitelist || [];
  const ruleList: any[] = rules.data?.rules || [];
  const shown = list.filter((p) => !q || p.prefix.includes(q.toLowerCase()));

  async function addAll() {
    for (const prefix of adding) await wl.run("admin/whitelist", { method: "POST", body: JSON.stringify({ prefix, role }) }, `เพิ่ม ${prefix} แล้ว`);
    setAdding([]);
  }

  return (
    <>
      <section className="t-card a-part">
        <h2 className="a-part-title">กำหนดรายคน ({list.length})</h2>
        <p className="a-help">ใส่ชื่อหน้า @ หรืออีเมลของโรงเรียน ใช้ก่อนกฎด้านล่างเสมอ</p>
        <Chips value={adding} onChange={setAdding} placeholder="เช่น somchai หรือ somchai@sirin.ac.th แล้วกด Enter" />
        <div className="a-inline">
          <div className="a-seg a-seg-sm">
            {["teacher", "council", "admin"].map((r) => (
              <button key={r} type="button" className={role === r ? "is-on" : undefined} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</button>
            ))}
          </div>
          <button type="button" className="t-btn t-btn-sm" disabled={!adding.length} onClick={addAll}><i className="fas fa-user-plus" aria-hidden /> เพิ่ม {adding.length || ""} คน</button>
        </div>
        <input className="t-input" placeholder="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} />
        {!wl.data ? <Loading /> : (
          <div className="a-people">
            {shown.map((p) => (
              <div key={p.prefix} className="a-person">
                <b>{p.prefix}</b>
                <select className="t-input" value={p.role} onChange={(e) => wl.run("admin/whitelist", { method: "PUT", body: JSON.stringify({ prefix: p.prefix, role: e.target.value }) }, "เปลี่ยนบทบาทแล้ว")}>
                  {["teacher", "council", "admin"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <button type="button" className="a-card-del" aria-label="ลบ" onClick={() => wl.run(`admin/whitelist?prefix=${encodeURIComponent(p.prefix)}`, { method: "DELETE" }, `ลบ ${p.prefix} แล้ว`)}>
                  <i className="fas fa-trash" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="t-card a-part">
        <h2 className="a-part-title">กฎตามรูปแบบอีเมล</h2>
        <p className="a-help">คนที่ไม่อยู่ในรายชื่อด้านบน ระบบตรวจกฎจากบนลงล่าง ใช้กฎแรกที่ตรง ลากเพื่อเปลี่ยนลำดับ</p>
        {rules.error ? <p className="a-error">{rules.error}</p> : !rules.data ? <Loading /> : (
          <SortableList
            items={ruleList}
            className="a-rows"
            onChange={(next) => rules.run("admin/email-rules", { method: "PUT", body: JSON.stringify({ order: next.map((r) => r.id) }) }, "เรียงลำดับใหม่แล้ว")}
            render={(r, i, handle) => (
              <div className="a-row-card a-rule">
                <span className="a-grip" {...handle}><i className="fas fa-grip-vertical" aria-hidden /></span>
                <span className="a-card-n">{i + 1}</span>
                <span className="a-card-text">
                  <b>{KIND_LABEL[r.local_kind] || r.local_kind}{r.local_value ? ` "${r.local_value}"` : ""}</b>
                  <small>→ {ROLE_LABEL[r.role] || r.role}</small>
                </span>
                <select className="t-input" value={r.role} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => rules.run("admin/email-rules", { method: "PUT", body: JSON.stringify({ ...r, role: e.target.value }) }, "แก้กฎแล้ว")}>
                  {["student", "council", "teacher", "deny"].map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                </select>
                <button type="button" className="a-card-del" aria-label="ลบ" onPointerDown={(e) => e.stopPropagation()} onClick={() => rules.run(`admin/email-rules?id=${r.id}`, { method: "DELETE" }, "ลบกฎแล้ว")}>
                  <i className="fas fa-trash" aria-hidden />
                </button>
              </div>
            )}
          />
        )}
        <div className="a-inline a-rule-add">
          <select className="t-input" value={newRule.local_kind} onChange={(e) => setNewRule({ ...newRule, local_kind: e.target.value })}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {(newRule.local_kind === "starts" || newRule.local_kind === "contains") && (
            <input className="t-input" placeholder="ข้อความ" value={newRule.local_value} onChange={(e) => setNewRule({ ...newRule, local_value: e.target.value })} />
          )}
          <select className="t-input" value={newRule.role} onChange={(e) => setNewRule({ ...newRule, role: e.target.value })}>
            {["student", "council", "teacher", "deny"].map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
          </select>
          <button type="button" className="t-btn t-btn-sm" onClick={() => rules.run("admin/email-rules", { method: "POST", body: JSON.stringify(newRule) }, "เพิ่มกฎแล้ว")}>
            <i className="fas fa-plus" aria-hidden /> เพิ่มกฎ
          </button>
        </div>
        <div className="a-inline">
          <input className="t-input" placeholder="ทดสอบอีเมล เช่น 41234@sirin.ac.th" value={test} onChange={(e) => setTest(e.target.value)} />
          <button
            type="button"
            className="t-btn t-btn-sm t-btn-ghost"
            disabled={!test.includes("@")}
            onClick={async () => {
              try {
                setTestResult((await assess(`admin/email-rules?test=${encodeURIComponent(test)}`)).test);
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            ทดสอบ
          </button>
        </div>
        {testResult && (
          <p className={testResult.result ? "a-ok" : "a-error"}>
            {testResult.email}: {testResult.result ? `เข้าได้เป็น ${ROLE_LABEL[testResult.result.role] || testResult.result.role} (${testResult.result.source === "whitelist" ? "จากรายชื่อรายคน" : "จากกฎ"})` : "เข้าใช้ไม่ได้"}
          </p>
        )}
      </section>
    </>
  );
}

// ---------------- Admin accounts ----------------
export function AssessAccounts({ toast, onAuthError }: Props) {
  const { data, error, load, run } = useLoad<any>("admin/accounts", onAuthError, toast);
  const [form, setForm] = useState({ username: "", displayName: "", password: "" });
  const [pw, setPw] = useState<Record<string, string>>({});
  if (error) return <Failed error={error} retry={load} />;
  if (!data) return <Loading />;
  return (
    <section className="t-card a-part">
      {data.envUsername && <p className="a-help">บัญชีหลัก <b>{data.envUsername}</b> ตั้งใน Vercel (ADMIN_USERNAME / ADMIN_PASSWORD) แก้ที่นี่ไม่ได้</p>}
      <div className="a-people">
        {(data.accounts || []).map((a: any) => (
          <div key={a.username} className="a-person a-account">
            <span className="a-card-text">
              <b>{a.display_name || a.username}</b>
              <small>{a.username}{a.last_login ? ` · เข้าล่าสุด ${new Date(a.last_login + "Z").toLocaleString("th-TH")}` : ""}</small>
            </span>
            <input className="t-input" type="password" placeholder="รหัสผ่านใหม่ (8+ ตัว)" value={pw[a.username] || ""} onChange={(e) => setPw({ ...pw, [a.username]: e.target.value })} />
            <button type="button" className="t-btn t-btn-sm t-btn-ghost" disabled={(pw[a.username] || "").length < 8} onClick={async () => { await run("admin/accounts", { method: "PUT", body: JSON.stringify({ username: a.username, password: pw[a.username] }) }, "เปลี่ยนรหัสผ่านแล้ว"); setPw({ ...pw, [a.username]: "" }); }}>
              เปลี่ยนรหัส
            </button>
            <button type="button" className="a-card-del" aria-label="ลบ" onClick={() => run(`admin/accounts?username=${encodeURIComponent(a.username)}`, { method: "DELETE" }, "ลบบัญชีแล้ว")}>
              <i className="fas fa-trash" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <h2 className="a-part-title">เพิ่มบัญชี</h2>
      <div className="a-inline">
        <input className="t-input" placeholder="ชื่อผู้ใช้ (a-z 0-9)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input className="t-input" placeholder="ชื่อที่แสดง" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <input className="t-input" type="password" placeholder="รหัสผ่าน (8+ ตัว)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="button" className="t-btn t-btn-sm" disabled={!form.username || form.password.length < 8} onClick={async () => { await run("admin/accounts", { method: "POST", body: JSON.stringify(form) }, "เพิ่มบัญชีแล้ว"); setForm({ username: "", displayName: "", password: "" }); }}>
          <i className="fas fa-plus" aria-hidden /> เพิ่ม
        </button>
      </div>
    </section>
  );
}
