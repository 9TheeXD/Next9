"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthError, adminFetch } from "./api";
import { sheetIdOf } from "./pages";

type Toast = (t: string, k?: "success" | "error") => void;
type Props = { toast: Toast; onAuthError: () => void };
type Term = { semester: number; year: number; start: string; end: string };

const thaiDate = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(iso + "T00:00:00"));
};
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const idOf = (t: Term) => `${t.semester}/${t.year}`;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function useGuard(onAuthError: () => void, toast: Toast) {
  return useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) onAuthError();
      else toast((e as Error).message, "error");
    },
    [onAuthError, toast],
  );
}

// A next term after the newest one, for "add". The admin fixes the dates.
function suggestNext(list: Term[]): Term {
  const last = [...list].sort((a, b) => b.start.localeCompare(a.start))[0];
  if (!last) {
    const y = new Date().getFullYear();
    return { semester: 1, year: y + 543, start: `${y}-05-16`, end: `${y}-10-10` };
  }
  const ce = last.year - 543;
  if (last.semester === 1) return { semester: 2, year: last.year, start: `${ce}-11-01`, end: `${ce + 1}-03-31` };
  return { semester: 1, year: last.year + 1, start: `${ce + 1}-05-16`, end: `${ce + 1}-10-10` };
}

function problems(list: Term[]) {
  const out: string[] = [];
  list.forEach((t, i) => {
    if (!t.start || !t.end) out.push(`${idOf(t)}: ยังไม่ได้ใส่วันที่`);
    else if (t.start > t.end) out.push(`${idOf(t)}: วันเปิดเทอมอยู่หลังวันปิดเทอม`);
    list.forEach((u, j) => {
      if (j <= i) return;
      if (idOf(t) === idOf(u)) out.push(`มีภาคเรียน ${idOf(t)} ซ้ำ`);
      else if (t.start && u.start && t.start <= u.end && u.start <= t.end) out.push(`${idOf(t)} กับ ${idOf(u)} ช่วงวันที่ซ้อนกัน`);
    });
  });
  return out;
}

// ---------------- Terms ----------------
export function Terms({ toast, onAuthError }: Props) {
  const guard = useGuard(onAuthError, toast);
  const [mode, setMode] = useState("auto");
  const [pinned, setPinned] = useState("");
  const [list, setList] = useState<Term[] | null>(null);
  const [inert, setInert] = useState<any>(null);
  const [sheets, setSheets] = useState<{ "1": string; "2": string }>({ "1": "", "2": "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = todayIso();

  const load = useCallback(async () => {
    try {
      const [t, d] = await Promise.all([adminFetch("/api/admin/settings/terms"), adminFetch("/api/admin/doc/inert")]);
      setMode(t.value.mode || "auto");
      setPinned(t.value.pinned || "");
      setList((t.value.list || []).map((x: any) => ({ semester: Number(x.semester), year: Number(x.year), start: x.start || "", end: x.end || "" })));
      setInert(d.value);
      setSheets({ "1": d.value?.terms?.["1"]?.SHEET_ID || "", "2": d.value?.terms?.["2"]?.SHEET_ID || d.value?.SHEET_ID || "" });
      setDirty(false);
    } catch (e) {
      guard(e);
    }
  }, [guard]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const sorted = useMemo(() => [...(list || [])].map((t, i) => ({ t, i })).sort((a, b) => b.t.start.localeCompare(a.t.start)), [list]);
  const current = useMemo(() => {
    const l = list || [];
    if (mode === "pinned") {
      const p = l.find((t) => idOf(t) === pinned);
      if (p) return idOf(p);
    }
    const inside = l.find((t) => t.start <= today && today <= t.end);
    const started = [...l].sort((a, b) => b.start.localeCompare(a.start)).find((t) => t.start && t.start <= today);
    return inside ? idOf(inside) : started ? idOf(started) : "";
  }, [list, mode, pinned, today]);

  if (!list) return <p className="a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></p>;
  const errs = problems(list);
  const set = (i: number, patch: Partial<Term>) => {
    setList(list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  // Timeline from the earliest start to the latest end.
  const dated = list.filter((t) => t.start && t.end && t.start <= t.end);
  const min = dated.length ? dated.reduce((m, t) => (t.start < m ? t.start : m), dated[0].start) : today;
  const max = dated.length ? dated.reduce((m, t) => (t.end > m ? t.end : m), dated[0].end) : today;
  const span = Math.max(1, days(min, max));
  const pos = (iso: string) => `${Math.min(100, Math.max(0, (days(min, iso) / span) * 100))}%`;

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/settings/terms", { method: "PUT", body: JSON.stringify({ mode, pinned, list }) });
      const terms = { ...(inert?.terms || {}) };
      for (const k of ["1", "2"] as const) terms[k] = { SHEET_RANGE: "รวม", SHEET_JUNIOR_RANGE: inert?.SHEET_JUNIOR_RANGE || "ม.ต้น", SHEET_HIGH_RANGE: inert?.SHEET_HIGH_RANGE || "ม.ปลาย", ...(terms[k] || {}), SHEET_ID: sheetIdOf(sheets[k]) };
      await adminFetch("/api/admin/doc/inert", { method: "PUT", body: JSON.stringify({ ...(inert || {}), terms }) });
      toast("บันทึกภาคเรียนแล้ว ทุกระบบใช้ค่าใหม่ภายในไม่กี่นาที");
      await load();
    } catch (e) {
      guard(e);
    }
    setSaving(false);
  }

  return (
    <>
      <section className="t-card a-part">
        <h2 className="a-part-title">ไทม์ไลน์</h2>
        <div className="a-timeline">
          {dated.map((t) => {
            const on = idOf(t) === current;
            return (
              <div key={idOf(t)} className={`a-tl-seg${on ? " is-on" : ""}`} style={{ left: pos(t.start), width: `calc(${pos(t.end)} - ${pos(t.start)})` }} title={`${thaiDate(t.start)} – ${thaiDate(t.end)}`}>
                <b>{idOf(t)}</b>
                <small>{thaiDate(t.start)} – {thaiDate(t.end)}</small>
              </div>
            );
          })}
          {today >= min && today <= max && (
            <div className="a-tl-today" style={{ left: pos(today) }}>
              <span>วันนี้</span>
            </div>
          )}
        </div>
        <div className="a-field">
          <span className="t-label">ภาคเรียนปัจจุบัน</span>
          <div className="a-seg">
            <button type="button" className={mode !== "pinned" ? "is-on" : undefined} onClick={() => { setMode("auto"); setDirty(true); }}>
              อัตโนมัติตามวันที่
            </button>
            <button type="button" className={mode === "pinned" ? "is-on" : undefined} onClick={() => { setMode("pinned"); setPinned(pinned || current); setDirty(true); }}>
              กำหนดเอง
            </button>
          </div>
          {mode === "pinned" ? (
            <div className="a-seg">
              {sorted.map(({ t }) => (
                <button key={idOf(t)} type="button" className={pinned === idOf(t) ? "is-on" : undefined} onClick={() => { setPinned(idOf(t)); setDirty(true); }}>
                  {idOf(t)}
                </button>
              ))}
            </div>
          ) : (
            <small className="a-help">ตอนนี้คือภาคเรียน <b>{current || "—"}</b> เปลี่ยนเป็นภาคเรียนใหม่เองเมื่อถึงวันเปิดเทอม</small>
          )}
        </div>
      </section>

      <div className="a-term-grid">
        {sorted.map(({ t, i }) => {
          const st = !t.start || !t.end ? "" : today < t.start ? "ยังไม่เริ่ม" : today > t.end ? "จบแล้ว" : "กำลังเรียน";
          return (
            <section key={i} className={`t-card a-term${idOf(t) === current ? " is-on" : ""}`}>
              <header>
                <b>ภาคเรียนที่ {idOf(t)}</b>
                {st && <span className={`a-tag is-${st === "กำลังเรียน" ? "ok" : st === "จบแล้ว" ? "muted" : "info"}`}>{st}</span>}
                {idOf(t) === current && <span className="a-tag is-accent">ปัจจุบัน</span>}
                <button type="button" className="a-card-del" aria-label="ลบ" onClick={() => { setList(list.filter((_, j) => j !== i)); setDirty(true); }}>
                  <i className="fas fa-trash" aria-hidden />
                </button>
              </header>
              <div className="a-term-row">
                <div className="a-seg a-seg-sm">
                  {[1, 2, 3].map((n) => (
                    <button key={n} type="button" className={t.semester === n ? "is-on" : undefined} onClick={() => set(i, { semester: n })}>
                      เทอม {n}
                    </button>
                  ))}
                </div>
                <span className="a-stepper">
                  <button type="button" className="t-icon-btn" onClick={() => set(i, { year: t.year - 1 })} aria-label="ปีก่อน">−</button>
                  <input className="t-input" type="number" value={t.year} onChange={(e) => set(i, { year: Number(e.target.value) })} />
                  <button type="button" className="t-icon-btn" onClick={() => set(i, { year: t.year + 1 })} aria-label="ปีถัดไป">+</button>
                </span>
              </div>
              <div className="a-term-row">
                <label>
                  <span className="t-label">วันเปิดเทอม</span>
                  <input className="t-input" type="date" value={t.start} onChange={(e) => set(i, { start: e.target.value })} />
                </label>
                <label>
                  <span className="t-label">วันปิดเทอม</span>
                  <input className="t-input" type="date" value={t.end} onChange={(e) => set(i, { end: e.target.value })} />
                </label>
              </div>
              {t.start && t.end && t.start <= t.end && <small className="a-help">{Math.ceil((days(t.start, t.end) + 1) / 7)} สัปดาห์ · สัปดาห์ที่ 1 ของเล่มชมพูเริ่ม {thaiDate(mondayOf(t.start))}</small>}
            </section>
          );
        })}
        <button type="button" className="a-add-card a-term-add" onClick={() => { setList([...list, suggestNext(list)]); setDirty(true); }}>
          <i className="fas fa-calendar-plus" aria-hidden /> เพิ่มภาคเรียนถัดไป
        </button>
      </div>

      <section className="t-card a-part">
        <h2 className="a-part-title">Google Sheet ของแบบฟอร์มสาย-เฉื่อย</h2>
        <p className="a-help">ใช้ไฟล์ตามภาคเรียน (ภาคเรียนเดียวกันของปีถัดไปให้เปลี่ยนไฟล์ที่นี่) แชร์ไฟล์ให้อีเมล service account เป็น Editor</p>
        {(["1", "2"] as const).map((k) => (
          <label key={k} className="a-field">
            <span className="t-label">ภาคเรียนที่ {k} (ID หรือลิงก์)</span>
            <span className="a-inline">
              <input className="t-input" value={sheets[k]} onChange={(e) => { setSheets({ ...sheets, [k]: e.target.value }); setDirty(true); }} />
              {sheetIdOf(sheets[k]) && (
                <a className="t-btn t-btn-sm t-btn-ghost" href={`https://docs.google.com/spreadsheets/d/${sheetIdOf(sheets[k])}`} target="_blank" rel="noopener noreferrer">
                  <i className="fas fa-arrow-up-right-from-square" aria-hidden /> เปิด
                </a>
              )}
            </span>
          </label>
        ))}
      </section>

      {errs.length > 0 && (
        <div className="a-alert">
          <i className="fas fa-triangle-exclamation" aria-hidden />
          <div>{errs.map((e) => <div key={e}>{e}</div>)}</div>
        </div>
      )}
      {dirty && (
      <div className="a-save is-dirty">
        <span>มีการแก้ไขที่ยังไม่บันทึก</span>
        <button type="button" className="t-btn t-btn-ghost t-btn-sm" disabled={!dirty || saving} onClick={load}>ยกเลิกการแก้ไข</button>
        <button type="button" className="t-btn" disabled={!dirty || saving || errs.length > 0 || !list.length} onClick={save}>
          <i className={saving ? "fas fa-spinner fa-spin" : "fas fa-floppy-disk"} aria-hidden /> บันทึก
        </button>
      </div>
      )}
    </>
  );
}

function mondayOf(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(+d)) return iso;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ---------------- Classes (from the student list) ----------------
type Grade = { grade: number; name?: string; rooms?: number; roomList: { room: number; groups: string[]; students: number }[] };

function ClassMap({ grades }: { grades: Grade[] }) {
  return (
    <div className="a-classmap">
      {grades.map((g) => (
        <div key={g.grade} className="a-cm-row">
          <div className="a-cm-grade">
            <b>ม.{g.grade}</b>
            <small>{g.roomList.length} ห้อง · {g.roomList.reduce((n, r) => n + (r.students || 0), 0)} คน</small>
          </div>
          <div className="a-cm-rooms">
            {g.roomList.map((r) => (
              <span key={r.room} className={`a-cm-room${r.groups.length > 1 ? " has-groups" : ""}`} title={`ม.${g.grade}/${r.room} · ${r.students} คน${r.groups.length ? ` · กลุ่ม ${r.groups.join(", ")}` : ""}`}>
                <b>{r.room}</b>
                {r.groups.length > 1 && <small>{r.groups.join("/")}</small>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Classes({ toast, onAuthError }: Props) {
  const guard = useGuard(onAuthError, toast);
  const [school, setSchool] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState<"" | "preview" | "sync">("");

  const load = useCallback(async () => {
    try {
      setSchool((await adminFetch("/api/admin/school")).school);
    } catch (e) {
      guard(e);
    }
  }, [guard]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function runPreview() {
    setBusy("preview");
    try {
      setPreview((await adminFetch("/api/admin/students/preview", { method: "POST", body: "{}" })).preview);
    } catch (e) {
      guard(e);
    }
    setBusy("");
  }

  async function sync() {
    setBusy("sync");
    try {
      const j = await adminFetch("/api/admin/students/sync", { method: "POST" });
      toast(`ดึงรายชื่อแล้ว ${j.count} คน ห้องเรียนของทุกระบบอัปเดตแล้ว`);
      setPreview(null);
      await load();
    } catch (e) {
      guard(e);
    }
    setBusy("");
  }

  return (
    <>
      <section className="t-card a-part">
        <h2 className="a-part-title">ห้องเรียนที่ทุกระบบใช้อยู่</h2>
        {!school ? (
          <p className="a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></p>
        ) : (
          <>
            {school.classesFrom !== "students" && <p className="a-error">ยังไม่มีรายชื่อนักเรียน ใช้ค่าเริ่มต้น (ม.1-3 มี 14 ห้อง ม.4-6 มี 16 ห้อง) ไปก่อน</p>}
            <ClassMap grades={school.grades} />
            <p className="a-help">ห้องสีเข้ม = แบ่งเป็นกลุ่ม ก/ข (เล่มชมพูตรวจแยกกลุ่ม) · ใช้ใน: เล่มชมพู สาย-เฉื่อย ส่งเล่ม หน้าสมาชิก และระบบประเมินหน้าเสาธง</p>
          </>
        )}
      </section>

      <section className="t-card a-part">
        <h2 className="a-part-title">อัปเดตรายชื่อนักเรียน</h2>
        <p className="a-help">กด &quot;ดูตัวอย่าง&quot; เพื่ออ่าน Sheet ตามการตั้งค่าด้านล่าง (ยังไม่เปลี่ยนอะไร) ถ้าถูกต้องกด &quot;ใช้รายชื่อนี้&quot; รายชื่อเดิมจะถูกแทนที่ทั้งหมด</p>
        <div className="a-links">
          <button type="button" className="t-btn t-btn-sm t-btn-ghost" disabled={!!busy} onClick={runPreview}>
            <i className={busy === "preview" ? "fas fa-spinner fa-spin" : "fas fa-eye"} aria-hidden /> ดูตัวอย่างจาก Sheet
          </button>
          {preview && (
            <button type="button" className="t-btn t-btn-sm" disabled={!!busy || preview.count === 0} onClick={sync}>
              <i className={busy === "sync" ? "fas fa-spinner fa-spin" : "fas fa-check"} aria-hidden /> ใช้รายชื่อนี้ ({preview.count} คน)
            </button>
          )}
        </div>
        {preview && (
          <div className="a-checks">
            <h3>
              จากไฟล์ &quot;{preview.file}&quot;: {preview.count} คน
              {preview.duplicates > 0 && ` (ซ้ำ ${preview.duplicates} คน ตัดออกแล้ว)`}
            </h3>
            {preview.missingTabs.length > 0 && <p className="a-error">ไม่พบแท็บ: {preview.missingTabs.join(", ")} (แท็บที่มี: {preview.allTabs.join(", ")})</p>}
            {preview.count === 0 && <p className="a-error">อ่านไม่ได้เลย ตรวจการตั้งค่าคอลัมน์ด้านล่าง (ดูข้อมูลดิบประกอบ)</p>}
            <ClassMap grades={(preview.structure || []).map((g: any) => ({ ...g, roomList: g.rooms }))} />
            <div className="a-table-wrap">
              <table className="a-table">
                <thead><tr><th>แท็บ</th><th>อ่านได้</th><th>ข้าม (ข้อมูลไม่ครบ)</th></tr></thead>
                <tbody>
                  {preview.perTab.map((t: any) => (
                    <tr key={t.title} className={t.students ? undefined : "is-bad"}><td>{t.title}</td><td>{t.students}</td><td>{t.skipped}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.sample.length > 0 && (
              <div className="a-table-wrap">
                <table className="a-table">
                  <thead><tr><th>เลขประจำตัว</th><th>ชื่อ</th><th>ชั้น/ห้อง</th><th>เลขที่</th><th>กลุ่ม</th></tr></thead>
                  <tbody>
                    {preview.sample.map((s: any) => (
                      <tr key={s.studentId}><td>{s.studentId}</td><td>{s.name}</td><td>ม.{s.class}/{s.room}</td><td>{s.number}</td><td>{s.classType}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.firstRows && (
              <details className="a-raw">
                <summary>ข้อมูลดิบ 12 แถวแรกของแท็บ &quot;{preview.firstRows.title}&quot; (ดูว่าข้อมูลอยู่คอลัมน์ไหน)</summary>
                <div className="a-table-wrap">
                  <table className="a-table">
                    <thead>
                      <tr><th>#</th>{Array.from({ length: Math.max(0, ...preview.firstRows.rows.map((r: any[]) => r.length)) }, (_, i) => <th key={i}>{String.fromCharCode(65 + i)}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.firstRows.rows.map((r: any[], i: number) => (
                        <tr key={i}><td>{i + 1}</td>{r.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </section>
    </>
  );
}
