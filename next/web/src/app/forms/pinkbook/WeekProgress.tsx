"use client";

import { useEffect, useState } from "react";
import { isRoomSub, roomOptions, type RoomsConfig } from "./pinkbook";

// "Sent so far this week": every room of every grade for the chosen week, coloured by the result
// already in the database (neat / messy / not yet), plus the rooms waiting in this inspector's table.

type Report = { grade: string; room: string | number; group_name: string; issues: string | null };
type Pending = { grade: string; room: string; group_name: string };

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
                        <span
                          key={grp}
                          className={`pb-prog-cell${res ? ` is-${res}` : pend ? " is-pend" : ""}`}
                          title={`${grade}/${room}${grp !== "-" ? ` กลุ่ม ${grp}` : ""}: ${label(res, pend)}`}
                        >
                          {grp !== "-" ? grp : ""}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
