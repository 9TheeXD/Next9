"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoginCard, StateCard, ToolShell, useConfirm, useStoredPassword, useToast } from "@/components/tool/Tool";
import { TOILET_PW_KEY, formatTime, verifyToilet, type Room, type Submission } from "../auth";

// Reports inbox: /forms/toilet/manage/ (optionally ?id=<room> to show one room). Same requests as the
// old page: GET /api/toilet/submissions[?roomId=], GET /api/toilet/config, POST /api/toilet/close { id }.
export function ToiletManage() {
  const [password, setPassword] = useStoredPassword(TOILET_PW_KEY);
  const [room, setRoom] = useState(useSearchParams()?.get("id") || "");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Submission[] | null>(null);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [closing, setClosing] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const say = toast.show;

  const load = useCallback(async () => {
    if (!password) return;
    try {
      const [subRes, cfgRes] = await Promise.all([
        fetch("/api/toilet/submissions" + (room ? "?roomId=" + room : ""), { headers: { Authorization: password } }),
        fetch("/api/toilet/config"),
      ]);
      if (subRes.status === 401) {
        setPassword("");
        return;
      }
      setItems(await subRes.json());
      setRooms((await cfgRes.json()).rooms || []);
    } catch {
      say("โหลดข้อมูลไม่สำเร็จ", "error");
    }
  }, [password, room, setPassword, say]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  function pickRoom(id: string) {
    setRoom(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("id", id);
    else url.searchParams.delete("id");
    window.history.replaceState({}, "", url);
  }

  async function close(s: Submission) {
    if (!(await confirm.ask(`ปิดเรื่อง "${s.problem}" ของ ${s.roomName || s.roomId}?`, "ปิดเรื่อง"))) return;
    setClosing(s.id);
    try {
      const res = await fetch("/api/toilet/close", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: password! },
        body: JSON.stringify({ id: s.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.show("ปิดแบบฟอร์มสำเร็จ");
        await load();
      } else toast.show("เกิดข้อผิดพลาด", "error");
    } catch {
      toast.show("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์", "error");
    }
    setClosing(null);
  }

  if (password === null) return <StateCard icon="fas fa-spinner fa-spin" title="กำลังโหลด..." />;
  if (!password)
    return <LoginCard title="เข้าสู่ระบบจัดการ" sub="สำหรับสมาชิกพรรค NEXT9" icon="fas fa-lock" verify={verifyToilet} onDone={setPassword} />;

  const open = items?.filter((s) => !s.closed) ?? [];
  const closed = items?.filter((s) => s.closed) ?? [];
  const shown = tab === "open" ? open : closed;

  return (
    <ToolShell
      title="จัดการแบบฟอร์มห้องน้ำ"
      icon="fas fa-clipboard-list"
      sub={
        <>
          <span>{tab === "open" ? "แสดงแบบฟอร์มที่ยังไม่ได้ปิด" : "ประวัติแบบฟอร์มที่ปิดแล้ว"}</span>
          <div className="t-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "is-on" : undefined} onClick={() => setTab("open")}>
              รอดำเนินการ <span>{open.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "closed"} className={tab === "closed" ? "is-on" : undefined} onClick={() => setTab("closed")}>
              ประวัติ <span>{closed.length}</span>
            </button>
          </div>
        </>
      }
    >
      <div className="t-pills">
        <button type="button" className={!room ? "is-on" : undefined} onClick={() => pickRoom("")}>ทั้งหมด</button>
        {rooms.map((r) => (
          <button key={r.id} type="button" className={room === r.id ? "is-on" : undefined} onClick={() => pickRoom(r.id)}>{r.name}</button>
        ))}
      </div>

      {items === null ? (
        <div className="t-card t-empty"><i className="fas fa-spinner fa-spin" aria-hidden />กำลังโหลด...</div>
      ) : shown.length === 0 ? (
        <div className="t-card t-empty">
          <i className={tab === "open" ? "fas fa-inbox" : "fas fa-box-archive"} aria-hidden />
          {tab === "open" ? "ไม่มีแบบฟอร์มที่รอดำเนินการ" : "ยังไม่มีประวัติ"}
        </div>
      ) : (
        shown.map((s) => (
          <div key={s.id} className="t-card toilet-sub" style={s.closed ? { opacity: 0.75 } : undefined}>
            <div className="toilet-sub-top">
              <b><i className="fas fa-restroom" aria-hidden /> {s.roomName || s.roomId}</b>
              <span className="t-muted">{formatTime(s.timestamp)}</span>
            </div>
            <div className="toilet-sub-problem">{s.problem}</div>
            <div className="toilet-sub-foot">
              <span className="t-tag is-grey"><i className="fas fa-user" aria-hidden /> {s.role}</span>
              {s.closed ? (
                <span className="t-muted"><i className="fas fa-check" aria-hidden /> ปิดเมื่อ {s.closedAt ? formatTime(s.closedAt) : "-"}</span>
              ) : (
                <button type="button" className="t-btn t-btn-ok t-btn-sm" onClick={() => close(s)} disabled={closing === s.id}>
                  {closing === s.id ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-check-circle" aria-hidden />} ปิดเรื่อง
                </button>
              )}
            </div>
          </div>
        ))
      )}
      {toast.node}
      {confirm.node}
    </ToolShell>
  );
}
