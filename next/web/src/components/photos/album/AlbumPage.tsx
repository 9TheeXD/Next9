"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import type { Album } from "@/lib/photos/types";
import { pinnedFirst } from "@/lib/photos/tree";
import { getCookie, haptic, HAPTIC, lsGet, resBadgeLabel, hotkey } from "@/lib/photos/util";
import { navProgress } from "@/lib/navProgress";
import { useCollapsingHeader } from "@/lib/photos/collapsingHeader";
import { useSwipeNav } from "@/lib/photos/swipeNav";
import { useAppNavigate, usePrefetch } from "@/lib/useAppNavigate";
import { FolderTile } from "../folders/FolderTile";
import { FoldersProvider, useAlbumDrag, useCanDrag, useDropTargets, useFolderGestures, useFolders, type Change } from "../folders/FoldersProvider";
import { PageShell, useShellClasses } from "../ui/PageShell";
import { PhotosUIProvider, usePhotosUI } from "../ui/PhotosUI";
import { GridItem, type GridEnv } from "./GridItem";
import { GridSkel } from "./GridSkel";
import { UploadSlotTile } from "./UploadSlotTile";
import { Lightbox, type SheetAction } from "./Lightbox";
import { RenameDialog } from "./RenameDialog";
import { Kbd, PopupMenu } from "./PopupMenu";
import { MorphMenu, MorphMenuItem, MorphMenuSeparator } from "../ui/MorphMenu";
import { dayHeadLabel, imageDate, imageDayKey, KeyedStore, type AlbumInfo, type Crumb, type Mode, type Photo, type ShareInfo, type UploadOrder } from "./model";
import { useDownloads } from "./useDownloads";
import { useUploads } from "./useUploads";

type ViewMode = "grid" | "list";
type ViewSize = "s" | "m" | "l";
const VIEW_MODE_KEY = "photos_view_mode";
const VIEW_SIZE_KEY = "photos_view_size";
const VIEW_MODES: [ViewMode, string, string][] = [
  ["grid", "fas fa-table-cells-large", "แบบตาราง"],
  ["list", "fas fa-list", "แบบรายการ"],
];
const VIEW_SIZES: [ViewSize, string, string][] = [
  ["s", "S", "เล็ก"],
  ["m", "M", "กลาง"],
  ["l", "L", "ใหญ่"],
];

// /photos/album/ — one album (?id=), All Photos (?view=all) or a public share link (?share=). Native
// port of the legacy photos/album/index.html.

const SKEL_AHEAD = 30;
const GRACE_MS = 550; // longer than the 500 ms long-press, so the gesture that opens a menu never closes it
const DRAG_EDGE_PX = 70;
// What is NOT empty space on the album page, for box select and the background right-click menu:
// tiles, anything interactive, the header and the bars.
const NOT_EMPTY_SPACE =
  "a, button, input, textarea, select, label, summary, [role='button'], [contenteditable], .photos-grid-item, .photos-header, .album-tabbar, .bottom-bar, .day-head, .app-menu, .upload-summary, .pf-tile, .pf-cover, [data-no-marquee]";
const DRAG_MAX_SCROLL_PX_PER_SEC = 1400;
const CHK_HOLD_MS = 260;
const CHK_HOLD_SLOP_PX = 10;
const CONVERT_CHUNK_SIZE = 20;
const CONVERT_CHUNK_WORKERS = 2;
const CS_CATEGORY_ITEMS = [
  { v: "image", label: "รูปภาพ" },
  { v: "video", label: "วิดีโอ" },
];
const CS_EXT_ITEMS = [
  { v: "jpg", label: "JPG" },
  { v: "png", label: "PNG" },
  { v: "webp", label: "WEBP" },
  { v: "heic", label: "HEIC" },
  { v: "mp4", label: "MP4" },
  { v: "mov", label: "MOV" },
  { v: "webm", label: "WEBM" },
];
const CS_RES_ITEMS = ["SD", "HD", "HD+", "FHD", "4K", "5K", "8K"].map((v) => ({ v, label: v }));
const SHARE_ERRORS: Record<string, [string, string, string]> = {
  invalid: ["fas fa-link-slash", "ลิงก์นี้ใช้ไม่ได้", "ลิงก์อาจถูกยกเลิกแล้ว หรือคัดลอกมาไม่ครบ"],
  expired: ["fa-regular fa-clock", "ลิงก์นี้หมดอายุแล้ว", "ขอลิงก์ใหม่จากคนที่แชร์ให้คุณ"],
  gone: ["fas fa-folder-minus", "ไม่พบสิ่งที่แชร์", "ไฟล์หรือโฟลเดอร์นี้ถูกลบไปแล้ว"],
  scope: ["fas fa-ban", "เปิดส่วนนี้ไม่ได้", "ลิงก์นี้ไม่ได้แชร์โฟลเดอร์นี้"],
  network: ["fas fa-wifi", "เชื่อมต่อไม่สำเร็จ", "ตรวจสอบอินเทอร์เน็ต แล้วลองอีกครั้ง"],
};
const THAI_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const formatShortDate = (ts?: number | null) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getDate()} ${THAI_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
};

type PageData = { success?: boolean; deleted?: boolean; locked?: boolean; lock_gate_name?: string; album: AlbumInfo; images: Photo[]; total: number; hasMore: boolean; children?: Album[]; breadcrumb?: Crumb[] };
type ShareError = Error & { reason?: string };
type MenuOpen = { t: number; x: number; y: number } | null;


// The choices of the two filter menus, in the order the old <select>s listed them.
const SORT_IMG_LABEL: Record<string, string> = { latest: "ล่าสุด", oldest: "เก่าสุด" };
const DATE_FIELD_LABEL: Record<string, string> = { upload: "วันที่อัปโหลด", taken: "วันที่ถ่าย" };

export function AlbumPage({ mode }: { mode: Mode }) {
  return (
    <PageShell scope="lp-album">
      <PhotosUIProvider variant="album">
        <FoldersProvider>
          <AlbumView mode={mode} />
        </FoldersProvider>
      </PhotosUIProvider>
    </PageShell>
  );
}

// Shown while the route itself loads: the page's header and grid placeholders, never a blank screen.
export function AlbumFallback() {
  return (
    <PageShell scope="lp-album">
      <div className="photos-page" id="page">
        <header className="photos-header">
          <div className="photos-header-inner">
            <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, width: "100%" }}>
              <span className="photos-back-link">
                <i className="fas fa-arrow-left" />
              </span>
              <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                <div className="title-container">
                  <h1 id="aTitle">โหลด...</h1>
                </div>
                <p id="aMeta" />
              </div>
            </div>
          </div>
        </header>
        <div className="photos-content" style={{ paddingBottom: 80 }}>
          <div className="photos-grid">
            {Array.from({ length: 24 }, (_, i) => (
              <GridSkel key={i} />
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function AlbumView({ mode }: { mode: Mode }) {
  const ui = usePhotosUI();
  const folders = useFolders();
  const navigate = useAppNavigate();
  const prefetch = usePrefetch();
  const setShellClasses = useShellClasses();
  const canDrag = useCanDrag();

  const IS_SHARE = mode.kind === "share";
  const IS_ALL = mode.kind === "all";
  const SHARE_TOKEN = mode.kind === "share" ? mode.token : "";

  // ---------- identity & auth ----------
  const albumIdRef = useRef(mode.kind === "album" ? mode.id : mode.kind === "share" ? mode.albumId : "");
  const shareRootId = useRef<string | null>(null);
  const [shareRoot, setShareRoot] = useState<string | null>(null);
  const albumToken = useRef("");
  const auth = useRef("");

  // ---------- page state ----------
  const [title, setTitle] = useState("โหลด...");
  const [albumData, setAlbumData] = useState<AlbumInfo | null>(null);
  const albumDataRef = useRef<AlbumInfo | null>(null);
  const [albumIsLocked, setAlbumIsLocked] = useState(false);
  const albumIsLockedRef = useRef(false);
  const [lockScreen, setLockScreen] = useState<{ title: string } | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Crumb[]>([]);
  const [children, setChildren] = useState<Album[]>([]);
  const childrenRef = useRef<Album[]>([]);
  const [imgs, setImgsState] = useState<Photo[]>([]);
  const imgsRef = useRef<Photo[]>([]);
  const [total, setTotalState] = useState(0);
  const totalRef = useRef(0);
  const [more, setMoreState] = useState(false);
  const moreRef = useRef(false);
  const pageRef = useRef(1);
  const loading = useRef(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [processing, setProcessing] = useState(0);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  // A share link with edit permission (role 'editor'): uploads, delete to trash, rename, dates, covers and
  // new sub-folders inside what it shares. The server checks every such request (shareEditorCovers).
  const shareEdit = IS_SHARE && shareInfo?.role === "editor";
  const shareInfoRef = useRef<ShareInfo | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [allAlbumNames, setAllAlbumNames] = useState<Record<string, string>>({});
  const [allVideoCount, setAllVideoCount] = useState(0);
  const [dayTotals, setDayTotals] = useState<Record<string, number>>({});
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [sortImg, setSortImg] = useState("latest");
  const [dateField, setDateField] = useState("upload");
  const [filterMenu, setFilterMenu] = useState<"sort" | "date" | null>(null);
  const [filterMonth, setFilterMonth] = useState("");
  const filters = useRef({ sortImg: "latest", dateField: "upload", filterMonth: "" });
  // How files and folders are laid out, like a desktop file browser: tiles or a list, in three sizes.
  // Kept per browser.
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [viewSize, setViewSize] = useState<ViewSize>("m");
  useEffect(() => {
    const t = setTimeout(() => {
      const v = lsGet(VIEW_MODE_KEY);
      const z = lsGet(VIEW_SIZE_KEY);
      if (v === "grid" || v === "list") setViewMode(v);
      if (z === "s" || z === "m" || z === "l") setViewSize(z);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const pickView = (v: ViewMode) => {
    setViewMode(v);
    try {
      localStorage.setItem(VIEW_MODE_KEY, v);
    } catch {}
  };
  const pickSize = (z: ViewSize) => {
    setViewSize(z);
    try {
      localStorage.setItem(VIEW_SIZE_KEY, z);
    } catch {}
  };
  const viewCls = ` v-${viewMode} sz-${viewSize}`;
  const [hideFilters, setHideFilters] = useState(false);
  const [titleOverflow, setTitleOverflow] = useState(false);
  const [scrollTopShow, setScrollTopShow] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  // Whether the pointer is inside the drop box. Only that box accepts a drop; the rest of the page
  // turns red and refuses one.
  const [dropInside, setDropInside] = useState(false);
  const dropInsideRef = useRef(false);
  const setDropInsideOnce = useCallback((v: boolean) => {
    if (dropInsideRef.current === v) return;
    dropInsideRef.current = v;
    setDropInside(v);
  }, []);
  const allImagesMeta = useRef<Photo[] | null>(null);

  // Photo id -> the position the file had in the list the visitor picked. The grid is newest-first and
  // files upload in picked order, so the last file picked is the newest and leads: picking 1, 2, 3, 4
  // shows 4, 3, 2, 1 and then the album's older photos. That is the same order the server's own
  // newest-first listing gives after a reload, so nothing moves when the page is opened again. This map
  // holds that order fixed while the upload runs and refreshes come in, whatever order files finish in.
  // Kept for as long as the page lives.
  //
  // Keyed by UploadOrder, not by the tile's index in the upload queue. The index restarted at 0 with
  // every new upload, so a second upload's photos sorted in among the first one's (both had a "0", a
  // "1", ...), and a failed tile dropping out shifted every index after it.
  const uploadOrderRef = useRef(new Map<string, UploadOrder>());
  const setImgs = useCallback((list: Photo[]) => {
    const order = uploadOrderRef.current;
    let next = list;
    // Only on the default newest-first view: any other sort or a month filter is an order the visitor
    // asked for, and this must not fight it.
    if (order.size && filters.current.sortImg === "latest" && !filters.current.filterMonth) {
      const picked: Photo[] = [];
      const rest: Photo[] = [];
      for (const img of list) (order.has(img.id) ? picked : rest).push(img);
      if (picked.length) {
        // Newest first throughout: newest upload block first, and inside a block the last-picked file
        // first. seq never repeats, so the order is total.
        picked.sort((a, b) => {
          const x = order.get(a.id)!,
            y = order.get(b.id)!;
          return y.block - x.block || y.seq - x.seq;
        });
        next = picked.concat(rest);
      }
    }
    imgsRef.current = next;
    setImgsState(next);
  }, []);
  const setTotal = useCallback((n: number) => {
    totalRef.current = n;
    setTotalState(n);
  }, []);
  const setMore = useCallback((m: boolean) => {
    moreRef.current = m;
    setMoreState(m);
  }, []);

  // ---------- selection ----------
  const [selection] = useState(() => new KeyedStore<true>());
  const [quality] = useState(() => new KeyedStore<"sd" | "medium">());
  const [loadedThumbs] = useState(() => new Set<string>());
  const selCount = useSyncExternalStore(
    (l) => selection.subscribeAll(l),
    () => selection.size,
    () => 0,
  );
  const [selMode, setSelModeState] = useState(false);
  const selModeRef = useRef(false);
  // Selection anchor for Shift+click, and the range the last Shift+click applied from it (see the
  // selection rules further down).
  const lastClickedIdx = useRef<number | null>(null);
  const shiftRange = useRef<{ lo: number; hi: number; baseline: Set<string> } | null>(null);

  // ---------- menus & modals ----------
  const [lbIdx, setLbIdx] = useState(-1);
  const lbIdxRef = useRef(-1);
  // Which photo the viewer is actually showing, as opposed to where it happens to sit in the list.
  // The grid is newest-first, so a photo that finishes uploading while someone is looking at number
  // 22 is put at the front and every existing photo slides down one — leaving the viewer on the same
  // INDEX, which is now a different picture. The id is what the viewer follows; the index it is
  // given is re-derived from that id, DURING RENDER (see lbIdxLive).
  //
  // State, not a ref, and set in the same update as lbIdx: the index has to be corrected in the very
  // render that brings the new list in. Correcting it afterwards in an effect left one render where
  // the list was new and the index was still old, so the viewer was handed a different photo for a
  // moment — which it quite reasonably treated as opening a new picture, throwing away the zoom and
  // flashing the spinner before the correction arrived and it did the whole thing again.
  const [lbId, setLbId] = useState<string | null>(null);
  const lbIdRef = useRef<string | null>(null);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number; closing: boolean } | null>(null);
  const ctxTarget = useRef<string | null>(null);
  const [albumMenu, setAlbumMenu] = useState(false);
  // Right-click on empty space: the album's own actions at the pointer.
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const [sbMenu, setSbMenu] = useState(false);
  const menuOpened = useRef<{ ctx: MenuOpen; album: MenuOpen; sb: MenuOpen; bg: MenuOpen }>({ ctx: null, album: null, sb: null, bg: null });
  // Where the ☰ menu hangs from (its button), taken when it opens.
  const albumMenuAnchor = useRef<DOMRect | null>(null);
  // The button itself, so the menu can grow out of it in its colour and the button can lean towards
  // it as it opens (see PopupMenu).
  const albumMenuBtn = useRef<HTMLElement | null>(null);
  const ctxTouch = useRef({ startAt: 0, releasedAt: 0, menuShownAt: 0, fromTouch: false });
  const [convert, setConvert] = useState<{ target: string | null; sub: string } | null>(null);
  const [convertFmt, setConvertFmt] = useState("jpg");
  const [csOpen, setCsOpen] = useState(false);
  const [csAdv, setCsAdv] = useState(false);
  const [cs, setCs] = useState({ cat: new Set<string>(), ext: new Set<string>(), res: new Set<string>(), from: "", to: "", dateFrom: "", dateTo: "", mode: "replace" });
  const [lockPw, setLockPw] = useState("");
  const [lockRemember, setLockRemember] = useState(false);
  const [lockError, setLockError] = useState("");
  const [lockBusy, setLockBusy] = useState(false);
  const [lockShake, setLockShake] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useCollapsingHeader(headerRef, ".photos-back-link, #uploadBtn, #albumMenuBtn");
  const subGridRef = useRef<HTMLDivElement>(null);
  const crumbsRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleBoxRef = useRef<HTMLDivElement>(null);
  const titleTrackRef = useRef<HTMLSpanElement>(null);
  const fileInRef = useRef<HTMLInputElement>(null);
  const folderInRef = useRef<HTMLInputElement>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const tabbarRef = useRef<HTMLElement>(null);
  const lockPwRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useLayoutEffect(() => {
    filters.current = { sortImg, dateField, filterMonth };
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ---------- helpers ----------
  const imageUrl = useCallback(
    (id: string, variant: string, download?: boolean) => {
      const base = IS_SHARE ? "/api/share/" + encodeURIComponent(SHARE_TOKEN) + "/image/" + encodeURIComponent(id) + "/" + variant : "/api/image/" + id + "/" + variant;
      return download ? base + "?download=1" : base;
    },
    [IS_SHARE, SHARE_TOKEN],
  );
  const albumUrlForImage = (img: Photo) => (img && img.album_id ? "/photos/album/?id=" + encodeURIComponent(img.album_id) + "&img=" + encodeURIComponent(img.id) : "/photos/");
  const shareAlbumUrl = useCallback(
    (id: string) => "/photos/album/?share=" + encodeURIComponent(SHARE_TOKEN) + (id && id !== shareRoot ? "&a=" + encodeURIComponent(id) : ""),
    [SHARE_TOKEN, shareRoot],
  );
  const shareAllows = useCallback(
    (action: string) => {
      if (!IS_SHARE) return true;
      if (["select", "selectAll", "clearSelection", "customSelect", "slideshow"].includes(action)) return true;
      if (action === "download") return !!(shareInfoRef.current && shareInfoRef.current.allow_download);
      // Edit links: what the server lets them do (see shareEditorCovers in server.js): the album's contents.
      // Album-level settings (cover, date), moving and copying between albums, deleting albums, locks and
      // making links stay with the site password.
      const editor = shareInfoRef.current?.role === "editor";
      return editor && ["upload", "uploadFolder", "delete", "retry", "rename", "subfolder"].includes(action);
    },
    [IS_SHARE],
  );
  const authHeaders = useCallback((json?: boolean) => {
    const h: Record<string, string> = { Authorization: auth.current };
    if (json) h["Content-Type"] = "application/json";
    // On a share link the link itself is the credential (the server only honours it for edit links).
    if (IS_SHARE && SHARE_TOKEN) h["X-Share-Token"] = SHARE_TOKEN;
    if (albumToken.current) h["X-Album-Token"] = albumToken.current;
    return h;
  }, [IS_SHARE, SHARE_TOKEN]);

  const downloads = useDownloads({
    imageUrl,
    isShare: IS_SHARE,
    shareToken: SHARE_TOKEN,
    shareAllows,
    isAll: IS_ALL,
    albumId: () => albumIdRef.current,
    authHeaders: () => authHeaders(false),
    findMeta: (id) => imgsRef.current.find((i) => i.id === id) || allImagesMeta.current?.find((i) => i.id === id),
    albumName: () => albumDataRef.current?.name || "",
    toast: (m, t) => ui.toast(m, t),
    hideToast: ui.hideToast,
  });

  // ---------- uploads ----------
  // Set further down, once the refresh it points at exists.
  const softRefreshRef = useRef<() => Promise<void>>(async () => {});
  const uploads = useUploads({
    albumId: () => albumIdRef.current,
    authHeaders: () => authHeaders(false),
    toast: ui.toast,
    hideToast: ui.hideToast,
    recordOrder: (id, order) => uploadOrderRef.current.set(id, order),
    onProcessed: () => softRefreshRef.current(),
    onFinished: (other) => {
      softRefreshRef.current();
      if (other) refreshAlbumNav();
    },
    refreshNav: () => refreshAlbumNav(),
  });

  const hasActiveForegroundProcess = () => uploads.isActive() || downloads.isActive();
  const uploadsActiveRef = useRef(uploads.isActive);
  useEffect(() => {
    uploadsActiveRef.current = uploads.isActive;
  });

  // Moving away while an upload/download runs asks first (it would be cancelled).
  const leave = useCallback(
    async (href: string, opts?: { replace?: boolean }) => {
      if (!opts?.replace && hasActiveForegroundProcess()) {
        const uploading = uploads.isActive();
        const ok = await ui.confirm({
          title: uploading ? "กำลังอัปโหลด" : "กำลังดาวน์โหลด",
          confirmText: uploading ? "ออกจากหน้านี้ (ยกเลิกอัปโหลด)" : "ออกจากหน้านี้ (ยกเลิกดาวน์โหลด)",
          message: uploading
            ? "ระบบกำลังอัปโหลดไฟล์อยู่ คุณแน่ใจหรือไม่ว่าต้องการออกจากหน้านี้? (ไฟล์ที่ยังอัปโหลดไม่เสร็จจะถูกยกเลิก)"
            : "ระบบกำลังดาวน์โหลดไฟล์อยู่ คุณแน่ใจหรือไม่ว่าต้องการออกจากหน้านี้? (การดาวน์โหลดที่ยังไม่เสร็จจะถูกยกเลิก)",
          isDanger: true,
          icon: "fas fa-exclamation-triangle",
        });
        if (!ok) return;
        uploads.cancelUpload();
        downloads.cancel();
      }
      navigate(href, opts);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, ui],
  );

  // ---------- album token ----------
  const setAlbumToken = (token: string, remember?: boolean) => {
    albumToken.current = token;
    const albumId = albumIdRef.current;
    // The token may be for a locked album further up the tree: store it under that album's id too.
    const gateId = String(token || "").split(":")[0];
    if (remember && gateId && gateId !== albumId) {
      localStorage.setItem("album_token_" + gateId, token);
      document.cookie = "album_token_" + gateId + "=" + encodeURIComponent(token) + "; path=/; max-age=315360000; SameSite=Lax";
    }
    if (remember) localStorage.setItem("album_token_" + albumId, token);
    else {
      localStorage.removeItem("album_token_" + albumId);
      sessionStorage.removeItem("album_token_" + albumId);
    }
  };
  const clearAlbumToken = () => {
    albumToken.current = "";
    localStorage.removeItem("album_token_" + albumIdRef.current);
    sessionStorage.removeItem("album_token_" + albumIdRef.current);
  };

  // ---------- data loading ----------
  const filterParams = useCallback(() => {
    const f = filters.current;
    let p = "&sort=" + f.sortImg;
    if (IS_ALL) p += "&dateField=" + f.dateField;
    if (f.filterMonth) {
      const [y, mo] = f.filterMonth.split("-").map(Number);
      p += "&dateFrom=" + new Date(y, mo - 1, 1).getTime() + "&dateTo=" + new Date(y, mo, 0, 23, 59, 59, 999).getTime();
    }
    return p;
  }, [IS_ALL]);

  const shareFetch = useCallback(
    async (path: string) => {
      let res: Response,
        data: Record<string, unknown> | null = null;
      try {
        res = await fetch("/api/share/" + encodeURIComponent(SHARE_TOKEN) + path, { cache: "no-store", credentials: "omit" });
      } catch {
        const err: ShareError = new Error("network");
        err.reason = "network";
        throw err;
      }
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data || data.success === false) {
        const err: ShareError = new Error((data && (data.message as string)) || "share request failed");
        err.reason = (data && (data.reason as string)) || (res.status === 410 ? "expired" : res.status === 404 ? "invalid" : "network");
        throw err;
      }
      return data;
    },
    [SHARE_TOKEN],
  );

  const fetchPage = useCallback(
    async (pg: number): Promise<PageData> => {
      if (IS_SHARE) return (await shareFetch("/album/" + encodeURIComponent(albumIdRef.current) + "?page=" + pg + "&limit=50" + filterParams())) as unknown as PageData;
      if (IS_ALL) {
        const r = await fetch("/api/photos/timeline?page=" + pg + "&limit=50" + filterParams(), { headers: { Authorization: auth.current }, credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error();
        const d = await r.json();
        setAllAlbumNames((cur) => ({ ...cur, ...(d.albums || {}) }));
        if (d.videos !== undefined) setAllVideoCount(d.videos);
        if (d.days) setDayTotals(Object.fromEntries(d.days.map((r: { d: string; n: number }) => [r.d, r.n])));
        return { success: true, album: { id: null, name: "รูปภาพทั้งหมด", custom_cover_id: null }, images: d.images || [], total: d.total || 0, hasMore: !!d.hasMore, children: [], breadcrumb: [] };
      }
      const headers: Record<string, string> = {};
      if (albumToken.current) headers["X-Album-Token"] = albumToken.current;
      const r = await fetch("/api/photos/albums/" + albumIdRef.current + "/images?page=" + pg + "&limit=50" + filterParams(), { headers, credentials: "include" });
      if (!r.ok) {
        if (r.status === 404) {
          navigate("/photos/", { replace: true });
          return { deleted: true, images: [], total: 0, hasMore: false, album: { id: null, name: "" } };
        }
        throw new Error();
      }
      return r.json();
    },
    [IS_SHARE, IS_ALL, shareFetch, filterParams, navigate],
  );

  const renderAlbumNav = useCallback(
    (bc: Crumb[] | null, kids: Album[] | null) => {
      if (bc) setBreadcrumb(bc);
      if (kids) {
        childrenRef.current = kids;
        setChildren(kids);
      }
      // Tell nav-motion.js how deep this album and its neighbours are, so moving to a sub-folder slides
      // in from the right and moving to a parent slides back. Share links key albums per token.
      if (window.navMotion?.rememberAlbums && !IS_ALL && (bc || kids)) {
        const key = (id: string) => (IS_SHARE && id === shareRootId.current ? "" : id);
        window.navMotion.rememberAlbums(
          (bc || []).map((b) => ({ id: key(b.id) })),
          key(albumIdRef.current),
          (kids || childrenRef.current).map((c) => ({ id: key(c.id) })),
          IS_SHARE ? "share:" + SHARE_TOKEN + ":" : "",
        );
      }
    },
    [IS_ALL, IS_SHARE, SHARE_TOKEN],
  );

  const refreshAlbumNav = useCallback(async () => {
    if (IS_SHARE || IS_ALL) return;
    try {
      const r = await fetch("/api/photos/albums/" + albumIdRef.current + "/images?page=1&limit=1", { headers: authHeaders(false), credentials: "include" });
      const d = await r.json();
      if (d && !d.locked && d.album) {
        renderAlbumNav(d.breadcrumb || [], d.children || []);
        if (d.album.name) {
          setTitle(d.album.name);
          document.title = d.album.name + " - NEXT9";
        }
      }
    } catch {}
  }, [IS_SHARE, IS_ALL, authHeaders, renderAlbumNav]);

  const loadPg = useCallback(
    async (pg: number, reset: boolean) => {
      if (loading.current) return;
      loading.current = true;
      try {
        const d = await fetchPage(pg);
        if (d.deleted || !alive.current) return;
        if (reset) {
          setImgs(d.images);
          setTotal(d.total);
        } else {
          const existing = new Set(imgsRef.current.map((i) => i.id));
          setImgs(imgsRef.current.concat(d.images.filter((i) => !existing.has(i.id))));
        }
        setMore(d.hasMore);
        pageRef.current = pg;
      } finally {
        loading.current = false;
      }
    },
    [fetchPage, setImgs, setTotal, setMore],
  );
  const loadNext = useCallback(async () => {
    if (moreRef.current) await loadPg(pageRef.current + 1, false);
  }, [loadPg]);

  // Page forward until the photo at this index is loaded. The viewer needs it to wrap: an album of
  // 227 photos shows "1 / 227" from the first page, so pressing back from the first photo has to
  // reach the 227th even though only the first hundred have been fetched.
  const ensureIndex = useCallback(
    async (i: number) => {
      for (let guard = 0; guard < 80; guard++) {
        if (i < imgsRef.current.length) return true;
        if (!moreRef.current) return false;
        // loadPg refuses to start while another page is in flight; give that one a moment rather
        // than spinning through the guard count.
        if (loading.current) await new Promise((r) => setTimeout(r, 120));
        else await loadNext();
      }
      return i < imgsRef.current.length;
    },
    [loadNext],
  );

  const resetLoad = useCallback(() => {
    pageRef.current = 1;
    setImgs([]);
    setTotal(0);
    loadedThumbs.clear();
    loadPg(1, true);
  }, [loadPg, setImgs, setTotal, loadedThumbs]);

  // ---------- init ----------
  const openDeepLinkedImage = useCallback(async () => {
    // ?img=<id> opens that file's viewer, paging forward until it shows up.
    const wanted = new URLSearchParams(location.search).get("img");
    if (!wanted) return;
    for (let guard = 0; guard < 40; guard++) {
      const idx = imgsRef.current.findIndex((i) => i.id === wanted);
      if (idx >= 0) {
        lbIdxRef.current = idx;
        lbIdRef.current = wanted;
        setLbId(wanted);
        setLbIdx(idx);
        return;
      }
      if (!moreRef.current) return;
      await loadPg(pageRef.current + 1, false);
    }
  }, [loadPg]);

  const init = useCallback(async () => {
    if (IS_SHARE) {
      loading.current = true;
      try {
        if (!/^[A-Za-z0-9_-]{8,40}$/.test(SHARE_TOKEN)) {
          setShareError("invalid");
          return;
        }
        const info = (await shareFetch("")) as unknown as ShareInfo;
        shareInfoRef.current = info;
        setShareInfo(info);
        if (info.kind === "image") {
          const im = info.image || ({} as Photo);
          const img: Photo = { ...im, original_name: im.original_name || im.name || "", processing_status: "done" };
          albumIdRef.current = img.album_id || "";
          const data = { id: null, name: img.original_name || "", custom_cover_id: null };
          albumDataRef.current = data;
          setAlbumData(data);
          setTitle(data.name);
          document.title = data.name + " - NEXT9";
          renderAlbumNav([], []);
          setHideFilters(true);
          setTotal(1);
          setImgs([img]);
          setMore(false);
          pageRef.current = 1;
          lbIdxRef.current = 0;
          lbIdRef.current = img.id;
          setLbId(img.id);
          setLbIdx(0);
          return;
        }
        shareRootId.current = info.album!.id;
        setShareRoot(info.album!.id);
        if (!albumIdRef.current) albumIdRef.current = shareRootId.current;
        const d = await fetchPage(1);
        albumDataRef.current = d.album;
        setAlbumData(d.album);
        renderAlbumNav(d.breadcrumb || [], d.children || []);
        setTitle(d.album.name);
        document.title = d.album.name + " - NEXT9";
        setTotal(d.total);
        setImgs(d.images);
        setMore(d.hasMore);
        pageRef.current = 1;
      } catch (e) {
        console.error("[share]", e);
        setShareError((e as ShareError).reason || "network");
      } finally {
        loading.current = false;
        setInitialLoading(false);
      }
      return;
    }

    auth.current = getCookie("photos_token") || lsGet("photos_token") || "";
    if (IS_ALL) {
      if (!auth.current) {
        navigate("/photos/?tab=photos", { replace: true });
        return;
      }
      loading.current = true;
      try {
        try {
          const saved = localStorage.getItem("photos_date_field");
          if (saved === "taken" || saved === "upload") {
            filters.current.dateField = saved;
            setDateField(saved);
          }
        } catch {}
        setTitle("รูปภาพทั้งหมด");
        document.title = "รูปภาพทั้งหมด - NEXT9";
        const d = await fetchPage(1);
        albumDataRef.current = d.album;
        setAlbumData(d.album);
        renderAlbumNav([], []);
        setTotal(d.total);
        setImgs(d.images);
        setMore(d.hasMore);
        pageRef.current = 1;
        loading.current = false;
        setInitialLoading(false);
        await openDeepLinkedImage();
      } catch (e) {
        console.error("[all]", e);
        ui.toast("โหลดรูปไม่สำเร็จ", "error");
      } finally {
        loading.current = false;
        setInitialLoading(false);
      }
      return;
    }

    const albumId = albumIdRef.current;
    if (!albumId) {
      navigate("/photos/", { replace: true });
      return;
    }
    if (!auth.current) {
      navigate("/photos/?to=" + encodeURIComponent(albumId), { replace: true });
      return;
    }
    albumToken.current = lsGet("album_token_" + albumId) || albumToken.current || "";
    try {
      loading.current = true;
      // Auto-login if a cookie holds the saved album password.
      const savedPass = getCookie("album_pass_" + albumId);
      if (savedPass && !albumToken.current) {
        try {
          const vr = await fetch("/api/photos/albums/" + albumId + "/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: savedPass }) });
          const vd = await vr.json();
          if (vd.success && vd.token) setAlbumToken(vd.token);
        } catch {}
      }
      const d = await fetchPage(1);
      if (!alive.current) return;
      if (d.deleted || (d.album && d.album.name.startsWith("[DELETED] "))) {
        navigate("/photos/", { replace: true });
        return;
      }
      if (d.locked) {
        albumIsLockedRef.current = true;
        setAlbumIsLocked(true);
        setTitle(d.album.name);
        document.title = d.album.name + " - NEXT9";
        setImgs([]);
        setLockScreen({ title: d.lock_gate_name ? d.album.name + ' (อยู่ใน "' + d.lock_gate_name + '" ที่ถูกล็อก)' : d.album.name });
        return;
      }
      albumDataRef.current = d.album;
      setAlbumData(d.album);
      albumIsLockedRef.current = !!d.album.is_locked;
      setAlbumIsLocked(!!d.album.is_locked);
      renderAlbumNav(d.breadcrumb || [], d.children || []);
      setTitle(d.album.name);
      document.title = d.album.name + " - NEXT9";
      setTotal(d.total);
      setImgs(d.images);
      setMore(d.hasMore);
      pageRef.current = 1;
      setLockScreen(null);
      if (new URLSearchParams(location.search).get("download") === "zip") {
        const u = new URL(location.href);
        u.searchParams.delete("download");
        history.replaceState(history.state, "", u.pathname + u.search + u.hash);
        downloads.openQuality("tree:" + albumId);
      }
      loading.current = false;
      setInitialLoading(false);
      await openDeepLinkedImage();
    } catch {
      navigate("/photos/", { replace: true });
    } finally {
      loading.current = false;
      setInitialLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [IS_SHARE, IS_ALL, SHARE_TOKEN]);

  useEffect(() => {
    // Loads the album when the page mounts; state updates arrive asynchronously.
     
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- page-state classes ----------
  useLayoutEffect(() => {
    const cls = [
      IS_ALL && "all-mode",
      selMode && "sel-mode",
      IS_SHARE && "share-mode",
      IS_SHARE && shareInfo && !shareInfo.allow_download && "share-no-dl",
      shareEdit && "share-edit",
    ]
      .filter(Boolean)
      .join(" ");
    setShellClasses(cls);
  }, [IS_ALL, IS_SHARE, selMode, shareInfo, shareEdit, setShellClasses]);

  // ---------- title overflow ----------
  useLayoutEffect(() => {
    const check = () => {
      const t = titleRef.current;
      if (t) setTitleOverflow(t.scrollWidth > t.clientWidth);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [title]);

  // A title too long for the header scrolls through, on a loop:
  //   hold 2s at the start → drift left until the last letter has left the left edge → come back in
  //   from the right to the start → hold 3s → again.
  // While hovered the holds are skipped and it keeps moving. The left fade (.title-scrolled) is on
  // only while the text is off its starting point. It is WAAPI on a transform, so it runs on the
  // compositor and costs nothing per frame on the main thread.
  useEffect(() => {
    const box = titleBoxRef.current;
    const h1 = titleRef.current;
    const track = titleTrackRef.current;
    if (!titleOverflow || !box || !h1 || !track) return;
    let stopped = false;
    let hovered = false;
    let cutHold: (() => void) | null = null;
    let anim: Animation | null = null;
    const hold = (ms: number) =>
      new Promise<void>((resolve) => {
        if (hovered) return resolve();
        const done = () => {
          cutHold = null;
          resolve();
        };
        const t = setTimeout(done, ms);
        cutHold = () => {
          clearTimeout(t);
          done();
        };
      });
    const play = async (from: number, to: number, ms: number, easing: string) => {
      anim = track.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: ms, easing, fill: "forwards" });
      await anim.finished;
    };
    const onEnter = () => {
      hovered = true;
      cutHold?.();
    };
    const onLeave = () => {
      hovered = false;
    };
    box.addEventListener("mouseenter", onEnter);
    box.addEventListener("mouseleave", onLeave);
    (async () => {
      try {
        while (!stopped) {
          await hold(2000);
          if (stopped) break;
          const text = track.scrollWidth;
          const room = h1.clientWidth;
          box.classList.add("title-scrolled");
          await play(0, -text, (text / 45) * 1000, "linear");
          if (stopped) break;
          await play(room, 0, Math.min(1600, Math.max(600, (room / 110) * 1000)), "cubic-bezier(0.22, 1, 0.36, 1)");
          box.classList.remove("title-scrolled");
          if (stopped) break;
          await hold(3000);
        }
      } catch {
        // Cancelled by the cleanup below.
      }
    })();
    return () => {
      stopped = true;
      cutHold?.();
      anim?.cancel();
      box.removeEventListener("mouseenter", onEnter);
      box.removeEventListener("mouseleave", onLeave);
      box.classList.remove("title-scrolled");
    };
  }, [titleOverflow, title]);

  // ---------- selection ----------
  const setSelMode = (on: boolean) => {
    selModeRef.current = on;
    setSelModeState(on);
  };
  const toggleSelect = useCallback(() => {
    setSelMode(!selModeRef.current);
    selection.clear();
    // A cleared selection has no anchor or range to extend.
    lastClickedIdx.current = null;
    shiftRange.current = null;
  }, [selection]);
  const toggleSel = useCallback(
    (id: string) => {
      if (selection.has(id)) selection.delete(id);
      else selection.set(id, true);
    },
    [selection],
  );
  const setItemSelected = useCallback(
    (i: number, want: boolean) => {
      const img = imgsRef.current[i];
      if (!img) return;
      if (want) selection.set(img.id, true);
      else selection.delete(img.id);
    },
    [selection],
  );

  // All images in the album matching the current sort/month filter, with the fields needed for
  // extension/resolution/date/position filtering.
  const fetchAllAlbumImages = useCallback(async (): Promise<Photo[] | null> => {
    const f = filters.current;
    if (IS_SHARE) {
      if (shareInfoRef.current && shareInfoRef.current.kind === "image") return imgsRef.current.slice();
      const d = await shareFetch("/album/" + encodeURIComponent(albumIdRef.current) + "/all");
      let list = (d.images as Photo[]) || [];
      if (f.filterMonth) {
        const [yy, mm] = f.filterMonth.split("-").map(Number);
        const from = new Date(yy, mm - 1, 1).getTime(),
          to = new Date(yy, mm, 0, 23, 59, 59, 999).getTime();
        list = list.filter((i) => i.created_at >= from && i.created_at <= to);
      }
      list = list.slice().sort((a, b) => (f.sortImg === "oldest" ? a.created_at - b.created_at : b.created_at - a.created_at));
      allImagesMeta.current = list;
      return list;
    }
    if (IS_ALL) {
      const r = await fetch("/api/photos/timeline?all=1" + filterParams(), { headers: { Authorization: auth.current }, credentials: "include", cache: "no-store" });
      const d = await r.json();
      if (!d.success) return null;
      setAllAlbumNames((cur) => ({ ...cur, ...(d.albums || {}) }));
      let list: Photo[] = d.images || [];
      if (f.sortImg === "oldest") list = list.slice().sort((a, b) => a.created_at - b.created_at);
      allImagesMeta.current = list;
      return list;
    }
    let q = "?sort=" + f.sortImg;
    if (f.filterMonth) {
      const [yy, mm] = f.filterMonth.split("-");
      const y = parseInt(yy),
        mon = parseInt(mm) - 1;
      q += "&dateFrom=" + new Date(y, mon, 1).getTime() + "&dateTo=" + new Date(y, mon + 1, 0, 23, 59, 59).getTime();
    }
    const headers: Record<string, string> = {};
    if (auth.current) headers.Authorization = auth.current;
    if (albumToken.current) headers["X-Album-Token"] = albumToken.current;
    const r = await fetch("/api/photos/albums/" + albumIdRef.current + "/all-images" + q, { headers });
    const d = await r.json();
    if (d.success && d.images) allImagesMeta.current = d.images;
    return d.success ? d.images : null;
  }, [IS_SHARE, IS_ALL, shareFetch, filterParams]);

  const selAll = async () => {
    if (selection.size === totalRef.current && totalRef.current > 0) {
      selection.clear();
      return;
    }
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> กำลังเลือกทั้งหมด...
      </>,
      "success",
      true,
    );
    try {
      const images = await fetchAllAlbumImages();
      if (images) {
        images.forEach((i) => selection.set(i.id, true));
        ui.hideToast();
      } else ui.toast("ไม่สามารถเลือกรูปทั้งหมดได้", "error");
    } catch {
      ui.toast("ไม่สามารถเลือกรูปทั้งหมดได้", "error");
    }
  };

  // ---------- drag-to-select (checkmark swipe) ----------
  // Range model: every item between startIdx and curIdx takes `value`; items that leave the range
  // when the finger reverses revert to their pre-drag state.
  const dragSel = useRef<{ pointerId: number; startIdx: number; curIdx: number; value: boolean; baseline: Set<string>; x: number; y: number; lastTs: number; scrollAcc: number; raf: number } | null>(null);
  const chkHold = useRef<{ pointerId: number; startX: number; startY: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const chkGestureEndAt = useRef(0);

  const updateDragRange = useCallback(() => {
    const ds = dragSel.current;
    const grid = gridRef.current;
    if (!ds || !grid) return;
    const gr = grid.getBoundingClientRect();
    // Clamp X into the grid so a finger drifting into the side margin keeps tracking its row.
    const x = Math.min(Math.max(ds.x, gr.left + 2), gr.right - 2);
    const hit = document.elementFromPoint(x, ds.y);
    const item = hit && (hit.closest(".photos-grid-item") as HTMLElement | null);
    if (!item) return;
    const idx = parseInt(item.dataset.idx || "");
    if (isNaN(idx) || idx === ds.curIdx) return;
    const oldLo = Math.min(ds.startIdx, ds.curIdx),
      oldHi = Math.max(ds.startIdx, ds.curIdx);
    const newLo = Math.min(ds.startIdx, idx),
      newHi = Math.max(ds.startIdx, idx);
    for (let i = Math.min(oldLo, newLo), end = Math.max(oldHi, newHi); i <= end; i++) {
      const inNew = i >= newLo && i <= newHi;
      const inOld = i >= oldLo && i <= oldHi;
      if (inNew && !inOld) setItemSelected(i, ds.value);
      else if (!inNew && inOld) setItemSelected(i, !!imgsRef.current[i] && ds.baseline.has(imgsRef.current[i].id));
    }
    ds.curIdx = idx;
    haptic(HAPTIC.tick);
  }, [setItemSelected]);

  const dragAutoScrollTick = useCallback(
    function tick(ts: number) {
      const ds = dragSel.current;
      if (!ds) return;
      const dt = ds.lastTs ? Math.min(ts - ds.lastTs, 50) : 0;
      ds.lastTs = ts;
      const hdr = document.querySelector(".lp-album .photos-header");
      const topBound = hdr ? Math.max(0, hdr.getBoundingClientRect().bottom) : 0;
      const bar = bottomBarRef.current;
      const bottomBound = bar && bar.classList.contains("show") ? bar.getBoundingClientRect().top : window.innerHeight;
      let t = 0;
      if (ds.y < topBound + DRAG_EDGE_PX) t = -Math.min(1, (topBound + DRAG_EDGE_PX - ds.y) / DRAG_EDGE_PX);
      else if (ds.y > bottomBound - DRAG_EDGE_PX) t = Math.min(1, (ds.y - (bottomBound - DRAG_EDGE_PX)) / DRAG_EDGE_PX);
      if (t && dt) {
        // Eased so the zone's inner edge creeps and the screen edge runs fast; dt keeps 60/120 Hz equal.
        ds.scrollAcc += (Math.sign(t) * t * t * DRAG_MAX_SCROLL_PX_PER_SEC * dt) / 1000;
        const step = Math.trunc(ds.scrollAcc);
        if (step) {
          ds.scrollAcc -= step;
          const before = window.scrollY;
          window.scrollBy(0, step);
          if (window.scrollY !== before) updateDragRange();
        }
      } else ds.scrollAcc = 0;
      ds.raf = requestAnimationFrame(tick);
    },
    [updateDragRange],
  );

  const activateDragSelect = useCallback(
    (idx: number, id: string, pointerId: number, x: number, y: number) => {
      if (!selModeRef.current) toggleSelect();
      dragSel.current = { pointerId, startIdx: idx, curIdx: idx, value: !selection.has(id), baseline: new Set(selection.keys()), x, y, lastTs: 0, scrollAcc: 0, raf: 0 };
      setItemSelected(idx, dragSel.current.value);
      lastClickedIdx.current = idx;
      shiftRange.current = null;
      haptic(HAPTIC.hold);
      // Capture on the grid: the start tile can unmount mid-drag, which would drop its capture.
      try {
        gridRef.current?.setPointerCapture(pointerId);
      } catch {}
      dragSel.current.raf = requestAnimationFrame(dragAutoScrollTick);
    },
    [selection, setItemSelected, toggleSelect, dragAutoScrollTick],
  );

  // Hold a finger still on a tile (its checkmark, or the picture itself in selection mode) and
  // drag-select arms. Any real movement before the timer cancels it, so scrolling past a tile never
  // selects anything.
  const beginTouchHold = useCallback(
    (e: PointerEvent, idx: number, id: string) => {
      chkHold.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        timer: setTimeout(() => {
          const cur = chkHold.current;
          chkHold.current = null;
          if (cur) activateDragSelect(idx, id, cur.pointerId, cur.startX, cur.startY);
        }, CHK_HOLD_MS),
      };
    },
    [activateDragSelect],
  );

  useEffect(() => {
    const cancelChkHold = () => {
      if (!chkHold.current) return;
      clearTimeout(chkHold.current.timer);
      chkHold.current = null;
    };
    const onMove = (e: globalThis.PointerEvent) => {
      const h = chkHold.current;
      if (h && e.pointerId === h.pointerId) {
        if (Math.hypot(e.clientX - h.startX, e.clientY - h.startY) > CHK_HOLD_SLOP_PX) cancelChkHold();
        return;
      }
      const ds = dragSel.current;
      if (!ds || e.pointerId !== ds.pointerId) return;
      ds.x = e.clientX;
      ds.y = e.clientY;
      updateDragRange();
    };
    const endDrag = (e?: globalThis.PointerEvent | FocusEvent) => {
      const pid = e && "pointerId" in e ? e.pointerId : undefined;
      if (chkHold.current && (pid === undefined || pid === chkHold.current.pointerId)) cancelChkHold();
      const ds = dragSel.current;
      if (!ds || (pid !== undefined && pid !== ds.pointerId)) return;
      cancelAnimationFrame(ds.raf);
      try {
        gridRef.current?.releasePointerCapture(ds.pointerId);
      } catch {}
      dragSel.current = null;
      chkGestureEndAt.current = Date.now();
    };
    const onBlur = () => endDrag();
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", endDrag);
      document.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", onBlur);
      cancelChkHold();
      if (dragSel.current) cancelAnimationFrame(dragSel.current.raf);
    };
  }, [updateDragRange]);

  // Once drag-select is armed the finger drives the selection instead of the page, which needs a
  // touchmove listener that can cancel the scroll. That listener used to sit on the document for the
  // whole life of the page, and a non-passive touch listener anywhere under a finger makes the
  // browser wait for the main thread before every scroll frame: on a phone busy decoding
  // thumbnails, all scrolling on the album page stuttered. It is now only where a hold can start —
  // the checkmarks (see GridItem), and the whole grid only while selection mode is on.
  useEffect(() => {
    const grid = gridRef.current;
    if (!selMode || !grid) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragSel.current && e.cancelable) e.preventDefault();
    };
    grid.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => grid.removeEventListener("touchmove", onTouchMove);
  }, [selMode]);

  // ---------- box select (mouse) ----------
  // Pressing on empty space in the album (between or around the tiles, never on a tile, which would
  // start a drag to a folder) and dragging draws a box; every tile it touches is selected. Tiles
  // already selected stay selected; with Ctrl/Cmd held the box toggles instead. Tiles the box leaves
  // again go back to how they were, so a box can be pulled back. The page scrolls when the pointer
  // nears the top or bottom, and the box keeps its start point in page coordinates while it does.
  const marquee = useRef<{
    pointerId: number;
    startX: number; // page coordinates
    startY: number;
    x: number; // client coordinates of the pointer
    y: number;
    toggle: boolean;
    active: boolean;
    baseline: Set<string>;
    inBox: Set<number>;
    tiles: { idx: number; l: number; t: number; r: number; b: number }[];
    tileCount: number;
    box: HTMLDivElement | null;
    raf: number;
    lastTs: number;
    scrollAcc: number;
  } | null>(null);

  useEffect(() => {
    // Tile rectangles in page coordinates, measured once per change in the number of tiles (more load
    // in while scrolling) rather than on every pointer move.
    const measure = (m: NonNullable<typeof marquee.current>) => {
      const grid = gridRef.current;
      if (!grid) return;
      const els = grid.querySelectorAll<HTMLElement>(".photos-grid-item[data-idx]");
      if (els.length === m.tileCount) return;
      m.tileCount = els.length;
      m.tiles = [];
      els.forEach((el) => {
        if (el.hidden) return;
        const r = el.getBoundingClientRect();
        m.tiles.push({ idx: Number(el.dataset.idx), l: r.left + window.scrollX, t: r.top + window.scrollY, r: r.right + window.scrollX, b: r.bottom + window.scrollY });
      });
    };
    const update = () => {
      const m = marquee.current;
      if (!m) return;
      const px = m.x + window.scrollX,
        py = m.y + window.scrollY;
      if (!m.active) {
        if (Math.hypot(px - m.startX, py - m.startY) < 6) return;
        m.active = true;
        m.box = document.createElement("div");
        m.box.className = "marquee-box";
        document.body.appendChild(m.box);
        document.documentElement.classList.add("marquee-active");
      }
      measure(m);
      const l = Math.min(px, m.startX),
        r = Math.max(px, m.startX),
        t = Math.min(py, m.startY),
        b = Math.max(py, m.startY);
      const box = m.box!;
      box.style.left = l - window.scrollX + "px";
      box.style.top = t - window.scrollY + "px";
      box.style.width = r - l + "px";
      box.style.height = b - t + "px";
      const now = new Set<number>();
      for (const tile of m.tiles) if (tile.l < r && tile.r > l && tile.t < b && tile.b > t) now.add(tile.idx);
      const changed: [number, boolean][] = [];
      now.forEach((i) => {
        if (m.inBox.has(i)) return;
        const id = imgsRef.current[i]?.id;
        changed.push([i, m.toggle ? !(id && m.baseline.has(id)) : true]);
      });
      m.inBox.forEach((i) => {
        if (now.has(i)) return;
        const id = imgsRef.current[i]?.id;
        changed.push([i, !!id && m.baseline.has(id)]);
      });
      m.inBox = now;
      if (!changed.length) return;
      if (!selModeRef.current) toggleSelect();
      for (const [i, want] of changed) setItemSelected(i, want);
      haptic(HAPTIC.tick);
    };
    const tick = (ts: number) => {
      const m = marquee.current;
      if (!m) return;
      const dt = m.lastTs ? Math.min(ts - m.lastTs, 50) : 0;
      m.lastTs = ts;
      if (m.active) {
        const hdr = document.querySelector(".lp-album .photos-header");
        const topBound = hdr ? Math.max(0, hdr.getBoundingClientRect().bottom) : 0;
        const bar = bottomBarRef.current;
        const bottomBound = bar && bar.classList.contains("show") ? bar.getBoundingClientRect().top : window.innerHeight;
        let k = 0;
        if (m.y < topBound + DRAG_EDGE_PX) k = -Math.min(1, (topBound + DRAG_EDGE_PX - m.y) / DRAG_EDGE_PX);
        else if (m.y > bottomBound - DRAG_EDGE_PX) k = Math.min(1, (m.y - (bottomBound - DRAG_EDGE_PX)) / DRAG_EDGE_PX);
        if (k && dt) {
          m.scrollAcc += (Math.sign(k) * k * k * DRAG_MAX_SCROLL_PX_PER_SEC * dt) / 1000;
          const step = Math.trunc(m.scrollAcc);
          if (step) {
            m.scrollAcc -= step;
            const before = window.scrollY;
            window.scrollBy(0, step);
            if (window.scrollY !== before) update();
          }
        } else m.scrollAcc = 0;
      }
      m.raf = requestAnimationFrame(tick);
    };
    const onDown = (e: globalThis.PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || marquee.current || dragSel.current) return;
      const target = e.target as Element;
      if (!target.closest?.("#page") || target.closest(NOT_EMPTY_SPACE)) return;
      if (lbIdxRef.current >= 0) return;
      // No text selection while drawing the box.
      e.preventDefault();
      marquee.current = {
        pointerId: e.pointerId,
        startX: e.pageX,
        startY: e.pageY,
        x: e.clientX,
        y: e.clientY,
        toggle: e.ctrlKey || e.metaKey,
        active: false,
        baseline: new Set(selection.keys()),
        inBox: new Set(),
        tiles: [],
        tileCount: -1,
        box: null,
        raf: 0,
        lastTs: 0,
        scrollAcc: 0,
      };
      marquee.current.raf = requestAnimationFrame(tick);
    };
    const onMove = (e: globalThis.PointerEvent) => {
      const m = marquee.current;
      if (!m || e.pointerId !== m.pointerId) return;
      m.x = e.clientX;
      m.y = e.clientY;
      update();
    };
    const end = (e?: globalThis.PointerEvent | FocusEvent) => {
      const m = marquee.current;
      if (!m || (e && "pointerId" in e && e.pointerId !== m.pointerId)) return;
      cancelAnimationFrame(m.raf);
      m.box?.remove();
      document.documentElement.classList.remove("marquee-active");
      // The click that follows a box must not open or toggle anything.
      if (m.active) {
        chkGestureEndAt.current = Date.now();
        shiftRange.current = null;
      }
      marquee.current = null;
    };
    const onBlur = () => end();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", onBlur);
      end();
    };
  }, [selection, setItemSelected, toggleSelect]);

  // ---------- swipe navigation (touch) ----------
  // Edge swipe (from the left edge, moving right) goes one level up: this album's parent, or the
  // album list (the same place as the header's back arrow; nothing at the root of a shared link).
  // On All Photos a swipe right switches to the อัลบั้ม tab, through its link so the tab indicator
  // slides as on a tap. The viewer handles its own swipes (Lightbox), and an open viewer, menu or
  // dialog, or a drag-select in progress, turns these off.
  useSwipeNav({
    enabled: () => lbIdxRef.current < 0 && !dragSel.current && !chkHold.current,
    onBack: () => {
      const href = backHref();
      if (href) leave(href);
    },
    onSwipeRight: IS_ALL ? () => tabbarRef.current?.querySelector<HTMLAnchorElement>('a[data-tab-item]')?.click() : undefined,
  });

  // ---------- keyboard: ESC and Ctrl/Cmd+A ----------
  // Select everything in the album view (every photo matching the current sort/filter, not only the
  // ones loaded so far). Unlike the menu's "เลือกทั้งหมด", pressing it again never deselects.
  const selectAllNow = () => {
    if (!shareAllows("selectAll")) return;
    if (!selModeRef.current) toggleSelect();
    if (totalRef.current > 0 && selection.size === totalRef.current) return;
    selAll();
  };
  const escapeLayer = () => {
    // Menus of this page first, then its dialogs, then the selection. One layer per press.
    if (bgMenu) return setBgMenu(null), true;
    if (ctx) return hideCtx(), true;
    if (albumMenu) return setAlbumMenu(false), true;
    if (sbMenu) return setSbMenu(false), true;
    if (downloads.escape() || uploads.escape()) return true;
    if (convert) return setConvert(null), true;
    if (csOpen) return setCsOpen(false), true;
    if (selModeRef.current) return toggleSelect(), true; // clears the selection and leaves selection mode
    return false;
  };
  const keyRef = useRef({ escapeLayer, selectAllNow });
  useLayoutEffect(() => {
    keyRef.current = { escapeLayer, selectAllNow };
  });
  useEffect(() => {
    // Capture phase on window: this runs before any other ESC handler, so it can see what is open
    // before that handler closes it, and leaves the layers that close themselves alone (one press
    // closes the viewer; the next one clears the selection, never both at once).
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as Element | null;
      const typing = !!t?.closest?.("input, textarea, select, [contenteditable]");
      const selfClosing =
        lbIdxRef.current >= 0 || // the viewer (Lightbox) closes on ESC itself
        !!document.querySelector(".custom-modal-overlay.show, .pf-picker, .pf-share-overlay, .pf-menu.show, [role='dialog'][aria-modal='true']");
      if (e.key === "Escape") {
        if (typing || selfClosing || e.defaultPrevented) return;
        if (keyRef.current.escapeLayer()) e.preventDefault();
      } else if (hotkey(e, "a") && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        // Ctrl/Cmd+A in a text field keeps its usual meaning; anywhere else it selects the album.
        if (typing || selfClosing) return;
        e.preventDefault();
        keyRef.current.selectAllNow();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ---------- right-click on empty space ----------
  // Tiles (photo menu) and folder tiles (folder menu) handle their own right-click and mark the event
  // handled; everything else on the page that isn't interactive opens the album's actions here.
  useEffect(() => {
    const onContext = (e: globalThis.MouseEvent) => {
      if (e.defaultPrevented) return;
      if ((e as globalThis.PointerEvent).pointerType === "touch") return; // long-press on a phone scrolls, not menus
      const target = e.target as Element;
      if (!target.closest?.("#page") || target.closest(NOT_EMPTY_SPACE) || lbIdxRef.current >= 0) return;
      e.preventDefault();
      setCtx(null);
      setAlbumMenu(false);
      setSbMenu(false);
      setBgMenu({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);
  // Closes on a press outside it or a resize. Page scrolling closes it like the other menus (see
  // "Floating menus close"); scrolling inside a menu never does: that closed this menu mid-scroll.
  useEffect(() => {
    if (!bgMenu) return;
    const close = (e: Event) => {
      if (e.type === "pointerdown" && (e.target as Element).closest?.("#bgMenu")) return;
      setBgMenu(null);
    };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.removeEventListener("resize", close);
    };
  }, [bgMenu]);
  const setSort = (v: string) => {
    filters.current.sortImg = v;
    setSortImg(v);
    resetLoad();
  };
  const bgAction = (act: string) => {
    setBgMenu(null);
    if (act === "upload") fileInRef.current?.click();
    else if (act === "selectAll") selectAllNow();
    else if (act === "select") toggleSelect();
    else if (act === "latest" || act === "oldest") setSort(act);
    else if (act === "refresh") resetLoad();
    else menuAction(act); // the header menu's own actions
  };

  // ---------- grid handlers ----------
  const openLB = useCallback((i: number) => {
    if (i < 0 || i >= imgsRef.current.length) return;
    lbIdxRef.current = i;
    const id = imgsRef.current[i]?.id ?? null;
    lbIdRef.current = id;
    setLbId(id);
    setLbIdx(i);
  }, []);

  // Where the photo the viewer is showing sits in the list *right now*. An upload landing, a
  // deletion or a re-sort moves it; this finds it again in the same render that brings the new list
  // in, so the viewer is never handed anything but the picture it already has open.
  const lbIdxLive = useMemo(() => {
    if (lbIdx < 0 || !lbId) return lbIdx;
    if (imgs[lbIdx]?.id === lbId) return lbIdx;
    const at = imgs.findIndex((i) => i.id === lbId);
    // Found it somewhere else: follow it. Gone (deleted, filtered out): stay put, which shows
    // whatever took its place.
    return at >= 0 ? at : Math.min(lbIdx, imgs.length - 1);
  }, [imgs, lbIdx, lbId]);

  // Catch the state up to what was rendered. Refs only, except when the photo being followed has
  // gone for good and the viewer has to adopt whatever is in its place.
  useEffect(() => {
    lbIdxRef.current = lbIdxLive;
    if (lbIdxLive < 0) return;
    const nowId = imgs[lbIdxLive]?.id ?? null;
    lbIdRef.current = nowId;
    if (nowId && nowId !== lbId) setLbId(nowId);
  }, [lbIdxLive, imgs, lbId]);

  // ---------- selection rules (mouse and keyboard modifiers) ----------
  // One anchor, set by every click that selects or deselects a single tile: Ctrl/Cmd+click, a click on
  // the checkmark, a click in selection mode, the start of a checkmark drag. Shift+click then works from
  // the most recent anchor, never from an older one.
  //
  // Shift+click gives every tile from the anchor to the clicked one the anchor's state (selected or
  // not), so a range can be added or taken back out. Clicking Shift again from the same anchor moves the
  // far end: the previous range is undone first (tiles go back to how they were before the first
  // Shift+click), exactly like a file manager. Any new anchor starts fresh. Positions are the grid's
  // order (imgs, which the upload block follows too).
  const setAnchor = useCallback((idx: number | null) => {
    lastClickedIdx.current = idx;
    shiftRange.current = null;
  }, []);
  const toggleAt = useCallback(
    (idx: number, id: string) => {
      if (!selModeRef.current) toggleSelect();
      toggleSel(id);
      setAnchor(idx);
      haptic(HAPTIC.tick);
    },
    [toggleSelect, toggleSel, setAnchor],
  );
  const selectRange = useCallback(
    (idx: number, id: string) => {
      const anchor = lastClickedIdx.current;
      const anchorImg = anchor !== null ? imgsRef.current[anchor] : undefined;
      if (anchor === null || !anchorImg) {
        toggleAt(idx, id); // nothing to range from yet: this click becomes the anchor
        return;
      }
      // Outside selection mode (the anchor came from a click that opened the viewer): entering the mode
      // starts from an empty selection, and the range is a plain "select these".
      const entering = !selModeRef.current;
      if (entering) {
        toggleSelect();
        lastClickedIdx.current = anchor;
      }
      if (!shiftRange.current) shiftRange.current = { lo: anchor, hi: anchor, baseline: new Set(selection.keys()) };
      const r = shiftRange.current;
      const want = entering || selection.has(anchorImg.id) || anchor === idx;
      const lo = Math.min(anchor, idx),
        hi = Math.max(anchor, idx);
      // Tiles the previous range covered and this one doesn't: back to their state before it.
      for (let i = r.lo; i <= r.hi; i++) {
        if (i >= lo && i <= hi) continue;
        const img = imgsRef.current[i];
        if (img) setItemSelected(i, r.baseline.has(img.id));
      }
      for (let i = lo; i <= hi; i++) setItemSelected(i, want);
      r.lo = lo;
      r.hi = hi;
      haptic(HAPTIC.tick);
    },
    [selection, setItemSelected, toggleSelect, toggleAt],
  );

  const gridEnv = useMemo<GridEnv>(
    () => ({
      selection,
      quality,
      loadedThumbs,
      imageUrl: (id, v) => imageUrl(id, v),
      draggable: canDrag,
      isDragSelecting: () => !!dragSel.current,
      handlers: {
        click: (e: MouseEvent, idx: number, id: string) => {
          // A drag that ended on a tile body still emits a click: never open the viewer for it.
          if (Date.now() - chkGestureEndAt.current < 400) return;
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleAt(idx, id);
            return;
          }
          if (e.shiftKey) {
            e.preventDefault();
            selectRange(idx, id);
            return;
          }
          // In selection mode too, tapping the picture opens it. Selecting is what the checkmark is
          // for, and holding a picture (or dragging from a checkmark) is what selects several — so
          // being in selection mode no longer costs you the ability to look at a photo.
          setAnchor(idx);
          openLB(idx);
        },
        chkPointerDown: (e: PointerEvent, _el: HTMLElement, idx: number, id: string) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          if (dragSel.current || chkHold.current) return;
          e.stopPropagation();
          // Shift or Ctrl/Cmd on the checkmark is a click with a modifier (range, or toggle and re-anchor),
          // handled by chkClick. Starting a checkmark drag here used to take it over: the drag toggled
          // just this tile and made it the anchor, so the Shift range never happened.
          if (e.pointerType === "mouse" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            return;
          }
          if (e.pointerType === "mouse") {
            e.preventDefault();
            activateDragSelect(idx, id, e.pointerId, e.clientX, e.clientY);
            return;
          }
          // Touch: the checkmark must be held still before drag-select arms, so brushing past one while
          // scrolling selects nothing. No preventDefault: until then the page must stay scrollable.
          beginTouchHold(e, idx, id);
        },
        // A finger pressed on the picture itself, rather than on its checkmark. In selection mode,
        // holding it still for a moment arms the same drag-select, so a sweep across the grid can
        // start anywhere on a tile instead of having to land on the small checkmark. Movement before
        // then cancels the hold and the page scrolls as usual, and a plain tap never gets this far —
        // it becomes a click, which opens the viewer.
        //
        // Mouse is left out on purpose: the checkmark is easy to hit with a cursor, and press-and-drag
        // on a tile already means dragging photos into a folder.
        bodyPointerDown: (e: PointerEvent, idx: number, id: string) => {
          if (!selModeRef.current || e.pointerType === "mouse") return;
          if (dragSel.current || chkHold.current) return;
          beginTouchHold(e, idx, id);
        },
        chkClick: (e: MouseEvent, idx: number, id: string) => {
          e.stopPropagation();
          e.preventDefault();
          if (Date.now() - chkGestureEndAt.current < 400) return; // tail of a drag, already applied
          if (e.shiftKey) {
            selectRange(idx, id);
            return;
          }
          toggleAt(idx, id);
        },
        dragStart: (e: DragEvent, id: string) => {
          if (dragSel.current || (e.target as Element).closest?.(".sel-chk")) {
            e.preventDefault();
            return;
          }
          const ids = selection.has(id) ? selection.keys() : [id];
          (e.currentTarget as HTMLElement).classList.add("pf-dragging");
          folders.dnd.begin(e.nativeEvent, { type: "images", ids, label: ids.length + " รายการ", sourceAlbumId: albumIdRef.current });
        },
        retry: (id: string) => retryImageRef.current(id),
        remove: (id: string) => deleteImageRef.current(id),
      },
    }),
    [selection, quality, loadedThumbs, imageUrl, canDrag, openLB, activateDragSelect, beginTouchHold, folders, selectRange, toggleAt, setAnchor],
  );

  // ---------- image actions ----------
  const updateImg = (id: string, patch: Partial<Photo>) => setImgs(imgsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const retryImage = async (id: string) => {
    if (!shareAllows("retry")) return;
    try {
      const r = await fetch("/api/photos/images/" + id + "/retry", { method: "POST", headers: authHeaders(false) });
      const d = await r.json();
      if (d.success) {
        updateImg(id, { processing_status: "pending" });
        ui.toast("เริ่มประมวลผลใหม่แล้ว", "success");
        // All Photos has no status poller of its own: check back once the worker has had time.
        if (IS_ALL)
          setTimeout(() => {
            if (alive.current && !loading.current) resetLoad();
          }, 12000);
      } else ui.toast(d.message || "ลองใหม่ไม่สำเร็จ", "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };
  const deleteImageById = async (id: string) => {
    const ok = await ui.confirm({ title: "ย้ายไปถังขยะ?", message: "ไฟล์นี้จะอยู่ในถังขยะ กู้คืนได้ภายใน 30 วัน", isDanger: true, confirmText: "ย้ายไปถังขยะ", cancelText: "ย้อนกลับ" });
    if (!ok) return;
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> กำลังลบ...
      </>,
      "success",
      true,
    );
    setImgs(imgsRef.current.filter((img) => img.id !== id));
    setTotal(Math.max(0, totalRef.current - 1));
    fetch("/api/photos/images/" + id, { method: "DELETE", headers: authHeaders(false) }).then(() => ui.toast("ย้ายไปถังขยะแล้ว", "success"));
  };
  const retryImageRef = useRef(retryImage);
  const deleteImageRef = useRef(deleteImageById);
  useLayoutEffect(() => {
    retryImageRef.current = retryImage;
    deleteImageRef.current = deleteImageById;
  });

  const setAlbumCover = async (imageId: string | null) => {
    try {
      const r = await fetch("/api/photos/albums/" + albumIdRef.current + "/cover", { method: "POST", headers: authHeaders(true), credentials: "include", body: JSON.stringify({ imageId }) });
      const d = await r.json();
      if (!d.success) {
        ui.toast(d.message || "ตั้งปกไม่สำเร็จ", "error");
        return;
      }
      if (albumDataRef.current) {
        albumDataRef.current = { ...albumDataRef.current, custom_cover_id: imageId };
        setAlbumData(albumDataRef.current);
      }
      ui.toast(imageId ? "ตั้งเป็นปกอัลบั้มแล้ว" : "กลับไปใช้ปกอัตโนมัติแล้ว", "success");
    } catch {
      ui.toast("ตั้งปกไม่สำเร็จ", "error");
    }
  };
  const shareImage = (id: string) => {
    const img = imgsRef.current.find((i) => i.id === id);
    folders.openShareDialog({ kind: "image", id, name: img?.original_name || "", locked: albumIsLockedRef.current });
  };

  // ---------- move / copy ----------
  const showMoveModal = async (mode: "move" | "copy") => {
    const ids = selection.keys();
    if (!ids.length) {
      ui.toast("เลือกรูปก่อน", "error");
      return;
    }
    const isCopy = mode === "copy";
    const res = await folders.openPicker({
      title: (isCopy ? "คัดลอก " : "ย้าย ") + ids.length + " รายการไปที่",
      confirmText: isCopy ? "คัดลอกมาที่นี่" : "ย้ายมาที่นี่",
      allowRoot: false,
      startId: IS_ALL ? null : albumIdRef.current,
      blockedTargetId: isCopy || IS_ALL ? undefined : albumIdRef.current,
      blockedHint: "รายการอยู่ในอัลบั้มนี้อยู่แล้ว",
    });
    if (!res || !res.targetId) return;
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> {(isCopy ? "กำลังคัดลอก " : "กำลังย้าย ") + ids.length + " รายการ..."}
      </>,
      "success",
      true,
    );
    try {
      const r = await fetch(isCopy ? "/api/photos/images/copy" : "/api/photos/images/move", {
        method: "POST",
        headers: authHeaders(true),
        credentials: "include",
        body: JSON.stringify({ ids, targetAlbumId: res.targetId }),
      });
      const d = await r.json();
      if (d.success) {
        selection.clear();
        if (selModeRef.current) toggleSelect();
        if (isCopy) {
          ui.toast("คัดลอกสำเร็จ " + d.copied + " รายการ" + (d.skipped ? " (ข้าม " + d.skipped + " รายการที่ยังประมวลผลไม่เสร็จ)" : ""), "success");
          haptic(HAPTIC.success);
        } else {
          ui.toast("ย้ายสำเร็จ " + ids.length + " รายการ", "success");
          resetLoad();
        }
        refreshAlbumNav();
      } else ui.toast(d.message || (isCopy ? "เกิดข้อผิดพลาดในการคัดลอก" : "เกิดข้อผิดพลาดในการย้าย"), "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };

  // ---------- rename ----------
  const [renameItems, setRenameItems] = useState<Photo[]>([]);
  const findPhoto = (id: string) => imgsRef.current.find((i) => i.id === id) || allImagesMeta.current?.find((i) => i.id === id);
  // One file (id) or the whole selection, numbered in the order the grid shows them.
  const openRename = (id: string | null) => {
    if (id) {
      const img = findPhoto(id);
      if (img) setRenameItems([img]);
      return;
    }
    const order = allImagesMeta.current || imgsRef.current;
    const picked = order.filter((i) => selection.has(i.id));
    const seen = new Set(picked.map((i) => i.id));
    for (const sid of selection.keys()) {
      const img = !seen.has(sid) ? findPhoto(sid) : null;
      if (img) picked.push(img);
    }
    if (!picked.length) return ui.toast("เลือกไฟล์ก่อน", "error");
    setRenameItems(picked);
  };
  const executeRename = async (list: { id: string; name: string }[]) => {
    try {
      const r = await fetch("/api/photos/images/rename", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ items: list }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) {
        ui.toast(r.status === 401 || r.status === 403 ? "ไม่มีสิทธิ์เปลี่ยนชื่อ" : "เปลี่ยนชื่อไม่สำเร็จ", "error");
        return false;
      }
      const names = new Map<string, string>((d.renamed || []).map((x: { id: string; original_name: string }) => [x.id, x.original_name]));
      setImgs(imgsRef.current.map((i) => (names.has(i.id) ? { ...i, original_name: names.get(i.id)! } : i)));
      allImagesMeta.current?.forEach((m) => {
        if (names.has(m.id)) m.original_name = names.get(m.id)!;
      });
      ui.toast(names.size > 1 ? `เปลี่ยนชื่อ ${names.size} ไฟล์แล้ว` : "เปลี่ยนชื่อแล้ว", "success");
      if (names.size > 1 && selModeRef.current) toggleSelect();
      return true;
    } catch {
      ui.toast("เปลี่ยนชื่อไม่สำเร็จ", "error");
      return false;
    }
  };

  // ---------- convert ----------
  const openConvertModal = (id: string | null) => {
    if (!id && !selection.size) {
      ui.toast("เลือกรูปก่อน", "error");
      return;
    }
    const count = id
      ? 1
      : selection.keys().filter((sid) => {
          const im = imgsRef.current.find((i) => i.id === sid);
          return !im || im.file_type !== "video";
        }).length;
    setConvert({ target: id, sub: id ? "เลือกนามสกุลไฟล์ที่ต้องการแปลง" : `แปลง ${count} รูปที่เลือก (วิดีโอจะถูกข้าม)` });
  };
  // Tiles flip to "processing" at once; ids go to the bulk endpoint in chunks (a couple in parallel);
  // the status poll picks up each item's real completion.
  const executeConvert = () => {
    const target = convert?.target;
    setConvert(null);
    const ids = target ? [target] : selection.keys();
    if (!ids.length) return;
    const idSet = new Set(ids);
    setImgs(imgsRef.current.map((i) => (idSet.has(i.id) ? { ...i, processing_status: "pending" } : i)));
    allImagesMeta.current?.forEach((m) => {
      if (idSet.has(m.id)) m.processing_status = "pending";
    });
    ui.toast("กำลังแปลงไฟล์ในพื้นหลัง", "success");
    if (selModeRef.current) toggleSelect();
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CONVERT_CHUNK_SIZE) chunks.push(ids.slice(i, i + CONVERT_CHUNK_SIZE));
    let next = 0;
    const worker = async () => {
      while (next < chunks.length) {
        const chunk = chunks[next++];
        try {
          const r = await fetch("/api/photos/images/convert-bulk", { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth.current }, body: JSON.stringify({ ids: chunk, format: convertFmt }) });
          const d = await r.json();
          if (!d.success) console.error("[convert-bulk]", chunk, d.message);
        } catch (e) {
          console.error("[convert-bulk]", chunk, e);
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(CONVERT_CHUNK_WORKERS, chunks.length) }, worker)).then(() => haptic(HAPTIC.success));
  };

  // ---------- delete selected ----------
  const delSelected = async () => {
    const ids = selection.keys();
    if (!ids.length) return;
    const ok = await ui.confirm({ title: `ย้าย ${ids.length} รายการไปถังขยะ?`, message: "รายการที่เลือกจะอยู่ในถังขยะ กู้คืนได้ภายใน 30 วัน", isDanger: true, confirmText: "ย้ายไปถังขยะ", cancelText: "ย้อนกลับ" });
    if (!ok) return;
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> {"กำลังลบ " + ids.length + " รูป..."}
      </>,
      "success",
      true,
    );
    try {
      const r = await fetch("/api/photos/images/delete-bulk", { method: "POST", headers: authHeaders(true), body: JSON.stringify({ ids }) });
      const d = await r.json();
      if (d.success) {
        ui.toast("ย้ายไปถังขยะแล้ว " + ids.length + " รายการ", "success");
        selection.clear();
        if (selModeRef.current) toggleSelect();
        resetLoad();
      } else ui.toast("ลบไม่สำเร็จ", "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };

  // ---------- custom select ----------
  const applyCustomSelect = async () => {
    const catVals = [...cs.cat],
      extVals = [...cs.ext],
      resVals = [...cs.res];
    const rangeFrom = parseInt(cs.from) || null,
      rangeTo = parseInt(cs.to) || null;
    const dateFrom = cs.dateFrom ? new Date(cs.dateFrom + "T00:00:00").getTime() : null;
    const dateTo = cs.dateTo ? new Date(cs.dateTo + "T23:59:59").getTime() : null;
    if (!catVals.length && !extVals.length && !resVals.length && !rangeFrom && !rangeTo && !dateFrom && !dateTo) {
      ui.toast("เลือกเงื่อนไขอย่างน้อย 1 อย่าง", "error");
      return;
    }
    const hadSelection = selection.size > 0;
    setCsOpen(false);
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> กำลังค้นหารูปที่ตรงเงื่อนไข...
      </>,
      "success",
      true,
    );
    try {
      const images = await fetchAllAlbumImages();
      if (!images) {
        ui.toast("โหลดรายการไม่สำเร็จ", "error");
        return;
      }
      const matched = images.filter((img, idx) => {
        const pos = idx + 1;
        const isVideo = img.file_type === "video";
        if (catVals.length && !catVals.some((c) => (c === "video") === isVideo)) return false;
        if (rangeFrom && pos < rangeFrom) return false;
        if (rangeTo && pos > rangeTo) return false;
        if (dateFrom && img.created_at < dateFrom) return false;
        if (dateTo && img.created_at > dateTo) return false;
        if (extVals.length && !extVals.includes((img.original_name || "").split(".").pop()!.toLowerCase())) return false;
        if (resVals.length) {
          if (isVideo) return false; // resolution tiers apply to images only
          if (!resVals.includes(resBadgeLabel(img.width, img.height))) return false;
        }
        return true;
      });
      if (!matched.length) {
        ui.toast("ไม่พบรูปที่ตรงเงื่อนไข", "error");
        return;
      }
      const mode = hadSelection ? cs.mode : "replace";
      if (!selModeRef.current) toggleSelect();
      if (mode === "replace") selection.clear();
      matched.forEach((img) => (mode === "remove" ? selection.delete(img.id) : selection.set(img.id, true)));
      ui.toast(
        mode === "add" ? `เพิ่ม ${matched.length} รายการเข้าที่เลือกไว้` : mode === "remove" ? `ยกเลิกการเลือก ${matched.length} รายการตามเงื่อนไขแล้ว` : `เลือก ${matched.length} รายการตามเงื่อนไขแล้ว`,
        "success",
      );
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };

  // ---------- album-level actions (header menu) ----------
  const createSubfolder = async () => {
    const name = await ui.prompt({ title: "สร้างโฟลเดอร์ย่อย", message: 'ใน "' + (title || "") + '"', placeholder: "ชื่อโฟลเดอร์", confirmText: "สร้าง" });
    if (!name || !name.trim()) return;
    try {
      const r = await fetch("/api/photos/albums", { method: "POST", headers: authHeaders(true), credentials: "include", body: JSON.stringify({ name: name.trim(), parent_id: albumIdRef.current }) });
      const d = await r.json();
      if (!d.success) {
        ui.toast(d.message || "สร้างโฟลเดอร์ไม่สำเร็จ", "error");
        return;
      }
      ui.toast("สร้างโฟลเดอร์แล้ว", "success");
      await refreshAlbumNav();
    } catch {
      ui.toast("สร้างโฟลเดอร์ไม่สำเร็จ", "error");
    }
  };
  const runAlbumAction = async (cmd: "move" | "copy") => {
    if (!albumDataRef.current) return;
    const parent = breadcrumb[breadcrumb.length - 1];
    const album = {
      id: albumIdRef.current,
      name: title,
      parent_id: parent ? parent.id : null,
      has_access: true,
      is_locked: albumIsLockedRef.current,
      photo_count: totalRef.current,
      video_count: 0,
      child_count: childrenRef.current.length,
    } as Album;
    await folders.run(cmd, album, (change) => {
      if (change.kind === "move") refreshAlbumNav();
      else if (change.kind === "copy" && change.newId) {
        const newId = change.newId;
        ui.toast(
          <>
            ทำสำเนาแล้ว
            <a
              href={"/photos/album/?id=" + encodeURIComponent(newId)}
              style={{ color: "#fff", textDecoration: "underline", marginLeft: 6 }}
              onClick={(e) => {
                e.preventDefault();
                leave("/photos/album/?id=" + encodeURIComponent(newId));
              }}
            >
              เปิดสำเนา
            </a>
          </>,
          "success",
        );
      }
    });
  };
  const promptLockAlbum = async () => {
    const pw = await ui.prompt({ title: "ตั้งรหัสผ่านล็อกอัลบั้ม", message: "กรุณาตั้งรหัสผ่านอย่างน้อย 4 ตัวอักษร", isPassword: true, confirmText: "ล็อกอัลบั้ม" });
    if (!pw || pw.length < 4) {
      if (pw) ui.toast("รหัสต้องมีอย่างน้อย 4 ตัวอักษร", "error");
      return;
    }
    try {
      const r = await fetch("/api/photos/albums/" + albumIdRef.current + "/lock", { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth.current }, body: JSON.stringify({ password: pw }) });
      const d = await r.json();
      if (d.success) {
        setAlbumToken(d.token);
        albumIsLockedRef.current = true;
        setAlbumIsLocked(true);
        ui.toast("ล็อกอัลบั้มสำเร็จ", "success");
      } else ui.toast(d.message || "เกิดข้อผิดพลาด", "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };
  const promptUnlockAlbum = async () => {
    const pw = await ui.prompt({ title: "ปลดล็อกอัลบั้ม", message: "กรอกรหัสผ่านเพื่อยกเลิกการล็อกอัลบั้ม", isPassword: true, confirmText: "ปลดล็อก" });
    if (!pw) return;
    try {
      const r = await fetch("/api/photos/albums/" + albumIdRef.current + "/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      const d = await r.json();
      if (d.success) {
        clearAlbumToken();
        albumIsLockedRef.current = false;
        setAlbumIsLocked(false);
        ui.toast("ปลดล็อกอัลบั้มสำเร็จ", "success");
      } else ui.toast(d.message || "รหัสไม่ถูกต้อง", "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };
  const promptEditAlbumDate = async () => {
    const cur = albumDataRef.current;
    const d = new Date((cur && (cur.event_date || cur.created_at)) || Date.now());
    const def = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const input = await ui.prompt({ title: "แก้ไขวันที่ของอัลบั้ม", message: "เลือกวันที่ที่ต้องการ", defaultValue: def, confirmText: "บันทึก", isDate: true });
    if (!input || !input.trim()) return;
    const parsed = new Date(input.trim()).getTime();
    if (isNaN(parsed)) {
      ui.toast("รูปแบบวันที่ไม่ถูกต้อง (ตัวอย่าง: 2026-08-27)", "error");
      return;
    }
    try {
      const res = await fetch("/api/photos/albums/" + albumIdRef.current, { method: "PUT", headers: { ...authHeaders(true) }, body: JSON.stringify({ event_date: parsed }) });
      const data = await res.json();
      if (data.success) {
        if (albumDataRef.current) {
          albumDataRef.current = { ...albumDataRef.current, event_date: parsed };
          setAlbumData(albumDataRef.current);
        }
        ui.toast("แก้ไขวันที่สำเร็จ", "success");
      } else ui.toast("แก้ไขวันที่ไม่สำเร็จ", "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };
  const renameAlbumInline = async () => {
    const cur = title;
    const n = await ui.prompt({ title: "เปลี่ยนชื่ออัลบั้ม", defaultValue: cur, confirmText: "บันทึก" });
    if (!n || !n.trim() || n.trim() === cur) return;
    try {
      const r = await fetch("/api/photos/albums/" + albumIdRef.current, { method: "PUT", headers: authHeaders(true), body: JSON.stringify({ name: n.trim() }) });
      const d = await r.json();
      if (d.success) {
        setTitle(n.trim());
        document.title = n.trim() + " - NEXT9";
        ui.toast("เปลี่ยนชื่อสำเร็จ", "success");
      } else ui.toast("เกิดข้อผิดพลาด", "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };
  const backHref = () => {
    const parent = breadcrumb[breadcrumb.length - 1];
    if (IS_SHARE) return parent ? shareAlbumUrl(parent.id) : "";
    return parent ? "/photos/album/?id=" + encodeURIComponent(parent.id) : "/photos/";
  };
  const deleteAlbumInside = async () => {
    const ok = await ui.confirm({
      title: "ย้ายอัลบั้มไปถังขยะ?",
      message: `"${title}" และไฟล์ทั้งหมดในอัลบั้มนี้${childrenRef.current.length ? " รวมถึงโฟลเดอร์ย่อยทั้งหมด" : ""} จะอยู่ในถังขยะ กู้คืนได้ภายใน 30 วัน`,
      isDanger: true,
      confirmText: "ย้ายไปถังขยะ",
      cancelText: "ย้อนกลับ",
    });
    if (!ok) return;
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> กำลังย้ายไปถังขยะ...
      </>,
      "success",
      true,
    );
    try {
      const r = await fetch("/api/photos/albums/" + albumIdRef.current, { method: "DELETE", headers: authHeaders(false), credentials: "include" });
      const d = await r.json();
      if (d.success) {
        ui.toast("ย้ายไปถังขยะแล้ว", "success");
        navigate(backHref(), { replace: true });
      } else ui.toast(d.message || "เกิดข้อผิดพลาด", "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  };

  const ctxAnchor = useMemo(() => (ctx ? { x: ctx.x, y: ctx.y } : null), [ctx?.x, ctx?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const bgAnchor = useMemo(() => (bgMenu ? { x: bgMenu.x, y: bgMenu.y } : null), [bgMenu]);

  const menuAction = (act: string) => {
    setAlbumMenu(false);
    if (!shareAllows(act)) return;
    if (act === "select") toggleSelect();
    else if (act === "selectAll") selectAllNow();
    else if (act === "rename") renameAlbumInline();
    else if (act === "date") promptEditAlbumDate();
    else if (act === "lock") (albumIsLockedRef.current ? promptUnlockAlbum : promptLockAlbum)();
    else if (act === "subfolder") createSubfolder();
    else if (act === "moveAlbum" || act === "copyAlbum") runAlbumAction(act === "moveAlbum" ? "move" : "copy");
    else if (act === "shareAlbum") folders.openShareDialog({ kind: "album", id: albumIdRef.current, name: title, locked: albumIsLockedRef.current });
    else if (act === "zipTree") downloads.openQuality("tree:" + albumIdRef.current);
    else if (act === "uploadFolder") folderInRef.current?.click();
    else if (act === "autoCover") setAlbumCover(null);
    else if (act === "delete" && !IS_SHARE) deleteAlbumInside(); // deleting the album itself needs the site password
  };

  const sbAction = (action: string) => {
    setSbMenu(false);
    if (!shareAllows(action)) return;
    if (action === "selectAll") selAll();
    else if (action === "clearSelection") {
      selection.clear();
      ui.toast("ยกเลิกการเลือกทั้งหมดแล้ว", "success");
    } else if (action === "customSelect") {
      setCs((c) => ({ ...c, mode: "replace" }));
      setCsOpen(true);
    } else if (!selection.size) return;
    else if (action === "download") downloads.openQuality("selected", selection.keys());
    else if (action === "move") showMoveModal("move");
    else if (action === "copy") showMoveModal("copy");
    else if (action === "convert") openConvertModal(null);
    else if (action === "rename") openRename(null);
    else if (action === "delete") delSelected();
  };

  // ---------- context menu ----------
  const hideCtx = useCallback(() => {
    setCtx((c) => {
      if (!c || c.closing) return c;
      setTimeout(() => setCtx((cur) => (cur && cur.closing ? null : cur)), 170);
      return { ...c, closing: true };
    });
    menuOpened.current.ctx = null;
  }, []);
  const showCtxMenu = useCallback((id: string, x: number, y: number, fromTouch = false) => {
    ctxTouch.current.menuShownAt = Date.now();
    ctxTouch.current.fromTouch = fromTouch;
    ctxTarget.current = id;
    menuOpened.current.ctx = { t: Date.now(), x: window.scrollX, y: window.scrollY };
    setCtx({ id, x, y, closing: false });
    // Only one floating menu at a time: a right-click is not a click, so the others would stay open.
    setAlbumMenu(false);
    setSbMenu(false);
    setBgMenu(null);
  }, []);
  // Protects a menu opened by the current (or just-finished) touch from that touch's own click.
  const ctxOpeningGestureTail = useCallback(() => {
    if (!menuOpened.current.ctx) return false;
    const t = ctxTouch.current;
    if (!t.fromTouch) return false; // a right-click menu has no finger still on the screen
    if (t.menuShownAt < t.startAt) return false;
    if (!t.releasedAt || t.releasedAt < t.startAt) return true;
    return Date.now() - t.releasedAt < 350;
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let lpt: ReturnType<typeof setTimeout> | null = null,
      lpId: string | null = null,
      lpX = 0,
      lpY = 0;
    const onContext = (e: globalThis.MouseEvent) => {
      if ((e.target as Element).closest(".sel-chk") || dragSel.current) {
        e.preventDefault();
        return;
      }
      const item = (e.target as Element).closest(".photos-grid-item") as HTMLElement | null;
      if (!item) return;
      e.preventDefault();
      showCtxMenu(item.dataset.id!, e.clientX, e.clientY);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || (e.target as Element).closest(".sel-chk")) return;
      const item = (e.target as Element).closest(".photos-grid-item") as HTMLElement | null;
      if (!item) return;
      lpId = item.dataset.id!;
      lpX = e.touches[0].clientX;
      lpY = e.touches[0].clientY;
      ctxTouch.current.startAt = Date.now();
      ctxTouch.current.releasedAt = 0;
      if (lpt) clearTimeout(lpt);
      lpt = setTimeout(() => {
        // A held finger has already become a selection drag by now (that arms at CHK_HOLD_MS, well
        // before this fires): it is selecting photos, not asking for a menu.
        if (dragSel.current) return;
        haptic(HAPTIC.hold);
        showCtxMenu(lpId!, lpX, lpY, true);
      }, 500);
    };
    // A resting finger always drifts a few pixels; only a real move (a scroll) cancels the long-press.
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && Math.hypot(t.clientX - lpX, t.clientY - lpY) > 10 && lpt) clearTimeout(lpt);
    };
    const release = () => {
      if (lpt) clearTimeout(lpt);
      ctxTouch.current.releasedAt = Date.now();
    };
    // The menu opens while the finger is still down; lifting it produces a click (and on Android a
    // contextmenu). Those belong to the long-press, so they neither close the menu nor reach the tile.
    const onDocClick = (e: globalThis.MouseEvent) => {
      if ((e.target as Element).closest?.(".app-menu")) return;
      if (ctxOpeningGestureTail()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      hideCtx();
    };
    grid.addEventListener("contextmenu", onContext);
    grid.addEventListener("touchstart", onTouchStart, { passive: true });
    grid.addEventListener("touchmove", onTouchMove, { passive: true });
    grid.addEventListener("touchend", release, { passive: true });
    grid.addEventListener("touchcancel", release, { passive: true });
    document.addEventListener("click", onDocClick, true);
    return () => {
      if (lpt) clearTimeout(lpt);
      grid.removeEventListener("contextmenu", onContext);
      grid.removeEventListener("touchstart", onTouchStart);
      grid.removeEventListener("touchmove", onTouchMove);
      grid.removeEventListener("touchend", release);
      grid.removeEventListener("touchcancel", release);
      document.removeEventListener("click", onDocClick, true);
    };
  }, [showCtxMenu, hideCtx, ctxOpeningGestureTail]);

  const ctxAction = async (action: string) => {
    const id = ctxTarget.current;
    setCtx(null);
    menuOpened.current.ctx = null;
    if (!shareAllows(action) || !id) return;
    ctxTarget.current = null;
    if (action === "select") {
      if (!selModeRef.current) toggleSelect();
      toggleSel(id);
    } else if (action === "download") downloads.openQuality(id);
    else if (action === "convert") openConvertModal(id);
    else if (action === "rename") openRename(id);
    else if (action === "openAlbum") {
      const img = imgsRef.current.find((i) => i.id === id);
      if (img) leave(albumUrlForImage(img));
    } else if (action === "cover") setAlbumCover(id);
    else if (action === "share") shareImage(id);
    else if (action === "delete") await deleteImageById(id);
    else if (action === "move" || action === "copy") {
      selection.clear();
      selection.set(id, true);
      showMoveModal(action);
    }
  };

  // Floating menus close as soon as anything scrolls (after a grace period and a real scroll).
  useEffect(() => {
    const closeAll = (e: Event) => {
      const now = Date.now();
      const entries: [keyof typeof menuOpened.current, string, () => void][] = [
        ["ctx", "#ctxMenu", hideCtx],
        ["album", "#albumDropdownMenu", () => setAlbumMenu(false)],
        ["sb", "#sbActionsMenu", () => setSbMenu(false)],
        ["bg", "#bgMenu", () => setBgMenu(null)],
      ];
      for (const [key, sel, close] of entries) {
        const info = menuOpened.current[key];
        if (!info || now - info.t < GRACE_MS) continue;
        const t = e.target as Element | null;
        if (t && t.nodeType === 1 && t.closest?.(sel)) continue;
        if (e.type === "scroll" || e.type === "touchmove") {
          if (Math.abs(window.scrollY - info.y) + Math.abs(window.scrollX - info.x) < 16) continue;
        }
        menuOpened.current[key] = null;
        close();
      }
    };
    window.addEventListener("scroll", closeAll, { passive: true });
    document.addEventListener("scroll", closeAll, { passive: true, capture: true });
    document.addEventListener("wheel", closeAll, { passive: true, capture: true });
    document.addEventListener("touchmove", closeAll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", closeAll);
      document.removeEventListener("scroll", closeAll, { capture: true });
      document.removeEventListener("wheel", closeAll, { capture: true });
      document.removeEventListener("touchmove", closeAll, { capture: true });
    };
  }, [hideCtx]);
  useEffect(() => {
    menuOpened.current.album = albumMenu ? { t: Date.now(), x: window.scrollX, y: window.scrollY } : null;
    menuOpened.current.sb = sbMenu ? { t: Date.now(), x: window.scrollX, y: window.scrollY } : null;
    menuOpened.current.bg = bgMenu ? { t: Date.now(), x: window.scrollX, y: window.scrollY } : null;
  }, [albumMenu, sbMenu, bgMenu]);
  useEffect(() => {
    const onDoc = (e: globalThis.MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest("#albumMenuBtn") && !t.closest("#albumDropdownMenu")) setAlbumMenu(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);


  // Files dragged in from the desktop show the drop overlay (not internal photo/folder drags).
  useEffect(() => {
    // On a share link only an edit link can drop files in.
    if ((IS_SHARE && !shareEdit) || IS_ALL || initialLoading || lockScreen) return;
    const onOver = (e: globalThis.DragEvent) => {
      const types = e.dataTransfer && e.dataTransfer.types;
      if (!types || ![...types].includes("Files") || folders.dnd.isInternal(e)) return;
      e.preventDefault();
      setDropActive(true);
    };
    window.addEventListener("dragover", onOver);
    return () => window.removeEventListener("dragover", onOver);
  }, [IS_SHARE, shareEdit, IS_ALL, initialLoading, lockScreen, folders]);

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (uploads.isActive() || downloads.isActive()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [downloads, uploads]);

  // ---------- infinite scroll ----------
  // The next page is needed as soon as the first placeholder tile nears the screen — not when the
  // bottom of the page does. The grid holds up to SKEL_AHEAD placeholders past the loaded photos
  // (15 rows, ~3,700px, on a two-column phone), and the old test measured from the page's end, so a
  // visitor could scroll deep into grey tiles that were still "too far" from the bottom to load.
  // Only opening the viewer and pressing next (which pages forward itself) brought them in.
  const needMorePhotos = useCallback(() => {
    if (!moreRef.current || loading.current) return false;
    const firstSkel = document.querySelector(".lp-album .photos-grid .grid-skel");
    const edge = firstSkel ? firstSkel.getBoundingClientRect().top : document.documentElement.scrollHeight - window.scrollY;
    return edge < window.innerHeight + 1500;
  }, []);
  // A page that lands while placeholders are still on screen (a fast scroll) fetches the next one
  // straight away, until the screen is filled — not on the next scroll event.
  useEffect(() => {
    if (!imgs.length) return;
    const t = setTimeout(() => {
      if (needMorePhotos()) loadNext();
    }, 50);
    return () => clearTimeout(t);
  }, [imgs.length, needMorePhotos, loadNext]);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const lm = loadMoreRef.current;
    if (!lm) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && moreRef.current && !loading.current) loadNext();
      },
      { rootMargin: "1800px" },
    );
    obs.observe(lm);
    const onScroll = () => {
      if (needMorePhotos()) loadNext();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [loadNext, needMorePhotos]);

  // ---------- status polling + soft auto refresh ----------
  // Merges page 1 into what is already loaded: new photos in front, changed ones swapped in place,
  // nothing else touched. Resolves "busy" when a page load was in flight and nothing was merged,
  // "view" when the current sort/filter is not one it can merge into.
  const autoRefresh = useCallback(async (): Promise<"ok" | "busy" | "view"> => {
    if (loading.current) return "busy";
    try {
      const f = filters.current;
      if (f.sortImg !== "latest" || f.filterMonth) return "view"; // only on the default latest view
      const d = await fetchPage(1);
      if (!alive.current) return "ok";
      if (d.deleted || loading.current) return "busy";
      const list = imgsRef.current;
      const existing = new Map(list.map((i) => [i.id, i]));
      const newImages: Photo[] = [];
      const updated = new Map<string, Photo>();
      const uploadRunning = uploadsActiveRef.current();
      for (const img of d.images) {
        // While an upload runs, a photo the server has but whose id has not come back to us yet would
        // land among the album's photos (it has no place in the upload block yet) and then jump into the
        // block a moment later. It waits for the next refresh, by which time its place is known.
        if (!existing.has(img.id)) {
          if (!uploadRunning || uploadOrderRef.current.has(img.id)) newImages.push(img);
        }
        else if (existing.get(img.id)!.processing_status !== img.processing_status) updated.set(img.id, img);
      }
      const fetchedIds = new Set(d.images.map((i) => i.id));
      const deleted = new Set<string>();
      if (d.images.length > 0) {
        const oldest = d.images[d.images.length - 1].created_at;
        for (const img of list) if (img.created_at >= oldest && !fetchedIds.has(img.id)) deleted.add(img.id);
      } else list.forEach((i) => deleted.add(i.id));
      if (!newImages.length && !deleted.size && !updated.size) {
        if (totalRef.current !== d.total) setTotal(d.total);
        return "ok";
      }
      setImgs([...newImages, ...list.filter((i) => !deleted.has(i.id)).map((i) => updated.get(i.id) || i)]);
      setTotal(d.total);
    } catch {}
    return "ok";
  }, [fetchPage, setImgs, setTotal]);

  // After an upload. resetLoad emptied the grid and fetched it again, so every tile blinked out, the
  // upload tiles lost their photos for a moment and the page jumped. The soft merge adds the new photos
  // where their upload tiles already stand. Only a sort/filter it cannot merge into falls back to a full
  // reload, and a page load already in flight is waited out rather than skipped.
  const softRefreshAfterUpload = useCallback(async () => {
    for (let tries = 0; tries < 20 && alive.current; tries++) {
      const r = await autoRefresh();
      if (r === "ok") return;
      if (r === "view") return resetLoad();
      await new Promise((res) => setTimeout(res, 300));
    }
  }, [autoRefresh, resetLoad]);
  useEffect(() => {
    softRefreshRef.current = softRefreshAfterUpload;
  });

  useEffect(() => {
    if (IS_SHARE || IS_ALL || initialLoading || lockScreen) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/photos/albums/${albumIdRef.current}/status`);
        const d = await r.json();
        setProcessing(d.processing > 0 ? d.processing : 0);
        autoRefresh();
      } catch {}
    }, 6000);
    return () => clearInterval(id);
  }, [IS_SHARE, IS_ALL, initialLoading, lockScreen, autoRefresh]);

  // ---------- lock screen ----------
  useEffect(() => {
    if (!lockScreen) return;
    const t = setTimeout(() => lockPwRef.current?.focus(), 100);
    // Anti-tamper watchdog: a locked album whose lock screen got hidden goes back to the album list.
    const w = setInterval(() => {
      if (albumIsLockedRef.current && !albumToken.current) {
        const modal = document.getElementById("lockModal");
        if (!modal || modal.style.display === "none" || !modal.classList.contains("show") || modal.style.opacity === "0" || modal.style.visibility === "hidden") navigate("/photos/", { replace: true });
      }
    }, 1000);
    return () => {
      clearTimeout(t);
      clearInterval(w);
    };
  }, [lockScreen, navigate]);

  const submitAlbumPassword = async () => {
    if (!lockPw) return;
    setLockBusy(true);
    setLockError("");
    const albumId = albumIdRef.current;
    try {
      const r = await fetch("/api/photos/albums/" + albumId + "/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: lockPw }) });
      const d = await r.json();
      if (d.success && d.token) {
        setAlbumToken(d.token, lockRemember);
        if (lockRemember) {
          document.cookie = "album_pass_" + albumId + "=" + encodeURIComponent(lockPw) + "; path=/; max-age=315360000; SameSite=Lax";
          document.cookie = "album_token_" + albumId + "=" + encodeURIComponent(d.token) + "; path=/; max-age=315360000; SameSite=Lax";
        } else {
          document.cookie = "album_pass_" + albumId + "=; path=/; max-age=0; SameSite=Lax";
          document.cookie = "album_token_" + albumId + "=; path=/; max-age=0; SameSite=Lax";
        }
        setLockScreen(null);
        loading.current = false;
        await init();
      } else {
        setLockError(d.message || "รหัสไม่ถูกต้อง");
        setLockShake(true);
        setTimeout(() => setLockShake(false), 400);
      }
    } catch {
      setLockError("เกิดข้อผิดพลาด");
    } finally {
      setLockBusy(false);
    }
  };

  // ---------- scroll top ----------
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      setScrollTopShow(window.scrollY > 1200);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ---------- sub-folders ----------
  const getChild = useCallback((id: string) => childrenRef.current.find((a) => a.id === id), []);
  const onSubfolderChanged = useCallback(
    (change: Change) => {
      if (change.kind === "delete" || change.kind === "move") {
        childrenRef.current = childrenRef.current.filter((a) => a.id !== change.id);
        setChildren(childrenRef.current);
      } else setChildren(childrenRef.current.slice());
      refreshAlbumNav();
    },
    [refreshAlbumNav],
  );
  const onMoved = useCallback(
    (change: Change) => {
      if (change.kind === "undo" || change.type === "images") resetLoad();
      refreshAlbumNav();
    },
    [resetLoad, refreshAlbumNav],
  );
  useFolderGestures(subGridRef, { selector: ".pf-tile[data-id]", getAlbum: getChild, onChanged: onSubfolderChanged, onOpen: (a) => leave("/photos/album/?id=" + encodeURIComponent(a.id)), enabled: !IS_SHARE });
  useAlbumDrag(subGridRef, { selector: ".pf-tile[data-id]", getAlbum: getChild, enabled: canDrag && !IS_SHARE });
  useDropTargets(subGridRef, {
    selector: ".pf-tile[data-id]",
    targetOf: (el) => {
      const a = getChild(el.dataset.id || "");
      return a ? { id: a.id, name: a.name } : null;
    },
    onChanged: onMoved,
    enabled: canDrag && !IS_SHARE,
  });
  useDropTargets(crumbsRef, {
    selector: "a[data-crumb]",
    targetOf: (el) => ({ id: el.dataset.crumb || null, name: el.dataset.crumbName || el.textContent || "" }),
    onChanged: onMoved,
    enabled: canDrag && !IS_SHARE,
  });

  useEffect(() => {
    folders.setDownloadFolderZip((a) => downloads.openQuality("tree:" + a.id));
    return () => folders.setDownloadFolderZip(null);
  }, [folders, downloads]);

  // Where the visitor most likely goes next: the album list and the parent folder.
  useEffect(() => {
    if (IS_SHARE || initialLoading) return;
    prefetch("/photos/");
    const parent = breadcrumb[breadcrumb.length - 1];
    if (parent) prefetch("/photos/album/?id=" + encodeURIComponent(parent.id));
  }, [IS_SHARE, initialLoading, breadcrumb, prefetch]);
  // Touching or hovering a link inside the page (crumbs, sub-folders) starts loading its target.
  const warmLink = (target: EventTarget) => {
    const el = target as Element;
    const a = el.closest?.("a[href]") as HTMLAnchorElement | null;
    if (a) {
      prefetch(a.getAttribute("href"));
      return;
    }
    const tile = el.closest?.(".pf-tile[data-id]") as HTMLElement | null;
    if (tile) prefetch(IS_SHARE ? shareAlbumUrl(tile.dataset.id || "") : "/photos/album/?id=" + encodeURIComponent(tile.dataset.id || ""));
  };

  // Tab bar indicator (All Photos).
  useEffect(() => {
    if (IS_ALL && tabbarRef.current) window.navMotion?.setupTabBar?.(tabbarRef.current);
  }, [IS_ALL]);

  // ---------- render ----------
  const coverId = albumData?.custom_cover_id;
  const orderedChildren = useMemo(() => pinnedFirst(children), [children]);

  let meta: string;
  if (IS_SHARE) {
    const exp = shareInfo && shareInfo.expires_at ? "ดูได้ถึง " + formatShortDate(shareInfo.expires_at) : "ไม่มีวันหมดอายุ";
    meta = shareInfo ? (shareInfo.kind === "image" ? "" : total + " รูป · ") + exp : "";
  } else if (IS_ALL) meta = initialLoading ? "" : total + " รูป/วิดีโอ" + (allVideoCount ? " · " + allVideoCount + " วิดีโอ" : "") + " · ทุกอัลบั้ม";
  else meta = albumData ? total + " รูป" + (albumData.event_date || albumData.created_at ? " · " + formatShortDate(albumData.event_date || albumData.created_at) : "") : "";
  const fInfo = initialLoading ? "" : "แสดง " + imgs.length + " / " + total;

  // Day grouping (All Photos): a heading whenever the day changes; collapsing only hides tiles.
  const loadedDayCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (IS_ALL && !Object.keys(dayTotals).length) imgs.forEach((i) => m.set(imageDayKey(i), (m.get(imageDayKey(i)) || 0) + 1));
    return m;
  }, [IS_ALL, imgs, dayTotals]);
  // Built once per change to what the grid shows, not on every render of this page. Opening or
  // closing any menu here re-renders AlbumPage, and rebuilding hundreds of tile elements then was a
  // main-thread spike landing exactly on the first frames of the menu's animation.
  const gridItems = useMemo(() => {
    const gridItems: React.ReactNode[] = [];
    // ---- Files being uploaded ----
    // One block at the front of the grid, newest first like the rest of it: the last file picked leads
    // (picking 1, 2, 3, 4 shows 4, 3, 2, 1), and files dropped mid-upload go in front of the block. Each
    // slot shows the real photo once it has arrived, and a placeholder saying where it is up to until
    // then. The queue itself stays in picked order (it is also the upload order); only the view is reversed.
    const uploadQueue = uploads.queue.slice().sort((a, b) => b.order.block - a.order.block || b.order.seq - a.order.seq);
    const uploadedIds = new Set<string>();
    if (uploadQueue.length) {
      const byId = new Map(imgs.map((i) => [i.id, i]));
      const indexOfId = new Map(imgs.map((i, n) => [i.id, n]));
      uploadQueue.forEach((slot) => {
        const photo = slot.id ? byId.get(slot.id) : undefined;
        if (photo) {
          uploadedIds.add(photo.id);
          gridItems.push(<GridItem key={photo.id} img={photo} idx={indexOfId.get(photo.id) ?? 0} env={gridEnv} albumTag={undefined} isCover={!!coverId && coverId === photo.id} />);
        } else {
          gridItems.push(<UploadSlotTile key={slot.key} slot={slot} onRetry={uploads.retrySlot} onDismiss={uploads.dismissSlot} />);
        }
      });
    }
    let lastDay: string | null = null;
    imgs.forEach((img, idx) => {
      if (uploadedIds.has(img.id)) return;
      let day: string | undefined;
      if (IS_ALL) {
        day = imageDayKey(img);
        if (day !== lastDay) {
          lastDay = day;
          const collapsed = collapsedDays.has(day);
          const key = day;
          gridItems.push(
            <div key={"day:" + day} className={"day-head" + (collapsed ? " collapsed" : "")} data-day-head={day}>
              <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => {
                  setCollapsedDays((cur) => {
                    const next = new Set(cur);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                  haptic(HAPTIC.tick);
                }}
              >
                <i className="fas fa-chevron-down" />
                <span>{dayHeadLabel(imageDate(img))}</span>
                <b data-count>{dayTotals[day] != null ? dayTotals[day] : loadedDayCounts.get(day) || 0}</b>
              </button>
            </div>,
          );
        }
      }
      gridItems.push(
        <GridItem
          key={img.id}
          img={img}
          idx={idx}
          env={gridEnv}
          day={day}
          hidden={day ? collapsedDays.has(day) : undefined}
          albumTag={IS_ALL ? allAlbumNames[img.album_id || ""] : undefined}
          isCover={!!coverId && coverId === img.id}
        />,
      );
    });
    // Placeholders for files that exist but are not fetched yet: fast scrolling stays smooth because the
    // grid is already as tall as the next batch.
    const skeletons = initialLoading && !imgs.length ? 24 : more ? Math.min(SKEL_AHEAD, Math.max(0, total - imgs.length)) : 0;
    for (let i = 0; i < skeletons; i++) gridItems.push(<GridSkel key={"skel:" + i} />);
    return gridItems;
  }, [IS_ALL, uploads.queue, uploads.retrySlot, uploads.dismissSlot, imgs, gridEnv, coverId, collapsedDays, dayTotals, loadedDayCounts, allAlbumNames, initialLoading, more, total]);

  const shareErr = shareError ? SHARE_ERRORS[shareError] || SHARE_ERRORS.invalid : null;
  const ctxImg = ctx ? imgs.find((i) => i.id === ctx.id) : undefined;
  const parent = breadcrumb[breadcrumb.length - 1];
  const showEmpty = !initialLoading && !lockScreen && imgs.length === 0 && !children.length;
  const selDisabled = selCount === 0;

  useEffect(() => {
    if (shareErr) document.title = shareErr[1] + " - NEXT9";
  }, [shareErr]);

  // The placeholders step aside once every picked file is either in the grid or has failed. The order
  // itself survives in uploadOrderRef, so the tiles stay where the placeholders were.
  const { queue: uploadSlots, clearQueue: clearUploadQueue, isUploading: uploadRunning } = uploads;
  useEffect(() => {
    if (!uploadSlots.length || uploadRunning) return;
    const present = new Set(imgs.map((i) => i.id));
    if (!uploadSlots.every((slot) => slot.status === "failed" || slot.status === "done" || (slot.id && present.has(slot.id)))) return;
    // A failed tile stays until it is retried (ลองอีกครั้ง) or taken out (×): it used to vanish after a
    // few seconds, taking the only way to retry that file with it. The block clears once none are left.
    if (!uploadSlots.some((slot) => slot.status === "failed")) clearUploadQueue();
  }, [imgs, uploadSlots, uploadRunning, clearUploadQueue]);



  return (
    <>
      {/* Files may only be dropped on the box. Everywhere else the overlay turns red and swallows the
          drop, so a file let go over the page never uploads and never opens in the browser either. */}
      <div
        className={"drop-overlay" + (dropActive ? " active" : "") + (dropActive && !dropInside ? " reject" : "")}
        id="dropOverlay"
        onDragLeave={(e) => {
          if (!e.relatedTarget) {
            setDropActive(false);
            setDropInsideOnce(false);
          }
        }}
        onDragEnter={(e) => e.preventDefault()}
        onDragOver={(e) => {
          // One handler for the whole overlay, deciding from where the pointer actually is: relying on
          // the box stopping the event never survived a real drag, where a move between the box and its
          // own icon or heading reports whatever child is under the cursor.
          e.preventDefault();
          const inBox = !!(e.target as Element).closest?.(".drop-overlay-content");
          e.dataTransfer.dropEffect = inBox ? "copy" : "none";
          setDropInsideOnce(inBox);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const inBox = !!(e.target as Element).closest?.(".drop-overlay-content");
          setDropActive(false);
          setDropInsideOnce(false);
          // Outside the box the files are swallowed: no upload, and the browser does not open them.
          if (inBox) uploads.handleDroppedItems(e.dataTransfer);
        }}
      >
        <div className={"drop-overlay-content" + (dropInside ? " over" : "")}>
          <i className={dropInside ? "fas fa-cloud-arrow-up" : "fas fa-cloud-upload-alt"} />
          <h2>{dropInside ? "ปล่อยเพื่ออัปโหลด" : "ลากมาวางในกรอบนี้"}</h2>
          <p className="drop-hint">{dropInside ? "ไฟล์จะถูกอัปโหลดเข้าอัลบั้มนี้" : "วางนอกกรอบจะไม่อัปโหลด"}</p>
        </div>
      </div>
      <div className="share-error" id="shareError" hidden={!shareErr}>
        {shareErr ? (
          <div className="share-error-card">
            <div className="share-error-icon">
              <i className={shareErr[0]} id="shareErrorIcon" />
            </div>
            <h2 id="shareErrorTitle">{shareErr[1]}</h2>
            <p id="shareErrorText">{shareErr[2]}</p>
            <button
              type="button"
              id="shareErrorRetry"
              hidden={shareError !== "network"}
              onClick={() => {
                setShareError(null);
                init();
              }}
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : null}
      </div>
      <div className={"photos-page" + (selMode ? " select-mode" : "")} id="page" style={shareErr ? { display: "none" } : undefined}>
        <header className="photos-header" ref={headerRef}>
          <div className="photos-header-inner">
            <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, width: "100%" }}>
              <a
                href={backHref() || "/photos/"}
                className={"photos-back-link" + (IS_SHARE && parent ? " share-back-visible" : "")}
                id="backLink"
                onPointerDown={(e) => warmLink(e.target)}
                onMouseOver={(e) => warmLink(e.target)}
                onClick={(e) => {
                  e.preventDefault();
                  const href = backHref();
                  if (href) leave(href);
                }}
              >
                <i className="fas fa-arrow-left" />
              </a>
              <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                <div className="share-line" id="shareLine" hidden={!IS_SHARE}>
                  <i className="fas fa-link" /> NEXT9 · ลิงก์ที่แชร์ให้ดู
                </div>
                <nav className="album-crumbs" id="albumCrumbs" aria-label="ตำแหน่ง" hidden={IS_SHARE ? breadcrumb.length === 0 : IS_ALL || initialLoading} ref={crumbsRef} onPointerDown={(e) => warmLink(e.target)} onMouseOver={(e) => warmLink(e.target)}>
                  {IS_SHARE
                    ? breadcrumb.map((b, i) => (
                        <Fragment key={b.id}>
                          {i ? <i className="fas fa-chevron-right" /> : null}
                          <a
                            href={shareAlbumUrl(b.id)}
                            onClick={(e) => {
                              e.preventDefault();
                              leave(shareAlbumUrl(b.id));
                            }}
                          >
                            {b.name}
                          </a>
                        </Fragment>
                      ))
                    : [
                        <a
                          key="root"
                          href="/photos/"
                          data-crumb=""
                          data-crumb-name="หน้าหลัก"
                          onClick={(e) => {
                            e.preventDefault();
                            leave("/photos/");
                          }}
                        >
                          อัลบั้มรูป
                        </a>,
                        ...breadcrumb.map((b) => (
                          <Fragment key={b.id}>
                            <i className="fas fa-chevron-right" />
                            <a
                              href={"/photos/album/?id=" + encodeURIComponent(b.id)}
                              data-crumb={b.id}
                              data-crumb-name={b.name}
                              onClick={(e) => {
                                e.preventDefault();
                                leave("/photos/album/?id=" + encodeURIComponent(b.id));
                              }}
                            >
                              {b.name}
                            </a>
                          </Fragment>
                        )),
                      ]}
                </nav>
                <div className={"title-container" + (titleOverflow ? " is-overflowing" : "")} ref={titleBoxRef}>
                  <h1 id="aTitle" ref={titleRef}>
                    <span className="title-track" ref={titleTrackRef}>
                      {title}
                    </span>
                  </h1>
                </div>
                <p id="aMeta">{meta}</p>
                <div className="album-status" id="albumStatus">
                  {IS_SHARE && shareInfo && !shareInfo.allow_download ? (
                    <span className="share-badge">
                      <i className="fas fa-eye" /> ดูอย่างเดียว
                    </span>
                  ) : processing > 0 ? (
                    <span className="status-badge processing">
                      <i className="fas fa-circle-notch fa-spin" /> กำลังประมวลผล {processing} ไฟล์
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {/* Action buttons: Upload + Hamburger menu */}
            <div className="photos-header-actions" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
              <button className="photos-header-btn" id="uploadBtn" onClick={() => fileInRef.current?.click()}>
                <i className="fas fa-cloud-upload-alt" /> อัปโหลด
              </button>
              <div style={{ position: "relative" }}>
                <button
                  className="photos-header-btn"
                  id="albumMenuBtn"
                  onClick={(e) => {
                    e.stopPropagation();
                    albumMenuAnchor.current = e.currentTarget.getBoundingClientRect();
                    albumMenuBtn.current = e.currentTarget;
                    setAlbumMenu((m) => !m);
                    hideCtx();
                    setBgMenu(null);
                  }}
                  style={{ padding: "0 12px" }}
                >
                  <i className="fas fa-bars" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Upload Summary */}
        {uploads.panelView}
        <input
          type="file"
          id="fileIn"
          ref={fileInRef}
          multiple
          accept="image/*,video/mp4,video/quicktime,video/webm"
          style={{ display: "none" }}
          onChange={(e) => {
            uploads.handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          type="file"
          id="folderIn"
          ref={folderInRef}
          {...{ webkitdirectory: "", directory: "" }}
          multiple
          style={{ display: "none" }}
          onChange={(e) => uploads.handleFolderInput(e.target)}
        />

        {/* Filters */}
        <div className="photos-content" style={{ paddingBottom: 80 }}>
          <section className="subfolders" id="subfolders" hidden={children.length === 0}>
            <div className="subfolders-head">
              <h2>
                <i className="fas fa-folder" /> โฟลเดอร์ <span className="subfolders-count" id="subfolderCount">{children.length}</span>
              </h2>
              <button type="button" className="subfolders-add" onClick={createSubfolder}>
                <i className="fas fa-folder-plus" />
                <span>โฟลเดอร์ใหม่</span>
              </button>
            </div>
            <div
              className={"pf-grid" + viewCls}
              id="subfolderGrid"
              onPointerDown={(e) => warmLink(e.target)}
              onMouseOver={(e) => warmLink(e.target)}
              ref={subGridRef}
              onClick={(e) => {
                const t = e.target as Element;
                if (t.closest("[data-more]") || folders.shouldSuppressClick()) return;
                const tile = t.closest(".pf-tile[data-id]") as HTMLElement | null;
                const a = tile && getChild(tile.dataset.id || "");
                if (!a) return;
                const url = IS_SHARE ? shareAlbumUrl(a.id) : "/photos/album/?id=" + encodeURIComponent(a.id);
                if (e.ctrlKey || e.metaKey) window.open(url, "_blank", "noopener");
                else leave(url);
              }}
              onKeyDown={(e) => {
                if (!IS_SHARE) return;
                const tile = (e.target as Element).closest?.(".pf-tile[data-id]") as HTMLElement | null;
                if (tile && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  leave(shareAlbumUrl(tile.dataset.id || ""));
                }
              }}
            >
              {orderedChildren.map((a) => (
                <FolderTile key={a.id} album={a} menu={!IS_SHARE} draggable={canDrag && !IS_SHARE} imageUrl={IS_SHARE ? (id, v) => imageUrl(id, v) : undefined} />
              ))}
            </div>
            <h2 className="files-label">
              <i className="fa-regular fa-images" /> รูปภาพและวิดีโอ
            </h2>
          </section>
          <div className="filter-bar" style={hideFilters ? { display: "none" } : undefined}>
            {/* Native <select>s drew their list with the operating system's own popup — a grey
                box that ignored the site entirely. These are the same MorphMenu as every other menu. */}
            <MorphMenu
              open={filterMenu === "sort"}
              onOpenChange={(o) => setFilterMenu(o ? "sort" : null)}
              align="start"
              width={170}
              triggerId="sortImg"
              triggerGlass={false}
              triggerClassName="filter-menu-trigger"
              triggerRadius={6}
              label="เรียงลำดับ"
              trigger={
                <>
                  {SORT_IMG_LABEL[sortImg] || SORT_IMG_LABEL.latest} <i className="fas fa-chevron-down filter-menu-chev" />
                </>
              }
            >
              {Object.entries(SORT_IMG_LABEL).map(([v, label]) => (
                <MorphMenuItem
                  key={v}
                  role="menuitemradio"
                  aria-checked={sortImg === v}
                  active={sortImg === v}
                  trailing={sortImg === v ? <i className="fas fa-check" /> : null}
                  onSelect={() => {
                    setFilterMenu(null);
                    setSort(v);
                  }}
                >
                  {label}
                </MorphMenuItem>
              ))}
            </MorphMenu>
            <MorphMenu
              id="dateField"
              open={filterMenu === "date"}
              onOpenChange={(o) => setFilterMenu(o ? "date" : null)}
              align="start"
              width={190}
              triggerGlass={false}
              triggerClassName="filter-menu-trigger"
              triggerRadius={6}
              triggerTitle="จัดกลุ่มและเรียงตามวันที่ใด"
              label="จัดกลุ่มตามวันที่"
              trigger={
                <>
                  {DATE_FIELD_LABEL[dateField] || DATE_FIELD_LABEL.upload} <i className="fas fa-chevron-down filter-menu-chev" />
                </>
              }
            >
              {Object.entries(DATE_FIELD_LABEL).map(([v, label]) => (
                <MorphMenuItem
                  key={v}
                  role="menuitemradio"
                  aria-checked={dateField === v}
                  active={dateField === v}
                  trailing={dateField === v ? <i className="fas fa-check" /> : null}
                  onSelect={() => {
                    setFilterMenu(null);
                    try {
                      localStorage.setItem("photos_date_field", v);
                    } catch {}
                    filters.current.dateField = v;
                    setDateField(v);
                    setCollapsedDays(new Set());
                    resetLoad();
                  }}
                >
                  {label}
                </MorphMenuItem>
              ))}
            </MorphMenu>
            <input
              type="month"
              id="filterMonth"
              value={filterMonth}
              onChange={(e) => {
                filters.current.filterMonth = e.target.value;
                setFilterMonth(e.target.value);
                resetLoad();
              }}
              style={{ minWidth: 140 }}
            />
            <button
              onClick={() => {
                filters.current.filterMonth = "";
                filters.current.sortImg = "latest";
                setFilterMonth("");
                setSortImg("latest");
                resetLoad();
              }}
              style={{ padding: "7px 14px", border: "1px solid #ddd", borderRadius: 6, background: "white", fontFamily: "'Prompt',sans-serif", fontSize: ".82rem", cursor: "pointer", color: "var(--text-light)" }}
            >
              ล้าง
            </button>
            <span id="fInfo" style={{ fontSize: ".8rem", color: "var(--text-light)", marginLeft: "auto" }}>
              {fInfo}
            </span>
            <div className="view-switch" role="group" aria-label="มุมมอง">
              {VIEW_MODES.map(([v, icon, label]) => (
                <button key={v} type="button" className={viewMode === v ? "is-on" : ""} aria-pressed={viewMode === v} title={label} aria-label={label} onClick={() => pickView(v)}>
                  <i className={icon} />
                </button>
              ))}
            </div>
            <div className="view-switch" role="group" aria-label="ขนาด">
              {VIEW_SIZES.map(([z, label, title]) => (
                <button key={z} type="button" className={viewSize === z ? "is-on" : ""} aria-pressed={viewSize === z} title={title} onClick={() => pickSize(z)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div id="grid" className={"photos-grid" + viewCls} ref={gridRef}>
            {gridItems}
          </div>
          <div id="empty" className="photos-empty" style={{ display: showEmpty ? "block" : "none" }}>
            <i className="fas fa-camera" />
            <p>ยังไม่มีรูป</p>
            <p className="empty-sub">กดปุ่ม &quot;อัปโหลด&quot; เพื่อเพิ่มรูป</p>
          </div>
          <div
            id="loadMore"
            ref={loadMoreRef}
            className="photos-load-more"
            style={{ display: more ? "block" : "none", textAlign: "center", padding: "40px 0", color: "var(--text-light)", fontSize: ".9rem" }}
          >
            <i className="fas fa-spinner fa-spin" /> กำลังโหลดรูปเพิ่มเติม...
          </div>
        </div>
      </div>

      {/* Lock Modal */}
      <div className={"quality-modal" + (lockScreen ? " show" : "")} id="lockModal">
        <div className={"quality-card" + (lockShake ? " shake" : "")} id="lockCard" style={{ textAlign: "center" }}>
          <div
            style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontSize: "1.8rem", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}
          >
            <i className="fas fa-lock" />
          </div>
          <h3 id="lockTitle" style={{ justifyContent: "center", marginBottom: 6, fontSize: "1.2rem" }}>
            {lockScreen?.title || "อัลบั้มนี้ถูกล็อก"}
          </h3>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", margin: "0 0 18px" }}>กรุณากรอกรหัสผ่านเพื่อเข้าดูรูปภาพ</p>
          <input
            ref={lockPwRef}
            type="password"
            id="lockPassword"
            placeholder="รหัสผ่าน"
            autoComplete="off"
            maxLength={64}
            value={lockPw}
            onChange={(e) => setLockPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAlbumPassword();
            }}
            style={{ width: "100%", padding: "12px 16px", border: "1px solid #d1d5db", borderRadius: 10, fontFamily: "'Prompt',sans-serif", fontSize: "1rem", outline: "none", textAlign: "center", boxSizing: "border-box" }}
          />
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "14px 0", fontSize: "0.85rem", color: "#4b5563", cursor: "pointer" }}>
            <input type="checkbox" id="rememberLockPass" checked={lockRemember} onChange={(e) => setLockRemember(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }} />
            <span>จดจำรหัสในการเข้าอัลบั้มครั้งถัดไป</span>
          </label>
          <button
            className="lock-btn"
            id="lockBtn"
            disabled={lockBusy}
            onClick={submitAlbumPassword}
            style={{ width: "100%", padding: 12, border: "none", borderRadius: 10, background: "var(--accent)", color: "white", fontFamily: "'Prompt',sans-serif", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" }}
          >
            เข้าถึงอัลบั้ม
          </button>
          <div className="lock-error" id="lockError" style={{ color: "#ef4444", fontSize: "0.82rem", marginTop: 8, minHeight: 20 }}>
            {lockError}
          </div>
          <div style={{ marginTop: 12 }}>
            <a
              href="/photos/"
              style={{ color: "#9ca3af", fontSize: "0.85rem", textDecoration: "none" }}
              onClick={(e) => {
                e.preventDefault();
                leave("/photos/");
              }}
            >
              <i className="fas fa-arrow-left" /> กลับหน้ารวมอัลบั้ม
            </a>
          </div>
        </div>
      </div>

      <Lightbox
        imgs={imgs}
        total={total}
        more={more}
        index={lbIdxLive}
        onIndex={openLB}
        ensureIndex={ensureIndex}
        onClose={() => {
          lbIdxRef.current = -1;
          lbIdRef.current = null;
          setLbId(null);
          setLbIdx(-1);
        }}
        imageUrl={imageUrl}
        onTierViewed={(id, tier) => {
          // Passive only: a grid tile sharpens after its image was actually viewed, capped at medium.
          if (tier !== "sd" && tier !== "medium") return;
          const cur = quality.get(id);
          if (cur === "medium" || cur === tier) return;
          quality.set(id, tier);
        }}
        selection={selection}
        isAll={IS_ALL}
        coverId={coverId}
        shareAllows={shareAllows}
        toast={(m, t) => ui.toast(m, t)}
        onAction={async (action: SheetAction, id: string) => {
          if (action === "select") {
            if (!selModeRef.current) toggleSelect(); // entering select mode fresh clears; already in it keeps
            toggleSel(id);
          } else if (action === "download") downloads.openQuality(id);
          else if (action === "convert") openConvertModal(id);
          else if (action === "rename") openRename(id);
          else if (action === "move" || action === "copy") {
            selection.clear();
            selection.set(id, true);
            showMoveModal(action);
          } else if (action === "openAlbum") {
            const img = imgsRef.current.find((i) => i.id === id);
            if (img) leave(albumUrlForImage(img));
          } else if (action === "cover") setAlbumCover(id);
          else if (action === "share") shareImage(id);
          else if (action === "delete") await deleteImageById(id);
        }}
      />

      {/* Bottom bar */}
      <div className={"bottom-bar" + (selMode ? " show" : "")} id="bottomBar" ref={bottomBarRef} style={shareErr ? { display: "none" } : undefined}>
        <div className="sb-count">
          <span id="selCnt">{selCount}</span> เลือกแล้ว
        </div>
        <div className="sb-actions">
          {/* The ⚡ button becomes its menu (shared layoutId). The rows keep their ids and
              data-share-* markers, and #sbActionsMenu sits on the rows' own parent, so share mode's
              direct-child rules still hide move/copy/convert/delete on public links. */}
          <MorphMenu
            open={sbMenu}
            onOpenChange={setSbMenu}
            side="top"
            align="end"
            width={250}
            maxHeight="min(60vh, 420px)"
            listId="sbActionsMenu"
            triggerId="sbActionsBtn"
            triggerGlass={false}
            triggerClassName="sb-btn primary"
            triggerRadius={20}
            tone="accent"
            label="ดำเนินการ"
            className="sb-actions-anchor"
            trigger={
              <>
                <i className="fas fa-bolt" /> ดำเนินการ <i className="fas fa-chevron-up" style={{ fontSize: ".65rem" }} />
              </>
            }
          >
            <MorphMenuItem
              data-share-ok
              id="sbSelectAllItem"
              active={total > 0 && selCount === total}
              onSelect={() => sbAction("selectAll")}
              icon={<i className="fas fa-check-double" style={{ color: "var(--accent)" }} />}
              trailing={<Kbd k="selectAll" />}
            >
              เลือกทั้งหมด
            </MorphMenuItem>
            <MorphMenuItem
              data-share-ok
              id="sbClearSelectionItem"
              onSelect={() => sbAction("clearSelection")}
              style={{ display: selCount > 0 ? "flex" : "none" }}
              icon={<i className="fas fa-times-circle" style={{ color: "#dc2626" }} />}
            >
              ยกเลิกการเลือกทั้งหมด
            </MorphMenuItem>
            <MorphMenuItem data-share-ok onSelect={() => sbAction("customSelect")} icon={<i className="fas fa-filter" style={{ color: "#8b5cf6" }} />}>
              เลือกแบบเจาะจง
            </MorphMenuItem>
            <MorphMenuSeparator data-share-ok data-share-dl />
            <MorphMenuItem data-share-ok data-share-dl id="sbDownloadItem" disabled={selDisabled} onSelect={() => sbAction("download")} icon={<i className="fas fa-download" style={{ color: "#6366f1" }} />}>
              ดาวน์โหลด
            </MorphMenuItem>
            <MorphMenuItem id="sbMoveItem" disabled={selDisabled} onSelect={() => sbAction("move")} icon={<i className="fas fa-folder-tree" style={{ color: "#0ea5e9" }} />}>
              ย้ายโฟลเดอร์
            </MorphMenuItem>
            <MorphMenuItem id="sbCopyItem" disabled={selDisabled} onSelect={() => sbAction("copy")} icon={<i className="fas fa-copy" style={{ color: "#8b5cf6" }} />}>
              คัดลอกไปอัลบั้มอื่น
            </MorphMenuItem>
            <MorphMenuItem id="sbConvertItem" disabled={selDisabled} onSelect={() => sbAction("convert")} icon={<i className="fas fa-exchange-alt" style={{ color: "#10b981" }} />}>
              แปลงไฟล์
            </MorphMenuItem>
            <MorphMenuItem data-share-edit id="sbRenameItem" disabled={selDisabled} onSelect={() => sbAction("rename")} icon={<i className="fas fa-pen" style={{ color: "#6366f1" }} />}>
              เปลี่ยนชื่อ
            </MorphMenuItem>
            <MorphMenuSeparator />
            <MorphMenuItem data-share-edit id="sbDeleteItem" danger disabled={selDisabled} onSelect={() => sbAction("delete")} icon={<i className="fas fa-trash" />}>
              ลบ
            </MorphMenuItem>
          </MorphMenu>
          <button className="sb-close-btn" onClick={toggleSelect} title="ยกเลิกการเลือก">
            <i className="fas fa-times" />
          </button>
        </div>
      </div>

      <button
        className={"photos-top-btn lg-glass-dark" + (scrollTopShow && lbIdx === -1 ? " show" : "")}
        id="scrollTopBtn"
        type="button"
        aria-label="เลื่อนขึ้นบนสุด"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <i className="fas fa-arrow-up" />
      </button>

      {/* Bottom tabs (All Photos) */}
      <nav className="album-tabbar" id="albumTabbar" aria-label="มุมมอง" data-tab-bar ref={tabbarRef}>
        <span className="nav-tab-pill" aria-hidden="true" />
        <a
          href="/photos/"
          data-tab-item
          onClick={(e) => {
            e.preventDefault();
            navProgress.start();
            // The indicator slides first (nav-motion.js), then the page pushes over.
            setTimeout(() => leave("/photos/"), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
          }}
        >
          <i className="fas fa-folder" />
          <span>อัลบั้ม</span>
        </a>
        <button type="button" className="active" aria-current="page" data-tab-item onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <i className="fas fa-images" />
          <span>รูปภาพ</span>
        </button>
      </nav>

      {/* Context Menu */}
      <PopupMenu id="ctxMenu" open={!!ctx} closing={!!ctx?.closing} anchor={ctxAnchor}>
        <button data-share-ok onClick={() => ctxAction("select")}>
          <i className="fas fa-check-circle" style={{ color: "var(--accent)" }} /> เลือก
        </button>
        <button data-share-ok data-share-dl onClick={() => ctxAction("download")}>
          <i className="fas fa-download" style={{ color: "#6366f1" }} /> ดาวน์โหลด
        </button>
        <button id="ctxOpenAlbumBtn" style={{ display: IS_ALL && ctxImg?.album_id ? "flex" : "none" }} onClick={() => ctxAction("openAlbum")}>
          <i className="fas fa-folder-tree" style={{ color: "#0ea5e9" }} /> เปิดในอัลบั้ม
        </button>
        <button onClick={() => ctxAction("move")}>
          <i className="fas fa-folder-open" style={{ color: "#f59e0b" }} /> ย้ายอัลบั้ม
        </button>
        <button onClick={() => ctxAction("copy")}>
          <i className="fas fa-copy" style={{ color: "#8b5cf6" }} /> คัดลอกไปอัลบั้มอื่น
        </button>
        <button id="ctxCoverBtn" style={{ display: IS_ALL || (ctx && coverId === ctx.id) ? "none" : "flex" }} onClick={() => ctxAction("cover")}>
          <i className="fas fa-image" style={{ color: "#f59e0b" }} /> ตั้งเป็นปกอัลบั้ม
        </button>
        <button data-share-edit onClick={() => ctxAction("rename")}>
          <i className="fas fa-pen" style={{ color: "#6366f1" }} /> เปลี่ยนชื่อ
        </button>
        <button onClick={() => ctxAction("share")}>
          <i className="fas fa-share-nodes" style={{ color: "#0369a1" }} /> แชร์ไฟล์นี้…
        </button>
        <button id="ctxConvertBtn" style={{ display: ctxImg?.file_type === "video" ? "none" : "flex" }} onClick={() => ctxAction("convert")}>
          <i className="fas fa-exchange-alt" style={{ color: "#10b981" }} /> แปลงไฟล์
        </button>
        <div className="ctx-sep" />
        <button data-share-edit className="danger" onClick={() => ctxAction("delete")}>
          <i className="fas fa-trash" /> ลบรูปนี้
        </button>
      </PopupMenu>

      {/* The header's ☰ menu: same component and look as the right-click menus, hung from its button. */}
      <PopupMenu id="albumDropdownMenu" open={albumMenu} anchor={albumMenu && albumMenuAnchor.current ? { rect: albumMenuAnchor.current, align: "end", el: albumMenuBtn.current } : null}>
      <button data-share-ok data-all-ok onClick={() => menuAction("selectAll")}>
        <i className="fas fa-check-double" style={{ color: "var(--accent)" }} /> เลือกทั้งหมด <Kbd k="selectAll" />
      </button>
      <button data-share-ok data-all-ok onClick={() => menuAction("select")}>
        <i className={"fas " + (selMode ? "fa-times-circle" : "fa-check-circle")} style={{ color: selMode ? "#dc2626" : "var(--accent)" }} />{" "}
        {selMode ? (
          <>
            ยกเลิกการเลือก <Kbd k="escape" />
          </>
        ) : (
          "เลือกรูป/วิดีโอ"
        )}
      </button>
      <div className="ctx-sep" />
      <button data-share-edit onClick={() => menuAction("rename")}>
        <i className="fas fa-pen" style={{ color: "#6366f1" }} /> เปลี่ยนชื่อ
      </button>
      <button onClick={() => menuAction("date")}>
        <i className="fa-regular fa-calendar" style={{ color: "#10b981" }} /> แก้ไขวันที่
      </button>
      <button data-share-edit hidden={IS_SHARE && !shareInfo?.include_subfolders} onClick={() => menuAction("subfolder")}>
        <i className="fas fa-folder-plus" style={{ color: "#b00909" }} /> สร้างโฟลเดอร์ย่อย
      </button>
      <button onClick={() => menuAction("moveAlbum")}>
        <i className="fas fa-folder-tree" style={{ color: "#0ea5e9" }} /> ย้ายอัลบั้มนี้…
      </button>
      <button onClick={() => menuAction("copyAlbum")}>
        <i className="fas fa-copy" style={{ color: "#8b5cf6" }} /> ทำสำเนาอัลบั้มนี้…
      </button>
      <button onClick={() => menuAction("shareAlbum")}>
        <i className="fas fa-share-nodes" style={{ color: "#0369a1" }} /> แชร์โฟลเดอร์นี้…
      </button>
      <button onClick={() => menuAction("zipTree")}>
        <i className="fas fa-file-zipper" style={{ color: "#6366f1" }} /> ดาวน์โหลดทั้งโฟลเดอร์ (ZIP)
      </button>
      <button data-share-edit hidden={IS_SHARE && !shareInfo?.include_subfolders} onClick={() => menuAction("uploadFolder")}>
        <i className="fas fa-folder-open" style={{ color: "#10b981" }} /> อัปโหลดทั้งโฟลเดอร์
      </button>
      <button onClick={() => menuAction("autoCover")} id="menuAutoCoverBtn" style={{ display: coverId ? undefined : "none" }}>
        <i className="fas fa-image" style={{ color: "#f59e0b" }} /> ใช้ปกอัตโนมัติ
      </button>
      <button onClick={() => menuAction("lock")} id="menuLockBtn">
        {albumIsLocked ? (
          <>
            <i className="fas fa-lock-open" style={{ color: "#10b981" }} /> ปลดล็อกอัลบั้ม
          </>
        ) : (
          <>
            <i className="fas fa-lock" style={{ color: "#f59e0b" }} /> ล็อกอัลบั้ม
          </>
        )}
      </button>
      <div className="ctx-sep" />
      <button className="danger" onClick={() => menuAction("delete")}>
        <i className="fas fa-trash" /> ลบอัลบั้ม
      </button>
      </PopupMenu>

      {/* Right-click on empty space: the album's own actions (same as the header menu). */}
      {bgMenu ? (
        <PopupMenu id="bgMenu" className="bg-menu" open anchor={bgAnchor}>
          {(!IS_SHARE || shareEdit) && !IS_ALL ? (
            <>
              <button onClick={() => bgAction("upload")}>
                <i className="fas fa-cloud-upload-alt" style={{ color: "var(--accent)" }} /> อัปโหลดรูป/วิดีโอ
              </button>
              <button hidden={IS_SHARE && !shareInfo?.include_subfolders} onClick={() => bgAction("uploadFolder")}>
                <i className="fas fa-folder-open" style={{ color: "#10b981" }} /> อัปโหลดทั้งโฟลเดอร์
              </button>
              <div className="ctx-sep" />
            </>
          ) : null}
          <button onClick={() => bgAction("selectAll")}>
            <i className="fas fa-check-double" style={{ color: "var(--accent)" }} /> เลือกทั้งหมด <Kbd k="selectAll" />
          </button>
          <button onClick={() => bgAction("select")}>
            <i className={"fas " + (selMode ? "fa-times-circle" : "fa-check-circle")} style={{ color: selMode ? "#dc2626" : "var(--accent)" }} />{" "}
            {selMode ? (
              <>
                ยกเลิกการเลือก <Kbd k="escape" />
              </>
            ) : (
              "เลือกรูป/วิดีโอ"
            )}
          </button>
          <div className="ctx-sep" />
          <div className="bg-menu-label">เรียงลำดับ</div>
          <button onClick={() => bgAction("latest")}>
            <i className="fas fa-arrow-down-wide-short" style={{ color: "#6366f1" }} /> ล่าสุดก่อน {sortImg === "latest" ? <i className="fas fa-check bg-menu-check" /> : null}
          </button>
          <button onClick={() => bgAction("oldest")}>
            <i className="fas fa-arrow-up-short-wide" style={{ color: "#6366f1" }} /> เก่าสุดก่อน {sortImg === "oldest" ? <i className="fas fa-check bg-menu-check" /> : null}
          </button>
          {shareEdit && shareInfo?.include_subfolders ? (
            <>
              <div className="ctx-sep" />
              <button onClick={() => bgAction("subfolder")}>
                <i className="fas fa-folder-plus" style={{ color: "#b00909" }} /> สร้างโฟลเดอร์ย่อย
              </button>
            </>
          ) : null}
          {!IS_SHARE && !IS_ALL ? (
            <>
              <div className="ctx-sep" />
              <button onClick={() => bgAction("subfolder")}>
                <i className="fas fa-folder-plus" style={{ color: "#b00909" }} /> สร้างโฟลเดอร์ย่อย
              </button>
              <button onClick={() => bgAction("shareAlbum")}>
                <i className="fas fa-share-nodes" style={{ color: "#0369a1" }} /> แชร์โฟลเดอร์นี้…
              </button>
              <button onClick={() => bgAction("zipTree")}>
                <i className="fas fa-file-zipper" style={{ color: "#6366f1" }} /> ดาวน์โหลดทั้งโฟลเดอร์ (ZIP)
              </button>
            </>
          ) : null}
          <div className="ctx-sep" />
          <button onClick={() => bgAction("refresh")}>
            <i className="fas fa-rotate-right" style={{ color: "#64748b" }} /> รีเฟรช
          </button>
        </PopupMenu>
      ) : null}

      {downloads.modals({ selectedIds: () => selection.keys(), currentId: imgs[lbIdxLive]?.id || null })}

      <RenameDialog items={renameItems} albumName={albumData?.name || ""} onClose={() => setRenameItems([])} onSubmit={executeRename} />

      {/* Convert Format Modal */}
      <div className={"quality-modal convert-modal" + (convert ? " show" : "")} id="convertModal">
        <div className="quality-card">
          <h3>
            <i className="fas fa-exchange-alt" style={{ color: "#10b981", marginRight: 6 }} /> แปลงไฟล์รูปภาพ
          </h3>
          <p style={{ marginBottom: 15, color: "var(--text-light)", fontSize: "0.9rem" }} id="convertModalSub">
            {convert?.sub || "เลือกนามสกุลไฟล์ที่ต้องการแปลง"}
          </p>
          <div style={{ marginBottom: 16 }}>
            {[
              ["jpg", "JPG (ไฟล์เล็ก ใช้งานทั่วไป)"],
              ["png", "PNG (คมชัด รองรับพื้นหลังโปร่งใส)"],
              ["webp", "WEBP (ไฟล์เล็กที่สุด คุณภาพดี)"],
            ].map(([v, label]) => (
              <label key={v}>
                <input type="radio" name="convertFmt" value={v} checked={convertFmt === v} onChange={() => setConvertFmt(v)} /> {label}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setConvert(null)} style={{ padding: "9px 18px", border: "1px solid #ddd", borderRadius: 8, background: "white", fontFamily: "'Prompt',sans-serif", cursor: "pointer" }}>
              ยกเลิก
            </button>
            <button onClick={executeConvert} style={{ padding: "9px 18px", border: "none", borderRadius: 8, background: "#10b981", color: "white", fontFamily: "'Prompt',sans-serif", fontWeight: 600, cursor: "pointer" }}>
              ตกลง
            </button>
          </div>
        </div>
      </div>

      {uploads.modals}

      {/* Custom Select Modal */}
      <div className={"quality-modal" + (csOpen ? " show" : "")} id="customSelectModal">
        <div className="quality-card cs-scroll" id="customSelectCard" style={{ maxWidth: 420, textAlign: "left", maxHeight: "85vh", overflowY: "auto" }}>
          <h3>
            <i className="fas fa-filter" style={{ color: "#8b5cf6", marginRight: 6 }} /> เลือกแบบเจาะจง
          </h3>
          <p style={{ marginBottom: 14, color: "var(--text-light)", fontSize: "0.85rem" }}>เลือกเงื่อนไข ระบบจะเลือกรูป/วิดีโอที่ตรงเงื่อนไขให้อัตโนมัติ</p>
          <div className="cs-section" id="csModeSection" style={{ display: selCount > 0 ? "block" : "none" }}>
            <div className="cs-label">
              โหมดการเลือก (มี <span id="csModeCount">{selCount}</span> รายการที่เลือกอยู่แล้ว)
            </div>
            {[
              ["replace", "fas fa-rotate", "var(--text-light)", "เลือกใหม่เฉพาะเงื่อนไขนี้"],
              ["add", "fas fa-plus", "#10b981", "เลือกเพิ่มจากเดิม"],
              ["remove", "fas fa-minus", "#dc2626", "ยกเลิกการเลือกตามเงื่อนไขนี้"],
            ].map(([v, icon, color, label]) => (
              <label key={v} className="cs-mode-opt">
                <input type="radio" name="csMode" value={v} checked={cs.mode === v} onChange={() => setCs((c) => ({ ...c, mode: v }))} />
                <i className={icon} style={{ color, width: 14 }} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <CsChips label="ประเภท" id="csCategoryChips" items={CS_CATEGORY_ITEMS} value={cs.cat} onChange={(v) => setCs((c) => ({ ...c, cat: v }))} />
          <button type="button" className={"cs-accordion-toggle" + (csAdv ? " open" : "")} id="csAdvToggle" onClick={() => setCsAdv((a) => !a)}>
            <span>ตัวเลือกเพิ่มเติม</span>
            <i className="fas fa-chevron-down" />
          </button>
          <div className={"cs-advanced" + (csAdv ? " open" : "")} id="csAdvanced">
            <CsChips label="นามสกุลไฟล์" id="csExtChips" items={CS_EXT_ITEMS} value={cs.ext} onChange={(v) => setCs((c) => ({ ...c, ext: v }))} />
            <CsChips label="ความละเอียด (เฉพาะรูปภาพ)" id="csResChips" items={CS_RES_ITEMS} value={cs.res} onChange={(v) => setCs((c) => ({ ...c, res: v }))} />
            <div className="cs-section">
              <div className="cs-label">ช่วงลำดับ (ตามที่แสดงในหน้านี้)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" id="csRangeFrom" placeholder="รูปที่" min={1} className="cs-input" value={cs.from} onChange={(e) => setCs((c) => ({ ...c, from: e.target.value }))} />
                <span style={{ color: "var(--text-light)", fontSize: ".85rem" }}>ถึง</span>
                <input type="number" id="csRangeTo" placeholder="รูปที่" min={1} className="cs-input" value={cs.to} onChange={(e) => setCs((c) => ({ ...c, to: e.target.value }))} />
              </div>
            </div>
            <div className="cs-section" style={{ marginBottom: 4 }}>
              <div className="cs-label">ช่วงวันที่</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="date" id="csDateFrom" className="cs-input" value={cs.dateFrom} onChange={(e) => setCs((c) => ({ ...c, dateFrom: e.target.value }))} />
                <span style={{ color: "var(--text-light)", fontSize: ".85rem" }}>ถึง</span>
                <input type="date" id="csDateTo" className="cs-input" value={cs.dateTo} onChange={(e) => setCs((c) => ({ ...c, dateTo: e.target.value }))} />
              </div>
            </div>
          </div>
          <div style={{ padding: "16px 0 0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => setCsOpen(false)} className="cs-cancel-btn">
              ยกเลิก
            </button>
            <button onClick={applyCustomSelect} className="cs-apply-btn">
              เลือกตามเงื่อนไข
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function CsChips({ label, id, items, value, onChange }: { label: string; id: string; items: { v: string; label: string }[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  return (
    <div className="cs-section">
      <div className="cs-label">{label}</div>
      <div className="cs-chips" id={id}>
        {items.map((it) => (
          <label key={it.v} className={"cs-chip" + (value.has(it.v) ? " checked" : "")}>
            <input
              type="checkbox"
              value={it.v}
              checked={value.has(it.v)}
              onChange={(e) => {
                const next = new Set(value);
                if (e.target.checked) next.add(it.v);
                else next.delete(it.v);
                onChange(next);
              }}
            />
            {it.label}
          </label>
        ))}
      </div>
    </div>
  );
}


