"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ToolShell, useConfirm, useToast } from "@/components/tool/Tool";
import { buddhistShort, calendarIndex, details, filterRows, fullImageUrl, historyFor, isPerfect, mergeData, overview, type RoomStat, type Row } from "./stats";

// Building inspection summary (/viewforms/building/). Reads GET /api/building/data_v2?building=all,
// and its one write is POST /api/building/cancel_deduction { issue_id, is_cancelled: true }.

const BUILDINGS = ["3", "5", "6", "9", "10", "11", "15"];
const DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
type Photo = { url: string; type: "overall" | "issue"; date: string; inspectors: string; id?: number; name: string; cancelled?: boolean };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inspectorsOf = (r: Row) => [r.inspector1, r.inspector2, r.inspector3].filter(Boolean).join(", ");

function photosOf(r: Row): Photo[] {
  const ins = inspectorsOf(r);
  const out: Photo[] = [];
  if (r.overall_image_url) out.push({ url: fullImageUrl(r.overall_image_url), type: "overall", date: r.date, inspectors: ins, name: "ความสะอาดโดยรวม" });
  (r.issues || []).forEach((i) => out.push({ url: fullImageUrl(i.image_url), type: "issue", date: r.date, inspectors: ins, id: i.id, name: i.issue_name, cancelled: i.is_cancelled === 1 }));
  return out;
}

export function ViewBuilding() {
  const [raw, setRaw] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState({ building: "all", start: "", end: "" });
  const [applied, setApplied] = useState(filter);
  const [tab, setTab] = useState<"calendar" | "details">("calendar");
  const [rankTab, setRankTab] = useState<"top" | "bottom">("top");
  const [rankAll, setRankAll] = useState<"top" | "bottom" | null>(null);
  const [calType, setCalType] = useState<"building" | "room">("building");
  const [calBuilding, setCalBuilding] = useState("all");
  const [calRoom, setCalRoom] = useState("");
  const [calRoomQ, setCalRoomQ] = useState("");
  const [month, setMonth] = useState(() => new Date());
  const [dayView, setDayView] = useState<{ iso: string; sort: "building" | "room" } | null>(null);
  const [history, setHistory] = useState<{ building: string | number; room: string; sort: string } | null>(null);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [openB, setOpenB] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const say = toast.show;
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const result = await (await fetch(`/api/building/data_v2?building=all&t=${Date.now()}`)).json();
      if (result.success) setRaw(mergeData(result));
      else {
        setRaw([]);
        say("เกิดข้อผิดพลาดในการโหลดข้อมูล: " + result.message, "error");
      }
    } catch {
      setRaw([]);
      say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "error");
    }
  }, [say]);

  useEffect(() => {
    const t = setTimeout(() => {
      const today = new Date();
      const last = new Date(today);
      last.setMonth(today.getMonth() - 1);
      const f = { building: "all", start: last.toISOString().slice(0, 10), end: today.toISOString().slice(0, 10) };
      setFilter(f);
      setApplied(f);
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setCalRoomQ(calRoom), 500);
    return () => clearTimeout(t);
  }, [calRoom]);

  const filtered = useMemo(() => (raw ? filterRows(raw, applied.building, applied.start, applied.end) : []), [raw, applied]);
  const ov = useMemo(() => overview(filtered), [filtered]);
  const det = useMemo(() => details(filtered), [filtered]);
  const cal = useMemo(() => (raw ? calendarIndex(raw, calType, calBuilding, calType === "room" ? calRoomQ : "") : {}), [raw, calType, calBuilding, calRoomQ]);

  async function cancelDeduction(id: number) {
    if (!(await confirm.ask("ยืนยันยกเลิกการหักคะแนน/สถานะไม่เรียบร้อยของจุดนี้?", "ยกเลิกการหัก"))) return;
    try {
      const result = await (await fetch("/api/building/cancel_deduction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issue_id: id, is_cancelled: true }) })).json();
      if (result.success) {
        say("ยกเลิกสำเร็จ");
        setLightbox(null);
        load();
      } else say("เกิดข้อผิดพลาด: " + result.message, "error");
    } catch {
      say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "error");
    }
  }

  const photos = (list: Photo[]) => (
    <div className="vb-photos">
      {list.map((p, i) => (
        <button key={i} type="button" className={`vb-photo${p.cancelled ? " is-cancelled" : ""}`} onClick={() => setLightbox(p)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt="" loading="lazy" />
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );

  const rankList = (rooms: RoomStat[]) =>
    rooms.length === 0 ? (
      <div className="t-empty">ไม่มีข้อมูล</div>
    ) : (
      <ol className="vb-rank">
        {rooms.map((r, i) => (
          <li key={`${r.building}-${r.room}`}>
            <span className="vb-rank-n">#{i + 1}</span>
            <span className="vb-rank-name">ห้อง {r.room} <small>(อาคาร {r.building})</small></span>
            <b className={r.pct >= 80 ? "vs-good" : r.pct < 50 ? "vs-bad" : "vb-mid"}>{r.pct.toFixed(1)}%</b>
          </li>
        ))}
      </ol>
    );

  const levelOf = (pct: number) => (pct >= 80 ? ["ดีมาก", "is-good"] : pct >= 50 ? ["พอใช้", "is-mid"] : ["ต้องปรับปรุง", "is-bad"]);

  // Calendar cells for the shown month.
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1).getDay();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const todayIso = iso(new Date());

  const dayRows = dayView ? [...(cal[dayView.iso] || [])] : [];
  if (dayView?.sort === "building") dayRows.sort((a, b) => (a.building !== b.building ? parseInt(String(a.building)) - parseInt(String(b.building)) : a.room.localeCompare(b.room)));
  else dayRows.sort((a, b) => a.room.localeCompare(b.room));

  return (
    <ToolShell wide title="สรุปผลการตรวจอาคาร" icon="fas fa-chart-column" sub="สภานักเรียน โรงเรียนสิรินธร จังหวัดสุรินทร์">
      <div className="t-card vb-filters">
        <label>
          <span className="t-label">อาคาร</span>
          <select className="t-input" value={filter.building} onChange={(e) => setFilter({ ...filter, building: e.target.value })}>
            <option value="all">ทุกอาคาร</option>
            {BUILDINGS.map((b) => <option key={b} value={b}>อาคาร {b}</option>)}
          </select>
        </label>
        <label>
          <span className="t-label">ตั้งแต่</span>
          <input type="date" className="t-input" value={filter.start} onChange={(e) => setFilter({ ...filter, start: e.target.value })} />
        </label>
        <label>
          <span className="t-label">ถึง</span>
          <input type="date" className="t-input" value={filter.end} onChange={(e) => setFilter({ ...filter, end: e.target.value })} />
        </label>
        <button type="button" className="t-btn" onClick={() => setApplied(filter)}><i className="fas fa-magnifying-glass" aria-hidden /> ค้นหา</button>
      </div>

      {raw === null ? (
        <div className="t-card t-empty"><i className="fas fa-spinner fa-spin" aria-hidden />กำลังโหลดข้อมูล...</div>
      ) : (
        <>
          <div className="vb-stats">
            <div className="t-card"><i className="fas fa-clipboard-list" aria-hidden /><span>จำนวนครั้งที่ตรวจ</span><b>{ov.total}</b></div>
            <div className="t-card"><i className="fas fa-star" aria-hidden /><span>ห้องที่เรียบร้อย</span><b>{ov.avg.toFixed(1)}%</b></div>
            <div className="t-card is-good"><i className="fas fa-trophy" aria-hidden /><span>อาคารที่เรียบร้อยที่สุด</span><b>{ov.best}</b></div>
            <div className="t-card is-bad"><i className="fas fa-triangle-exclamation" aria-hidden /><span>ห้องที่ต้องปรับปรุง</span><b>{ov.badCount}</b></div>
          </div>

          <div className="vb-grid">
            <section className="t-card">
              <h2 className="t-card-title"><i className="fas fa-building" aria-hidden /> ภาพรวมรายอาคาร</h2>
              {ov.buildings.length === 0 ? (
                <div className="t-empty">ไม่มีข้อมูล</div>
              ) : (
                <div className="vb-buildings">
                  {ov.buildings.map((b) => {
                    const [label, cls] = levelOf(b.pct);
                    return (
                      <div key={String(b.name)} className="vb-bld">
                        <b>อาคาร {b.name}</b>
                        <span className="t-muted">{b.count} ครั้ง</span>
                        <span className="vb-bar"><span className={cls} style={{ width: `${b.pct}%` }} /></span>
                        <b>{b.pct.toFixed(1)}%</b>
                        <span className={`vb-level ${cls}`}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="t-card">
              <h2 className="t-card-title"><i className="fas fa-ranking-star" aria-hidden /> อันดับห้องเรียน</h2>
              <div className="t-pills">
                <button type="button" className={rankTab === "top" ? "is-on" : undefined} onClick={() => setRankTab("top")}>เรียบร้อยที่สุด</button>
                <button type="button" className={rankTab === "bottom" ? "is-on" : undefined} onClick={() => setRankTab("bottom")}>ต้องปรับปรุง</button>
              </div>
              {rankList((rankTab === "top" ? ov.top : ov.bottom).slice(0, 5))}
              <button type="button" className="t-btn t-btn-ghost t-btn-sm vb-more" onClick={() => setRankAll(rankTab)}>ดูเพิ่มเติม</button>
            </section>
          </div>

          <div className="vb-tabs">
            <button type="button" className={tab === "calendar" ? "is-on" : undefined} onClick={() => setTab("calendar")}><i className="fas fa-calendar-days" aria-hidden /> ปฏิทิน</button>
            <button type="button" className={tab === "details" ? "is-on" : undefined} onClick={() => setTab("details")}><i className="fas fa-list" aria-hidden /> รายละเอียดแต่ละห้อง</button>
          </div>

          {tab === "calendar" ? (
            <section className="t-card">
              <div className="vb-cal-filter">
                <div className="t-pills">
                  <button type="button" className={calType === "building" ? "is-on" : undefined} onClick={() => setCalType("building")}>ตามอาคาร</button>
                  <button type="button" className={calType === "room" ? "is-on" : undefined} onClick={() => setCalType("room")}>ตามห้อง</button>
                </div>
                {calType === "building" ? (
                  <select className="t-input" value={calBuilding} onChange={(e) => setCalBuilding(e.target.value)} aria-label="อาคาร">
                    <option value="all">ทุกอาคาร</option>
                    {BUILDINGS.map((b) => <option key={b} value={b}>อาคาร {b}</option>)}
                  </select>
                ) : (
                  <input className="t-input" value={calRoom} onChange={(e) => setCalRoom(e.target.value)} placeholder="ระบุเลขห้อง..." aria-label="เลขห้อง" />
                )}
              </div>
              <div className="vb-cal-head">
                <button type="button" className="t-icon-btn" onClick={() => setMonth(new Date(y, m - 1, 1))} aria-label="เดือนก่อน"><i className="fas fa-chevron-left" aria-hidden /></button>
                <b>{month.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</b>
                <button type="button" className="t-icon-btn" onClick={() => setMonth(new Date(y, m + 1, 1))} aria-label="เดือนถัดไป"><i className="fas fa-chevron-right" aria-hidden /></button>
              </div>
              <p className="t-muted vb-legend"><span className="vs-good">●</span> เรียบร้อย <span className="vs-bad">●</span> ไม่เรียบร้อย <span>●</span> ยังไม่ตรวจ · แตะวันที่เพื่อดูรายละเอียด</p>
              <div className="vb-cal">
                {DAYS.map((d) => <div key={d} className="vb-cal-dow">{d}</div>)}
                {Array.from({ length: first }, (_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysIn }, (_, i) => {
                  const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                  const items = cal[key] || [];
                  const good = items.filter(isPerfect).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`vb-cal-day${items.length ? " has-data" : ""}${key === todayIso ? " is-today" : ""}`}
                      disabled={!items.length}
                      onClick={() => setDayView({ iso: key, sort: "building" })}
                    >
                      <span className="vb-cal-n">{i + 1}</span>
                      {items.length > 0 && (
                        <span className="vb-cal-counts">
                          <em className="vs-good">{good}</em>
                          <em className="vs-bad">{items.length - good}</em>
                          <em>{Math.max(0, 117 - items.length)}</em>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section>
              {det.length === 0 && <div className="t-card t-empty">ไม่พบข้อมูล</div>}
              {det.map((b) => {
                const isOpen = !!openB[String(b.building)];
                return (
                  <div key={String(b.building)} className="t-card vp-grade">
                    <div className="vp-grade-head" onClick={() => setOpenB((o) => ({ ...o, [String(b.building)]: !isOpen }))}>
                      <b className="vb-bname">อาคาร {b.building}</b>
                      <span className="t-muted">{b.count} ห้อง</span>
                      <span style={{ flex: 1 }} />
                      <i className={`fas fa-chevron-${isOpen ? "up" : "down"}`} aria-hidden />
                    </div>
                    {isOpen && (
                      <div className="vb-floors">
                        {b.floors.map((f) => (
                          <div key={String(f.floor)}>
                            <h4 className="vb-floor">ชั้น {f.floor}</h4>
                            <div className="vb-rooms">
                              {f.rooms.map((r) => {
                                const cls = r.latestStatus === "เรียบร้อย" ? "is-good" : r.latestStatus === "ไม่เรียบร้อย" ? "is-bad" : "";
                                return (
                                  <div key={r.room} className={`vb-room ${cls}`}>
                                    <div className="vb-room-top">
                                      <b>ห้อง {r.room}</b>
                                      <span className={`vb-level ${cls}`}>{r.latestStatus === "v1_legacy" ? "ตรวจแล้ว" : r.latestStatus}</span>
                                    </div>
                                    <div className="vb-room-date">ตรวจล่าสุด {buddhistShort(r.latestDate)}</div>
                                    {r.issueCounts.length > 0 && (
                                      <ul className="vb-room-issues">
                                        {r.issueCounts.map(([n, c]) => <li key={n}>{n} ({c} ครั้ง)</li>)}
                                      </ul>
                                    )}
                                    <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={() => setHistory({ building: r.building, room: r.room, sort: "latest" })}>
                                      <i className="fas fa-clock-rotate-left" aria-hidden /> ประวัติ
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {rankAll && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setRankAll(null)}>
          <div className="t-modal-card vs-sheet">
            <div className="vs-sheet-head">
              <b>{rankAll === "top" ? "ห้องที่เรียบร้อยที่สุด (ทั้งหมด)" : "ห้องที่ต้องปรับปรุง (ทั้งหมด)"}</b>
              <button type="button" className="t-icon-btn" onClick={() => setRankAll(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
            </div>
            {rankList(rankAll === "top" ? ov.top : ov.bottom)}
          </div>
        </div>
      )}

      {dayView && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setDayView(null)}>
          <div className="t-modal-card vs-sheet vb-wide">
            <div className="vs-sheet-head">
              <b>ข้อมูลการตรวจวันที่ {dayView.iso.slice(8)}/{dayView.iso.slice(5, 7)}/{parseInt(dayView.iso.slice(0, 4)) + 543}</b>
              <button type="button" className="t-icon-btn" onClick={() => setDayView(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
            </div>
            <div className="t-pills">
              <button type="button" className={dayView.sort === "building" ? "is-on" : undefined} onClick={() => setDayView({ ...dayView, sort: "building" })}>เรียงตามอาคาร</button>
              <button type="button" className={dayView.sort === "room" ? "is-on" : undefined} onClick={() => setDayView({ ...dayView, sort: "room" })}>เรียงตามห้อง</button>
            </div>
            {dayRows.map((r) => {
              const ph = photosOf(r);
              if (!ph.length) return null;
              return (
                <div key={r.id + "-" + r.room} className="vb-day-room">
                  <b>ห้อง {r.room}</b> <span className="t-muted">(อาคาร {r.building} ชั้น {r.floor})</span>
                  {photos(ph)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {history && raw && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setHistory(null)}>
          <div className="t-modal-card vs-sheet vb-wide">
            <div className="vs-sheet-head">
              <b>ประวัติห้อง {history.room} <span className="t-muted">(อาคาร {history.building})</span></b>
              <button type="button" className="t-icon-btn" onClick={() => setHistory(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
            </div>
            <select className="t-input vb-sort" value={history.sort} onChange={(e) => setHistory({ ...history, sort: e.target.value })} aria-label="เรียงลำดับ">
              <option value="latest">ล่าสุด</option>
              <option value="oldest">เก่าสุด</option>
              <option value="most_issues">ไม่เรียบร้อยสุด</option>
              <option value="least_issues">เรียบร้อยสุด</option>
            </select>
            {historyFor(raw, history.building, history.room, history.sort).map(([mon, recs]) => (
              <div key={mon}>
                <h4 className="vb-month">{mon}</h4>
                {recs.map((r) => {
                  const ph = photosOf(r);
                  if (!ph.length) return null;
                  return (
                    <div key={r.id + r.timestamp} className="vb-day-room">
                      <div className="vb-hist-top">
                        <b>วันที่ {r.date.split("/")[0]} ({r.status})</b>
                        <span className="t-muted">{inspectorsOf(r)}</span>
                      </div>
                      {photos(ph)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div className="bld-lb" onClick={(e) => e.target === e.currentTarget && setLightbox(null)}>
          <div className="vb-lb-head">
            <i className="far fa-calendar" aria-hidden /> {buddhistShort(lightbox.date)} · {lightbox.name}
            <br />
            <small>ผู้ตรวจ: {lightbox.inspectors}</small>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt="" />
          <button type="button" className="bld-lb-close" onClick={() => setLightbox(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
          {lightbox.type === "issue" && lightbox.id && (
            <button type="button" className="vb-cancel" onClick={() => cancelDeduction(lightbox.id!)}>ยกเลิกการหัก</button>
          )}
        </div>
      )}
      {toast.node}
      {confirm.node}
    </ToolShell>
  );
}
