"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ToolShell, useConfirm, useToast } from "@/components/tool/Tool";
import { compressImage } from "@/lib/compressImage";

// Building inspection form (/forms/building/). Same requests as the old page:
//   GET /api/building/config_v2, GET /inspectors.json, GET /forms/building/rooms/<building>.json
//   POST /api/building/upload_image (multipart "image", file named img_b<building>_r<room>_t<target>_<id>.<ext>)
//   POST /api/building/delete_image { url }   (photo removed, or the whole inspection abandoned)
//   POST /api/building/submit_v2 { date: "d/m/yyyy", inspector1..3, building, rooms: [...] }
// Like the old page it also reloads itself on page 1 when the server restarts (new version), keeping
// what was typed (sessionStorage "buildingAutoUpdateState").

type FileObj = { id: string; file: File; url: string | null; status: "uploading" | "done" | "failed" | "cancelled"; preview: string };
type RoomFiles = { overall: FileObj[]; issues: Record<string, FileObj[]> };
type RoomState = { perfect: boolean; ticked: number[]; open: boolean };
type Room = { floor: string; room: string };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clearFiles(store: Record<string, RoomFiles>) {
  for (const k of Object.keys(store)) delete store[k];
}

function deleteRemote(url: string) {
  fetch("/api/building/delete_image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => {});
}

export function BuildingForm() {
  const [page, setPage] = useState<1 | 2>(1);
  const [date, setDate] = useState("");
  const [ins, setIns] = useState(["", "", ""]);
  const [building, setBuilding] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [buildings, setBuildings] = useState<string[]>([]);
  const [inspectors, setInspectors] = useState<string[]>([]);
  const [errors1, setErrors1] = useState({ date: false, ins: false, building: false });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomState, setRoomState] = useState<Record<string, RoomState>>({});
  // Photos per room. Each FileObj's status changes while its upload runs, so this is one mutable
  // store; bump() re-renders after a change.
  const [files] = useState<{ current: Record<string, RoomFiles> }>(() => ({ current: {} }));
  const [, setFilesVersion] = useState(0);
  const bump = () => setFilesVersion((v) => v + 1);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [badRoom, setBadRoom] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ room: string; target: string } | null>(null);
  const [grid, setGrid] = useState<{ room: string; target: string } | null>(null);
  const [lightbox, setLightbox] = useState<{ list: string[]; i: number } | null>(null);
  const [waitNote, setWaitNote] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<{ room: string; target: string } | null>(null);
  const toast = useToast();
  const say = toast.show;
  const confirm = useConfirm();
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const formRef = useRef({ date, ins, building });
  useEffect(() => {
    formRef.current = { date, ins, building };
  }, [date, ins, building]);

  // Load config, inspectors, and the state saved by an auto-update reload.
  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const cfg = await (await fetch("/api/building/config_v2")).json();
        const list = await (await fetch("/inspectors.json")).json();
        if (!alive) return;
        if (cfg.success) {
          setItems(cfg.config.ITEMS);
          setBuildings(cfg.config.BUILDINGS.map(String));
        }
        setInspectors(list);
        let d = todayISO();
        try {
          const st = JSON.parse(sessionStorage.getItem("buildingAutoUpdateState") || "null");
          if (st) {
            if (st.date) d = st.date;
            setIns([st.inspector1 || "", st.inspector2 || "", ""]);
            if (st.building) setBuilding(String(st.building));
            if (st.intendedVersion) setTimeout(() => say("อัปเดทระบบเรียบร้อย!"), 500);
            sessionStorage.removeItem("buildingAutoUpdateState");
          }
        } catch {}
        setDate(d);
      } catch {
        if (alive) say("โหลดข้อมูลไม่สำเร็จ", "error");
      }
      if (alive) setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [say]);

  // Auto update: reload on page 1 when the server's start time changes (as the old page did).
  useEffect(() => {
    let version: unknown = null;
    const check = async () => {
      try {
        const res = await fetch(`/server_start_time.json?t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (version === null) {
          version = data.version;
          return;
        }
        if (data.version !== version && pageRef.current === 1) {
          const f = formRef.current;
          sessionStorage.setItem(
            "buildingAutoUpdateState",
            JSON.stringify({ date: f.date, inspector1: f.ins[0], inspector2: f.ins[1], building: f.building || undefined, intendedVersion: data.version }),
          );
          window.location.reload();
        }
      } catch {}
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (page !== 2) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [page]);

  useEffect(() => {
    if (pending === 0) {
      const t = setTimeout(() => setWaitNote(false), 0);
      return () => clearTimeout(t);
    }
  }, [pending]);

  const filesOf = (room: string) => (files.current[room] ??= { overall: [], issues: {} });
  const listOf = (room: string, target: string) => {
    const f = filesOf(room);
    return target === "overall" ? f.overall : (f.issues[target] ??= []);
  };

  async function goPage2() {
    const e = { date: !date, ins: !ins[0].trim(), building: !building };
    setErrors1(e);
    if (e.date || e.ins || e.building) return;
    setBusy(true);
    try {
      const res = await fetch(`/forms/building/rooms/${building}.json?t=${Date.now()}`);
      if (!res.ok) throw new Error();
      const data: Record<string, string[]> = await res.json();
      const list: Room[] = Object.entries(data).flatMap(([floor, rs]) => rs.map((room) => ({ floor, room })));
      setRooms(list);
      setRoomState(Object.fromEntries(list.map((r, i) => [r.room, { perfect: false, ticked: [], open: i === 0 }])));
      setPage(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      say(`ไม่พบข้อมูลห้องของอาคาร ${building}`, "error");
    }
    setBusy(false);
  }

  const setRoom = (room: string, patch: Partial<RoomState>) => setRoomState((s) => ({ ...s, [room]: { ...s[room], ...patch } }));

  async function upload(room: string, target: string, fo: FileObj) {
    setPending((n) => n + 1);
    try {
      const fd = new FormData();
      const ext = fo.file.name.split(".").pop() || "jpg";
      fd.append("image", fo.file, `img_b${building}_r${room}_t${target}_${fo.id}.${ext}`);
      const data = await (await fetch("/api/building/upload_image", { method: "POST", body: fd })).json();
      if (fo.status === "cancelled") {
        if (data.success) deleteRemote(data.url);
      } else if (data.success) {
        fo.url = data.url;
        fo.status = "done";
      } else {
        fo.status = "failed";
        say("อัปโหลดรูปไม่สำเร็จ", "error");
      }
    } catch {
      if (fo.status !== "cancelled") fo.status = "failed";
      say("เกิดข้อผิดพลาดในการอัปโหลด", "error");
    }
    bump();
    setPending((n) => n - 1);
  }

  async function onFiles(input: HTMLInputElement) {
    const t = pickTarget.current;
    const picked = Array.from(input.files || []);
    input.value = "";
    if (!t) return;
    for (const original of picked) {
      let file = original;
      if (original.type.startsWith("image/")) {
        try {
          file = await compressImage(original, 1080);
        } catch {}
      }
      const fo: FileObj = { id: Date.now() + Math.random().toString(), file, url: null, status: "uploading", preview: URL.createObjectURL(file) };
      listOf(t.room, t.target).push(fo);
      bump();
      upload(t.room, t.target, fo);
    }
  }

  async function removePhoto(room: string, target: string, index: number) {
    if (!(await confirm.ask("ลบรูปภาพนี้?", "ลบรูปภาพ"))) return;
    const list = listOf(room, target);
    const fo = list[index];
    if (!fo) return;
    list.splice(index, 1);
    if (fo.status === "done" && fo.url) deleteRemote(fo.url);
    else if (fo.status === "uploading") fo.status = "cancelled";
    bump();
    say("ลบรูปภาพเรียบร้อย");
  }

  async function back() {
    if (!(await confirm.ask("ย้อนกลับใช่หรือไม่? ข้อมูลที่ยังไม่ถูกบันทึกจะสูญหาย", "ย้อนกลับ"))) return;
    for (const room in files.current) {
      const f = files.current[room];
      [...f.overall, ...Object.values(f.issues).flat()].forEach((x) => x.status === "done" && x.url && deleteRemote(x.url));
    }
    clearFiles(files.current);
    bump();
    setPage(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (pending > 0) {
      setWaitNote(true);
      return;
    }
    const [y, m, d] = date.split("-");
    const payloadRooms: unknown[] = [];
    const problems: string[] = [];
    let firstBad: string | null = null;
    for (const { room, floor } of rooms) {
      const st = roomState[room];
      const ticked = [...st.ticked].sort((a, b) => a - b);
      const status = st.perfect ? "เรียบร้อย" : ticked.length ? "ไม่เรียบร้อย" : "ไม่ได้ตรวจ";
      if (status === "ไม่ได้ตรวจ") continue;
      const overall = (files.current[room]?.overall || []).filter((f) => f.status === "done" && f.url).map((f) => f.url!);
      if (!overall.length) {
        problems.push(`ห้อง ${room}: บังคับต้องมีรูปความสะอาดโดยรวม`);
        firstBad ??= room;
      }
      const issues: { name: string; image_url: string }[] = [];
      for (const idx of ticked) {
        const photos = (files.current[room]?.issues[idx] || []).filter((f) => f.status === "done" && f.url).map((f) => f.url!);
        if (!photos.length) {
          problems.push(`ห้อง ${room}: ลืมอัปโหลดรูปสำหรับจุดที่ไม่เรียบร้อย "${items[idx]}"`);
          firstBad ??= room;
        } else issues.push({ name: items[idx], image_url: photos[0] });
      }
      payloadRooms.push({ room, floor, status, overall_image_url: overall[0] || "", issues });
    }
    if (firstBad) {
      say(problems.length > 1 ? `${problems[0]} (และอีก ${problems.length - 1} จุด)` : problems[0], "error");
      setRoom(firstBad, { open: true });
      setBadRoom(firstBad);
      setTimeout(() => document.getElementById(`room-${firstBad}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      setTimeout(() => setBadRoom(null), 3000);
      return;
    }
    if (!payloadRooms.length) return say("กรุณาประเมินอย่างน้อย 1 ห้องก่อนส่ง", "error");
    setBusy(true);
    try {
      const data = await (
        await fetch("/api/building/submit_v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: `${parseInt(d)}/${parseInt(m)}/${y}`,
            inspector1: ins[0].trim(),
            inspector2: ins[1].trim(),
            inspector3: ins[2].trim(),
            building,
            rooms: payloadRooms,
          }),
        })
      ).json();
      if (data.success) {
        say(`บันทึกข้อมูลสำเร็จ ${data.count} ห้อง`);
        clearFiles(files.current);
        setPage(1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else say("เกิดข้อผิดพลาด: " + (data.message || ""), "error");
    } catch {
      say("ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่", "error");
    }
    setBusy(false);
  }

  const openPicker = useCallback((room: string, target: string) => setPicker({ room, target }), []);

  const floors = rooms.reduce<Record<string, Room[]>>((acc, r) => ((acc[r.floor] ??= []).push(r), acc), {});
  const done = rooms.filter((r) => roomState[r.room]?.perfect || roomState[r.room]?.ticked.length).length;

  return (
    <ToolShell title="แบบฟอร์มตรวจอาคาร" icon="fas fa-building" sub={page === 1 ? "สภานักเรียน โรงเรียนสิรินธร จังหวัดสุรินทร์" : `อาคาร ${building} · ตรวจแล้ว ${done}/${rooms.length} ห้อง`}>
      {page === 1 ? (
        <>
          <div className="t-card">
            <h2 className="t-card-title"><i className="fas fa-clipboard" aria-hidden /> ข้อมูลเบื้องต้น</h2>
            <label className={`inert-field${errors1.date ? " is-error" : ""}`}>
              <span className="t-label">วันที่ <span className="t-req">*</span></span>
              <input type="date" className="t-input" value={date} onChange={(e) => setDate(e.target.value)} />
              <span className="inert-error">กรุณาเลือกวันที่</span>
            </label>
            {[0, 1, 2].map((n) => (
              <div key={n} className={`inert-field${n === 0 && errors1.ins ? " is-error" : ""}`}>
                <span className="t-label">
                  ชื่อผู้ตรวจคนที่ {n + 1} {n === 0 ? <span className="t-req">*</span> : <span className="t-muted">(ตัวเลือก)</span>}
                </span>
                <NameSuggest
                  value={ins[n]}
                  options={inspectors}
                  onChange={(v) => {
                    setIns((l) => l.map((x, j) => (j === n ? v : x)));
                    if (n === 0 && v.trim()) setErrors1((e) => ({ ...e, ins: false }));
                  }}
                />
                {n === 0 && <span className="inert-error">กรุณาเลือกชื่อผู้ตรวจอย่างน้อย 1 คน</span>}
              </div>
            ))}
            <div className={`inert-field${errors1.building ? " is-error" : ""}`}>
              <span className="t-label">อาคาร <span className="t-req">*</span></span>
              <div className="t-choices is-row bld-buildings">
                {buildings.map((b) => (
                  <label key={b} className={`t-choice${building === b ? " is-on" : ""}`}>
                    <input type="radio" name="building" value={b} checked={building === b} onChange={() => { setBuilding(b); setErrors1((e) => ({ ...e, building: false })); }} />
                    <span className="t-choice-dot" />
                    <span>อาคาร {b}</span>
                  </label>
                ))}
              </div>
              <span className="inert-error">กรุณาเลือกอาคาร</span>
            </div>
          </div>
          <button type="button" className="t-btn t-btn-block" onClick={goPage2} disabled={busy}>
            ถัดไป <i className="fas fa-arrow-right" aria-hidden />
          </button>
        </>
      ) : (
        <>
          {Object.entries(floors).map(([floor, list]) => (
            <section key={floor}>
              <h2 className="bld-floor">ชั้น {floor}</h2>
              {list.map(({ room }) => {
                const st = roomState[room];
                const status = st.perfect ? "perfect" : st.ticked.length ? "bad" : "none";
                const overall = files.current[room]?.overall || [];
                return (
                  <div key={room} id={`room-${room}`} className={`t-card bld-room is-${status}${badRoom === room ? " is-flagged" : ""}`}>
                    <button type="button" className="bld-room-head" onClick={() => setRoom(room, { open: !st.open })} aria-expanded={st.open}>
                      <span className="bld-room-no">{room}</span>
                      <span className="bld-room-title">ห้อง {room}</span>
                      <span className={`bld-badge is-${status}`}>{status === "perfect" ? "เรียบร้อย" : status === "bad" ? "ไม่เรียบร้อย" : "ไม่ได้ตรวจ"}</span>
                      <i className={`fas fa-chevron-${st.open ? "up" : "down"}`} aria-hidden />
                    </button>
                    {st.open && (
                      <div className="bld-room-body">
                        <button
                          type="button"
                          className={`bld-perfect${st.perfect ? " is-on" : ""}`}
                          disabled={st.ticked.length > 0}
                          onClick={() => setRoom(room, { perfect: !st.perfect })}
                        >
                          <i className={st.perfect ? "fas fa-circle-check" : "far fa-circle"} aria-hidden /> เรียบร้อยทั้งห้อง
                        </button>

                        <div className={`bld-issues${st.perfect ? " is-off" : ""}`}>
                          <span className="t-muted">หรือระบุจุดที่ไม่เรียบร้อย (ต้องใส่รูปทุกจุดที่ติ๊ก)</span>
                          {items.map((text, idx) => {
                            const on = st.ticked.includes(idx);
                            const photos = files.current[room]?.issues[idx] || [];
                            return (
                              <div key={idx} className={`bld-issue${on ? " is-on" : ""}`}>
                                <label className="bld-issue-label">
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    disabled={st.perfect}
                                    onChange={() => setRoom(room, { ticked: on ? st.ticked.filter((x) => x !== idx) : [...st.ticked, idx] })}
                                  />
                                  <i className={on ? "fas fa-square-check" : "far fa-square"} aria-hidden /> {text}
                                </label>
                                {on && <PhotoButtons list={photos} small onAdd={() => openPicker(room, String(idx))} onView={() => setGrid({ room, target: String(idx) })} />}
                              </div>
                            );
                          })}
                        </div>

                        <div className="bld-overall">
                          <span className="t-label">
                            ความสะอาดโดยรวม <span className="t-req">*</span>
                            <small className="t-muted"> (บังคับถ่ายรูป 1 รูป หากมีการประเมินห้องนี้)</small>
                          </span>
                          <PhotoButtons list={overall} onAdd={() => openPicker(room, "overall")} onView={() => setGrid({ room, target: "overall" })} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}

          <div className="t-bar">
            <button type="button" className="t-btn t-btn-ghost" onClick={back}>
              <i className="fas fa-arrow-left" aria-hidden /> ย้อนกลับ
            </button>
            <span className={pending ? "is-dirty" : undefined}>{pending ? `กำลังอัปโหลดภาพ (${pending})` : `ตรวจแล้ว ${done} ห้อง`}</span>
            <button type="button" className="t-btn" onClick={submit} disabled={busy}>
              <i className="fas fa-paper-plane" aria-hidden /> ส่งแบบฟอร์ม
            </button>
          </div>
          {waitNote && pending > 0 && <div className="t-toast is-success bld-wait"><i className="fas fa-spinner fa-spin" aria-hidden /> กำลังอัปโหลดรูปภาพ กรุณารอสักครู่...</div>}
        </>
      )}

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target)} />
      <input ref={galleryInput} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target)} />

      {picker && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setPicker(null)}>
          <div className="t-modal-card">
            <p>เพิ่มรูปภาพ</p>
            <div className="bld-pick">
              <button type="button" onClick={() => { pickTarget.current = picker; setPicker(null); cameraInput.current?.click(); }}>
                <i className="fas fa-camera" aria-hidden /> เปิดกล้อง
              </button>
              <button type="button" onClick={() => { pickTarget.current = picker; setPicker(null); galleryInput.current?.click(); }}>
                <i className="fas fa-images" aria-hidden /> เลือกรูปภาพ
              </button>
            </div>
          </div>
        </div>
      )}

      {grid && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setGrid(null)}>
          <div className="t-modal-card bld-grid-card">
            <div className="bld-grid-head">
              <b>ภาพที่อัปโหลด</b>
              <button type="button" className="t-icon-btn" onClick={() => setGrid(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
            </div>
            <div className="bld-grid">
              {listOf(grid.room, grid.target).length === 0 && <div className="t-empty">ไม่มีรูปภาพ</div>}
              {listOf(grid.room, grid.target).map((f, i, arr) => (
                <div key={f.id} className="bld-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.preview} alt="" onClick={() => setLightbox({ list: arr.map((x) => x.preview), i })} />
                  {f.status !== "done" && <span className={`bld-thumb-state is-${f.status}`}>{f.status === "uploading" ? <i className="fas fa-spinner fa-spin" aria-hidden /> : "ไม่สำเร็จ"}</span>}
                  <button type="button" onClick={() => removePhoto(grid.room, grid.target, i)} aria-label="ลบรูปภาพ"><i className="fas fa-trash-alt" aria-hidden /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="bld-lb" onClick={(e) => e.target === e.currentTarget && setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.list[lightbox.i]} alt="" />
          <button type="button" className="bld-lb-close" onClick={() => setLightbox(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
          {lightbox.list.length > 1 && (
            <>
              <button type="button" className="bld-lb-nav is-prev" onClick={() => setLightbox((l) => l && { ...l, i: (l.i - 1 + l.list.length) % l.list.length })} aria-label="ก่อนหน้า"><i className="fas fa-chevron-left" aria-hidden /></button>
              <button type="button" className="bld-lb-nav is-next" onClick={() => setLightbox((l) => l && { ...l, i: (l.i + 1) % l.list.length })} aria-label="ถัดไป"><i className="fas fa-chevron-right" aria-hidden /></button>
            </>
          )}
          <span className="bld-lb-count">{lightbox.i + 1} / {lightbox.list.length}</span>
        </div>
      )}

      {busy && <div className="inert-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></div>}
      {toast.node}
      {confirm.node}
    </ToolShell>
  );
}

function PhotoButtons({ list, onAdd, onView, small }: { list: FileObj[]; onAdd: () => void; onView: () => void; small?: boolean }) {
  const uploading = list.filter((f) => f.status === "uploading").length;
  const failed = list.filter((f) => f.status === "failed").length;
  return (
    <div className={`bld-photos${small ? " is-small" : ""}`}>
      <button type="button" className="bld-add" onClick={onAdd}>
        <i className="fas fa-camera" aria-hidden /> {small ? "ใส่รูป" : "ถ่ายภาพ / อัปโหลด"}
      </button>
      {list.length > 0 && (
        <button type="button" className="bld-view" onClick={onView}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={list[list.length - 1].preview} alt="" />
          <span>
            {list.length} รูป
            {uploading > 0 && <> · <i className="fas fa-spinner fa-spin" aria-hidden /></>}
            {failed > 0 && <em> · ไม่สำเร็จ {failed}</em>}
          </span>
        </button>
      )}
    </div>
  );
}

function NameSuggest({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
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
        placeholder="พิมพ์ค้นหาชื่อ..."
        autoComplete="off"
      />
      {open && shown.length > 0 && (
        <div className="inert-menu">
          {shown.map((n) => (
            <button key={n} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(n); setOpen(false); }}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
