"use client";

import { useEffect, useState } from "react";
import { formatWeekRanges, isRoomSub, roomOptions, type RoomsConfig } from "./pinkbook";

// "Sent so far this week": every room of every grade for the chosen week, coloured by the result
// already in the database (neat / messy / not yet), plus the rooms waiting in this inspector's table.

type Report = { grade: string; room: string | number; group_name: string; issues: string | null };
type Pending = { grade: string; room: string; group_name: string };
type Log = { id: number; action: string; action_by?: string; status?: string; issues?: string; unsubmitted_weeks?: string; diff_summary?: string; created_at?: string };

function thaiDateTime(s?: string) {
  if (!s) return "-";
  const d = new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z"));
  if (isNaN(d.getTime())) return s;
  const m = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function unsubText(v?: string) {
  try {
    const a = JSON.parse(v || "[]");
    return Array.isArray(a) && a.length ? formatWeekRanges(a.map(Number)) : "";
  } catch {
    return "";
  }
}

export function WeekProgress({
  week,
  term,
  grades,
  roomsConfig,
  pending,
  refresh,
}: {
  week: string;
  term: string;
  grades: string[];
  roomsConfig: RoomsConfig;
  pending: Pending[];
  refresh: number;
}) {
  const [data, setData] = useState<Report[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [logs, setLogs] = useState<{ title: string; list: Log[] | null; error?: boolean } | null>(null);

  async function openLogs(grade: string, room: string, grp: string) {
    const title = `${grade}/${room}${grp !== "-" ? ` กลุ่ม ${grp}` : ""} · สัปดาห์ที่ ${week}`;
    setLogs({ title, list: null });
    try {
      const j = await (
        await fetch(`/api/pinkbook/logs?week=${encodeURIComponent(week)}&grade=${encodeURIComponent(grade)}&room=${encodeURIComponent(room)}&group=${encodeURIComponent(grp)}&term=${encodeURIComponent(term)}`)
      ).json();
      setLogs({ title, list: j.success && Array.isArray(j.data) ? j.data : [] });
    } catch {
      setLogs({ title, list: [], error: true });
    }
  }

  useEffect(() => {
    if (!week || !term) return;
    let alive = true;
    fetch(`/api/pinkbook/reports?week=${encodeURIComponent(week)}&term=${encodeURIComponent(term)}&t=${Date.now()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setFailed(!j.success);
        setData(j.success ? j.data : []);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [week, term, refresh]);

  if (!week) return null;

  // Newest record first from the server, so the first match is the current result.
  const resultOf = (grade: string, room: string, grp: string, sub: boolean) => {
    const r = (data || []).find(
      (d) => d.grade === grade && String(d.room) === room && (sub ? d.group_name === grp : ["-", "", "ก"].includes(d.group_name)),
    );
    if (!r) return null;
    return r.issues && r.issues !== "-" ? "messy" : "neat";
  };
  const isPending = (grade: string, room: string, grp: string) => pending.some((p) => p.grade === grade && p.room === room && p.group_name === grp);

  let total = 0;
  let done = 0;
  const rows = grades.map((grade) => {
    const cells = roomOptions(roomsConfig, grade).map((room) => {
      const sub = isRoomSub(roomsConfig, grade, room);
      const parts = (sub ? ["ก", "ข"] : ["-"]).map((grp) => {
        const res = resultOf(grade, room, grp, sub);
        total++;
        if (res) done++;
        return { grp, res, pend: isPending(grade, room, grp) };
      });
      return { room, parts };
    });
    const gDone = cells.reduce((n, c) => n + c.parts.filter((p) => p.res).length, 0);
    const gTotal = cells.reduce((n, c) => n + c.parts.length, 0);
    return { grade, cells, gDone, gTotal };
  });

  const label = (res: string | null, pend: boolean) => (res === "neat" ? "เรียบร้อย" : res === "messy" ? "ไม่เรียบร้อย" : pend ? "อยู่ในตาราง ยังไม่บันทึก" : "ยังไม่ส่ง");

  return (
    <section className="pb-progress" aria-label="ห้องที่ส่งแล้ว">
      <div className="pb-table-head">
        <h2>
          <i className="fas fa-list-check" aria-hidden /> ส่งแล้วสัปดาห์ที่ {week}
          {data && <span className="pb-count">{done}/{total}</span>}
        </h2>
      </div>
      <div className="t-card pb-progress-card">
        <div className="pb-legend">
          <span><i className="pb-dot is-neat" /> เรียบร้อย</span>
          <span><i className="pb-dot is-messy" /> ไม่เรียบร้อย</span>
          <span><i className="pb-dot is-pend" /> อยู่ในตาราง</span>
          <span><i className="pb-dot" /> ยังไม่ส่ง</span>
        </div>
        {failed && <p className="t-muted">โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้าเว็บ</p>}
        {!data && !failed && <p className="t-muted"><i className="fas fa-spinner fa-spin" aria-hidden /> กำลังโหลด...</p>}
        {data &&
          rows.map(({ grade, cells, gDone, gTotal }) => (
            <div key={grade} className="pb-prog-grade">
              <div className="pb-prog-title">
                <b>{grade}</b>
                <span className={gDone === gTotal ? "is-all" : undefined}>{gDone}/{gTotal}</span>
              </div>
              <div className="pb-prog-rooms">
                {cells.map(({ room, parts }) => (
                  <div key={room} className="pb-prog-room">
                    <span className="pb-prog-num">{room}</span>
                    <span className="pb-prog-parts">
                      {parts.map(({ grp, res, pend }) => (
                        <button
                          type="button"
                          key={grp}
                          className={`pb-prog-cell${res ? ` is-${res}` : pend ? " is-pend" : ""}`}
                          title={`${grade}/${room}${grp !== "-" ? ` กลุ่ม ${grp}` : ""}: ${label(res, pend)} (แตะเพื่อดูประวัติ)`}
                          onClick={() => openLogs(grade, room, grp)}
                        >
                          {grp !== "-" ? grp : ""}
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {data && <p className="t-muted pb-prog-tip">แตะช่องห้องเพื่อดูประวัติการบันทึก</p>}
      </div>
      {logs && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setLogs(null)}>
          <div className="t-modal-card pb-log-sheet">
            <div className="pb-log-head">
              <b>ประวัติการบันทึก · {logs.title}</b>
              <button type="button" className="t-icon-btn" onClick={() => setLogs(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
            </div>
            {logs.list === null ? (
              <div className="t-empty"><i className="fas fa-spinner fa-spin" aria-hidden />กำลังโหลดประวัติ...</div>
            ) : logs.error ? (
              <div className="t-empty">โหลดประวัติไม่สำเร็จ</div>
            ) : logs.list.length === 0 ? (
              <div className="t-empty"><i className="far fa-folder-open" aria-hidden />ยังไม่มีการบันทึกห้องนี้ในสัปดาห์นี้</div>
            ) : (
              logs.list.map((log) => {
                const act = { submit: "ส่งข้อมูล", delete: "ลบข้อมูล", revert: "ย้อนกลับ" }[log.action] || "แก้ไข";
                const st = log.status || "ไม่ระบุ";
                const unsub = unsubText(log.unsubmitted_weeks);
                return (
                  <div key={log.id} className={`pb-tl is-${log.action}`}>
                    <span className="pb-tl-dot"><i className={`fas ${{ submit: "fa-cloud-arrow-up", delete: "fa-trash-can", revert: "fa-rotate-left" }[log.action] || "fa-pen-to-square"}`} aria-hidden /></span>
                    <div className="pb-tl-card">
                      <div className="pb-tl-top">
                        <b>{act} · <span className={st === "เรียบร้อย" ? "pb-log-good" : st === "ยังไม่ส่ง" ? "pb-log-bad" : "pb-log-warn"}>{st}</span></b>
                        <time>{thaiDateTime(log.created_at)}</time>
                      </div>
                      <div className="t-muted pb-tl-meta"><i className="far fa-user" aria-hidden /> {log.action_by || "แอดมิน"}{log.diff_summary ? ` · ${log.diff_summary}` : ""}</div>
                      {log.issues && log.issues !== "-" && <div className="pb-tl-issues">{log.issues.split(/,<br>|<br>/).join(" · ")}</div>}
                      {unsub && <div className="t-muted pb-tl-meta">สัปดาห์ที่ขาดส่ง: {unsub}</div>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
