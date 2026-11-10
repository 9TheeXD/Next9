"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ToolShell, useConfirm, useToast } from "@/components/tool/Tool";
import { DEFAULT_ITEMS, isRoomSub, type Item, type RoomsConfig } from "../../forms/pinkbook/pinkbook";

// Pink book results for admins (/viewforms/pinkbook/). Same requests as the old page:
//   POST /api/pinkbook/login { password }   → cookie pinkbook_admin_auth=true (7 days)
//   GET  /api/pinkbook/config, GET /api/pinkbook/reports?week&term
//   GET  /api/pinkbook/latest?grade&room&group&term          (prefill a room nobody has sent yet)
//   POST /api/pinkbook/reports/admin_save {...}, DELETE /api/pinkbook/reports/<id>
//   GET  /api/pinkbook/logs?week&grade&room&group&term, POST /api/pinkbook/logs/revert { log_id, action_by }

type Report = { id: number; grade: string; room: string | number; group_name: string; issues: string; raw_issues?: string; unsubmitted_weeks?: string; status?: string };
type Sel = Record<string, { label: string; title?: string; weeks: number[]; allow_week: boolean }>;
type Log = { id: number; action: string; status?: string; created_at: string; action_by?: string; diff_summary?: string; issues?: string; unsubmitted_weeks?: string };

const GRADES = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const CLASS_ROOMS: Record<string, number> = { "ม.1": 14, "ม.2": 14, "ม.3": 14, "ม.4": 16, "ม.5": 16, "ม.6": 16 };
const COOKIE = "pinkbook_admin_auth";
const WEEKS = Array.from({ length: 22 }, (_, i) => i + 1);

// PinkbookShared.formatWeekRanges: weeks may arrive as a JSON string.
function weekRanges(weeks: unknown): string {
  if (!weeks) return "-";
  let parsed = weeks;
  if (typeof weeks === "string") {
    try {
      parsed = JSON.parse(weeks);
    } catch {
      return weeks;
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return "-";
  const sorted = parsed.map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  if (!sorted.length) return "-";
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) end = sorted[i];
    else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(", ");
}

function issuesList(sel: Sel) {
  const keys = Object.keys(sel || {});
  if (!keys.length) return "-";
  return keys
    .map((k) => {
      const it = sel[k];
      const title = it.label || it.title || "";
      const weeks = it.weeks || [];
      return it.allow_week !== false && weeks.length > 0 ? `${title} สัปดาห์ที่ ${weekRanges(weeks)}` : title;
    })
    .join(",<br>");
}

function currentWeekFor(week1?: string) {
  const dateStr = week1 || "2026-10-26";
  const target = new Date();
  const w1 = new Date(dateStr);
  const a = new Date(w1);
  a.setDate(w1.getDate() - w1.getDay());
  a.setHours(0, 0, 0, 0);
  const b = new Date(target);
  b.setDate(target.getDate() - target.getDay());
  b.setHours(0, 0, 0, 0);
  return Math.max(1, Math.min(22, Math.round((b.getTime() - a.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1));
}

function getCookie(name: string) {
  const parts = `; ${document.cookie}`.split(`; ${name}=`);
  return parts.length === 2 ? parts.pop()!.split(";").shift() : null;
}
function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value}; expires=${d.toUTCString()}; path=/`;
}

function thaiDateTime(s?: string) {
  if (!s) return "-";
  const d = new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return s;
  const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function ViewPinkbook() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [term, setTerm] = useState("2/2569");
  const [week, setWeek] = useState<number | null>(null);
  const [data, setData] = useState<Report[] | null>(null);
  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS);
  const [rooms, setRooms] = useState<RoomsConfig>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<{ grade: string; room: number; group: string; status: string; items: Item[]; sel: Sel; unsub: number[] } | null>(null);
  const [weekPick, setWeekPick] = useState<{ title: string; weeks: number[]; apply: (w: number[]) => void } | null>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ title: string; list: Log[] | null; error?: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const say = toast.show;
  const confirm = useConfirm();

  const loadWeek = useCallback(
    async (w: number, t: string) => {
      setWeek(w);
      setData(null);
      try {
        const json = await (await fetch(`/api/pinkbook/reports?week=${w}&term=${encodeURIComponent(t)}`)).json();
        if (json.success) setData(json.data);
        else say("ดึงข้อมูลล้มเหลว", "error");
      } catch {
        say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "error");
      }
    },
    [say],
  );

  const init = useCallback(async () => {
    let cfg: { current_term?: string; week_1_start?: string; items?: Item[]; rooms?: RoomsConfig } | null = null;
    try {
      const json = await (await fetch(`/api/pinkbook/config?t=${Date.now()}`)).json();
      if (json.success && json.config) cfg = json.config;
    } catch {}
    if (cfg && Array.isArray(cfg.items)) setItems(cfg.items);
    if (cfg?.rooms) setRooms(cfg.rooms);
    const t = cfg?.current_term || "2/2569";
    setTerm(t);
    loadWeek(currentWeekFor(cfg?.week_1_start), t);
  }, [loadWeek]);

  useEffect(() => {
    const t = setTimeout(() => {
      const ok = getCookie(COOKIE) === "true";
      setAuthed(ok);
      if (ok) init();
    }, 0);
    return () => clearTimeout(t);
  }, [init]);

  // Coming back to the tab after 3 s or more reloads the page, unless something is open.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = !!(edit || logs || weekPick || custom || !authed);
  }, [edit, logs, weekPick, custom, authed]);
  useEffect(() => {
    let blurred = 0;
    const back = () => {
      const tag = document.activeElement?.tagName;
      if (blurred > 0 && Date.now() - blurred >= 3000 && !busyRef.current && tag !== "INPUT" && tag !== "TEXTAREA") {
        setRefreshing(true);
        setTimeout(() => window.location.reload(), 300);
        setTimeout(() => setRefreshing(false), 3500);
      }
      blurred = 0;
    };
    const onBlur = () => (blurred = Date.now());
    const onVis = () => (document.visibilityState === "hidden" ? onBlur() : back());
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  function roomList(grade: string) {
    const g = grade.replace(/\D/g, "");
    const configured = rooms[g] ? Object.keys(rooms[g]).map(Number).sort((a, b) => a - b) : null;
    const max = configured ? configured[configured.length - 1] : CLASS_ROOMS[grade];
    return configured || Array.from({ length: max }, (_, i) => i + 1);
  }

  function rowsFor(grade: string) {
    return roomList(grade).flatMap((rNum) => {
      const hasSub = isRoomSub(rooms, grade, String(rNum));
      return (hasSub ? ["ก", "ข"] : ["-"]).map((grp) => {
        const r = (data || []).find(
          (d) => d.grade === grade && parseInt(String(d.room)) === rNum && (d.group_name === grp || (!hasSub && (d.group_name === "ก" || d.group_name === "" || d.group_name === "-"))),
        );
        return { rNum, grp, hasSub, r };
      });
    });
  }

  async function openEdit(grade: string, room: number, group: string, record?: Report) {
    let eItems: Item[] = [...items];
    let sel: Sel = {};
    let unsub: number[] = [];
    let status = "ยังไม่ส่ง";
    const addTitles = (raw: Sel) =>
      Object.values(raw).forEach((it) => {
        const title = it.label || it.title;
        if (title && !eItems.some((x) => (x as { title: string }).title === title)) eItems = [...eItems, { title, allow_week: it.allow_week !== false }];
      });
    if (record) {
      if (record.issues && record.issues !== "-") {
        status = "ไม่เรียบร้อย";
        try {
          const raw = JSON.parse(record.raw_issues || "{}");
          if (typeof raw === "object" && Object.keys(raw).length > 0) {
            sel = raw;
            addTitles(raw);
          }
        } catch {}
      } else status = "เรียบร้อย";
      try {
        const u = JSON.parse(record.unsubmitted_weeks || "null") || [];
        unsub = Array.isArray(u) ? u : [];
      } catch {
        unsub = [];
      }
    } else {
      try {
        const json = await (await fetch(`/api/pinkbook/latest?grade=${encodeURIComponent(grade)}&room=${room}&group=${encodeURIComponent(group || "-")}&term=${encodeURIComponent(term)}`)).json();
        if (json.success && json.data) {
          const latest = json.data;
          if (latest.raw_issues) {
            try {
              const raw = JSON.parse(latest.raw_issues || "{}");
              if (typeof raw === "object" && Object.keys(raw).length > 0) {
                sel = raw;
                addTitles(raw);
              }
            } catch {}
          }
          if (latest.unsubmitted_weeks) {
            try {
              const u = JSON.parse(latest.unsubmitted_weeks);
              if (Array.isArray(u)) unsub = u;
            } catch {}
          }
          if (Object.keys(sel).length > 0 || (latest.issues && latest.issues !== "-")) status = "ไม่เรียบร้อย";
          else if (latest.status === "เรียบร้อย" || latest.issues === "-") status = "เรียบร้อย";
          else status = "ไม่เรียบร้อย";
        }
      } catch {}
    }
    if (status === "เรียบร้อย") sel = {};
    if (status === "ยังไม่ส่ง") {
      sel = {};
      unsub = [];
    }
    setEdit({ grade, room, group, status, items: eItems, sel, unsub });
  }

  function setEditStatus(status: string) {
    setEdit((e) => e && { ...e, status, sel: status === "ไม่เรียบร้อย" ? e.sel : {}, unsub: status === "ยังไม่ส่ง" ? [] : e.unsub });
  }

  async function saveEdit() {
    if (!edit || week === null) return;
    let sel = edit.sel;
    let unsub = edit.unsub;
    let issues = "-";
    if (edit.status === "ไม่เรียบร้อย") {
      const keys = Object.keys(sel);
      if (!keys.length) return say("กรุณาเลือกรายการที่ไม่เรียบร้อยอย่างน้อย 1 รายการ", "error");
      for (const k of keys) {
        const it = sel[k];
        if (it.allow_week !== false && (!it.weeks || it.weeks.length === 0)) return say(`กรุณาเลือกสัปดาห์สำหรับ: ${it.label}`, "error");
      }
      issues = issuesList(sel);
    } else if (edit.status === "เรียบร้อย") sel = {};
    else {
      sel = {};
      unsub = [];
    }
    try {
      const json = await (
        await fetch("/api/pinkbook/reports/admin_save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            term,
            week,
            grade: edit.grade,
            room: edit.room,
            group_name: edit.group,
            status: edit.status,
            issues,
            unsubmitted_weeks: unsub,
            raw_issues: sel,
            action_by: "แอดมิน",
            diff_summary: `บันทึกผลการตรวจเป็น ${edit.status}`,
          }),
        })
      ).json();
      if (json.success) {
        say("บันทึกข้อมูลสำเร็จ");
        setEdit(null);
        loadWeek(week, term);
      } else say("บันทึกข้อมูลไม่สำเร็จ: " + (json.error || ""), "error");
    } catch {
      say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "error");
    }
  }

  async function openLogs(grade: string, room: number, group: string) {
    const grp = group && group !== "-" ? ` (กลุ่ม ${group})` : "";
    const title = `${grade}/${room}${grp} - สัปดาห์ที่ ${week}`;
    setLogs({ title, list: null });
    try {
      const json = await (await fetch(`/api/pinkbook/logs?week=${week}&grade=${encodeURIComponent(grade)}&room=${room}&group=${encodeURIComponent(group || "-")}&term=${encodeURIComponent(term)}`)).json();
      setLogs({ title, list: json.success && Array.isArray(json.data) ? json.data : [] });
    } catch {
      setLogs({ title, list: [], error: true });
    }
  }

  async function revert(id: number) {
    if (!(await confirm.ask("ย้อนกลับข้อมูลห้องนี้ไปเป็นข้อมูล ณ จุดนี้ใช่หรือไม่? (ระบบจะบันทึกประวัติรายการใหม่โดยไม่ลบประวัติเดิม)", "ย้อนกลับ"))) return;
    try {
      const json = await (await fetch("/api/pinkbook/logs/revert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ log_id: id, action_by: "แอดมิน" }) })).json();
      if (json.success) {
        say("ย้อนกลับข้อมูลสำเร็จ");
        setLogs(null);
        if (week !== null) loadWeek(week, term);
      } else say("ย้อนกลับไม่สำเร็จ: " + (json.error || ""), "error");
    } catch {
      say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "error");
    }
  }

  async function remove(id: number) {
    if (!(await confirm.ask("ลบข้อมูลผลการตรวจห้องนี้? (สถานะจะเปลี่ยนเป็น 'ยังไม่ส่ง' และถูกบันทึกลงใน Logs)", "ลบ"))) return;
    try {
      const json = await (await fetch(`/api/pinkbook/reports/${id}`, { method: "DELETE" })).json();
      if (json.success) {
        say("ลบข้อมูลสำเร็จ");
        if (week !== null) loadWeek(week, term);
      } else say("ลบข้อมูลไม่สำเร็จ", "error");
    } catch {
      say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "error");
    }
  }

  function copyGrade(grade: string) {
    let text = `สรุปการตรวจเล่มชมพู ระดับชั้น ${grade} (สัปดาห์ที่ ${week})\n\n`;
    rowsFor(grade).forEach(({ rNum, grp, hasSub, r }) => {
      const label = hasSub ? ` (${grp})` : "";
      if (r) {
        const status = r.issues && r.issues !== "-" ? "ไม่เรียบร้อย" : "เรียบร้อย";
        text += status === "ไม่เรียบร้อย" ? `- ${grade}/${rNum}${label}: ${status} (${r.issues.replace(/<br\s*\/?>/gi, " ").replace(/^"|"$/g, "")})\n` : `- ${grade}/${rNum}${label}: ${status}\n`;
      } else text += `- ${grade}/${rNum}${label}: ยังไม่ส่ง\n`;
    });
    navigator.clipboard.writeText(text).then(
      () => say(`คัดลอกข้อมูลชั้น ${grade} เรียบร้อยแล้ว`),
      () => say("ไม่สามารถคัดลอกข้อความได้", "error"),
    );
  }

  if (authed === null) return null;
  if (!authed) return <Login onDone={() => { setAuthed(true); init(); }} />;

  return (
    <ToolShell
      wide
      title={week ? `สรุปผลเล่มชมพู สัปดาห์ที่ ${week}` : "สรุปผลเล่มชมพู"}
      icon="fas fa-book"
      sub={
        <>
          <div className="t-tabs" role="tablist">
            {["2/2569", "1/2569"].map((t) => (
              <button key={t} type="button" role="tab" aria-selected={term === t} className={term === t ? "is-on" : undefined} onClick={() => { setTerm(t); loadWeek(week || 1, t); }}>
                ภาคเรียนที่ {t}
              </button>
            ))}
          </div>
          <button type="button" className="vp-logout" onClick={() => { setCookie(COOKIE, "", -1); location.reload(); }}>
            <i className="fas fa-arrow-right-from-bracket" aria-hidden /> ออกจากระบบ
          </button>
        </>
      }
    >
      <div className="t-card vp-weeks" role="tablist" aria-label="สัปดาห์">
        {WEEKS.map((w) => (
          <button key={w} type="button" role="tab" aria-selected={week === w} className={week === w ? "is-on" : undefined} onClick={() => loadWeek(w, term)}>{w}</button>
        ))}
      </div>

      {data === null ? (
        <div className="t-card t-empty"><i className="fas fa-spinner fa-spin" aria-hidden />กำลังโหลด...</div>
      ) : (
        GRADES.map((grade) => {
          const rows = rowsFor(grade);
          const sent = rows.filter((x) => x.r).length;
          const isOpen = !!open[grade];
          return (
            <section key={grade} className={`t-card vp-grade${isOpen ? " is-open" : ""}`}>
              <div className="vp-grade-head" onClick={() => setOpen((o) => ({ ...o, [grade]: !o[grade] }))}>
                <b>{grade}</b>
                <span className="vp-progress"><span style={{ width: `${(sent / rows.length) * 100}%` }} /></span>
                <span className="t-muted">ส่งแล้ว {sent}/{rows.length}</span>
                <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={(e) => { e.stopPropagation(); copyGrade(grade); }}>
                  <i className="far fa-copy" aria-hidden /> คัดลอก
                </button>
                <i className={`fas fa-chevron-${isOpen ? "up" : "down"}`} aria-hidden />
              </div>
              {isOpen && (
                <div className="vf-table-wrap">
                  <table className="vf-table">
                    <thead>
                      <tr>
                        <th>ห้อง</th>
                        <th>กลุ่ม</th>
                        <th>สถานะ</th>
                        <th>รายการที่ต้องแก้ไข</th>
                        <th>สัปดาห์ที่ขาดส่ง</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ rNum, grp, hasSub, r }) => {
                        const status = r ? (r.issues && r.issues !== "-" ? "ไม่เรียบร้อย" : "เรียบร้อย") : "ยังไม่ส่ง";
                        const room = r ? Number(r.room) : rNum;
                        return (
                          <tr key={`${rNum}${grp}`}>
                            <td data-label="ห้อง"><b>{grade}/{r ? r.room : rNum}</b></td>
                            <td data-label="กลุ่ม">{r ? (hasSub ? r.group_name : "-") : grp}</td>
                            <td data-label="สถานะ"><span className={`pb-status ${status === "เรียบร้อย" ? "is-neat" : status === "ไม่เรียบร้อย" ? "is-messy" : "is-none"}`}>{status}</span></td>
                            <td data-label="รายการ">{r?.issues && r.issues !== "-" ? r.issues.split(",<br>").join(" · ") : "-"}</td>
                            <td data-label="ขาดส่ง">{r ? weekRanges(r.unsubmitted_weeks) : "-"}</td>
                            <td data-label="จัดการ">
                              <div className="vp-actions">
                                <button type="button" className="t-icon-btn" title={r ? "แก้ไขข้อมูล" : "บันทึกข้อมูล"} aria-label="แก้ไข" onClick={() => openEdit(grade, room, grp, r)}><i className="fas fa-pen" aria-hidden /></button>
                                <button type="button" className="t-icon-btn" title="ดูประวัติ" aria-label="ประวัติ" onClick={() => openLogs(grade, room, grp)}><i className="far fa-file-lines" aria-hidden /></button>
                                {r && <button type="button" className="t-icon-btn" title="ลบข้อมูล" aria-label="ลบ" onClick={() => remove(r.id)}><i className="fas fa-trash" aria-hidden /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}

      {edit && (
        <div className="t-modal">
          <div className="t-modal-card vs-sheet">
            <div className="vs-sheet-head">
              <b>แก้ไขผลการตรวจ · {edit.grade}/{edit.room}{edit.group && edit.group !== "-" ? ` (กลุ่ม ${edit.group})` : ""} - สัปดาห์ที่ {week}</b>
              <button type="button" className="t-icon-btn" onClick={() => setEdit(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
            </div>
            <div className="vp-status">
              {["เรียบร้อย", "ไม่เรียบร้อย", "ยังไม่ส่ง"].map((s) => (
                <label key={s} className={`pb-seg-btn${edit.status === s ? " is-on" : ""} ${s === "เรียบร้อย" ? "is-neat" : s === "ไม่เรียบร้อย" ? "is-messy" : ""}`}>
                  <input type="radio" name="edit_overall_status" value={s} checked={edit.status === s} onChange={() => setEditStatus(s)} />
                  {s}
                </label>
              ))}
            </div>
            {edit.status === "ไม่เรียบร้อย" && (
              <div className="pb-items vp-items">
                {edit.items.map((it, index) => {
                  const title = typeof it === "string" ? it : it.title;
                  const allowWeek = typeof it === "string" ? true : it.allow_week !== false;
                  const on = !!edit.sel[index];
                  const weeks = on && edit.sel[index].weeks ? edit.sel[index].weeks : [];
                  return (
                    <div
                      key={index}
                      className={`pb-item${on ? " is-on" : ""}`}
                      onClick={() =>
                        setEdit((e) => {
                          if (!e) return e;
                          const sel = { ...e.sel };
                          if (sel[index]) delete sel[index];
                          else sel[index] = { label: title, weeks: [], allow_week: allowWeek };
                          return { ...e, sel };
                        })
                      }
                    >
                      <i className={on ? "fas fa-square-check" : "far fa-square"} aria-hidden />
                      <span className="pb-item-text">{title}</span>
                      {allowWeek && on && (
                        <button
                          type="button"
                          className={`pb-week-btn${weeks.length ? " has-weeks" : ""}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setWeekPick({
                              title,
                              weeks: [...weeks],
                              apply: (w) =>
                                setEdit((e) => {
                                  if (!e) return e;
                                  const sel = { ...e.sel };
                                  sel[index] = sel[index] ? { ...sel[index], weeks: w } : { label: title, weeks: w, allow_week: allowWeek };
                                  return { ...e, sel };
                                }),
                            });
                          }}
                        >
                          {weeks.length ? `สัปดาห์ที่ ${weekRanges(weeks)}` : "เลือกสัปดาห์"}
                        </button>
                      )}
                    </div>
                  );
                })}
                <button type="button" className="inert-add pb-add-item" onClick={() => setCustom("")}><i className="fas fa-plus" aria-hidden /> เพิ่มรายการ</button>
              </div>
            )}
            {edit.status !== "ยังไม่ส่ง" && (
              <button type="button" className="pb-unsub vp-unsub" onClick={() => setWeekPick({ title: "เลือกสัปดาห์ที่ขาดส่ง", weeks: [...edit.unsub], apply: (w) => setEdit((e) => e && { ...e, unsub: w }) })}>
                <i className="fas fa-calendar-xmark" aria-hidden />
                {edit.unsub.length ? `สัปดาห์ที่ขาดส่ง: ${weekRanges(edit.unsub)}` : "เลือกสัปดาห์ที่ยังไม่ส่ง"}
              </button>
            )}
            <div className="t-modal-actions">
              <button type="button" className="t-btn t-btn-ghost" onClick={() => setEdit(null)}>ยกเลิก</button>
              <button type="button" className="t-btn" onClick={saveEdit}><i className="fas fa-floppy-disk" aria-hidden /> บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {weekPick && (
        <div className="t-modal">
          <div className="t-modal-card">
            <p><b>เลือกสัปดาห์</b></p>
            <p className="t-muted">{weekPick.title}</p>
            <div className="pb-weeks">
              {WEEKS.map((w) => {
                const on = weekPick.weeks.includes(w);
                return (
                  <button key={w} type="button" className={on ? "is-on" : undefined} onClick={() => setWeekPick((p) => p && { ...p, weeks: on ? p.weeks.filter((x) => x !== w) : [...p.weeks, w] })}>{w}</button>
                );
              })}
            </div>
            <div className="t-modal-actions">
              <button type="button" className="t-btn t-btn-ghost" onClick={() => setWeekPick(null)}>ยกเลิก</button>
              <button type="button" className="t-btn" onClick={() => { weekPick.apply([...weekPick.weeks].sort((a, b) => a - b)); setWeekPick(null); }}>ตกลง</button>
            </div>
          </div>
        </div>
      )}

      {custom !== null && (
        <div className="t-modal">
          <div className="t-modal-card">
            <p><b>เพิ่มรายการใหม่</b></p>
            <input
              className="t-input pb-modal-input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="ชื่อรายการ..."
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && document.getElementById("vp-custom-add")?.click()}
            />
            <div className="t-modal-actions">
              <button type="button" className="t-btn t-btn-ghost" onClick={() => setCustom(null)}>ยกเลิก</button>
              <button
                id="vp-custom-add"
                type="button"
                className="t-btn"
                onClick={() => {
                  const val = custom.trim();
                  if (!val) return;
                  setEdit((e) => {
                    if (!e) return e;
                    const items = [...e.items, { title: val, allow_week: true }];
                    return { ...e, items, sel: { ...e.sel, [items.length - 1]: { label: val, weeks: [], allow_week: true } } };
                  });
                  setCustom(null);
                }}
              >
                เพิ่ม
              </button>
            </div>
          </div>
        </div>
      )}

      {logs && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setLogs(null)}>
          <div className="t-modal-card vs-sheet">
            <div className="vs-sheet-head">
              <b>ประวัติการบันทึก · {logs.title}</b>
              <button type="button" className="t-icon-btn" onClick={() => setLogs(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
            </div>
            {logs.list === null ? (
              <div className="t-empty"><i className="fas fa-spinner fa-spin" aria-hidden />กำลังโหลดประวัติ...</div>
            ) : logs.error ? (
              <div className="t-empty">ไม่สามารถดึงข้อมูลประวัติได้</div>
            ) : logs.list.length === 0 ? (
              <div className="t-empty"><i className="far fa-folder-open" aria-hidden />ยังไม่มีประวัติการบันทึกข้อมูลสำหรับห้องนี้</div>
            ) : (
              logs.list.map((log) => {
                const act = { submit: "ส่งข้อมูล", delete: "ลบข้อมูล", revert: "ย้อนกลับ" }[log.action] || "แก้ไข";
                const st = log.status || "ไม่ระบุ";
                return (
                  <div key={log.id} className={`pb-tl is-${log.action}`}>
                    <span className="pb-tl-dot"><i className={`fas ${{ submit: "fa-cloud-arrow-up", delete: "fa-trash-can", revert: "fa-rotate-left" }[log.action] || "fa-pen-to-square"}`} aria-hidden /></span>
                    <div className="pb-tl-card">
                      <div className="pb-tl-top">
                        <b>{act} · <span className={st === "เรียบร้อย" ? "vs-good" : st === "ยังไม่ส่ง" ? "vs-bad" : ""}>{st}</span></b>
                        <time>{thaiDateTime(log.created_at)}</time>
                      </div>
                      <div className="t-muted pb-tl-meta"><i className="far fa-user" aria-hidden /> {log.action_by || "แอดมิน"}{log.diff_summary ? ` · ${log.diff_summary}` : ""}</div>
                      {log.issues && log.issues !== "-" && <div className="pb-tl-issues">{log.issues.split(/,<br>|<br>/).join(" · ")}</div>}
                      {log.unsubmitted_weeks && log.unsubmitted_weeks !== "[]" && log.unsubmitted_weeks !== "-" && <div className="t-muted pb-tl-meta">สัปดาห์ที่ขาดส่ง: {weekRanges(log.unsubmitted_weeks)}</div>}
                      <button type="button" className="t-btn t-btn-ghost t-btn-sm vp-revert" onClick={() => revert(log.id)}><i className="fas fa-rotate-left" aria-hidden /> ย้อนกลับไปสถานะนี้</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {refreshing && <div className="inert-loading"><i className="fas fa-arrows-rotate fa-spin" aria-hidden /></div>}
      {toast.node}
      {confirm.node}
    </ToolShell>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="t-center">
      <form
        className="t-login"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value) return;
          try {
            const json = await (await fetch("/api/pinkbook/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: value }) })).json();
            if (json.success) {
              setCookie(COOKIE, "true", 7);
              onDone();
            } else setError("รหัสผ่านไม่ถูกต้อง");
          } catch {
            setError("เกิดข้อผิดพลาดในการเชื่อมต่อ");
          }
        }}
      >
        <i className="fas fa-lock t-login-icon" aria-hidden />
        <h1>เข้าสู่ระบบแอดมิน</h1>
        <p>กรุณากรอกรหัสผ่านเพื่อเข้าดูสรุปผล</p>
        <input type="password" value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} placeholder="รหัสผ่าน..." autoComplete="off" autoFocus />
        {error && <span className="t-login-error">{error}</span>}
        <button type="submit" className="t-btn t-btn-block">เข้าสู่ระบบ</button>
      </form>
    </div>
  );
}
