"use client";

import { useEffect, useRef, useState } from "react";
import { ToolShell, useToast } from "@/components/tool/Tool";
import { usePublicSettings } from "@/lib/useSettings";

// Late/slow students form (/forms/inert/). Same requests as the old page: GET /inspectors.json,
// GET /api/inert/config, GET /api/students/search?q=, POST /api/inert/submit { headers, sources, rows }.
// Rows are built exactly like the old page did (Buddhist-era dates with a leading ' so Sheets keeps
// them as text, Bangkok time, "ไม่เข้าแถวหน้าเสาธง" folded into the violations).

type Column = { header: string; source: string };
type Student = { studentId: string; name: string; class: string | number; room: string | number; number: string | number };

const DEFAULT_COLUMNS: Column[] = [
  { header: "ประทับเวลา", source: "timestamp" },
  { header: "วันที่", source: "dateFormatted" },
  { header: "ชื่อผู้ตรวจ", source: "inspector" },
  { header: "รหัสประจำตัวนักเรียน", source: "studentId" },
  { header: "ชื่อ - สกุล", source: "name" },
  { header: "ชั้น", source: "cls" },
  { header: "ห้อง", source: "room" },
  { header: "เลขที่", source: "number" },
  { header: "สาย - เฉื่อย", source: "typeVal" },
  { header: "รายการผิดระเบียบ", source: "violations" },
];
// Grades: admin → ปีการศึกษา (fallback while loading).
const DEFAULT_CLASSES = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const DEFAULT_ROOMS = Array.from({ length: 16 }, (_, i) => String(i + 1));
const NUMBERS = Array.from({ length: 45 }, (_, i) => String(i + 1));
const OTHER = "อื่นๆ";
const NO_ASSEMBLY = "ไม่เข้าแถวหน้าเสาธง";
const TYPE_ICONS: Record<string, string> = { เฉื่อย: "fas fa-person-walking", สาย: "fas fa-clock", [NO_ASSEMBLY]: "fas fa-flag", [OTHER]: "fas fa-ellipsis" };

type Box = {
  key: number;
  studentId: string;
  name: string;
  cls: string;
  room: string;
  number: string;
  type: string;
  typeOther: string;
  noAssembly: string;
  violations: string[];
  violOther: string;
  collapsed: boolean;
  lastAutoFillId: string;
  errors: Record<string, boolean>;
};

let boxSeq = 0;
function newBox(): Box {
  return { key: ++boxSeq, studentId: "", name: "", cls: "", room: "", number: "", type: "", typeOther: "", noAssembly: "", violations: [], violOther: "", collapsed: false, lastAutoFillId: "", errors: {} };
}

// A <select> only takes values it has an option for; anything else leaves it empty (as on the old page).
const pick = (value: string, options: string[]) => (options.includes(value) ? value : "");

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function searchStudents(q: string): Promise<Student[]> {
  const res = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`);
  const json = await res.json();
  return json.success ? json.results : [];
}

function boxErrors(b: Box) {
  const e: Record<string, boolean> = {};
  for (const f of ["studentId", "name", "cls", "room", "number"] as const) if (!b[f].trim()) e[f] = true;
  if (!b.type) e.type = true;
  if (b.type === OTHER && !b.typeOther.trim()) e.type = true;
  if (b.type === NO_ASSEMBLY && !b.noAssembly.trim()) e.type = true;
  if (b.violations.includes(OTHER) && !b.violOther.trim()) e.violations = true;
  return e;
}

export function InertForm() {
  const school = usePublicSettings("school")?.school;
  const CLASSES = school?.grades?.length ? school.grades.map((g) => g.name) : DEFAULT_CLASSES;
  const maxRooms = school?.grades?.length ? Math.max(...school.grades.map((g) => Number(g.rooms) || 0)) : 0;
  const ROOMS = maxRooms > 0 ? Array.from({ length: maxRooms }, (_, i) => String(i + 1)) : DEFAULT_ROOMS;
  const [page, setPage] = useState<1 | 2>(1);
  const [date, setDate] = useState("");
  const [inspector, setInspector] = useState("");
  const [inspectors, setInspectors] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [violationList, setViolationList] = useState<string[]>([]);
  const [columns, setColumns] = useState<Column[]>(DEFAULT_COLUMNS);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [autofill, setAutofill] = useState(true);
  const [page1Errors, setPage1Errors] = useState({ date: false, inspector: false });
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const say = toast.show;

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => setDate(todayISO()), 0);
    (async () => {
      try {
        const [insRes, cfgRes] = await Promise.all([fetch(`/inspectors.json?t=${Date.now()}`), fetch(`/api/inert/config?t=${Date.now()}`)]);
        const ins = await insRes.json();
        const cfg = await cfgRes.json();
        if (!alive) return;
        setInspectors(ins);
        if (cfg.success) {
          setTypes(cfg.config.TYPES || []);
          setViolationList(cfg.config.VIOLATIONS || []);
          setColumns(cfg.config.COLUMNS || DEFAULT_COLUMNS);
        }
        setBoxes([newBox()]);
      } catch {
        if (alive) say("โหลดข้อมูลไม่สำเร็จ", "error");
      }
    })();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [say]);

  const update = (key: number, patch: Partial<Box> | ((b: Box) => Partial<Box>)) =>
    setBoxes((list) => list.map((b) => (b.key === key ? { ...b, ...(typeof patch === "function" ? patch(b) : patch) } : b)));

  function applyStudent(key: number, s: Student) {
    update(key, {
      lastAutoFillId: s.studentId,
      studentId: s.studentId,
      name: s.name,
      cls: pick("ม." + s.class, CLASSES),
      room: pick(String(s.room), ROOMS),
      number: pick(String(s.number), NUMBERS),
      errors: {},
    });
  }

  function validatePage1() {
    const e = { date: !date, inspector: !inspector.trim() };
    setPage1Errors(e);
    return !e.date && !e.inspector;
  }

  function goTo(p: 1 | 2) {
    if (p === 2 && !validatePage1()) return;
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!validatePage1()) return goTo(1);
    if (boxes.length === 0) return say("กรุณาเพิ่มนักเรียนอย่างน้อย 1 คน", "error");
    const checked = boxes.map((b) => ({ ...b, errors: boxErrors(b) }));
    const firstBad = checked.find((b) => Object.keys(b.errors).length);
    if (firstBad) {
      setBoxes(checked.map((b) => (Object.keys(b.errors).length ? { ...b, collapsed: false } : b)));
      setTimeout(() => document.getElementById(`box-${firstBad.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return say("กรุณากรอกข้อมูลให้ครบถ้วน", "error");
    }

    const [y, m, d] = date.split("-");
    const dateFormatted = `'${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`;
    const insp = inspector.trim();
    const bangkok = new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false });
    const [datePart, timePart] = bangkok.split(", ");
    const [dd, mm, yyyy] = datePart.split("/");
    const timestamp = `'${dd}/${mm}/${parseInt(yyyy) + 543} ${timePart}`;

    const rows = boxes.map((b) => {
      let typeVal = b.type;
      if (typeVal === OTHER) typeVal = b.typeOther.trim() || OTHER;
      const violations = violationList
        .filter((v) => b.violations.includes(v))
        .map((v) => (v === OTHER ? b.violOther.trim() || OTHER : v));
      if (typeVal === NO_ASSEMBLY) {
        typeVal = OTHER;
        violations.unshift(`${NO_ASSEMBLY} (${b.noAssembly.trim()})`);
      }
      const data: Record<string, string> = {
        timestamp,
        dateFormatted,
        inspector: insp,
        studentId: b.studentId.trim(),
        name: b.name.trim(),
        cls: b.cls,
        room: b.room,
        number: b.number,
        typeVal,
        violations: violations.join(", "),
      };
      return columns.map((c) => (data[c.source] !== undefined ? data[c.source] : ""));
    });

    setSending(true);
    try {
      const res = await fetch("/api/inert/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: columns.map((c) => c.header), sources: columns.map((c) => c.source), rows }),
      });
      const data = await res.json();
      if (data.success) {
        say(`ส่งข้อมูลสำเร็จ ${data.count} รายการ`);
        setBoxes([newBox()]);
        goTo(1);
      } else say("เกิดข้อผิดพลาด: " + (data.message || ""), "error");
    } catch {
      say("ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่", "error");
    }
    setSending(false);
  }

  return (
    <ToolShell title="แบบฟอร์มลงชื่อ สาย - เฉื่อย" icon="fas fa-user-clock" sub="สภานักเรียน โรงเรียนสิรินธร จังหวัดสุรินทร์">
      <div className="inert-steps" aria-hidden>
        <span className={page === 1 ? "is-on" : "is-done"}>1 ผู้กรอก</span>
        <i className="fas fa-chevron-right" />
        <span className={page === 2 ? "is-on" : undefined}>2 รายชื่อนักเรียน</span>
      </div>

      {page === 1 ? (
        <>
          <div className="t-card">
            <h2 className="t-card-title"><i className="fas fa-user-pen" aria-hidden /> ลงชื่อผู้กรอก</h2>
            <label className={`inert-field${page1Errors.date ? " is-error" : ""}`}>
              <span className="t-label">วันที่ <span className="t-req">*</span></span>
              <input type="date" className="t-input" value={date} onChange={(e) => setDate(e.target.value)} />
              <span className="inert-error">กรุณาเลือกวันที่</span>
            </label>
            <div className={`inert-field${page1Errors.inspector ? " is-error" : ""}`}>
              <span className="t-label">ชื่อผู้ตรวจ <span className="t-req">*</span></span>
              <Suggest
                value={inspector}
                onChange={(v) => {
                  setInspector(v);
                  if (v.trim()) setPage1Errors((e) => ({ ...e, inspector: false }));
                }}
                placeholder="พิมพ์เพื่อค้นหา หรือเลือกจากรายการ..."
                options={inspectors}
              />
              <span className="inert-error">กรุณาเลือกชื่อผู้ตรวจ</span>
            </div>
          </div>
          <button type="button" className="t-btn t-btn-block" onClick={() => goTo(2)}>
            ถัดไป <i className="fas fa-arrow-right" aria-hidden />
          </button>
        </>
      ) : (
        <>
          <div className="t-card inert-who">
            <div>
              <b>{inspector}</b>
              <span className="t-muted"> · {date && `${parseInt(date.slice(8))}/${parseInt(date.slice(5, 7))}/${parseInt(date.slice(0, 4)) + 543}`}</span>
            </div>
            <label className="inert-switch">
              <span>เติมข้อมูลอัตโนมัติ</span>
              <input type="checkbox" checked={autofill} onChange={(e) => setAutofill(e.target.checked)} />
              <span className="inert-switch-ui" />
            </label>
          </div>

          {boxes.map((b, i) => (
            <StudentBox
              key={b.key}
              box={b}
              index={i}
              types={types}
              violationList={violationList}
              classes={CLASSES}
              rooms={ROOMS}
              autofill={autofill}
              update={(patch) => update(b.key, patch)}
              apply={(s) => applyStudent(b.key, s)}
              remove={() => {
                if (boxes.length <= 1) return say("ต้องมีอย่างน้อย 1 รายการ", "error");
                setBoxes((list) => list.filter((x) => x.key !== b.key));
              }}
            />
          ))}

          <button
            type="button"
            className="inert-add"
            onClick={() => {
              const b = newBox();
              setBoxes((list) => [...list.map((x) => ({ ...x, collapsed: true })), b]);
              setTimeout(() => document.getElementById(`box-${b.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
            }}
          >
            <i className="fas fa-plus" aria-hidden /> เพิ่มนักเรียน
          </button>

          <div className="t-bar">
            <button type="button" className="t-btn t-btn-ghost" onClick={() => goTo(1)}>
              <i className="fas fa-arrow-left" aria-hidden /> ย้อนกลับ
            </button>
            <span>{boxes.length} คน</span>
            <button type="button" className="t-btn" onClick={submit} disabled={sending}>
              {sending ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-paper-plane" aria-hidden />} ส่งแบบฟอร์ม
            </button>
          </div>
        </>
      )}
      {sending && <div className="inert-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></div>}
      {toast.node}
    </ToolShell>
  );
}

function StudentBox({
  box: b,
  index,
  types,
  violationList,
  classes: CLASSES,
  rooms: ROOMS,
  autofill,
  update,
  apply,
  remove,
}: {
  box: Box;
  index: number;
  types: string[];
  violationList: string[];
  classes: string[];
  rooms: string[];
  autofill: boolean;
  update: (patch: Partial<Box>) => void;
  apply: (s: Student) => void;
  remove: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Student[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastAuto = useRef(b.lastAutoFillId);
  useEffect(() => {
    lastAuto.current = b.lastAutoFillId;
  }, [b.lastAutoFillId]);
  const err = b.errors;
  const clearErr = (k: string) => (err[k] ? { errors: { ...err, [k]: false } } : {});

  async function onIdInput(value: string) {
    update({ studentId: value, ...clearErr("studentId") });
    const val = value.trim();
    if (!autofill || !val) return;
    try {
      const found = (await searchStudents(val)).find((s) => s.studentId === val);
      if (found && lastAuto.current !== val) {
        lastAuto.current = val;
        apply(found);
      }
    } catch {}
  }

  function showSuggestions(q: string) {
    clearTimeout(timer.current);
    if (!q.trim()) return setSuggestions(null);
    timer.current = setTimeout(async () => {
      try {
        setSuggestions(await searchStudents(q.trim()));
      } catch {}
    }, 150);
  }

  async function choose(sid: string) {
    setSuggestions(null);
    try {
      const found = (await searchStudents(sid)).find((s) => s.studentId === sid);
      if (found) apply(found);
    } catch {}
  }

  return (
    <div id={`box-${b.key}`} className={`t-card inert-box${Object.values(err).some(Boolean) ? " has-error" : ""}`}>
      <div className="inert-box-head" onClick={() => update({ collapsed: !b.collapsed })}>
        <span className="inert-box-n">{index + 1}</span>
        <span className="inert-box-title">
          {b.name ? b.name : "นักเรียน"}
          {b.collapsed && b.cls && <small> · {b.cls}/{b.room}</small>}
        </span>
        <i className={`fas fa-chevron-${b.collapsed ? "down" : "up"} inert-box-chev`} aria-hidden />
        <button type="button" className="t-icon-btn" aria-label="ลบรายการนี้" onClick={(e) => { e.stopPropagation(); remove(); }}>
          <i className="fas fa-xmark" aria-hidden />
        </button>
      </div>

      {!b.collapsed && (
        <div className="inert-box-body">
          <label className={`inert-field${err.studentId ? " is-error" : ""}`}>
            <span className="t-label">รหัสประจำตัวนักเรียน <span className="t-req">*</span></span>
            <input className="t-input" value={b.studentId} onChange={(e) => onIdInput(e.target.value)} placeholder="เช่น 21067" inputMode="numeric" autoComplete="off" />
            <span className="inert-hint">กรอกเลข 5 หลัก</span>
            <span className="inert-error">กรุณากรอกรหัสประจำตัว</span>
          </label>

          <div className={`inert-field inert-suggest${err.name ? " is-error" : ""}`}>
            <span className="t-label">ชื่อ - สกุล ผู้มาสาย <span className="t-req">*</span></span>
            <input
              className="t-input"
              value={b.name}
              onChange={(e) => {
                update({ name: e.target.value, ...clearErr("name") });
                showSuggestions(e.target.value);
              }}
              onFocus={(e) => e.target.value.trim() && showSuggestions(e.target.value)}
              onBlur={() => setTimeout(() => setSuggestions(null), 200)}
              placeholder="พิมพ์ชื่อเพื่อค้นหา..."
              autoComplete="off"
            />
            {suggestions && (
              <div className="inert-menu">
                {suggestions.length === 0 ? (
                  <div className="inert-menu-empty">ไม่พบข้อมูล</div>
                ) : (
                  suggestions.map((s) => (
                    <button key={s.studentId} type="button" onMouseDown={(e) => { e.preventDefault(); choose(s.studentId); }}>
                      <b>{s.name}</b>
                      <span>ม.{s.class}/{s.room} เลขที่{s.number} ({s.studentId})</span>
                    </button>
                  ))
                )}
              </div>
            )}
            <span className="inert-error">กรุณากรอกชื่อ - สกุล</span>
          </div>

          <div className="inert-row">
            <Select label="ชั้น" value={b.cls} options={CLASSES} error={err.cls} msg="เลือกชั้น" onChange={(v) => update({ cls: v, ...clearErr("cls") })} />
            <Select label="ห้อง" value={b.room} options={ROOMS} error={err.room} msg="เลือกห้อง" onChange={(v) => update({ room: v, ...clearErr("room") })} />
            <Select label="เลขที่" value={b.number} options={NUMBERS} error={err.number} msg="เลือกเลขที่" onChange={(v) => update({ number: v, ...clearErr("number") })} />
          </div>

          <div className={`inert-field${err.type ? " is-error" : ""}`}>
            <span className="t-label">สาย - เฉื่อย <span className="t-req">*</span></span>
            <div className="inert-types">
              {types.map((t) => (
                <label key={t} className={`inert-type${b.type === t ? " is-on" : ""}`}>
                  <input type="radio" name={`type-${b.key}`} value={t} checked={b.type === t} onChange={() => update({ type: t, ...clearErr("type") })} />
                  <i className={TYPE_ICONS[t] ?? "fas fa-circle-dot"} aria-hidden />
                  <span>{t === NO_ASSEMBLY ? <><span className="inert-nb">ไม่เข้าแถว</span><wbr /><span className="inert-nb">หน้าเสาธง</span></> : t}</span>
                </label>
              ))}
            </div>
            {b.type === OTHER && <input className="t-input inert-more" value={b.typeOther} onChange={(e) => update({ typeOther: e.target.value })} placeholder="ระบุ อื่นๆ..." />}
            {b.type === NO_ASSEMBLY && (
              <input className="t-input inert-more" value={b.noAssembly} onChange={(e) => update({ noAssembly: e.target.value })} placeholder="ระบุเหตุผลที่ไม่เข้าแถว (เช่น อยู่ในห้อง)..." />
            )}
            <span className="inert-error">กรุณาเลือกประเภทหรือระบุเหตุผลให้ครบถ้วน</span>
          </div>

          <div className={`inert-field${err.violations ? " is-error" : ""}`}>
            <span className="t-label">รายการผิดระเบียบ</span>
            <div className="inert-checks">
              {violationList.map((v) => {
                const on = b.violations.includes(v);
                return (
                  <label key={v} className={`inert-check${on ? " is-on" : ""}`}>
                    <input
                      type="checkbox"
                      value={v}
                      checked={on}
                      onChange={() => update({ violations: on ? b.violations.filter((x) => x !== v) : [...b.violations, v], ...clearErr("violations") })}
                    />
                    <i className={on ? "fas fa-square-check" : "far fa-square"} aria-hidden /> {v}
                  </label>
                );
              })}
            </div>
            {b.violations.includes(OTHER) && <input className="t-input inert-more" value={b.violOther} onChange={(e) => update({ violOther: e.target.value })} placeholder="ระบุรายการผิดระเบียบ อื่นๆ..." />}
            <span className="inert-error">กรุณาระบุรายการผิดระเบียบอื่นๆ</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Select({ label, value, options, error, msg, onChange }: { label: string; value: string; options: string[]; error?: boolean; msg: string; onChange: (v: string) => void }) {
  return (
    <label className={`inert-field${error ? " is-error" : ""}`}>
      <span className="t-label">{label} <span className="t-req">*</span></span>
      <select className="t-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">เลือก</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <span className="inert-error">{msg}</span>
    </label>
  );
}

// Free text input with a filtered list under it (the inspector name).
function Suggest({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const q = value.toLowerCase();
  const shown = q ? options.filter((n) => n.toLowerCase().includes(q)) : options;
  return (
    <div className="inert-suggest">
      <input
        className="t-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && shown.length > 0 && (
        <div className="inert-menu">
          {shown.map((n) => (
            <button
              key={n}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(n);
                setOpen(false);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
