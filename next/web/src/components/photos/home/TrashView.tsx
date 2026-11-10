"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/photos/request";
import { fmt } from "@/lib/photos/util";
import { usePhotosUI } from "../ui/PhotosUI";

type TrashAlbum = { id: string; name: string; locked?: boolean; cover_id?: string | null; from?: { name: string } | null; folders?: number; items?: number; expires_at: number };
type TrashImage = { id: string; name: string; locked?: boolean; file_type?: string; album?: { name: string; alive: boolean } | null; expires_at: number };
type TrashData = { albums?: TrashAlbum[]; images?: TrashImage[]; image_total?: number; next_offset?: number | null };

const daysLeft = (ts: number) => Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
const daysText = (ts: number) => {
  const n = daysLeft(ts);
  return n ? `เหลือ ${fmt(n)} วัน` : "จะถูกลบถาวรเร็ว ๆ นี้";
};

// ===== ถังขยะ =====
export function TrashView({ onStats, onAlbumsChanged }: { onStats: (albums: number, files: number) => void; onAlbumsChanged: () => void }) {
  const ui = usePhotosUI();
  const [data, setData] = useState<TrashData | null>(null);
  const [images, setImages] = useState<TrashImage[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null | undefined>(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "ready" | { error: string }>("loading");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (reset: boolean, offset: number | null | undefined) => {
      setLoading(true);
      if (reset) {
        setSelected(new Set());
        setStatus("loading");
      }
      try {
        const d = await apiJson<TrashData>("/api/photos/trash?limit=200&offset=" + ((reset ? 0 : offset) || 0));
        setData(d);
        setImages((cur) => (reset ? d.images || [] : cur.concat(d.images || [])));
        setNextOffset(d.next_offset);
        setStatus("ready");
        onStats((d.albums || []).length, d.image_total || 0);
      } catch (e) {
        setStatus({ error: (e as Error).message });
      } finally {
        setLoading(false);
      }
    },
    [onStats],
  );

  useEffect(() => {
    // Loads the trash when the view opens; results arrive asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true, 0);
  }, [load]);

  async function restore(body: { albums?: string[]; images?: string[] }, skippedHere: number) {
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> กำลังกู้คืน...
      </>,
      "success",
      true,
    );
    try {
      const d = await apiJson<{ restoredAlbums?: number; restoredImages?: number; skipped?: { reason: string }[] }>("/api/photos/trash/restore", "POST", {
        albums: body.albums || [],
        images: body.images || [],
      });
      const parts: string[] = [];
      if (d.restoredAlbums) parts.push(fmt(d.restoredAlbums) + " โฟลเดอร์");
      if (d.restoredImages) parts.push(fmt(d.restoredImages) + " ไฟล์");
      const skipped = d.skipped || [];
      let msg = parts.length ? "กู้คืนแล้ว " + parts.join(" และ ") : "ไม่มีรายการที่กู้คืนได้";
      const skippedCount = skipped.length + (skippedHere || 0);
      if (skippedCount) msg += ` · ข้าม ${fmt(skippedCount)} รายการ (${skipped[0] ? skipped[0].reason : "อัลบั้มของไฟล์ถูกลบ"})`;
      ui.toast(msg, parts.length ? "success" : "error");
      load(true, 0);
      onAlbumsChanged();
    } catch (e) {
      ui.toast((e as Error).message, "error");
    }
  }

  async function purge(body: { albums?: string[]; images?: string[]; all?: boolean }, what: string) {
    const ok = await ui.confirm({ title: "ลบถาวร?", message: what + " · การลบนี้ย้อนกลับไม่ได้", isDanger: true, confirmText: "ลบถาวร", cancelText: "ยกเลิก" });
    if (!ok) return;
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> กำลังลบถาวร...
      </>,
      "success",
      true,
    );
    try {
      const d = await apiJson<{ albums: number; images: number }>("/api/photos/trash/purge", "POST", body);
      ui.toast(`ลบถาวรแล้ว ${fmt(d.albums)} โฟลเดอร์ ${fmt(d.images)} ไฟล์`, "success");
      load(true, 0);
    } catch (e) {
      ui.toast((e as Error).message, "error");
    }
  }

  if (status === "loading" && !data)
    return (
      <div className="pane-status">
        <i className="fas fa-circle-notch fa-spin" /> กำลังโหลดถังขยะ...
      </div>
    );
  if (typeof status === "object")
    return (
      <div className="pane-status">
        {status.error}{" "}
        <button type="button" className="link-btn" onClick={() => load(true, 0)}>
          ลองอีกครั้ง
        </button>
      </div>
    );

  const albums = data?.albums || [];
  if (!albums.length && !images.length)
    return (
      <div className="pane-empty">
        <i className="fas fa-trash-can" />
        <div>ถังขยะว่างเปล่า</div>
        <small>รายการที่ลบจะอยู่ที่นี่ 30 วันก่อนถูกลบถาวร</small>
      </div>
    );

  const n = selected.size;
  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <div className="trash-notice">
        <i className="fas fa-circle-info" />
        <span>รายการในถังขยะจะถูกลบถาวรอัตโนมัติหลัง 30 วัน</span>
        <button type="button" className="pill-btn danger" onClick={() => purge({ all: true }, "ลบทุกรายการในถังขยะถาวร")}>
          <i className="fas fa-trash-can" />
          <span>ล้างถังขยะ</span>
        </button>
      </div>
      {albums.length ? (
        <>
          <h2 className="pane-title">
            <i className="fas fa-folder" /> โฟลเดอร์ <b>{fmt(albums.length)}</b>
          </h2>
          <div className="trash-folders">
            {albums.map((a) => (
              <div key={a.id} className="trash-folder" data-id={a.id}>
                <div className={"tf-cover" + (a.locked ? " locked" : "")}>
                  {a.locked ? (
                    <i className="fas fa-lock" />
                  ) : a.cover_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/image/${encodeURIComponent(a.cover_id)}/thumb`} alt="" loading="lazy" />
                  ) : (
                    <i className="fas fa-folder" />
                  )}
                </div>
                <div className="tf-info">
                  <div className="tf-name">{a.name}</div>
                  <div className="tf-meta">
                    {a.from ? "จาก " + a.from.name : "กู้คืนไปที่หน้าหลัก"}
                    {a.folders ? " · " + fmt(a.folders) + " โฟลเดอร์ย่อย" : ""} · {fmt(a.items)} ไฟล์
                  </div>
                  <div className="tf-days">{daysText(a.expires_at)}</div>
                </div>
                <div className="tf-actions">
                  <button type="button" className="pill-btn" aria-label="กู้คืน" onClick={() => restore({ albums: [a.id] }, 0)}>
                    <i className="fas fa-rotate-left" />
                    <span>กู้คืน</span>
                  </button>
                  <button type="button" className="pill-btn danger" aria-label="ลบถาวร" onClick={() => purge({ albums: [a.id] }, `ลบ "${a.name}" และทุกไฟล์ข้างในถาวร`)}>
                    <i className="fas fa-xmark" />
                    <span>ลบถาวร</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {images.length ? (
        <>
          <h2 className="pane-title">
            <i className="fa-regular fa-file" /> ไฟล์ <b>{fmt(data?.image_total || images.length)}</b>
          </h2>
          <div className="trash-bulk">
            <label className="select-all">
              <input
                type="checkbox"
                checked={n > 0 && images.every((i) => selected.has(i.id))}
                onChange={(e) => setSelected(e.target.checked ? new Set(images.map((i) => i.id)) : new Set())}
              />{" "}
              เลือกทั้งหมด
            </label>
            <span className="bulk-count">{n ? "เลือก " + fmt(n) + " ไฟล์" : ""}</span>
            <button
              type="button"
              className="pill-btn"
              disabled={!n}
              onClick={() => {
                const ids = [...selected];
                const restorable = ids.filter((id) => {
                  const f = images.find((i) => i.id === id);
                  return f && f.album && f.album.alive;
                });
                if (!restorable.length) {
                  ui.toast("ไฟล์ที่เลือกอยู่ในอัลบั้มที่ถูกลบ ให้กู้คืนอัลบั้มก่อน", "error");
                  return;
                }
                restore({ images: restorable }, ids.length - restorable.length);
              }}
            >
              <i className="fas fa-rotate-left" />
              <span>กู้คืน</span>
            </button>
            <button type="button" className="pill-btn danger" disabled={!n} onClick={() => purge({ images: [...selected] }, `ลบ ${fmt(selected.size)} ไฟล์ที่เลือกถาวร`)}>
              <i className="fas fa-xmark" />
              <span>ลบถาวร</span>
            </button>
          </div>
          <div className="trash-files">
            {images.map((f) => {
              const on = selected.has(f.id);
              return (
                <label key={f.id} className={"trash-file" + (on ? " selected" : "")} data-id={f.id}>
                  <input type="checkbox" checked={on} aria-label={"เลือก " + f.name} onChange={(e) => toggle(f.id, e.target.checked)} />
                  <span className="tfile-check">
                    <i className="fas fa-check" />
                  </span>
                  <div className="tfile-thumb">
                    {f.locked ? (
                      <i className="fas fa-lock" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/image/${encodeURIComponent(f.id)}/thumb`} alt="" loading="lazy" />
                    )}
                    {f.file_type === "video" ? (
                      <span className="tl-video">
                        <i className="fas fa-play" />
                      </span>
                    ) : null}
                  </div>
                  <div className="tfile-name">{f.name}</div>
                  <div className="tfile-meta">
                    {f.album && f.album.alive ? f.album.name : <span className="warn">อัลบั้มถูกลบ</span>} · {daysText(f.expires_at)}
                  </div>
                </label>
              );
            })}
          </div>
          {nextOffset != null ? (
            <div className="pane-more">
              <button type="button" className="pill-btn" disabled={loading} onClick={() => load(false, nextOffset)}>
                โหลดเพิ่ม
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
