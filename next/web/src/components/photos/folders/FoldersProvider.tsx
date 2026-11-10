"use client";

import { MorphSheet, MorphSurface } from "@/components/photos/ui/MorphMenu";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Album } from "@/lib/photos/types";
import { albumUrl, metaText, tree } from "@/lib/photos/tree";
import { photosApi, saveAlbumToken } from "@/lib/photos/request";
import { canDragWithMouse, copyText, fmt, lsGet, lsSet } from "@/lib/photos/util";
import { useAppNavigate } from "@/lib/useAppNavigate";
import { usePhotosUI } from "../ui/PhotosUI";
import { FolderPicker, type PickerOptions, type PickerResult } from "./FolderPicker";
import { ShareDialog, ShareEditor, type Share, type ShareDialogOptions } from "./ShareDialogs";

// Shared folder UI for the photos pages (the legacy photos/folders.js): the right-click / long-press /
// ⋮ album menu, album actions (pin, rename, move, copy, share, zip, delete), the folder picker, the
// share dialogs and desktop drag & drop.

const CACHE_KEY = "photos_albums_cache_v2";
const LONG_PRESS_MS = 450;
const MENU_GRACE_MS = 500;
const MENU_SCROLL_SLOP = 16;
const MENU_DRAG_SLOP = 26;
const RELEASE_SETTLE_MS = 350;
const DND_TYPE = "application/x-next9-photos";

export type Change = { kind: string; id?: string; newId?: string; targetId?: string | null; type?: string; ids?: string[] };
export type OnChanged = (change: Change) => void;
export type DndPayload = { type: "albums" | "images"; ids: string[]; label?: string; sourceAlbumId?: string | null; albums?: { id: string; parent_id: string | null }[] };
type Cmd = "open" | "newTab" | "copyLink" | "pin" | "rename" | "move" | "copy" | "remove" | "share" | "zip";

// ---- Album list: the page's own list when it has one, otherwise fetched here with its ETag ----
const store: { albums: Album[] | null; etag: string | null; body: string | null; inflight: Promise<Album[]> | null; loaded: boolean } = {
  albums: null,
  etag: null,
  body: null,
  inflight: null,
  loaded: false,
};
function loadStoreCache() {
  if (store.loaded) return;
  store.loaded = true;
  try {
    const c = JSON.parse(lsGet(CACHE_KEY) || "null");
    if (c && c.body) {
      store.albums = JSON.parse(c.body);
      store.etag = c.etag || null;
      store.body = c.body;
    }
  } catch {}
}

let dragPayload: DndPayload | null = null;

type MenuState = {
  album: Album;
  x: number;
  y: number;
  sheet: boolean;
  onChanged?: OnChanged;
  openedAt: number;
  fromTouch: boolean;
  touchReleasedAt: number;
  scrollX: number;
  scrollY: number;
};

export type Folders = {
  getAlbums: () => Album[];
  refresh: (force?: boolean) => Promise<Album[]>;
  configure: (p: { getAlbums: () => Album[]; reload: (force?: boolean) => unknown } | null) => void;
  setDownloadFolderZip: (fn: ((a: Album) => void) | null) => void;
  openMenu: (o: { album: Album | undefined; x: number; y: number; sheet?: boolean; onChanged?: OnChanged; fromTouch?: boolean }) => void;
  closeMenu: () => void;
  requestCloseMenu: (e?: Event) => void;
  isMenuOpen: () => boolean;
  run: (cmd: Cmd, album: Album, onChanged?: OnChanged) => Promise<void>;
  openPicker: (o: PickerOptions) => Promise<PickerResult | null>;
  openShareDialog: (o: ShareDialogOptions) => void;
  openShareEditor: (share: Share, onSaved?: (s: Share) => void) => void;
  unlockAlbum: (a: Album) => Promise<boolean>;
  shouldSuppressClick: () => boolean;
  suppressClicks: (ms: number) => void;
  dnd: { begin: (e: DragEvent | React.DragEvent, payload: DndPayload) => void; end: () => void; active: () => DndPayload | null; isInternal: (e: DragEvent) => boolean };
  moveInto: (payload: DndPayload, target: { id: string | null; name: string }, onChanged?: OnChanged) => Promise<void>;
};

const Ctx = createContext<Folders | null>(null);
export function useFolders() {
  const f = useContext(Ctx);
  if (!f) throw new Error("useFolders outside FoldersProvider");
  return f;
}

// Each action keeps one colour wherever it appears — the same palette as the album page's ☰ menu —
// so "move" is the blue folder tree and "copy" the violet pages in every menu on the site.
// "remove" has none: a danger row is red throughout.
const CMD_COLOR: Partial<Record<Cmd, string>> = {
  open: "#f59e0b",
  newTab: "#0ea5e9",
  pin: "#b00909",
  copyLink: "#10b981",
  rename: "#6366f1",
  move: "#0ea5e9",
  copy: "#8b5cf6",
  share: "#0369a1",
  zip: "#6366f1",
};

export function FoldersProvider({ children }: { children: ReactNode }) {
  const ui = usePhotosUI();
  const navigate = useAppNavigate();
  const provider = useRef<{ getAlbums: () => Album[]; reload: (force?: boolean) => unknown } | null>(null);
  const zipHook = useRef<((a: Album) => void) | null>(null);
  const suppressUntil = useRef(0);
  const lastUndo = useRef<(() => Promise<unknown>) | null>(null);
  const undoChanged = useRef<OnChanged | undefined>(undefined);

  // ---- menu ----
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuRef = useRef<MenuState | null>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  const menuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);

  // ---- dialogs ----
  const [picker, setPicker] = useState<{ opts: PickerOptions; resolve: (r: PickerResult | null) => void; key: number } | null>(null);
  const [share, setShare] = useState<{ opts: ShareDialogOptions; key: number } | null>(null);
  const [editor, setEditor] = useState<{ share: Share; onSaved?: (s: Share) => void; key: number } | null>(null);

  const getAlbums = useCallback(() => {
    loadStoreCache();
    return (provider.current ? provider.current.getAlbums() : store.albums) || [];
  }, []);

  const refresh = useCallback(
    function refreshAlbums(force?: boolean): Promise<Album[]> {
      loadStoreCache();
      if (provider.current) return Promise.resolve(provider.current.reload(force)).then(() => getAlbums());
      if (store.inflight) return force ? store.inflight.then(() => refreshAlbums(true)) : store.inflight;
      store.inflight = (async () => {
        const headers: Record<string, string> = {};
        if (!force && store.etag && store.albums) headers["If-None-Match"] = store.etag;
        const res = await fetch("/api/photos/albums", { credentials: "include", cache: "no-store", headers });
        if (res.status === 304) return store.albums || [];
        if (!res.ok) throw new Error("HTTP " + res.status);
        const body = await res.text();
        store.etag = res.headers.get("ETag");
        if (body !== store.body) {
          store.body = body;
          store.albums = JSON.parse(body);
        }
        lsSet(CACHE_KEY, JSON.stringify({ etag: store.etag, body, at: Date.now() }));
        return store.albums || [];
      })().finally(() => {
        store.inflight = null;
      });
      return store.inflight;
    },
    [getAlbums],
  );
  const ensureAlbums = useCallback(async () => {
    if (!getAlbums().length) await refresh();
  }, [getAlbums, refresh]);

  const unlockAlbum = useCallback(
    async (a: Album) => {
      const gateId = a.lock_gate_id || a.id;
      const pw = await ui.prompt({
        title: "โฟลเดอร์นี้ถูกล็อก",
        message: gateId !== a.id ? "อยู่ในโฟลเดอร์ที่ถูกล็อก กรอกรหัสผ่านของโฟลเดอร์นั้น" : 'กรอกรหัสผ่านเพื่อเปิด "' + a.name + '"',
        isPassword: true,
        placeholder: "รหัสผ่าน",
        confirmText: "ปลดล็อก",
      });
      if (!pw) return false;
      let d: { success?: boolean; token?: string; album_id?: string; message?: string } = {};
      try {
        const res = await fetch("/api/photos/albums/" + encodeURIComponent(gateId) + "/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pw }),
        });
        d = await res.json();
      } catch {}
      if (!d.success || !d.token) {
        ui.toast(d.message || "รหัสผ่านไม่ถูกต้อง", "error");
        return false;
      }
      saveAlbumToken(d.album_id || gateId, d.token);
      return true;
    },
    [ui],
  );

  const openPicker = useCallback(
    (opts: PickerOptions) =>
      new Promise<PickerResult | null>((resolve) => {
        setPicker((cur) => {
          cur?.resolve(null);
          return { opts, resolve, key: (cur?.key || 0) + 1 };
        });
      }),
    [],
  );
  const openShareDialog = useCallback((opts: ShareDialogOptions) => setShare((cur) => ({ opts, key: (cur?.key || 0) + 1 })), []);
  const openShareEditor = useCallback((s: Share, onSaved?: (s: Share) => void) => setEditor((cur) => ({ share: s, onSaved, key: (cur?.key || 0) + 1 })), []);

  const actions = useMemo(
    () => ({
      open(a: Album) {
        navigate(albumUrl(a.id));
        return null;
      },
      newTab(a: Album) {
        window.open(albumUrl(a.id), "_blank", "noopener");
        return null;
      },
      async copyLink(a: Album) {
        const ok = await copyText(location.origin + albumUrl(a.id));
        ui.toast(ok ? "คัดลอกลิงก์แล้ว" : "คัดลอกไม่สำเร็จ", ok ? "success" : "error");
        return null;
      },
      async pin(a: Album): Promise<Change> {
        const pinned = !a.pinned_at;
        await photosApi("/api/photos/albums/" + encodeURIComponent(a.id) + "/pin", "POST", { pinned });
        a.pinned_at = pinned ? Date.now() : null;
        ui.toast(pinned ? "ปักหมุดแล้ว" : "เลิกปักหมุดแล้ว", "success");
        return { kind: "pin", id: a.id };
      },
      async rename(a: Album): Promise<Change | null> {
        const name = await ui.prompt({ title: "เปลี่ยนชื่อ", defaultValue: a.name, placeholder: "ชื่ออัลบั้ม", confirmText: "บันทึก" });
        if (!name || !name.trim() || name.trim() === a.name) return null;
        await photosApi("/api/photos/albums/" + encodeURIComponent(a.id), "PUT", { name: name.trim() }, a.id);
        a.name = name.trim();
        ui.toast("เปลี่ยนชื่อแล้ว", "success");
        return { kind: "rename", id: a.id };
      },
      async move(a: Album): Promise<Change | null> {
        await ensureAlbums();
        const res = await openPicker({
          title: 'ย้าย "' + a.name + '" ไปที่',
          confirmText: "ย้ายมาที่นี่",
          allowRoot: true,
          startId: a.parent_id || null,
          disabledIds: tree.descendants(getAlbums(), a.id),
          disabledHint: "ย้ายเข้าไปในตัวเองไม่ได้",
          blockedTargetId: a.parent_id || null,
          blockedHint: "อยู่ในโฟลเดอร์นี้อยู่แล้ว",
        });
        if (!res) return null;
        await photosApi("/api/photos/albums/" + encodeURIComponent(a.id), "PUT", { parent_id: res.targetId }, a.id);
        a.parent_id = res.targetId;
        ui.toast("ย้ายไปที่ " + res.label + " แล้ว", "success");
        return { kind: "move", id: a.id, targetId: res.targetId };
      },
      async copy(a: Album): Promise<Change | null> {
        await ensureAlbums();
        const res = await openPicker({
          title: 'ทำสำเนา "' + a.name + '" ไปที่',
          confirmText: "ทำสำเนาที่นี่",
          allowRoot: true,
          startId: a.parent_id || null,
          disabledIds: tree.descendants(getAlbums(), a.id),
          disabledHint: "ทำสำเนาเข้าไปในตัวเองไม่ได้",
        });
        if (!res) return null;
        ui.toast(
          <>
            <i className="fas fa-circle-notch fa-spin" /> กำลังทำสำเนา...
          </>,
          "success",
        );
        const d = await photosApi<{ albums: number; copied: number; skipped: number; album_id: string }>(
          "/api/photos/albums/" + encodeURIComponent(a.id) + "/copy",
          "POST",
          { parentId: res.targetId },
          a.id,
        );
        ui.toast(
          "ทำสำเนาแล้ว " + fmt(d.albums) + " อัลบั้ม " + fmt(d.copied) + " รายการ" + (d.skipped ? " (ข้าม " + fmt(d.skipped) + " ที่ยังประมวลผลไม่เสร็จ)" : ""),
          "success",
        );
        return { kind: "copy", id: a.id, newId: d.album_id, targetId: res.targetId };
      },
      async remove(a: Album): Promise<Change | null> {
        const t = tree.totals(getAlbums(), a.id);
        const inside: string[] = [];
        if (t.folders) inside.push(fmt(t.folders) + " โฟลเดอร์ย่อย");
        if (t.photos) inside.push(fmt(t.photos) + " รูป");
        if (t.videos) inside.push(fmt(t.videos) + " วิดีโอ");
        const ok = await ui.confirm({
          title: "ย้ายไปถังขยะ?",
          message: '"' + a.name + '"' + (inside.length ? " รวมถึง " + inside.join(", ") + " ที่อยู่ข้างใน" : "") + " จะอยู่ในถังขยะ กู้คืนได้ภายใน 30 วัน",
          isDanger: true,
          confirmText: "ย้ายไปถังขยะ",
          cancelText: "ยกเลิก",
        });
        if (!ok) return null;
        await photosApi("/api/photos/albums/" + encodeURIComponent(a.id), "DELETE", null, a.id);
        ui.toast("ย้ายไปถังขยะแล้ว", "success");
        return { kind: "delete", id: a.id };
      },
      share(a: Album) {
        openShareDialog({ kind: "album", id: a.id, name: a.name, locked: !!a.is_locked });
        return null;
      },
      zip(a: Album) {
        if (zipHook.current) zipHook.current(a);
        else navigate(albumUrl(a.id) + "&download=zip");
        return null;
      },
    }),
    [ui, navigate, ensureAlbums, getAlbums, openPicker, openShareDialog],
  );

  const run = useCallback(
    async (cmd: Cmd, album: Album, onChanged?: OnChanged) => {
      try {
        const r = await actions[cmd](album);
        if (r && onChanged) onChanged(r);
      } catch (e) {
        ui.toast(e instanceof Error && e.message ? e.message : "เกิดข้อผิดพลาด", "error");
      }
    },
    [actions, ui],
  );

  // ---- menu open / close ----
  const closeMenu = useCallback(() => {
    const was = menuRef.current;
    menuRef.current = null;
    if (!was) return;
    setMenuClosing(true);
    if (menuCloseTimer.current) clearTimeout(menuCloseTimer.current);
    menuCloseTimer.current = setTimeout(() => {
      setMenu(null);
      setMenuClosing(false);
    }, 170);
  }, []);

  // True while events still belong to the gesture that opened the menu: the finger has not lifted
  // yet, or lifted less than RELEASE_SETTLE_MS ago.
  const isOpeningGestureTail = useCallback(() => {
    const m = menuRef.current;
    if (!m) return false;
    if (Date.now() - m.openedAt < MENU_GRACE_MS) return true;
    if (!m.fromTouch) return false;
    return !m.touchReleasedAt || Date.now() - m.touchReleasedAt < RELEASE_SETTLE_MS;
  }, []);

  // Close requests from scrolling/dragging clear the grace period and a movement threshold first.
  const requestCloseMenu = useCallback(
    (e?: Event) => {
      const m = menuRef.current;
      if (!m) return;
      const t = e && (e.target as Element | null);
      if (t && t.nodeType === 1 && t.closest && t.closest(".pf-menu")) return;
      if (Date.now() - m.openedAt < MENU_GRACE_MS) return;
      if (e && (e.type === "scroll" || e.type === "touchmove")) {
        const scrolled = Math.abs(window.scrollY - m.scrollY) + Math.abs(window.scrollX - m.scrollX);
        const touch = (e as TouchEvent).touches && (e as TouchEvent).touches[0];
        const dragged = touch ? Math.hypot(touch.clientX - m.x, touch.clientY - m.y) : 0;
        if (scrolled < MENU_SCROLL_SLOP && dragged < MENU_DRAG_SLOP) return;
      }
      closeMenu();
    },
    [closeMenu],
  );

  const openMenu = useCallback<Folders["openMenu"]>(({ album, x, y, sheet, onChanged, fromTouch }) => {
    if (!album) return;
    const useSheet = !!sheet || window.matchMedia("(max-width: 640px)").matches;
    if (menuCloseTimer.current) clearTimeout(menuCloseTimer.current);
    const state: MenuState = {
      album,
      x,
      y,
      sheet: useSheet,
      onChanged,
      openedAt: Date.now(),
      fromTouch: !!fromTouch,
      touchReleasedAt: 0,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
    menuRef.current = state;
    setMenuPos(null);
    setMenuClosing(false);
    setMenu(state);
  }, []);

  // Place the popup menu inside the viewport once it has a size, then focus its first item.
  useLayoutEffect(() => {
    const el = menuEl.current;
    if (!menu || !el) return;
    if (!menu.sheet) {
      // offsetWidth/offsetHeight, NOT getBoundingClientRect: the panel opens with a scale
      // animation, and a bounding rect measured mid-animation is the scaled box, which would place
      // the menu against a size it is not going to keep.
      const w = el.offsetWidth,
        h = el.offsetHeight;
      setMenuPos({ left: Math.max(8, Math.min(menu.x, innerWidth - w - 8)), top: Math.max(8, Math.min(menu.y, innerHeight - h - 8)) });
    }
    (el.querySelector("button[data-cmd]") as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const released = () => {
      const m = menuRef.current;
      if (m && m.fromTouch && !m.touchReleasedAt) m.touchReleasedAt = Date.now();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menuRef.current) closeMenu();
    };
    const onResize = () => {
      if (menuRef.current && !menuRef.current.sheet) closeMenu();
    };
    document.addEventListener("touchend", released, { capture: true, passive: true });
    document.addEventListener("touchcancel", released, { capture: true, passive: true });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", requestCloseMenu, { passive: true, capture: true });
    // Wheel anywhere, or a touch drag that began while the menu was open (never the long-press
    // that opened it), also asks the menu to close.
    let touchBeganWithMenuOpen = false;
    const onTouchStart = () => {
      touchBeganWithMenuOpen = !!menuRef.current && !isOpeningGestureTail();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchBeganWithMenuOpen) requestCloseMenu(e);
    };
    window.addEventListener("wheel", requestCloseMenu, { passive: true, capture: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    return () => {
      window.removeEventListener("wheel", requestCloseMenu, { capture: true });
      window.removeEventListener("touchstart", onTouchStart, { capture: true });
      window.removeEventListener("touchmove", onTouchMove, { capture: true });
      document.removeEventListener("touchend", released, { capture: true });
      document.removeEventListener("touchcancel", released, { capture: true });
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", requestCloseMenu, { capture: true });
    };
  }, [menu, closeMenu, requestCloseMenu, isOpeningGestureTail]);

  // ---- drag & drop ----
  const dnd = useMemo<Folders["dnd"]>(
    () => ({
      begin(e, payload) {
        dragPayload = payload;
        try {
          const dt = (e as DragEvent).dataTransfer!;
          dt.setData(DND_TYPE, JSON.stringify(payload));
          dt.setData("text/plain", payload.label || "");
          dt.effectAllowed = "move";
          const ghost = document.createElement("div");
          ghost.className = "pf-drag-ghost";
          ghost.innerHTML = `<i class="fas ${payload.type === "albums" ? "fa-folder" : "fa-images"}"></i> `;
          ghost.append(payload.label || fmt(payload.ids.length) + " รายการ");
          document.body.appendChild(ghost);
          dt.setDragImage(ghost, 18, 18);
          setTimeout(() => ghost.remove(), 0);
        } catch {}
        document.documentElement.classList.add("pf-is-dragging");
      },
      end() {
        dragPayload = null;
        document.documentElement.classList.remove("pf-is-dragging");
        document.querySelectorAll(".pf-drop-over, .pf-dragging").forEach((n) => n.classList.remove("pf-drop-over", "pf-dragging"));
      },
      active: () => dragPayload,
      isInternal: (e) => !!(e && e.dataTransfer && [...e.dataTransfer.types].includes(DND_TYPE)),
    }),
    [],
  );
  useEffect(() => {
    const end = () => dnd.end();
    document.addEventListener("dragend", end);
    return () => document.removeEventListener("dragend", end);
  }, [dnd]);

  const undoLast = useCallback(async () => {
    const undo = lastUndo.current;
    lastUndo.current = null;
    if (!undo) return;
    try {
      await undo();
      ui.toast("เลิกทำแล้ว", "success");
      undoChanged.current?.({ kind: "undo" });
    } catch (e) {
      ui.toast((e as Error).message, "error");
    }
  }, [ui]);

  const moveInto = useCallback<Folders["moveInto"]>(
    async (payload, target, onChanged) => {
      // The album page may not have fetched the folder list yet; it's needed to spot locked targets.
      if (target.id && !getAlbums().some((a) => a.id === target.id)) {
        try {
          await refresh();
        } catch {}
      }
      const list = getAlbums();
      const targetAlbum = target.id ? list.find((a) => a.id === target.id) : null;
      if (targetAlbum && !targetAlbum.has_access && !(await unlockAlbum(targetAlbum))) return;
      try {
        if (payload.type === "albums") {
          const previous = payload.ids.map((id) => {
            const known = list.find((a) => a.id === id) || (payload.albums || []).find((a) => a.id === id);
            return { id, parent_id: known ? known.parent_id || null : undefined };
          });
          for (const id of payload.ids) await photosApi("/api/photos/albums/" + encodeURIComponent(id), "PUT", { parent_id: target.id || null }, id);
          lastUndo.current = previous.every((p) => p.parent_id !== undefined)
            ? async () => {
                for (const p of previous) await photosApi("/api/photos/albums/" + encodeURIComponent(p.id), "PUT", { parent_id: p.parent_id }, p.id);
              }
            : null;
        } else {
          await photosApi("/api/photos/images/move", "POST", { ids: payload.ids, targetAlbumId: target.id }, payload.sourceAlbumId);
          lastUndo.current = payload.sourceAlbumId
            ? () => photosApi("/api/photos/images/move", "POST", { ids: payload.ids, targetAlbumId: payload.sourceAlbumId }, target.id)
            : null;
        }
        undoChanged.current = onChanged;
        const what = payload.type === "albums" ? '"' + (payload.label || "โฟลเดอร์") + '"' : fmt(payload.ids.length) + " รายการ";
        ui.toast(
          <>
            {"ย้าย " + what + " ไปที่ " + (target.name || "หน้าหลัก") + " แล้ว"}
            {lastUndo.current ? (
              <button type="button" className="pf-undo" onClick={undoLast}>
                เลิกทำ
              </button>
            ) : null}
          </>,
          "success",
        );
        onChanged?.({ kind: "dnd-move", type: payload.type, ids: payload.ids, targetId: target.id || null });
      } catch (e) {
        ui.toast((e as Error).message, "error");
      }
    },
    [getAlbums, refresh, unlockAlbum, ui, undoLast],
  );

  const api = useMemo<Folders>(
    () => ({
      getAlbums,
      refresh,
      configure: (p) => {
        provider.current = p;
      },
      setDownloadFolderZip: (fn) => {
        zipHook.current = fn;
      },
      openMenu,
      closeMenu,
      requestCloseMenu,
      isMenuOpen: () => !!menuRef.current,
      run,
      openPicker,
      openShareDialog,
      openShareEditor,
      unlockAlbum,
      shouldSuppressClick: () => Date.now() < suppressUntil.current,
      suppressClicks: (ms) => {
        suppressUntil.current = Date.now() + ms;
      },
      dnd,
      moveInto,
    }),
    [getAlbums, refresh, openMenu, closeMenu, requestCloseMenu, run, openPicker, openShareDialog, openShareEditor, unlockAlbum, dnd, moveInto],
  );

  const m = menu;
  const ok = m?.album.has_access;
  const item = (cmd: Cmd, icon: string, label: string, cls?: string) => (
    <button type="button" role="menuitem" data-cmd={cmd} className={cls}>
      <i className={icon} style={CMD_COLOR[cmd] ? { color: CMD_COLOR[cmd] } : undefined} />
      <span>{label}</span>
    </button>
  );
  const onMenuMove = (move: RequestCloseEvent) => requestCloseMenu(move.nativeEvent);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className={"pf-menu-backdrop" + (m ? " show" : "") + (m?.sheet ? " dim" : "") + (menuClosing ? " closing" : "")}
        onClick={(e) => {
          if (isOpeningGestureTail()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          closeMenu();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!isOpeningGestureTail()) closeMenu();
        }}
        onTouchMove={onMenuMove}
        onWheel={onMenuMove}
      />
      {(() => {
        const onMenuClick = (e: React.MouseEvent<HTMLDivElement>) => {
          const b = (e.target as Element).closest("button[data-cmd]") as HTMLButtonElement | null;
          const cur = menuRef.current;
          if (!b || !cur) return;
          closeMenu();
          run(b.dataset.cmd as Cmd, cur.album, cur.onChanged);
        };
        const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          const items = [...(menuEl.current?.querySelectorAll("button[data-cmd]") || [])] as HTMLButtonElement[];
          const i = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        };
        // Nothing to render until a menu is open; every field below reads from it.
        if (!m) return null;
        const menuBody = (
          <>

            <div className="pf-menu-head">
              <div className="pf-menu-grip" />
              <div className="pf-menu-title">{m.album.name}</div>
              <div className="pf-menu-sub">{ok ? metaText(m.album) : "ถูกล็อก"}</div>
            </div>
            {item("open", "fas fa-folder-open", "เปิด")}
            {item("newTab", "fas fa-arrow-up-right-from-square", "เปิดในแท็บใหม่")}
            {item("pin", "fas fa-thumbtack", m.album.pinned_at ? "เลิกปักหมุด" : "ปักหมุด")}
            {item("copyLink", "fas fa-link", "คัดลอกลิงก์")}
            {ok ? (
              <>
                <div className="pf-menu-sep" />
                {item("rename", "fas fa-pen", "เปลี่ยนชื่อ")}
                {item("move", "fas fa-folder-tree", "ย้ายไปที่…")}
                {item("copy", "fas fa-copy", "ทำสำเนาไปที่…")}
                {item("share", "fas fa-share-nodes", "แชร์โฟลเดอร์…")}
                {item("zip", "fas fa-file-zipper", "ดาวน์โหลดเป็น ZIP")}
                <div className="pf-menu-sep" />
                {item("remove", "fas fa-trash", "ลบ", "danger")}
              </>
            ) : null}
          </>
        );
        // On a phone the menu is a bottom sheet: it rises from the edge rather than growing out of
        // a point, but it is driven by Motion the same way, so it never paints before it animates.
        if (m.sheet)
          return (
            <MorphSheet innerRef={menuEl} open={!menuClosing} className="pf-menu show sheet" onClick={onMenuClick} onKeyDown={onMenuKey}>
              {menuBody}
            </MorphSheet>
          );
        return (
          <MorphSurface
            innerRef={menuEl}
            open={!!m && !menuClosing}
            left={menuPos ? menuPos.left : null}
            top={menuPos ? menuPos.top : null}
            originX={m ? m.x : 0}
            originY={m ? m.y : 0}
            className="pf-menu show"
            onClick={onMenuClick}
            onKeyDown={onMenuKey}
          >
            {menuBody}
          </MorphSurface>
        );
      })()}
      {picker ? (
        <FolderPicker
          key={picker.key}
          opts={picker.opts}
          folders={api}
          onClose={(r) => {
            picker.resolve(r);
            setPicker((cur) => (cur === picker ? null : cur));
          }}
        />
      ) : null}
      {share ? <ShareDialog key={share.key} opts={share.opts} onClose={() => setShare(null)} onEdit={openShareEditor} /> : null}
      {editor ? <ShareEditor key={editor.key} share={editor.share} onSaved={editor.onSaved} onClose={() => setEditor(null)} /> : null}
    </Ctx.Provider>
  );
}

type RequestCloseEvent = React.TouchEvent | React.WheelEvent;

// ---- Gestures on a grid of album tiles: ⋮ button, right-click, long-press, keyboard ----
// The page keeps handling plain clicks (open); this adds the menu entry points.
export function useFolderGestures(
  ref: RefObject<HTMLElement | null>,
  opts: { selector: string; getAlbum: (id: string) => Album | undefined; onChanged?: OnChanged; onOpen?: (a: Album) => void; enabled?: boolean },
) {
  const folders = useFolders();
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });
  const enabled = opts.enabled !== false;

  useEffect(() => {
    const container = ref.current;
    if (!container || !enabled) return;
    let lp: { tile: HTMLElement; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
    let lastTouch = 0;
    const o = () => optsRef.current;
    const hitOf = (el: EventTarget | null) => {
      const tile = el && (el as Element).closest ? ((el as Element).closest(o().selector) as HTMLElement | null) : null;
      const album = tile && o().getAlbum(tile.dataset.id || "");
      return tile && album ? { tile, album } : null;
    };
    const cancel = () => {
      if (!lp) return;
      clearTimeout(lp.timer);
      lp.tile.classList.remove("pf-pressing");
      lp = null;
    };
    const onClickCapture = (e: MouseEvent) => {
      const more = (e.target as Element).closest("[data-more]");
      if (!more) return;
      const hit = hitOf(more);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      const r = more.getBoundingClientRect();
      folders.openMenu({ album: hit.album, x: r.right - 230, y: r.bottom + 6, onChanged: o().onChanged });
    };
    const onContext = (e: MouseEvent) => {
      const hit = hitOf(e.target);
      if (!hit) return;
      e.preventDefault();
      if (Date.now() - lastTouch < 900) return; // the long-press timer already owns touch gestures
      folders.openMenu({ album: hit.album, x: e.clientX, y: e.clientY, onChanged: o().onChanged });
    };
    const onTouchStart = (e: TouchEvent) => {
      lastTouch = Date.now();
      if (e.touches.length !== 1 || (e.target as Element).closest("[data-more]")) {
        cancel();
        return;
      }
      const hit = hitOf(e.target);
      if (!hit) return;
      const t = e.touches[0];
      cancel();
      hit.tile.classList.add("pf-pressing");
      const state = {
        tile: hit.tile,
        x: t.clientX,
        y: t.clientY,
        timer: setTimeout(() => {
          if (lp !== state) return;
          lp = null;
          state.tile.classList.remove("pf-pressing");
          folders.suppressClicks(700);
          try {
            navigator.vibrate?.(40);
          } catch {}
          folders.openMenu({ album: o().getAlbum(state.tile.dataset.id || ""), x: state.x, y: state.y, sheet: true, onChanged: o().onChanged, fromTouch: true });
        }, LONG_PRESS_MS),
      };
      lp = state;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!lp) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - lp.x, t.clientY - lp.y) > 10) cancel();
    };
    const onTouchEnd = () => {
      lastTouch = Date.now();
      cancel();
    };
    const onKey = (e: KeyboardEvent) => {
      const hit = hitOf(e.target);
      if (!hit || e.target !== hit.tile) return;
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const r = hit.tile.getBoundingClientRect();
        folders.openMenu({ album: hit.album, x: r.left + 24, y: r.top + 24, onChanged: o().onChanged });
      } else if ((e.key === "Enter" || e.key === " ") && o().onOpen) {
        e.preventDefault();
        o().onOpen!(hit.album);
      }
    };
    container.addEventListener("click", onClickCapture, true);
    container.addEventListener("contextmenu", onContext);
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", cancel, { passive: true });
    container.addEventListener("keydown", onKey);
    return () => {
      cancel();
      container.removeEventListener("click", onClickCapture, true);
      container.removeEventListener("contextmenu", onContext);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", cancel);
      container.removeEventListener("keydown", onKey);
    };
  }, [ref, folders, enabled]);
}

// Desktop only (mouse + hover): whether album tiles and photos can be dragged onto folders.
export function useCanDrag() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    // Media queries only exist in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCan(canDragWithMouse());
  }, []);
  return can;
}

// Album tiles in `ref` (rendered with draggable) start an album drag.
export function useAlbumDrag(ref: RefObject<HTMLElement | null>, opts: { selector: string; getAlbum: (id: string) => Album | undefined; enabled: boolean }) {
  const folders = useFolders();
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });
  useEffect(() => {
    const container = ref.current;
    if (!container || !opts.enabled) return;
    const onStart = (e: DragEvent) => {
      const tile = (e.target as Element).closest?.(optsRef.current.selector) as HTMLElement | null;
      if (!tile) return;
      const a = optsRef.current.getAlbum(tile.dataset.id || "");
      if (!a || !a.has_access) {
        e.preventDefault();
        return;
      }
      tile.classList.add("pf-dragging");
      folders.dnd.begin(e, { type: "albums", ids: [a.id], label: a.name, albums: [{ id: a.id, parent_id: a.parent_id || null }] });
    };
    container.addEventListener("dragstart", onStart);
    return () => container.removeEventListener("dragstart", onStart);
  }, [ref, folders, opts.enabled]);
}

// Elements matching `selector` in `ref` accept dropped albums/photos: { id (null = top level), name }.
export function useDropTargets(
  ref: RefObject<HTMLElement | null>,
  opts: { selector: string; targetOf: (el: HTMLElement) => { id: string | null; name: string } | null; onChanged?: OnChanged; enabled: boolean },
) {
  const folders = useFolders();
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });
  useEffect(() => {
    const container = ref.current;
    if (!container || !opts.enabled) return;
    const hitFor = (e: DragEvent) => {
      const p = dragPayload;
      if (!p) return null;
      const el = (e.target as Element).closest?.(optsRef.current.selector) as HTMLElement | null;
      if (!el || !container.contains(el)) return null;
      const t = optsRef.current.targetOf(el);
      if (!t) return null;
      if (!t.id && p.type !== "albums") return null; // photos always live inside an album
      if (p.type === "albums") {
        const list = folders.getAlbums();
        if (p.ids.some((id) => id === t.id || (t.id && list.length && tree.descendants(list, id).has(t.id)))) return null;
        if (p.albums && p.albums.every((a) => (a.parent_id || null) === (t.id || null))) return null;
      } else if (p.sourceAlbumId === t.id) return null;
      return { el, t };
    };
    const onOver = (e: DragEvent) => {
      const hit = hitFor(e);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = "move";
      container.querySelectorAll(".pf-drop-over").forEach((n) => {
        if (n !== hit.el) n.classList.remove("pf-drop-over");
      });
      hit.el.classList.add("pf-drop-over");
    };
    const onLeave = (e: DragEvent) => {
      const el = (e.target as Element).closest?.(optsRef.current.selector);
      if (el && !el.contains(e.relatedTarget as Node)) el.classList.remove("pf-drop-over");
    };
    const onDrop = (e: DragEvent) => {
      const hit = hitFor(e);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      const payload = dragPayload!;
      folders.dnd.end();
      folders.moveInto(payload, hit.t, optsRef.current.onChanged);
    };
    container.addEventListener("dragover", onOver);
    container.addEventListener("dragleave", onLeave);
    container.addEventListener("drop", onDrop);
    return () => {
      container.removeEventListener("dragover", onOver);
      container.removeEventListener("dragleave", onLeave);
      container.removeEventListener("drop", onDrop);
    };
  }, [ref, folders, opts.enabled]);
}
