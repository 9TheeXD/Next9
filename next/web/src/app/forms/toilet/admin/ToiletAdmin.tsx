"use client";

import { useEffect, useState } from "react";
import { LoginCard, StateCard, ToolShell, useConfirm, useStoredPassword, useToast } from "@/components/tool/Tool";
import { TOILET_PW_KEY, verifyToilet, type ToiletConfig } from "../auth";

// Restroom and problem lists: /forms/toilet/admin/. Same requests as the old page: GET
// /api/toilet/config, POST /api/toilet/save-config { rooms, problems } (saves everything at once).
export function ToiletAdmin() {
  const [password, setPassword] = useStoredPassword(TOILET_PW_KEY);
  const [cfg, setCfg] = useState<ToiletConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newProblem, setNewProblem] = useState("");
  const toast = useToast();
  const confirm = useConfirm();
  const say = toast.show;

  useEffect(() => {
    if (!password) return;
    let alive = true;
    fetch("/api/toilet/config")
      .then((r) => r.json())
      .then((c: ToiletConfig) => alive && setCfg({ rooms: c.rooms || [], problems: c.problems || [] }))
      .catch(() => alive && say("โหลดข้อมูลไม่สำเร็จ", "error"));
    return () => {
      alive = false;
    };
  }, [password, say]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(next: ToiletConfig) {
    setCfg(next);
    setDirty(true);
  }

  function addRoom() {
    if (!cfg) return;
    const id = newId.trim();
    const name = newName.trim();
    if (!id || !name) return toast.show("กรุณากรอกรหัสและชื่อห้อง", "error");
    if (cfg.rooms.find((r) => r.id === id)) return toast.show("รหัสห้องนี้มีอยู่แล้ว", "error");
    change({ ...cfg, rooms: [...cfg.rooms, { id, name }] });
    setNewId("");
    setNewName("");
  }

  function addProblem() {
    if (!cfg) return;
    const p = newProblem.trim();
    if (!p) return toast.show("กรุณากรอกชื่อปัญหา", "error");
    if (cfg.problems.includes(p)) return toast.show("ปัญหานี้มีอยู่แล้ว", "error");
    change({ ...cfg, problems: [...cfg.problems, p] });
    setNewProblem("");
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch("/api/toilet/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: password! },
        body: JSON.stringify({ rooms: cfg.rooms, problems: cfg.problems }),
      });
      if (res.status === 401) {
        toast.show("รหัสผ่านไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", "error");
        setPassword("");
      } else if ((await res.json()).success) {
        toast.show("บันทึกสำเร็จ!");
        setDirty(false);
      } else toast.show("บันทึกไม่สำเร็จ", "error");
    } catch {
      toast.show("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์", "error");
    }
    setSaving(false);
  }

  async function copyLink(id: string) {
    const url = `${location.origin}/forms/toilet/?id=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.show("คัดลอกลิงก์แบบฟอร์มแล้ว");
    } catch {
      toast.show(url, "success");
    }
  }

  if (password === null) return <StateCard icon="fas fa-spinner fa-spin" title="กำลังโหลด..." />;
  if (!password)
    return <LoginCard title="ตั้งค่าระบบห้องน้ำ" sub="จัดการห้องน้ำและรายการปัญหา" icon="fas fa-gear" verify={verifyToilet} onDone={setPassword} />;
  if (!cfg) return <StateCard icon="fas fa-spinner fa-spin" title="กำลังโหลด..." />;

  return (
    <ToolShell title="ตั้งค่าระบบห้องน้ำ" icon="fas fa-gear" sub="เพิ่ม/ลบ ห้องน้ำ และกำหนดรายการปัญหา กด “บันทึกทั้งหมด” เมื่อแก้เสร็จ">
      <section className="t-card">
        <h2 className="t-card-title"><i className="fas fa-restroom" aria-hidden /> รายการห้องน้ำ ({cfg.rooms.length})</h2>
        <div className="t-list">
          {cfg.rooms.length === 0 && <div className="t-empty">ยังไม่มีห้องน้ำ</div>}
          {cfg.rooms.map((r, i) => (
            <div key={r.id} className="t-row">
              <span className="toilet-room-id">#{r.id}</span>
              <span className="t-row-main">{r.name}</span>
              <button type="button" className="t-icon-btn" onClick={() => copyLink(r.id)} title="คัดลอกลิงก์แบบฟอร์ม (สำหรับทำ QR Code)" aria-label={`คัดลอกลิงก์ ${r.name}`}>
                <i className="fas fa-link" aria-hidden />
              </button>
              <button
                type="button"
                className="t-icon-btn"
                aria-label={`ลบ ${r.name}`}
                onClick={async () => {
                  if (await confirm.ask(`ลบห้อง "${r.name}" (${r.id})?`, "ลบ")) change({ ...cfg, rooms: cfg.rooms.filter((_, j) => j !== i) });
                }}
              >
                <i className="fas fa-trash-alt" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <div className="toilet-add">
          <input className="t-input" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="รหัสห้อง (ID)" />
          <input className="t-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อห้องน้ำ" onKeyDown={(e) => e.key === "Enter" && addRoom()} />
          <button type="button" className="t-btn" onClick={addRoom}><i className="fas fa-plus" aria-hidden /> เพิ่ม</button>
        </div>
      </section>

      <section className="t-card">
        <h2 className="t-card-title"><i className="fas fa-list-check" aria-hidden /> รายการปัญหา ({cfg.problems.length})</h2>
        <div className="t-list">
          {cfg.problems.length === 0 && <div className="t-empty">ยังไม่มีปัญหา</div>}
          {cfg.problems.map((p, i) => (
            <div key={p} className="t-row">
              <span className="t-row-main">{p}</span>
              <button
                type="button"
                className="t-icon-btn"
                aria-label={`ลบ ${p}`}
                onClick={async () => {
                  if (await confirm.ask(`ลบปัญหา "${p}"?`, "ลบ")) change({ ...cfg, problems: cfg.problems.filter((_, j) => j !== i) });
                }}
              >
                <i className="fas fa-trash-alt" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <div className="toilet-add is-single">
          <input className="t-input" value={newProblem} onChange={(e) => setNewProblem(e.target.value)} placeholder="ชื่อปัญหา" onKeyDown={(e) => e.key === "Enter" && addProblem()} />
          <button type="button" className="t-btn" onClick={addProblem}><i className="fas fa-plus" aria-hidden /> เพิ่ม</button>
        </div>
      </section>

      <div className="t-bar">
        <span className={dirty ? "is-dirty" : undefined}>{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้วทั้งหมด"}</span>
        <button type="button" className="t-btn" onClick={save} disabled={saving}>
          {saving ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-save" aria-hidden />} บันทึกทั้งหมด
        </button>
      </div>
      {toast.node}
      {confirm.node}
    </ToolShell>
  );
}
