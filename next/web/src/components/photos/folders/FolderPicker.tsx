"use client";

import { useEffect, useRef, useState } from "react";
import type { Album } from "@/lib/photos/types";
import { pinnedFirst, tree } from "@/lib/photos/tree";
import { photosApi } from "@/lib/photos/request";
import { usePhotosUI } from "../ui/PhotosUI";
import { FolderTile, FolderTileSkeleton } from "./FolderTile";
import type { Folders } from "./FoldersProvider";

export type PickerOptions = {
  title?: string;
  confirmText?: string;
  allowRoot?: boolean;
  startId?: string | null;
  disabledIds?: Set<string>;
  disabledHint?: string;
  blockedTargetId?: string | null;
  blockedHint?: string;
};
export type PickerResult = { targetId: string | null; label: string };

// Drive-style folder picker. Resolves { targetId (null = top level), label } or null when cancelled.
export function FolderPicker({ opts: raw, folders, onClose }: { opts: PickerOptions; folders: Folders; onClose: (r: PickerResult | null) => void }) {
  const ui = usePhotosUI();
  const opts = {
    title: "เลือกโฟลเดอร์",
    confirmText: "เลือก",
    allowRoot: false,
    startId: null,
    disabledIds: new Set<string>(),
    disabledHint: "เลือกโฟลเดอร์นี้ไม่ได้",
    blockedHint: "",
    ...raw,
  };
  const [currentId, setCurrentId] = useState<string | null>(opts.startId || null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<Album[]>(() => folders.getAlbums());
  const [show, setShow] = useState(false);
  const closing = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const crumbsRef = useRef<HTMLElement>(null);

  const findAlbum = (id: string | null) => (id ? list.find((a) => a.id === id) : undefined);
  const label = (id: string | null) => {
    if (!id) return "หน้าหลัก";
    const a = findAlbum(id);
    return a ? a.name : "โฟลเดอร์";
  };
  const here = !loading && currentId && !findAlbum(currentId) ? null : currentId;

  function blockReason() {
    if (!here && !opts.allowRoot) return "เปิดอัลบั้มที่ต้องการ แล้วกดยืนยัน";
    if (here && opts.disabledIds.has(here)) return opts.disabledHint;
    if (opts.blockedTargetId !== undefined && (opts.blockedTargetId || null) === (here || null)) return opts.blockedHint || "เลือกโฟลเดอร์อื่น";
    const a = findAlbum(here);
    if (a && !a.has_access) return "ปลดล็อกโฟลเดอร์นี้ก่อน";
    return "";
  }

  const close = (result: PickerResult | null) => {
    if (closing.current) return;
    closing.current = true;
    setShow(false);
    setTimeout(() => onClose(result), 180);
  };

  useEffect(() => {
    requestAnimationFrame(() => setShow(true));
    let alive = true;
    folders
      .refresh()
      .catch(() => {
        if (!folders.getAlbums().length) ui.toast("โหลดรายการโฟลเดอร์ไม่สำเร็จ", "error");
      })
      .finally(() => {
        if (!alive) return;
        setList(folders.getAlbums());
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".custom-modal-overlay.show")) return; // a prompt on top handles its own Escape
      e.stopPropagation();
      close(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => {
    if (crumbsRef.current) crumbsRef.current.scrollLeft = crumbsRef.current.scrollWidth;
  }, [here, list]);

  async function go(id: string | null) {
    const a = findAlbum(id);
    if (a && !a.has_access) {
      if (!(await folders.unlockAlbum(a))) return;
      try {
        await folders.refresh(true);
      } catch {}
      setList(folders.getAlbums());
    }
    setCurrentId(id || null);
    setQuery("");
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }

  async function createHere() {
    const cur = findAlbum(here);
    if (cur && !cur.has_access) return;
    const name = await ui.prompt({ title: "สร้างโฟลเดอร์ใหม่", message: "ใน " + label(here), placeholder: "ชื่อโฟลเดอร์", confirmText: "สร้าง" });
    if (!name || !name.trim()) return;
    try {
      const d = await photosApi<{ album: { id: string } }>("/api/photos/albums", "POST", { name: name.trim(), parent_id: here }, here);
      try {
        await folders.refresh(true);
      } catch {}
      setList(folders.getAlbums());
      setCurrentId(d.album.id);
      setQuery("");
      ui.toast("สร้างโฟลเดอร์แล้ว", "success");
    } catch (e) {
      ui.toast((e as Error).message, "error");
    }
  }

  const path = here ? tree.path(list, here) : [];
  const q = query.trim().toLowerCase();
  const items = pinnedFirst(q ? list.filter((a) => a.name.toLowerCase().includes(q)) : tree.children(list, here));
  const reason = blockReason();

  return (
    <div
      className={"pf-picker-overlay" + (show ? " show" : "")}
      onClick={(e) => {
        const t = e.target as Element;
        if (e.target === e.currentTarget || t.closest("[data-close]")) return close(null);
        const tile = t.closest(".pf-tile[data-id]") as HTMLElement | null;
        if (!tile) return;
        if (tile.classList.contains("is-disabled")) {
          ui.toast(opts.disabledHint);
          return;
        }
        go(tile.dataset.id || null);
      }}
      onKeyDown={(e) => {
        const tile = (e.target as Element).closest?.(".pf-tile[data-id]") as HTMLElement | null;
        if (tile && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          tile.click();
        }
      }}
    >
      <div className="pf-picker" role="dialog" aria-modal="true" aria-labelledby="pfPickerTitle">
        <div className="pf-picker-head">
          <div className="pf-picker-top">
            <div className="pf-picker-title" id="pfPickerTitle">
              {opts.title}
            </div>
            <button type="button" className="pf-icon-btn" data-close aria-label="ปิด">
              <i className="fas fa-xmark" />
            </button>
          </div>
          <nav className="pf-crumbs" aria-label="ตำแหน่ง" ref={crumbsRef}>
            <button type="button" className={path.length ? undefined : "current"} onClick={() => go(null)}>
              <i className="fas fa-house" /> หน้าหลัก
            </button>
            {path.map((a, i) => (
              <span key={a.id} style={{ display: "contents" }}>
                <i className="fas fa-chevron-right pf-crumb-sep" />
                <button type="button" className={i === path.length - 1 ? "current" : undefined} onClick={() => go(a.id)}>
                  {a.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="pf-picker-tools">
            <label className="pf-search">
              <i className="fas fa-magnifying-glass" />
              <input type="search" placeholder="ค้นหาโฟลเดอร์ทั้งหมด" autoComplete="off" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button type="button" className="pf-btn pf-btn-glass" onClick={createHere}>
              <i className="fas fa-folder-plus" />
              <span>โฟลเดอร์ใหม่</span>
            </button>
          </div>
        </div>
        <div className="pf-picker-body" ref={bodyRef}>
          <div className="pf-grid">
            {loading && !list.length ? (
              Array.from({ length: 6 }, (_, i) => <FolderTileSkeleton key={i} />)
            ) : !items.length ? (
              <div className="pf-empty">
                <i className="fas fa-folder-open" />
                <div>{q ? "ไม่พบโฟลเดอร์ที่ค้นหา" : "ไม่มีโฟลเดอร์ย่อยในนี้"}</div>
                {!q && !reason ? <small>กด “{opts.confirmText}” เพื่อเลือกที่นี่</small> : null}
              </div>
            ) : (
              items.map((a) => (
                <FolderTile
                  key={a.id}
                  album={a}
                  disabled={opts.disabledIds.has(a.id)}
                  note={
                    q
                      ? tree
                          .path(list, a.id)
                          .slice(0, -1)
                          .map((x) => x.name)
                          .join(" › ") || "หน้าหลัก"
                      : ""
                  }
                />
              ))
            )}
          </div>
        </div>
        <div className="pf-picker-foot">
          <div className="pf-target">
            {reason ? (
              <>
                <i className="fas fa-circle-info" /> {reason}
              </>
            ) : (
              <>
                <i className="fas fa-location-dot" /> ปลายทาง: <b>{label(here)}</b>
              </>
            )}
          </div>
          <div className="pf-actions">
            <button type="button" className="pf-btn pf-btn-ghost" data-close>
              ยกเลิก
            </button>
            <button
              type="button"
              className="pf-btn pf-btn-primary"
              disabled={!!reason}
              onClick={() => {
                if (!blockReason()) close({ targetId: here, label: label(here) });
              }}
            >
              {opts.confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
