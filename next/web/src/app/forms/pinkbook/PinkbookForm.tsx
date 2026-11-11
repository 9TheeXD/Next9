"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/tool/Tool";
import {
  DEFAULT_ITEMS,
  LOCAL_KEY,
  TERM_FALLBACK,
  calculateCurrentWeek,
  draftId,
  draftIsEmpty,
  formatRoomTime,
  formatWeekRanges,
  isRoomSub,
  itemAllowWeek,
  itemTitle,
  roomOptions,
  roomTime,
  sortRooms,
  type Draft,
  type Item,
  type RoomRecord,
  type RoomsConfig,
  type Selected,
} from "./pinkbook";
import { History } from "./History";
import { usePublicSettings } from "@/lib/useSettings";

// Pink book inspection form (/forms/pinkbook/). Same requests and data as the old page:
//   GET /api/pinkbook/config, GET /inspectors.json, GET /api/pinkbook/latest?grade&room&group
//   POST /api/pinkbook/add-item { title, allow_week }      (a checklist item saved for everyone)
//   POST /api/pinkbook/submit, then POST /api/pinkbook/verify (same payload), retried once after 2 s
//   GET/POST /api/pinkbook/draft                           (unsaved work, keyed by this browser's id)
// plus localStorage pinkbook_inspector / pinkbook_week / pinkbook_draft(_id) and cookie pb_draft.

const DEFAULT_GRADES = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const WEEKS = Array.from({ length: 22 }, (_, i) => i + 1);
const MESSY = "ไม่เรียบร้อย";
const NEAT = "เรียบร้อย";

function store(key: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {}
  return null;
}

export function PinkbookForm() {
  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS);
  // The term being recorded: the pinkbook settings' current term, else the school's (admin → ปีการศึกษา).
  const [TERM, setTerm] = useState("");
  // Grades: admin → ปีการศึกษา.
  const school = usePublicSettings("school")?.school;
  const GRADES = school?.grades?.length ? school.grades.map((g) => g.name) : DEFAULT_GRADES;
  // Checklist from the server config, permanent items included; picking a room starts from this.
  const [baseItems, setBaseItems] = useState<Item[]>(DEFAULT_ITEMS);
  const [roomsConfig, setRoomsConfig] = useState<RoomsConfig>({});
  const [inspectors, setInspectors] = useState<string[]>([]);
  const [inspector, setInspector] = useState("");
  const [week, setWeek] = useState("");
  const [grade, setGrade] = useState("");
  const [room, setRoom] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Selected>({});
  const [unsub, setUnsub] = useState<number[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [ready, setReady] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [weekModal, setWeekModal] = useState<{ id: string | null; label: string; weeks: number[] } | null>(null);
  const [addModal, setAddModal] = useState<{ title: string; allowWeek: boolean; permanent: boolean } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [inspOpen, setInspOpen] = useState(false);
  const toast = useToast();
  const say = useCallback((m: string) => toast.show(m, "success"), [toast]);
  const sayErr = useCallback((m: string) => toast.show(m, "error"), [toast]);
  const historyRefresh = useRef<() => void>(() => {});

  // ----- Draft ---------------------------------------------------------------------
  const draft = useRef({ id: "", lastSent: "", timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const collect = useCallback(
    (): Draft => ({ v: 1, inspector, week, grade, room, group, status, selectedData: selected, unsubmittedWeeks: unsub, addedRooms: rooms, editingId }),
    [inspector, week, grade, room, group, status, selected, unsub, rooms, editingId],
  );
  const latest = useRef(collect);
  useEffect(() => {
    latest.current = collect;
  }, [collect]);

  const push = useCallback(async (d: Draft, beacon?: boolean) => {
    const body = JSON.stringify({ id: draft.current.id, draft: draftIsEmpty(d) ? null : d });
    if (body === draft.current.lastSent) return;
    draft.current.lastSent = body;
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/pinkbook/draft", new Blob([body], { type: "text/plain" }));
      return;
    }
    try {
      await fetch("/api/pinkbook/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    } catch {
      draft.current.lastSent = "";
    }
  }, []);
  const snapshot = useCallback(() => {
    const d = { ...latest.current(), savedAt: Date.now() };
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
    } catch {}
    return d;
  }, []);
  const flush = useCallback(() => {
    clearTimeout(draft.current.timer);
    push(snapshot(), true);
  }, [push, snapshot]);

  // Every change is saved locally and to the server 0.7 s later (once the form is restored).
  useEffect(() => {
    if (!ready) return;
    clearTimeout(draft.current.timer);
    draft.current.timer = setTimeout(() => push(snapshot()), 700);
  }, [ready, collect, push, snapshot]);

  useEffect(() => {
    if (!ready) return;
    const onHide = () => document.visibilityState === "hidden" && flush();
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!draftIsEmpty(latest.current())) {
        flush();
        e.preventDefault();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [ready, flush]);

  // ----- Load ------------------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      draft.current.id = draftId();
      fetch("/inspectors.json")
        .then((r) => r.json())
        .then((l) => alive && setInspectors(l))
        .catch(() => {});
      let cfgItems: Item[] = DEFAULT_ITEMS;
      let cfgRooms: RoomsConfig = {};
      let json: { success?: boolean; config?: { items?: Item[]; rooms?: RoomsConfig; week_1_start?: string; current_term?: string } } = {};
      try {
        json = await (await fetch(`/api/pinkbook/config?t=${Date.now()}`)).json();
      } catch {}
      const term = json.config?.current_term || TERM_FALLBACK;
      if (alive) setTerm(term);
      if (store("pinkbook_term_v2") !== term) {
        try {
          localStorage.removeItem("pinkbook_week");
        } catch {}
        store("pinkbook_term_v2", term);
      }
      let insp = store("pinkbook_inspector") || "";
      let wk = store("pinkbook_week") || "";
      if (wk === "22") wk = "";
      try {
        if (json.success && json.config) {
          if (Array.isArray(json.config.items)) cfgItems = json.config.items;
          if (json.config.rooms) cfgRooms = json.config.rooms;
          if (!wk || wk === "22") {
            wk = String(calculateCurrentWeek(json.config.week_1_start));
            store("pinkbook_inspector", insp);
            store("pinkbook_week", wk);
          }
        }
      } catch {}
      if (!alive) return;
      // Old configs list plain titles; keep the built-in allow_week for those so the week picker stays as before.
      const configItems = cfgItems.map((it) => (typeof it === "string" ? DEFAULT_ITEMS.find((d) => itemTitle(d) === it) ?? it : it));

      // Restore unsaved work: whichever copy (this browser's or the server's) was saved last.
      let local: Draft | null = null;
      try {
        local = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      } catch {}
      let server: Draft | null = null;
      try {
        const j = await (await fetch(`/api/pinkbook/draft?id=${encodeURIComponent(draft.current.id)}&t=${Date.now()}`)).json();
        server = j.success ? j.draft : null;
      } catch {}
      if (!alive) return;
      const pick = [local, server].filter((d): d is Draft => !!d && d.v === 1).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
      let restoredRooms: RoomRecord[] = [];
      if (pick && !draftIsEmpty(pick)) {
        if (pick.inspector) insp = pick.inspector;
        if (pick.week) wk = pick.week;
        store("pinkbook_inspector", insp);
        store("pinkbook_week", wk);
        restoredRooms = Array.isArray(pick.addedRooms) ? pick.addedRooms : [];
        cfgItems = withLabels(cfgItems, pick.selectedData);
        loadRoomInto(pick);
        setRooms(sortRooms(restoredRooms));
        if (pick.editingId && restoredRooms.some((r) => r.id === pick.editingId)) setEditingId(pick.editingId);
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify(pick));
        } catch {}
        draft.current.lastSent = "";
        push(pick);
        const n = restoredRooms.length;
        say(n ? `กู้คืนข้อมูลที่ยังไม่ได้บันทึกแล้ว (${n} ห้องในตาราง)` : "กู้คืนข้อมูลที่ยังไม่ได้บันทึกแล้ว");
      }
      setItems(cfgItems);
      setBaseItems(configItems);
      setRoomsConfig(cfgRooms);
      setInspector(insp);
      setWeek(wk);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function withLabels(list: Item[], sel?: Selected) {
    const next = [...list];
    Object.values(sel || {}).forEach((it) => {
      if (!it || !it.label) return;
      if (!next.some((x) => itemTitle(x) === it.label)) next.push({ title: it.label, allow_week: it.allow_week !== false });
    });
    return next;
  }

  // One room's answers onto the form, without asking the server for that room's last record.
  function loadRoomInto(d: Partial<Draft>) {
    setSelected(d.selectedData && typeof d.selectedData === "object" ? d.selectedData : {});
    setUnsub(Array.isArray(d.unsubmittedWeeks) ? d.unsubmittedWeeks : []);
    setGrade(d.grade || "");
    setRoom(d.grade && d.room ? d.room : "");
    setGroup(d.grade && d.room && d.group ? d.group : "");
    setStatus(d.status || "");
  }

  const saveCache = (insp: string, wk: string) => {
    store("pinkbook_inspector", insp);
    store("pinkbook_week", wk);
  };

  // ----- Room selection --------------------------------------------------------------
  const hasSub = !!(grade && room) && isRoomSub(roomsConfig, grade, room);
  const enabled = !!(grade && room) && (!hasSub || !!group);

  async function fetchLatest(g: string, r: string, grp: string) {
    setLoadingRoom(true);
    try {
      const json = await (await fetch(`/api/pinkbook/latest?grade=${encodeURIComponent(g)}&room=${encodeURIComponent(r)}&group=${encodeURIComponent(grp)}`)).json();
      let sel: Selected = {};
      let weeks: number[] = [];
      const list: Item[] = [...baseItems];
      if (json.success && json.data) {
        try {
          if (json.data.raw_issues) {
            sel = JSON.parse(json.data.raw_issues) || {};
            Object.keys(sel).forEach((k) => {
              const lbl = sel[k].label;
              if (!list.some((it) => itemTitle(it) === lbl)) list.push({ title: lbl, allow_week: sel[k].allow_week !== false });
            });
          }
        } catch {}
        try {
          const parsed = JSON.parse(json.data.unsubmitted_weeks);
          if (Array.isArray(parsed)) weeks = parsed;
        } catch {}
      }
      setItems(list);
      setSelected(sel);
      setUnsub(weeks);
      if (Object.keys(sel).length > 0) setStatus(MESSY);
      else if (json.success && json.data && json.data.status === NEAT) setStatus(NEAT);
      else setStatus("");
    } catch {
      sayErr("เกิดข้อผิดพลาดในการโหลดข้อมูลเก่า");
    }
    setLoadingRoom(false);
  }

  function pickGrade(g: string) {
    setGrade(g);
    setRoom("");
    setGroup("");
  }

  function pickRoom(r: string) {
    setRoom(r);
    setGroup("");
    if (grade && r && !isRoomSub(roomsConfig, grade, r)) fetchLatest(grade, r, "-");
  }

  function pickGroup(g: string) {
    setGroup(g);
    if (grade && room) fetchLatest(grade, room, g);
  }

  function pickStatus(s: string) {
    setStatus(s);
    if (s !== MESSY) setSelected({});
  }

  function toggleItem(id: string, label: string, allowWeek: boolean) {
    setSelected((sel) => {
      const next = { ...sel };
      if (next[id]) delete next[id];
      else next[id] = { label, weeks: [], allow_week: allowWeek };
      return next;
    });
  }

  function clearForm() {
    setGrade("");
    setRoom("");
    setGroup("");
    setStatus("");
    setSelected({});
    setUnsub([]);
  }

  // ----- Table -----------------------------------------------------------------------
  function addToTable() {
    if (!grade || !room) return sayErr("กรุณาเลือกระดับชั้นและห้องเรียน (ส่วนที่ 2)");
    const grp = hasSub ? group || null : "-";
    if (hasSub && !grp) return sayErr("กรุณาเลือกกลุ่ม ก หรือ ข (ส่วนที่ 2)");
    const keys = Object.keys(selected);
    const formatted = keys.map((k) => {
      const it = selected[k];
      return it.allow_week !== false && it.weeks && it.weeks.length > 0 ? `${it.label} สัปดาห์ที่ ${formatWeekRanges(it.weeks)}` : it.label;
    });
    if (!status) return sayErr("กรุณาเลือกสถานะการตรวจ (ส่วนที่ 3)");
    if (status === MESSY) {
      if (keys.length === 0) return sayErr("กรุณาเลือกรายการที่ไม่เรียบร้อยอย่างน้อย 1 รายการ (ส่วนที่ 4)");
      for (const k of keys) {
        const it = selected[k];
        if (it.allow_week !== false && (!it.weeks || it.weeks.length === 0)) return sayErr(`กรุณาระบุสัปดาห์ที่ไม่เรียบร้อยสำหรับ "${it.label}"`);
      }
    }
    const record: RoomRecord = {
      id: Date.now().toString(),
      grade,
      room,
      group_name: grp!,
      status,
      issues: formatted.length > 0 ? formatted.join(",<br>") : "-",
      raw_issues: selected,
      unsubmitted_weeks: [...unsub],
    };
    record.updatedAt = Date.now();
    const wasEditing = !!editingId && rooms.some((r) => r.id === editingId);
    if (wasEditing) {
      record.id = editingId!;
      setRooms(sortRooms(rooms.map((r) => (r.id === editingId ? record : r))));
    } else setRooms(sortRooms([...rooms, record]));
    setEditingId(null);
    clearForm();
    if (window.innerWidth <= 900) setFormOpen(false);
    const g = hasSub ? ` กลุ่ม ${grp}` : "";
    say(wasEditing ? `แก้ไขข้อมูล ${grade}/${room}${g} แล้ว` : `เพิ่มข้อมูล ${grade}/${room}${g} ลงตารางแล้ว`);
  }

  function editRecord(id: string) {
    const r = rooms.find((x) => x.id === id);
    if (!r) return;
    const sel: Selected = JSON.parse(JSON.stringify(r.raw_issues || {}));
    setItems((list) => withLabels(list, sel));
    loadRoomInto({ grade: r.grade, room: r.room, group: r.group_name === "-" ? "" : r.group_name, status: r.status, selectedData: sel, unsubmittedWeeks: [...(r.unsubmitted_weeks || [])] });
    setEditingId(id);
    if (window.innerWidth <= 900) setFormOpen(true);
    const g = r.group_name && r.group_name !== "-" ? ` กลุ่ม ${r.group_name}` : "";
    say(`กำลังแก้ไข ${r.grade}/${r.room}${g}`);
  }

  function removeRecord(id: string) {
    setRooms((l) => l.filter((r) => r.id !== id));
    if (editingId === id) setEditingId(null);
  }

  // ----- Submit ----------------------------------------------------------------------
  async function submit() {
    const name = inspector.trim();
    if (!name) return sayErr("กรุณากรอกชื่อผู้ตรวจ (ส่วนที่ 1)");
    if (!week) return sayErr("กรุณาเลือกสัปดาห์ที่ตรวจ (ส่วนที่ 1)");
    if (rooms.length === 0) return sayErr('ยังไม่มีข้อมูลในตารางฝั่งขวา กรุณากด "เพิ่มลงตาราง" ก่อน');
    const payload = JSON.stringify({ inspector_name: name, inspected_week: parseInt(week), term: TERM, records: rooms });
    const post = async (url: string) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload })).json();
    setSending("กำลังบันทึกข้อมูล...");
    let ok = false;
    try {
      try {
        if ((await post("/api/pinkbook/submit")).success) {
          setSending("กำลังตรวจสอบฐานข้อมูล...");
          const v = await post("/api/pinkbook/verify");
          ok = v.success && v.verified;
        }
      } catch {}
      if (!ok) {
        setSending("กำลังลองส่งใหม่อีกครั้ง...");
        await new Promise((r) => setTimeout(r, 2000));
        try {
          if ((await post("/api/pinkbook/submit")).success) {
            const v = await post("/api/pinkbook/verify");
            ok = v.success && v.verified;
          }
        } catch {}
      }
      if (ok) {
        setSuccess(true);
        setRooms([]);
        clearTimeout(draft.current.timer);
        draft.current.lastSent = "";
        const d = { ...latest.current(), addedRooms: [], savedAt: Date.now() };
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
        } catch {}
        push(d);
      } else sayErr("ไม่สามารถบันทึกข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วกดส่งใหม่อีกครั้ง");
    } catch {
      sayErr("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง");
    }
    setSending(null);
  }

  // ----- Add a checklist item -------------------------------------------------------
  async function confirmAdd() {
    if (!addModal) return;
    const val = addModal.title.trim();
    if (!val) return sayErr("กรุณาพิมพ์ชื่อรายการ");
    if (addModal.permanent) {
      try {
        const data = await (
          await fetch("/api/pinkbook/add-item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: val, allow_week: addModal.allowWeek }) })
        ).json();
        if (data.success) {
          setItems((l) => [...l, { title: val, allow_week: addModal.allowWeek }]);
          setBaseItems((l) => [...l, { title: val, allow_week: addModal.allowWeek }]);
          setAddModal(null);
          say("เพิ่มรายการถาวรสำเร็จ ทุกคนจะเห็นหัวข้อนี้");
        } else sayErr(data.message || "เกิดข้อผิดพลาด");
      } catch {
        sayErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
      }
    } else {
      setItems((l) => [...l, { title: val, allow_week: addModal.allowWeek }]);
      setAddModal(null);
      say("เพิ่มรายการสำเร็จ (ชั่วคราว)");
    }
  }

  // ----- Refresh after coming back to the tab (only when nothing is in progress) ------
  const cleanRef = useRef<() => boolean>(() => true);
  useEffect(() => {
    cleanRef.current = () => {
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const modal = !!(weekModal || addModal || confirmClear || success);
      return draftIsEmpty(latest.current()) && !typing && !modal;
    };
  }, [weekModal, addModal, confirmClear, success]);
  const historyOpenRef = useRef(false);
  useEffect(() => {
    historyOpenRef.current = historyOpen;
  }, [historyOpen]);
  useEffect(() => {
    let blurredAt = 0;
    const back = () => {
      if (blurredAt > 0 && Date.now() - blurredAt >= 3000) {
        if (historyOpenRef.current) historyRefresh.current();
        else if (cleanRef.current()) {
          setRefreshing(true);
          setTimeout(() => window.location.reload(), 300);
          setTimeout(() => setRefreshing(false), 3500);
        }
      }
      blurredAt = 0;
    };
    const onBlur = () => (blurredAt = Date.now());
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

  // ----- Render ------------------------------------------------------------------------
  const q = inspector.toLowerCase();
  const inspMatches = q ? inspectors.filter((n) => n.toLowerCase().includes(q)) : inspectors;
  const hint = enabled ? null : "เลือกระดับชั้น ห้องเรียน และกลุ่มก่อน";

  return (
    <div className="pb-page">
      <header className="pb-head">
        <div className="pb-head-inner">
          <div>
            <h1><i className="fas fa-book" aria-hidden /> เล่มชมพู</h1>
            <p>บันทึกการตรวจเล่มชมพู · สภานักเรียน <span className="pb-term">ภาคเรียนที่ {TERM}</span></p>
          </div>
          <button type="button" className="pb-history-btn" onClick={() => setHistoryOpen(true)}>
            <i className="fas fa-clock-rotate-left" aria-hidden /> <span>ประวัติการส่ง</span>
          </button>
        </div>
      </header>

      <div className="pb-split">
        <aside className={`pb-form${formOpen ? " is-open" : ""}${editingId ? " is-editing" : ""}`}>
          <div className="pb-form-mhead">
            <b><i className="fas fa-pen-to-square" aria-hidden /> {editingId ? "แก้ไขข้อมูลห้อง" : "กรอกข้อมูล"}</b>
            <button type="button" className="t-icon-btn" onClick={() => setFormOpen(false)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
          </div>

          <section className="t-card">
            <h2 className="t-card-title"><span className="pb-step">1</span> ผู้ตรวจ</h2>
            <span className="t-label">ชื่อผู้ตรวจ <span className="t-req">*</span></span>
            <div className="inert-suggest">
              <input
                className="t-input"
                value={inspector}
                onChange={(e) => {
                  setInspector(e.target.value);
                  saveCache(e.target.value, week);
                  setInspOpen(true);
                }}
                onFocus={() => setInspOpen(true)}
                onBlur={() => setTimeout(() => setInspOpen(false), 200)}
                placeholder="พิมพ์เพื่อค้นหา หรือเลือกจากรายการ..."
                autoComplete="off"
              />
              {inspOpen && inspMatches.length > 0 && (
                <div className="inert-menu">
                  {inspMatches.map((n) => (
                    <button key={n} type="button" onMouseDown={(e) => { e.preventDefault(); setInspector(n); saveCache(n, week); setInspOpen(false); }}>{n}</button>
                  ))}
                </div>
              )}
            </div>
            <label className="pb-field">
              <span className="t-label">สัปดาห์ที่ตรวจ <span className="t-req">*</span></span>
              <select className="t-input" value={week} onChange={(e) => { setWeek(e.target.value); saveCache(inspector, e.target.value); }}>
                <option value="" disabled>-- เลือกสัปดาห์ --</option>
                {WEEKS.map((w) => <option key={w} value={String(w)}>สัปดาห์ที่ {w}</option>)}
              </select>
            </label>
          </section>

          <section className="t-card">
            <h2 className="t-card-title"><span className="pb-step">2</span> ห้องเรียน</h2>
            <div className="pb-two">
              <select className="t-input" value={grade} onChange={(e) => pickGrade(e.target.value)} aria-label="ระดับชั้น">
                <option value="" disabled>-- ระดับชั้น --</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select className="t-input" value={room} onChange={(e) => pickRoom(e.target.value)} disabled={!grade} aria-label="ห้อง">
                <option value="" disabled>-- ห้อง --</option>
                {grade && roomOptions(roomsConfig, grade).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {!(grade && room && !hasSub) && (
              <div className="pb-field">
                <span className="t-label">กลุ่ม <span className="t-req">*</span></span>
                <div className="pb-seg">
                  {["ก", "ข"].map((g) => (
                    <label key={g} className={`pb-seg-btn${group === g ? " is-on" : ""}${!(grade && room) ? " is-off" : ""}`}>
                      <input type="radio" name="group" value={g} checked={group === g} disabled={!(grade && room)} onChange={() => pickGroup(g)} />
                      กลุ่ม {g}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className={`t-card${enabled ? "" : " pb-off"}`}>
            <h2 className="t-card-title"><span className="pb-step">3</span> สถานะการตรวจ</h2>
            {hint && <p className="t-muted pb-hint">* {hint}</p>}
            <div className="pb-seg">
              {[NEAT, MESSY].map((s) => (
                <label key={s} className={`pb-seg-btn ${s === NEAT ? "is-neat" : "is-messy"}${status === s ? " is-on" : ""}`}>
                  <input type="radio" name="overall_status" value={s} checked={status === s} disabled={!enabled} onChange={() => pickStatus(s)} />
                  <i className={s === NEAT ? "fas fa-circle-check" : "fas fa-triangle-exclamation"} aria-hidden /> {s}
                </label>
              ))}
            </div>
          </section>

          {status === MESSY && (
            <section className={`t-card${enabled ? "" : " pb-off"}${loadingRoom ? " pb-loading" : ""}`}>
              <h2 className="t-card-title"><span className="pb-step">4</span> รายการที่ไม่เรียบร้อย</h2>
              <p className="t-muted pb-hint">* แตะเพื่อเลือก (เลือกได้หลายข้อ) รายการที่มีสัปดาห์ต้องเลือกสัปดาห์ด้วย</p>
              <div className="pb-items">
                {items.map((it, index) => {
                  const id = `chk-${index}`;
                  const title = itemTitle(it);
                  const allowWeek = itemAllowWeek(it);
                  const on = !!selected[id];
                  const weeks = on ? selected[id].weeks || [] : [];
                  return (
                    <div key={id} className={`pb-item${on ? " is-on" : ""}`} onClick={() => toggleItem(id, title, allowWeek)}>
                      <i className={on ? "fas fa-square-check" : "far fa-square"} aria-hidden />
                      <span className="pb-item-text">{title}</span>
                      {allowWeek && on && (
                        <button
                          type="button"
                          className={`pb-week-btn${weeks.length ? " has-weeks" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setWeekModal({ id, label: title, weeks: [...weeks] });
                          }}
                        >
                          {weeks.length ? `สัปดาห์ ${formatWeekRanges(weeks)}` : <><i className="fas fa-plus" aria-hidden /> เลือกสัปดาห์</>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="inert-add pb-add-item" onClick={() => setAddModal({ title: "", allowWeek: false, permanent: false })}>
                <i className="fas fa-plus" aria-hidden /> เพิ่มรายการ
              </button>
            </section>
          )}

          <section className={`t-card${enabled ? "" : " pb-off"}${loadingRoom ? " pb-loading" : ""}`}>
            <h2 className="t-card-title"><span className="pb-step">{status === MESSY ? 5 : 4}</span> สัปดาห์ที่ยังไม่ส่ง</h2>
            <button type="button" className="pb-unsub" onClick={() => setWeekModal({ id: null, label: "สัปดาห์ที่ยังไม่ส่ง", weeks: [...unsub] })} disabled={!enabled}>
              <i className="fas fa-calendar-xmark" aria-hidden />
              {unsub.length ? `ยังไม่ส่ง: สัปดาห์ ${formatWeekRanges(unsub)}` : "แตะเพื่อเลือกสัปดาห์ที่ยังไม่ส่ง"}
              {unsub.length > 0 && <span className="pb-count">{unsub.length}</span>}
            </button>
          </section>

          <div className="pb-form-actions">
            <button type="button" className="t-btn t-btn-ghost" onClick={() => setConfirmClear(true)}>
              <i className="fas fa-rotate-right" aria-hidden /> ล้างฟอร์ม
            </button>
            <button type="button" className="t-btn" onClick={addToTable}>
              {editingId ? <><i className="fas fa-check" aria-hidden /> บันทึกการแก้ไข</> : <><i className="fas fa-plus" aria-hidden /> เพิ่มลงตาราง</>}
            </button>
          </div>
        </aside>

        <main className="pb-table">
          <div className="pb-table-head">
            <h2><i className="fas fa-table-list" aria-hidden /> สรุปผลการตรวจ <span className="pb-count">{rooms.length} ห้อง</span></h2>
          </div>
          {rooms.length === 0 ? (
            <div className="t-card t-empty">
              <i className="far fa-folder-open" aria-hidden />
              ยังไม่มีข้อมูลชั่วคราว
              <br />
              <span className="t-muted">กรอกข้อมูลแล้วกด “เพิ่มลงตาราง”</span>
            </div>
          ) : (
            <div className="pb-rows">
              {rooms.map((r) => (
                <div key={r.id} className={`t-card pb-row${r.id === editingId ? " is-editing" : ""}`}>
                  <div className="pb-row-top">
                    <b className="pb-row-room">{r.grade}/{r.room}{r.group_name !== "-" && <small> กลุ่ม {r.group_name}</small>}</b>
                    <span className={`pb-status ${r.status === NEAT ? "is-neat" : "is-messy"}`}>{r.status}</span>
                    <time className="t-muted">{formatRoomTime(roomTime(r))}</time>
                  </div>
                  {r.issues && r.issues !== "-" && <div className="pb-row-issues">{r.issues.split(",<br>").map((s) => <span key={s}>{s}</span>)}</div>}
                  {r.unsubmitted_weeks?.length > 0 && <div className="t-muted pb-row-unsub"><i className="far fa-calendar-xmark" aria-hidden /> ยังไม่ส่งสัปดาห์ {formatWeekRanges(r.unsubmitted_weeks)}</div>}
                  <div className="pb-row-actions">
                    <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={() => editRecord(r.id)}><i className="fas fa-pen" aria-hidden /> แก้ไข</button>
                    <button type="button" className="t-icon-btn" onClick={() => removeRecord(r.id)} aria-label={`ลบ ${r.grade}/${r.room}`}><i className="fas fa-trash" aria-hidden /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pb-submit-bar">
            <button type="button" className="pb-mobile-add t-btn t-btn-ghost" onClick={() => setFormOpen(true)}>
              <i className="fas fa-plus" aria-hidden /> เพิ่มห้อง
            </button>
            <button type="button" className="t-btn pb-submit" onClick={submit} disabled={!!sending}>
              {sending ? <><i className="fas fa-spinner fa-spin" aria-hidden /> {sending}</> : <><i className="fas fa-check-to-slot" aria-hidden /> บันทึกการตรวจลงฐานข้อมูล</>}
            </button>
          </div>
        </main>
      </div>
      {formOpen && <div className="pb-overlay" onClick={() => setFormOpen(false)} />}

      {weekModal && (
        <div className="t-modal">
          <div className="t-modal-card">
            <p><b>เลือกสัปดาห์</b></p>
            <p className="t-muted">{weekModal.label}</p>
            <div className="pb-weeks">
              {WEEKS.map((w) => {
                const on = weekModal.weeks.includes(w);
                return (
                  <button
                    key={w}
                    type="button"
                    className={on ? "is-on" : undefined}
                    onClick={() => setWeekModal((m) => m && { ...m, weeks: on ? m.weeks.filter((x) => x !== w) : [...m.weeks, w] })}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
            <div className="t-modal-actions">
              <button
                type="button"
                className="t-btn"
                onClick={() => {
                  const m = weekModal;
                  if (m.id === null) setUnsub(m.weeks);
                  else setSelected((sel) => (sel[m.id!] ? { ...sel, [m.id!]: { ...sel[m.id!], weeks: m.weeks } } : sel));
                  setWeekModal(null);
                }}
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}

      {addModal && (
        <div className="t-modal">
          <div className="t-modal-card">
            <p><b>เพิ่มรายการที่ไม่เรียบร้อย</b></p>
            <input className="t-input pb-modal-input" value={addModal.title} onChange={(e) => setAddModal({ ...addModal, title: e.target.value })} placeholder="พิมพ์ชื่อรายการ..." autoFocus onKeyDown={(e) => e.key === "Enter" && confirmAdd()} />
            <label className="pb-check-line">
              <input type="checkbox" checked={addModal.allowWeek} onChange={(e) => setAddModal({ ...addModal, allowWeek: e.target.checked })} /> ต้องเลือกสัปดาห์ที่เกิดปัญหา
            </label>
            <label className="pb-check-line">
              <input type="checkbox" checked={addModal.permanent} onChange={(e) => setAddModal({ ...addModal, permanent: e.target.checked })} /> บันทึกหัวข้อนี้ไว้ถาวร
            </label>
            <p className="t-muted pb-small">ถ้าไม่ติ๊กจะอยู่ชั่วคราวบนหน้านี้เท่านั้น ถ้าติ๊กทุกคนจะเห็นหัวข้อนี้ (ลบหัวข้อภายหลังได้โดยติดต่อผู้พัฒนา)</p>
            <div className="t-modal-actions">
              <button type="button" className="t-btn t-btn-ghost" onClick={() => setAddModal(null)}>ยกเลิก</button>
              <button type="button" className="t-btn" onClick={confirmAdd}>เพิ่มรายการ</button>
            </div>
          </div>
        </div>
      )}

      {confirmClear && (
        <div className="t-modal">
          <div className="t-modal-card">
            <p><b>ล้างฟอร์ม?</b></p>
            <p className="t-muted">ข้อมูลห้องที่กำลังกรอกจะถูกล้าง (ข้อมูลในตารางยังอยู่)</p>
            <div className="t-modal-actions">
              <button type="button" className="t-btn t-btn-ghost" onClick={() => setConfirmClear(false)}>ยกเลิก</button>
              <button
                type="button"
                className="t-btn"
                onClick={() => {
                  setEditingId(null);
                  clearForm();
                  setConfirmClear(false);
                  say("ล้างข้อมูลเรียบร้อย");
                }}
              >
                ยืนยันล้างข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="t-modal">
          <div className="t-modal-card pb-success">
            <i className="fas fa-circle-check" aria-hidden />
            <p><b>บันทึกข้อมูลสำเร็จ</b></p>
            <p className="t-muted">ส่งข้อมูลการตรวจลงฐานข้อมูลเรียบร้อยแล้ว</p>
            <button type="button" className="t-btn t-btn-block" onClick={() => setSuccess(false)}>ปิดหน้าต่าง</button>
          </div>
        </div>
      )}

      <History open={historyOpen} me={inspector.trim()} onClose={() => setHistoryOpen(false)} refreshRef={historyRefresh} />
      {refreshing && <div className="inert-loading"><i className="fas fa-arrows-rotate fa-spin" aria-hidden /></div>}
      {toast.node}
    </div>
  );
}
