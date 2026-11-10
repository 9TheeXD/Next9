"use client";

import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/photos/request";
import { shareUrl } from "@/lib/photos/tree";
import { copyText, fmt, formatShortDate } from "@/lib/photos/util";
import { useFolders } from "../folders/FoldersProvider";
import type { Share } from "../folders/ShareDialogs";
import { usePhotosUI } from "../ui/PhotosUI";

// ===== ลิงก์ที่แชร์ =====
export function SharesView({ onStats }: { onStats: (links: number) => void }) {
  const ui = usePhotosUI();
  const folders = useFolders();
  const [list, setList] = useState<Share[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setList(null);
    setError("");
    try {
      const d = await apiJson<{ shares: Share[] }>("/api/photos/shares");
      setList(d.shares || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // Loads the links when the view opens; results arrive asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (list) onStats(list.length);
  }, [list, onStats]);

  if (error)
    return (
      <div className="pane-status">
        {error}{" "}
        <button type="button" className="link-btn" onClick={load}>
          ลองอีกครั้ง
        </button>
      </div>
    );
  if (!list)
    return (
      <div className="pane-status">
        <i className="fas fa-circle-notch fa-spin" /> กำลังโหลดลิงก์...
      </div>
    );
  if (!list.length)
    return (
      <div className="pane-empty">
        <i className="fas fa-link" />
        <div>ยังไม่มีลิงก์ที่แชร์</div>
        <small>แชร์โฟลเดอร์ได้จากเมนูของอัลบั้ม หรือแชร์ไฟล์จากเมนูของรูป</small>
      </div>
    );

  async function revoke(id: string) {
    const ok = await ui.confirm({ title: "ยกเลิกลิงก์นี้?", message: "คนที่มีลิงก์นี้จะเปิดไม่ได้อีก", isDanger: true, confirmText: "ยกเลิกลิงก์", cancelText: "ย้อนกลับ", icon: "fas fa-link-slash" });
    if (!ok) return;
    try {
      await apiJson("/api/photos/shares/" + encodeURIComponent(id), "DELETE");
      setList((cur) => (cur || []).filter((sh) => sh.id !== id));
      ui.toast("ยกเลิกลิงก์แล้ว", "success");
    } catch (err) {
      ui.toast((err as Error).message, "error");
    }
  }

  return (
    <div className="share-list">
      {list.map((sh) => {
        const isAlbum = sh.kind === "album";
        return (
          <div key={sh.id} className={"share-row" + (sh.expired ? " expired" : "")} data-id={sh.id}>
            <div className={"sr-ico " + (isAlbum ? "album" : "file")}>
              <i className={"fas " + (isAlbum ? "fa-folder" : "fa-image")} />
            </div>
            <div className="sr-main">
              <div className="sr-name">{sh.target ? sh.target.name : <span className="warn">ถูกลบแล้ว</span>}</div>
              <div className="sr-meta">
                {isAlbum ? "โฟลเดอร์" : "ไฟล์"} · {sh.expired ? <span className="warn">หมดอายุแล้ว</span> : sh.expires_at ? "หมดอายุ " + formatShortDate(sh.expires_at) : "ไม่หมดอายุ"} · สร้าง{" "}
                {formatShortDate(sh.created_at)} · เปิดดู {fmt(sh.view_count)} ครั้ง
              </div>
              <div className="sr-badges">
                <span className="badge">{sh.allow_download ? "ดาวน์โหลดได้" : "ดูอย่างเดียว"}</span>
                {isAlbum && sh.include_subfolders ? <span className="badge">รวมโฟลเดอร์ย่อย</span> : null}
              </div>
            </div>
            <div className="sr-actions">
              <button
                type="button"
                className="icon-pill"
                title="คัดลอกลิงก์"
                aria-label="คัดลอกลิงก์"
                onClick={async () => {
                  const ok = await copyText(shareUrl(sh.id));
                  ui.toast(ok ? "คัดลอกลิงก์แล้ว" : "คัดลอกไม่สำเร็จ", ok ? "success" : "error");
                }}
              >
                <i className="far fa-copy" />
              </button>
              <button
                type="button"
                className="icon-pill"
                title="แก้ไขสิทธิ์"
                aria-label="แก้ไขสิทธิ์"
                onClick={() => folders.openShareEditor(sh, (updated) => setList((cur) => (cur || []).map((x) => (x.id === sh.id ? updated : x))))}
              >
                <i className="fas fa-sliders" />
              </button>
              <button type="button" className="icon-pill" title="เปิดลิงก์" aria-label="เปิดลิงก์" onClick={() => window.open(shareUrl(sh.id), "_blank", "noopener")}>
                <i className="fas fa-arrow-up-right-from-square" />
              </button>
              <button type="button" className="icon-pill danger" title="ยกเลิกลิงก์" aria-label="ยกเลิกลิงก์" onClick={() => revoke(sh.id)}>
                <i className="fas fa-link-slash" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
