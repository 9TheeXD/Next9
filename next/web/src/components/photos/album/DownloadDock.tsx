"use client";

import { useEffect, useRef, useState } from "react";
import "./download-dock.css";

// Download progress, out of the way: a card that pops up when a download starts, then after 3 s slides
// off to the right and turns into a small floating circle (progress ring + time left). Tapping the
// circle brings the card back, and it then stays open. When the download has finished the circle and
// card stay available until the card is closed with its × button.

export type DockProgress = {
  open: boolean;
  startedAt: number; // changes for each new download
  title: string;
  pct: number;
  done: boolean;
  doneCount: number;
  total: number;
  unit: string;
  size: string;
  speed: string;
  etaSec: number | null;
  busy: boolean; // a stage with no measurable progress (building the ZIP)
  showStats: boolean;
  // Some or all files went to the browser's own download manager, which the page cannot track. The
  // note says where to watch them. standalone: nothing was downloaded in-page, so there is no progress
  // to show and the card closes itself.
  handoff: { note: string; standalone?: boolean } | null;
  // iPhone/iPad: the files are downloaded and wait for a tap to open the share sheet (see useDownloads).
  share: { count: number } | null;
};

const AUTO_MINIMIZE_MS = 3000;
const HANDOFF_CLOSE_MS = 9000;
const RING_R = 25;
const RING_C = 2 * Math.PI * RING_R;

export const shortEta = (sec: number | null) => {
  if (sec == null || !isFinite(sec)) return "";
  if (sec < 60) return `${Math.max(1, Math.round(sec))}s`;
  if (sec < 3600) return `${Math.ceil(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
};
const longEta = (sec: number | null) => {
  if (sec == null || !isFinite(sec)) return "กำลังคำนวณเวลา…";
  if (sec < 60) return `เหลืออีกประมาณ ${Math.max(1, Math.round(sec))} วินาที`;
  return `เหลืออีกประมาณ ${Math.ceil(sec / 60)} นาที`;
};

export function DownloadDock({
  progress,
  onCancel,
  onDismiss,
  onShare,
}: {
  progress: DockProgress;
  onCancel: () => void;
  onDismiss: () => void;
  onShare: () => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const pinned = useRef(false); // reopened by the user: no more auto-minimize for this download
  const [session, setSession] = useState(0);

  // Each new download starts a fresh session: card shown, auto-minimize armed.
  useEffect(() => {
    if (!progress.open) return;
    pinned.current = false;
    // Showing the card again for a newly started download.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinimized(false);
    setSession((s) => s + 1);
  }, [progress.open, progress.startedAt]);

  // Files waiting for the save tap: the card comes back (even if already shrunk to the circle) and
  // stays, since nothing is saved until the button is tapped.
  const awaitingShare = !!progress.share;
  useEffect(() => {
    if (!awaitingShare) return;
    pinned.current = true;
    // Bringing the card back for the tap the save needs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinimized(false);
  }, [awaitingShare]);

  // A pure hand-off has no progress to come back to, so it closes instead of shrinking to the circle.
  const handoffOnly = !!progress.handoff?.standalone;
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!session) return;
    const t = setTimeout(
      () => {
        if (pinned.current) return;
        if (handoffOnly) onDismissRef.current();
        else setMinimized(true);
      },
      handoffOnly ? HANDOFF_CLOSE_MS : AUTO_MINIMIZE_MS,
    );
    return () => clearTimeout(t);
    // Armed once per download session; handoffOnly is fixed for a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!progress.open) return null;

  const pct = Math.max(0, Math.min(100, progress.pct));
  const state = handoffOnly ? "handoff" : progress.done ? "done" : progress.busy ? "busy" : "active";
  const eta = shortEta(progress.etaSec);

  return (
    <>
      <section
        className={"dl-dock-card" + (minimized ? " is-away" : "")}
        data-state={state}
        role="status"
        aria-live="polite"
        aria-hidden={minimized}
        onPointerDown={() => (pinned.current = true)}
      >
        <header className="dl-dock-head">
          <span className="dl-dock-icon" aria-hidden="true">
            <i className={handoffOnly ? "fas fa-arrow-up-right-from-square" : progress.done ? "fas fa-check" : progress.busy ? "fas fa-file-zipper" : "fas fa-arrow-down"} />
          </span>
          <div className="dl-dock-title">
            <b>{progress.title}</b>
            <small>
              {handoffOnly ? progress.size : `${progress.doneCount} / ${progress.total} ${progress.unit}`}
            </small>
          </div>
          {progress.done ? (
            <button type="button" className="dl-dock-btn" aria-label="ปิด" onClick={onDismiss}>
              <i className="fas fa-xmark" />
            </button>
          ) : (
            <button
              type="button"
              className="dl-dock-btn"
              aria-label="ย่อ"
              onClick={() => {
                pinned.current = true;
                setMinimized(true);
              }}
            >
              <i className="fas fa-minus" />
            </button>
          )}
        </header>

        {handoffOnly ? null : (
          <>
            <div className="dl-dock-pct">
              <span>{progress.busy ? "" : `${Math.round(pct)}%`}</span>
              <small>{progress.done ? progress.size : progress.busy ? "กำลังบีบอัดไฟล์ ZIP…" : longEta(progress.etaSec)}</small>
            </div>
            <div className="dl-dock-bar">
              <div className="dl-dock-fill" style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
          </>
        )}

        {progress.share ? (
          <div className="dl-dock-share">
            <button type="button" className="dl-dock-share-btn" onClick={onShare}>
              <i className="fas fa-arrow-up-from-bracket" aria-hidden="true" /> บันทึก{progress.share.count > 1 ? ` ${progress.share.count} ไฟล์` : "ไฟล์"}
            </button>
            <small>เลือก &quot;บันทึกไปยังแอปไฟล์&quot; เพื่อเลือกโฟลเดอร์ หรือ &quot;บันทึกรูปภาพ&quot; เพื่อเก็บในแอปรูปภาพ</small>
          </div>
        ) : null}

        {progress.handoff ? (
          <p className="dl-dock-note">
            <i className="fas fa-circle-info" aria-hidden="true" /> {progress.handoff.note}
          </p>
        ) : null}

        {!progress.done ? (
          <>
            <div className="dl-dock-stats">
              {progress.showStats ? (
                <span>
                  <i className="fas fa-bolt" /> {progress.speed}
                </span>
              ) : null}
              <span>
                <i className="fas fa-hard-drive" /> {progress.size}
              </span>
            </div>
            <div className="dl-dock-foot">
              <small>
                <i className="fas fa-triangle-exclamation" /> อย่าปิดหรือรีเฟรชหน้านี้จนกว่าจะเสร็จ
              </small>
              <button type="button" className="dl-dock-cancel" onClick={onCancel}>
                ยกเลิก
              </button>
            </div>
          </>
        ) : null}
      </section>

      <button
        type="button"
        className={"dl-dock-fab" + (minimized ? "" : " is-away")}
        data-state={state}
        aria-label={progress.done ? "ดาวน์โหลดเสร็จแล้ว แตะเพื่อดูรายละเอียด" : `กำลังดาวน์โหลด ${Math.round(pct)}% แตะเพื่อดูรายละเอียด`}
        aria-hidden={!minimized}
        tabIndex={minimized ? 0 : -1}
        onClick={() => {
          pinned.current = true;
          setMinimized(false);
        }}
      >
        <svg viewBox="0 0 60 60" aria-hidden="true">
          <circle className="dl-dock-ring-bg" cx="30" cy="30" r={RING_R} />
          <circle className="dl-dock-ring" cx="30" cy="30" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - (progress.busy ? 1 : pct / 100))} />
        </svg>
        <i className={"dl-dock-fab-bg " + (handoffOnly ? "fas fa-arrow-up-right-from-square" : progress.done ? "fas fa-check" : "fas fa-arrow-down")} aria-hidden="true" />
        <span className="dl-dock-fab-text">{progress.done ? <i className="fas fa-check" /> : progress.busy ? "ZIP" : eta || `${Math.round(pct)}%`}</span>
      </button>
    </>
  );
}
