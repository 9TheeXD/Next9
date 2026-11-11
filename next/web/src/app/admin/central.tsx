"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthError, adminFetch } from "./api";
import { sheetIdOf } from "./pages";
import { SortableList } from "./Sortable";
import { Drawer as DrawerLite } from "./fields";

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

// ---------------- Council (the one member list) ----------------
// members.json as people cards: drag to reorder, click to edit, add, remove. Every system takes its
// people from here (member pages, inspectors in the forms, duty check-in).
type Position = { dept: string; unit: string; title: string; label: string };
type Member = { slug: string; nickname: string; name: string; role?: string; room?: string; no?: string; img?: string; bio?: string; contacts?: { ig?: string; line?: string; call?: string }; positions?: Position[]; inspector?: boolean; duty?: boolean; [k: string]: any };
const TITLES = ["หัวหน้า", "ผู้ช่วย", "ผู้ช่วยและเลขานุการ"];

export function Council({ toast, onAuthError }: Props) {
  const guard = useGuard(onAuthError, toast);
  const [list, setList] = useState<Member[] | null>(null);
  const [layout, setLayout] = useState<any>(null);
  const [nos, setNos] = useState<Record<string, { room: string; no: string }>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [raw, council, lay] = await Promise.all([adminFetch("/api/admin/council/members"), adminFetch("/api/admin/council"), adminFetch("/api/admin/settings/members")]);
      setList(raw.members);
      setNos(Object.fromEntries(council.council.map((m: any) => [m.slug, { room: m.room, no: m.no }])));
      setLayout(lay.value);
      setDirty(false);
    } catch (e) {
      guard(e);
    }
  }, [guard]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!list || !layout) return <p className="a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></p>;
  const change = (next: Member[]) => {
    setList(next);
    setDirty(true);
  };
  const set = (i: number, patch: Partial<Member>) => change(list.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  // Where a position can be: the executive board, each department, each grade.
  const depts: { key: string; name: string; units: { key: string; name: string }[] }[] = [
    { key: "executive", name: "คณะกรรมการบริหาร", units: [...(layout.exec || []).map((e: any) => ({ key: e.unit, name: e.caption })), { key: "secretary", name: "เลขานุการ" }, { key: "treasurer", name: "เหรัญญิก" }].filter((u, i, a) => a.findIndex((x) => x.key === u.key) === i) },
    ...(layout.depts || []).filter((d: any) => !d.data_dept).map((d: any) => ({ key: d.key, name: d.name, units: d.units })),
    { key: "grade", name: "ระดับชั้น", units: [1, 2, 3, 4, 5, 6].map((g) => ({ key: `m${g}`, name: `ระดับชั้นม.${g}` })) },
  ];
  const unitName = (p: Position) => depts.find((d) => d.key === p.dept)?.units.find((u) => u.key === p.unit)?.name || "";
  const autoLabel = (p: Position) => (TITLES.includes(p.title) ? `${p.title}${unitName(p) === "หัวหน้าฝ่าย" ? depts.find((d) => d.key === p.dept)?.name || "" : unitName(p)}` : p.title);

  const shown = list.map((m, i) => ({ m, i })).filter(({ m }) => !q || [m.name, m.nickname, m.role, m.room].some((v) => String(v || "").includes(q)));
  const m = open !== null ? list[open] : null;

  async function save() {
    setSaving(true);
    try {
      setList((await adminFetch("/api/admin/council/members", { method: "PUT", body: JSON.stringify(list) })).members);
      setDirty(false);
      toast("บันทึกรายชื่อแล้ว หน้าสมาชิก แบบฟอร์ม และระบบลงเวรใช้รายชื่อใหม่");
      load();
    } catch (e) {
      guard(e);
    }
    setSaving(false);
  }

  return (
    <>
      <section className="t-card a-part">
        <div className="a-council-stats">
          <div><b>{list.length}</b><span>สมาชิก</span></div>
          <div><b>{list.filter((x) => x.inspector !== false).length}</b><span>เป็นผู้ตรวจ</span></div>
          <div><b>{list.filter((x) => x.duty !== false).length}</b><span>ลงเวร</span></div>
        </div>
        <input className="t-input a-search" placeholder="ค้นหาชื่อ ชื่อเล่น ตำแหน่ง ห้อง" value={q} onChange={(e) => setQ(e.target.value)} />
        <SortableList
          items={shown}
          layout="grid"
          className="a-council"
          onChange={(next) => (q ? null : change(next.map((x) => x.m)))}
          render={({ m: x, i }, _k, handle) => (
            <div className={`a-member${x.inspector === false && x.duty === false ? " is-off" : ""}`} onClick={() => setOpen(i)} role="button" tabIndex={0}>
              <span className="a-grip" {...handle} onClick={(e) => e.stopPropagation()}><i className="fas fa-grip-vertical" aria-hidden /></span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/file/next9/members/${x.img || `2/${x.slug}.webp`}`} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
              <div className="a-card-text">
                <b>{x.nickname || <em className="a-muted">(ใหม่)</em>} <span className="a-muted">· {x.role || "—"}</span></b>
                <small>{x.name}{(x.room || nos[x.slug]?.room) ? ` · ${x.room || nos[x.slug]?.room}` : ""}</small>
              </div>
              <span className="a-member-tags">
                {x.inspector !== false && <span className="a-tag is-info">ผู้ตรวจ</span>}
                {x.duty !== false && <span className="a-tag is-ok">ลงเวร</span>}
              </span>
            </div>
          )}
        />
        <button
          type="button"
          className="a-add-card"
          onClick={() => {
            change([...list, { slug: `m${Date.now().toString(36)}`, nickname: "", name: "", role: "", room: "", positions: [], inspector: true, duty: true, contacts: {}, bio: "" }]);
            setOpen(list.length);
          }}
        >
          <i className="fas fa-user-plus" aria-hidden /> เพิ่มสมาชิก
        </button>
        <p className="a-help">ลากการ์ดเพื่อเรียงลำดับ (ลำดับมีผลกับลำดับในหน้าฝ่าย) · รูปโปรไฟล์ตั้งที่หน้าแก้ไขข้อมูลสมาชิก (มีตัวครอปรูป)</p>
      </section>

      {m && open !== null && (
        <DrawerLite title={m.nickname || "สมาชิกใหม่"} onClose={() => setOpen(null)}>
          <div className="a-drawer-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/file/next9/members/${m.img || `2/${m.slug}.webp`}`} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
            <a className="t-btn t-btn-sm t-btn-ghost" href="/member/editor/" target="_blank" rel="noopener noreferrer"><i className="fas fa-camera" aria-hidden /> เปลี่ยนรูป (หน้าแก้ไขข้อมูลสมาชิก)</a>
          </div>
          <label className="a-field"><span className="t-label">ชื่อเล่น</span><input className="t-input" value={m.nickname} onChange={(e) => set(open, { nickname: e.target.value })} /></label>
          <label className="a-field"><span className="t-label">ชื่อ-นามสกุล (มีคำนำหน้า)</span><input className="t-input" value={m.name} placeholder="นายสมชาย ใจดี" onChange={(e) => set(open, { name: e.target.value })} /></label>
          <label className="a-field"><span className="t-label">ตำแหน่งหลัก (แสดงใต้ชื่อ)</span><input className="t-input" value={m.role || ""} onChange={(e) => set(open, { role: e.target.value })} /></label>
          <div className="a-inline">
            <label><span className="t-label">ห้อง</span><input className="t-input" value={m.room || ""} placeholder={nos[m.slug]?.room || "5/2"} onChange={(e) => set(open, { room: e.target.value })} /></label>
            <label><span className="t-label">เลขที่</span><input className="t-input" value={m.no || ""} placeholder={nos[m.slug]?.no || "อัตโนมัติ"} onChange={(e) => set(open, { no: e.target.value })} /></label>
          </div>
          <label className="a-switch"><input type="checkbox" checked={m.inspector !== false} onChange={(e) => set(open, { inspector: e.target.checked })} /><span className="a-switch-ui" aria-hidden /><span>เป็นผู้ตรวจ (มีชื่อในแบบฟอร์มทุกตัว)</span></label>
          <label className="a-switch"><input type="checkbox" checked={m.duty !== false} onChange={(e) => set(open, { duty: e.target.checked })} /><span className="a-switch-ui" aria-hidden /><span>ลงเวรประจำวัน</span></label>

          <div className="a-field">
            <span className="t-label">ตำแหน่งในฝ่าย/งาน <em className="a-count">ใช้จัดคนลงหน้าฝ่ายและงานระดับชั้น</em></span>
            {(m.positions || []).map((p, pi) => {
              const d = depts.find((x) => x.key === p.dept);
              const setP = (patch: Partial<Position>) => {
                const np = { ...p, ...patch };
                if (!("label" in patch)) np.label = autoLabel(np);
                set(open, { positions: (m.positions || []).map((x, j) => (j === pi ? np : x)) });
              };
              return (
                <div key={pi} className="a-position">
                  <select className="t-input" value={p.dept} onChange={(e) => setP({ dept: e.target.value, unit: depts.find((x) => x.key === e.target.value)?.units[0]?.key || "" })}>
                    {depts.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                  </select>
                  <select className="t-input" value={p.unit} onChange={(e) => setP({ unit: e.target.value })}>
                    {(d?.units || []).map((u) => <option key={u.key} value={u.key}>{u.name}</option>)}
                  </select>
                  <input className="t-input" list="a-titles" value={p.title} onChange={(e) => setP({ title: e.target.value })} placeholder="หัวหน้า / ผู้ช่วย / ประธานสภา" />
                  <input className="t-input a-position-label" value={p.label} onChange={(e) => setP({ label: e.target.value })} placeholder="ชื่อตำแหน่งที่แสดง" />
                  <button type="button" className="a-card-del" aria-label="ลบตำแหน่ง" onClick={() => set(open, { positions: (m.positions || []).filter((_, j) => j !== pi) })}><i className="fas fa-trash" aria-hidden /></button>
                </div>
              );
            })}
            <datalist id="a-titles">{[...TITLES, "ประธานสภา", "รองประธาน 1", "รองประธาน 2", "เลขานุการ", "เหรัญญิก"].map((t) => <option key={t} value={t} />)}</datalist>
            <button type="button" className="t-btn t-btn-sm t-btn-ghost" onClick={() => {
              const p = { dept: depts[1]?.key || "executive", unit: depts[1]?.units[0]?.key || "", title: "ผู้ช่วย", label: "" };
              set(open, { positions: [...(m.positions || []), { ...p, label: autoLabel(p) }] });
            }}>
              <i className="fas fa-plus" aria-hidden /> เพิ่มตำแหน่ง
            </button>
          </div>
          <label className="a-field"><span className="t-label">แนะนำตัว</span><textarea className="t-input a-textarea" rows={4} value={m.bio || ""} onChange={(e) => set(open, { bio: e.target.value })} /></label>
          <div className="a-inline">
            <label><span className="t-label">Instagram</span><input className="t-input" value={m.contacts?.ig || ""} onChange={(e) => set(open, { contacts: { ...m.contacts, ig: e.target.value } })} /></label>
            <label><span className="t-label">LINE ID</span><input className="t-input" value={m.contacts?.line || ""} onChange={(e) => set(open, { contacts: { ...m.contacts, line: e.target.value } })} /></label>
            <label><span className="t-label">เบอร์โทร</span><input className="t-input" value={m.contacts?.call || ""} onChange={(e) => set(open, { contacts: { ...m.contacts, call: e.target.value } })} /></label>
          </div>
          <label className="a-field">
            <span className="t-label">รหัส (ภาษาอังกฤษ ใช้ในลิงก์โปรไฟล์ /member/profile/&lt;รหัส&gt;.html และชื่อไฟล์รูป)</span>
            <input className="t-input" value={m.slug} onChange={(e) => set(open, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} />
          </label>
          <button type="button" className="t-btn t-btn-sm a-danger-btn" onClick={() => { change(list.filter((_, j) => j !== open)); setOpen(null); }}>
            <i className="fas fa-user-minus" aria-hidden /> ลบสมาชิกคนนี้
          </button>
        </DrawerLite>
      )}

      {dirty && (
        <div className="a-save is-dirty">
          <span>มีการแก้ไขที่ยังไม่บันทึก</span>
          <button type="button" className="t-btn t-btn-ghost t-btn-sm" disabled={saving} onClick={load}>ยกเลิกการแก้ไข</button>
          <button type="button" className="t-btn" disabled={saving} onClick={save}>
            <i className={saving ? "fas fa-spinner fa-spin" : "fas fa-floppy-disk"} aria-hidden /> บันทึก
          </button>
        </div>
      )}
    </>
  );
}
