"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StateCard, ToolShell, useToast } from "@/components/tool/Tool";

type Room = { id: string; name: string };
type Config = { rooms: Room[]; problems: string[] };

const ROLES = ["นักเรียน", "ครู", "บุคคลอื่น"];
const OTHER = "อื่นๆ";

// The public report form, opened from the QR code on each restroom: /forms/toilet/?id=<room id>.
// Requests are the same as the old page's: GET /api/toilet/config, POST /api/toilet/submit
// { roomId, role, problem, customProblem }.
export function ToiletReport() {
  const id = useSearchParams().get("id");
  const [state, setState] = useState<"loading" | "notfound" | "form" | "done">("loading");
  const [room, setRoom] = useState<Room | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [problem, setProblem] = useState("");
  const [custom, setCustom] = useState("");
  const [sending, setSending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) return alive && setState("notfound");
      try {
        const cfg: Config = await (await fetch("/api/toilet/config")).json();
        const found = cfg.rooms.find((r) => r.id === id);
        if (!alive) return;
        if (!found) return setState("notfound");
        setRoom(found);
        setProblems(cfg.problems);
        setState("form");
      } catch {
        if (alive) setState("notfound");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function submit() {
    const customProblem = problem === OTHER ? custom.trim() : "";
    if (!role) return toast.show("กรุณาเลือกบทบาท", "error");
    if (!problem) return toast.show("กรุณาเลือกปัญหา", "error");
    if (problem === OTHER && !customProblem) return toast.show("กรุณาระบุปัญหา", "error");
    setSending(true);
    try {
      const res = await fetch("/api/toilet/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: id, role, problem, customProblem }),
      });
      const data = await res.json();
      if (data.success) {
        setState("done");
        return;
      }
      toast.show("เกิดข้อผิดพลาด: " + (data.message || ""), "error");
    } catch {
      toast.show("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", "error");
    }
    setSending(false);
  }

  if (state === "loading") return <StateCard icon="fas fa-spinner fa-spin" title="กำลังโหลด..." />;
  if (state === "notfound")
    return (
      <StateCard icon="fas fa-ban" title="ไม่พบห้องน้ำ">
        <p>กรุณาสแกน QR Code ที่ห้องน้ำเพื่อเข้าสู่แบบฟอร์ม<br />หรือตรวจสอบลิงก์อีกครั้ง</p>
      </StateCard>
    );
  if (state === "done")
    return (
      <StateCard icon="fas fa-check" title="ส่งแบบฟอร์มสำเร็จ!" tone="ok">
        <p>ขอบคุณที่แจ้งปัญหา<br />ทีมงานจะดำเนินการแก้ไขโดยเร็ว</p>
        <button
          type="button"
          className="t-btn"
          onClick={() => {
            setRole("");
            setProblem("");
            setCustom("");
            setSending(false);
            setState("form");
          }}
        >
          แจ้งปัญหาอีกครั้ง
        </button>
      </StateCard>
    );

  return (
    <ToolShell
      title="แจ้งปัญหาห้องน้ำ"
      icon="fas fa-toilet"
      sub={
        <span>
          <i className="fas fa-location-dot" aria-hidden /> {room?.name} (ID: {room?.id})
        </span>
      }
    >
      <div className="t-card">
        <span className="t-label">บทบาทของคุณ <span className="t-req">*</span></span>
        <div className="t-choices is-row" role="radiogroup">
          {ROLES.map((r) => (
            <label key={r} className={`t-choice${role === r ? " is-on" : ""}`}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
              <span className="t-choice-dot" />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="t-card">
        <span className="t-label">ปัญหาที่พบ <span className="t-req">*</span></span>
        <div className="t-choices" role="radiogroup">
          {[...problems, OTHER].map((p) => (
            <label key={p} className={`t-choice${problem === p ? " is-on" : ""}`}>
              <input
                type="radio"
                name="problem"
                value={p}
                checked={problem === p}
                onChange={() => {
                  setProblem(p);
                  if (p !== OTHER) setCustom("");
                }}
              />
              <span className="t-choice-dot" />
              <span>{p}</span>
            </label>
          ))}
          {problem === OTHER && (
            <input className="t-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="กรุณาระบุปัญหา..." autoFocus />
          )}
        </div>
      </div>

      <button type="button" className="t-btn t-btn-block" onClick={submit} disabled={sending}>
        {sending ? <><i className="fas fa-spinner fa-spin" aria-hidden /> กำลังส่ง...</> : <><i className="fas fa-paper-plane" aria-hidden /> ส่งแบบฟอร์ม</>}
      </button>
      {toast.node}
    </ToolShell>
  );
}
