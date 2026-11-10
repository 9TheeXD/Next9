"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Album } from "@/lib/photos/types";
import { fmt, getCookie, hotkey } from "@/lib/photos/util";
import { countsOf } from "@/lib/photos/tree";
import { navProgress } from "@/lib/navProgress";
import { useSwipeNav } from "@/lib/photos/swipeNav";
import { useAppNavigate, usePrefetch } from "@/lib/useAppNavigate";
import { FoldersProvider, useAlbumDrag, useCanDrag, useDropTargets, useFolderGestures, useFolders, type Change } from "../folders/FoldersProvider";
import { PageShell, useShellClasses } from "../ui/PageShell";
import { PhotosUIProvider, usePhotosUI } from "../ui/PhotosUI";
import { AlbumCard, AlbumCardSkeletons, CreateAlbumCard, scheduleCoverUpgrades } from "./AlbumCard";
import { SharesView } from "./SharesView";
import { MorphMenu, MorphMenuItem } from "../ui/MorphMenu";
import { useCollapsingHeader } from "@/lib/photos/collapsingHeader";
import { TrashView } from "./TrashView";

// /photos/ — the album list, with the trash and shared-links views (?view=trash|shares). Native port
// of the legacy photos/index.html.

const CACHE_KEY = "photos_albums_cache_v2";
type View = null | "trash" | "shares";
const VIEW_TITLES: Record<"trash" | "shares", [string, string]> = { trash: ["fas fa-trash-can", "ถังขยะ"], shares: ["fas fa-link", "ลิงก์ที่แชร์"] };

type Sort = "default" | "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "count_desc" | "count_asc" | "name_asc";
// The sort choices, in the order the old <select> listed them.
const SORT_LABEL: Record<Sort, string> = {
  default: "ค่าเริ่มต้น",
  updated_desc: "แก้ไขล่าสุด",
  updated_asc: "แก้ไขเก่าสุด",
  created_desc: "สร้างล่าสุด",
  created_asc: "สร้างเก่าสุด",
  count_desc: "จำนวนรูปมากสุด",
  count_asc: "จำนวนรูปน้อยสุด",
  name_asc: "ชื่อ ก-ฮ",
};
function sortList(list: Album[], sort: Sort) {
  const date = (a: Album) => a.event_date || a.created_at || 0;
  return list.slice().sort((a, b) => {
    switch (sort) {
      case "updated_desc":
        return (b.updated_at || 0) - (a.updated_at || 0);
      case "updated_asc":
        return (a.updated_at || 0) - (b.updated_at || 0);
      case "created_desc":
        return (b.created_at || 0) - (a.created_at || 0);
      case "created_asc":
        return (a.created_at || 0) - (b.created_at || 0);
      case "count_desc":
        return countsOf(b).photos - countsOf(a).photos || (b.updated_at || 0) - (a.updated_at || 0);
      case "count_asc":
        return countsOf(a).photos - countsOf(b).photos || (b.updated_at || 0) - (a.updated_at || 0);
      case "name_asc":
        return a.name.localeCompare(b.name, "th");
      default:
        return date(b) - date(a) || (b.updated_at || 0) - (a.updated_at || 0);
    }
  });
}
function pathNames(a: Album, byId: Map<string, Album>) {
  const names: string[] = [];
  const seen = new Set<string>();
  let cur = a.parent_id ? byId.get(a.parent_id) : undefined;
  while (cur && !seen.has(cur.id)) {
    names.unshift(cur.name);
    seen.add(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return names;
}
const readView = (): View => {
  const v = new URLSearchParams(location.search).get("view");
  return v === "trash" || v === "shares" ? v : null;
};
const moveTo = (dir: "forward" | "back", change: () => void) => (window.navMotion?.run ? window.navMotion.run(dir, change) : change());

export function PhotosHome() {
  return (
    <PageShell scope="lp-home">
      <PhotosUIProvider variant="home">
        <FoldersProvider>
          <Home />
        </FoldersProvider>
      </PhotosUIProvider>
    </PageShell>
  );
}

function Home() {
  const ui = usePhotosUI();
  const folders = useFolders();
  const navigate = useAppNavigate();
  const prefetch = usePrefetch();
  const setShellClasses = useShellClasses();

  const [auth, setAuth] = useState<"checking" | "in" | "out">("checking");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [albums, setAlbums] = useState<Album[]>([]);
  const [hasData, setHasData] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [initial, setInitial] = useState(true);
  const albumsRef = useRef<Album[]>([]);
  const net = useRef<{ etag: string | null; lastBody: string | null; inflight: Promise<void> | null; hasData: boolean }>({ etag: null, lastBody: null, inflight: null, hasData: false });

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("default");
  const [view, setView] = useState<View>(null);
  const [viewStats, setViewStats] = useState<React.ReactNode>(null);
  const [scrollShow, setScrollShow] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabbarRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useCollapsingHeader(headerRef, "#backBtn", ".photos-toolbar");
  const [sortOpen, setSortOpen] = useState(false);
  const canDrag = useCanDrag();

  const applyAlbums = useCallback((list: Album[]) => {
    albumsRef.current = list;
    setAlbums(list);
  }, []);

  // ===== Data: render cached list instantly, then revalidate with the server (ETag) =====
  const loadAlbums = useCallback(
    function load(force?: boolean): Promise<void> {
      const n = net.current;
      if (n.inflight) return force ? n.inflight.then(() => load(true)) : n.inflight;
      n.inflight = (async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        try {
          const headers: Record<string, string> = {};
          if (!force && n.etag && n.hasData) headers["If-None-Match"] = n.etag;
          const res = await fetch("/api/photos/albums", { credentials: "include", cache: "no-store", headers, signal: ctrl.signal });
          if (res.status === 304) return;
          if (!res.ok) throw new Error("HTTP " + res.status);
          const body = await res.text();
          n.etag = res.headers.get("ETag");
          if (body !== n.lastBody || !n.hasData) {
            n.lastBody = body;
            n.hasData = true;
            applyAlbums(JSON.parse(body));
            setHasData(true);
            setLoadError(false);
          }
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ etag: n.etag, body: n.lastBody, at: Date.now() }));
          } catch {}
        } catch {
          if (!n.hasData) setLoadError(true);
          else if (force) ui.toast("อัปเดตรายการไม่สำเร็จ", "error");
        } finally {
          clearTimeout(timer);
          n.inflight = null;
        }
      })();
      return n.inflight;
    },
    [applyAlbums, ui],
  );

  const showApp = useCallback(() => {
    const p = new URLSearchParams(location.search);
    const to = p.get("to");
    if (to) {
      navigate("/photos/album/?id=" + encodeURIComponent(to), { replace: true });
      return;
    }
    // The "รูปภาพ" tab lives on the album page, which already has the grid, lightbox and menus.
    if (p.get("tab") === "photos" && !readView()) {
      navigate("/photos/album/?view=all", { replace: true });
      return;
    }
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (c && c.body) {
        applyAlbums(JSON.parse(c.body));
        net.current.lastBody = c.body;
        net.current.etag = c.etag || null;
        net.current.hasData = true;
        setHasData(true);
      }
    } catch {}
    setView(readView());
    setAuth("in");
    loadAlbums(false);
  }, [navigate, applyAlbums, loadAlbums]);

  // ===== Init =====
  useEffect(() => {
    const saved = getCookie("photos_token") || localStorage.getItem("photos_token");
    // The cookie can only be read after mount: decide there between the app and the login card.
    if (saved) {
      sessionStorage.setItem("photos_token", saved);
       
      showApp();
    } else {
      document.documentElement.classList.remove("has-token");
      setAuth("out");
    }
    const mq = window.matchMedia("(max-width: 600px)");
    setNarrow(mq.matches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doLogin() {
    try {
      const res = await fetch("/api/photos/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (data.success) {
        document.cookie = "photos_token=" + password + "; path=/; max-age=31536000";
        localStorage.setItem("photos_token", password);
        sessionStorage.setItem("photos_token", password);
        showApp();
      } else setLoginError("รหัสผ่านไม่ถูกต้อง");
    } catch {
      setLoginError("ไม่สามารถเชื่อมต่อได้");
    }
  }

  // Revalidate while the tab is visible (cheap 304s when nothing changed); never poll hidden tabs.
  useEffect(() => {
    if (auth !== "in") return;
    const tick = () => {
      if (!document.hidden) loadAlbums(false);
    };
    const id = setInterval(tick, 30000);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) loadAlbums(false);
    };
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", onPageShow);
    scheduleCoverUpgrades();
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [auth, loadAlbums]);

  // The รูปภาพ tab is one tap away: have it ready.
  useEffect(() => {
    if (auth === "in") prefetch("/photos/album/?view=all");
  }, [auth, prefetch]);

  // The page's own album list backs the folder menus and picker.
  useEffect(() => {
    folders.configure({ getAlbums: () => albumsRef.current, reload: (force) => loadAlbums(force) });
    return () => folders.configure(null);
  }, [folders, loadAlbums]);

  const onAlbumChanged = useCallback(
    (change: Change) => {
      if (change.kind === "dnd-move" || change.kind === "undo") {
        net.current.lastBody = null;
        loadAlbums(true);
        return;
      }
      if (change.kind === "delete" && change.id) {
        const gone = descendantsOf(albumsRef.current, change.id);
        applyAlbums(albumsRef.current.filter((a) => !gone.has(a.id)));
      } else {
        applyAlbums(albumsRef.current.slice()); // actions mutate the album in place (pin, rename, move)
      }
      net.current.lastBody = null; // whatever the server returns next replaces the optimistic state
      loadAlbums(true);
    },
    [applyAlbums, loadAlbums],
  );

  const getAlbum = useCallback((id: string) => albumsRef.current.find((a) => a.id === id), []);
  const openAlbum = useCallback(
    (id: string, newTab?: boolean) => {
      const url = "/photos/album/?id=" + encodeURIComponent(id);
      if (newTab) window.open(url, "_blank", "noopener");
      else navigate(url);
    },
    [navigate],
  );

  useFolderGestures(gridRef, { selector: ".photos-album-card[data-id]", getAlbum, onChanged: onAlbumChanged, onOpen: (a) => openAlbum(a.id), enabled: auth === "in" });
  useAlbumDrag(gridRef, { selector: ".photos-album-card[data-id]", getAlbum, enabled: canDrag && auth === "in" });
  useDropTargets(gridRef, {
    selector: ".photos-album-card[data-id]",
    targetOf: (el) => {
      const a = getAlbum(el.dataset.id || "");
      return a ? { id: a.id, name: a.name } : null;
    },
    onChanged: onAlbumChanged,
    enabled: canDrag && auth === "in",
  });

  // Touching or hovering an album card starts loading that album, ahead of the tap completing.
  const warmCard = (target: EventTarget) => {
    const card = (target as Element).closest?.(".photos-album-card[data-id]") as HTMLElement | null;
    if (card) prefetch("/photos/album/?id=" + encodeURIComponent(card.dataset.id || ""));
  };

  async function createAlbum() {
    const name = await ui.prompt({ title: "สร้างอัลบั้มใหม่", placeholder: "กรอกชื่ออัลบั้ม...", confirmText: "สร้างอัลบั้ม" });
    if (!name || !name.trim()) return;
    ui.toast(
      <>
        <i className="fas fa-circle-notch fa-spin" /> กำลังสร้างอัลบั้ม...
      </>,
      "success",
      true,
    );
    try {
      const res = await fetch("/api/photos/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: getCookie("photos_token") || localStorage.getItem("photos_token") || "" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        ui.toast("สร้างอัลบั้มสำเร็จ", "success");
        openAlbum(data.album.id);
      } else ui.toast("สร้างอัลบั้มไม่สำเร็จ", "error");
    } catch {
      ui.toast("เกิดข้อผิดพลาด", "error");
    }
  }

  // ===== Views: ถังขยะ / ลิงก์ที่แชร์ go one level deeper and slide in from the right =====
  const openView = (v: "trash" | "shares") =>
    moveTo("forward", () => {
      flushSync(() => {
        setViewStats(null);
        setView(v);
      });
      history.pushState({ ...(history.state || {}), photosMode: true }, "", "/photos/?view=" + v);
      window.scrollTo(0, 0);
    });
  const closeView = () => {
    if (history.state && history.state.photosMode) history.back();
    else
      moveTo("back", () => {
        flushSync(() => setView(null));
        history.replaceState(history.state, "", "/photos/");
        window.scrollTo(0, 0);
      });
  };
  const viewRef = useRef<View>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    if (auth !== "in") return;
    const onPop = () => {
      const next = readView();
      const cur = viewRef.current;
      if (cur === next) return;
      moveTo(cur && !next ? "back" : "forward", () => {
        flushSync(() => {
          setViewStats(null);
          setView(next);
        });
        window.scrollTo(0, 0);
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [auth]);

  // "/" focuses the search box.
  useEffect(() => {
    if (auth !== "in") return;
    const onKey = (e: KeyboardEvent) => {
      if (hotkey(e, "/") && !view && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as Element)?.tagName || "")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [auth, view]);

  // A thumbnail that fails to load shows the tile's grey placeholder instead of a broken-image icon.
  useEffect(() => {
    const onError = (e: Event) => {
      const el = e.target as HTMLImageElement;
      if (el && el.tagName === "IMG" && /\/api\/image\/[^/]+\/thumb/.test(el.getAttribute("src") || "")) el.style.visibility = "hidden";
    };
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);

  // Back-to-top button: appears once the visitor is a couple of screens down (one check per frame).
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      setScrollShow(window.scrollY > 1000);
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

  // Swipes: left switches to the รูปภาพ tab (through its button, so the indicator slides as on a tap);
  // the edge back gesture leaves the trash / shared-links view for the album list.
  useSwipeNav({
    enabled: () => auth === "in",
    onBack: () => {
      if (view) closeView();
    },
    onSwipeLeft: () => {
      if (!view) tabbarRef.current?.querySelector<HTMLButtonElement>('[data-tab="photos"]')?.click();
    },
  });

  // Tab bar: sliding red indicator from /nav-motion.js.
  useEffect(() => {
    if (tabbarRef.current) window.navMotion?.setupTabBar?.(tabbarRef.current);
  }, [auth]);

  // Page-state classes on the wrapper (legacy: on <html>).
  useLayoutEffect(() => {
    setShellClasses((auth === "in" ? "has-token" : "") + (auth === "in" && !view ? " has-tabbar" : ""));
  }, [auth, view, setShellClasses]);

  // Cards fade up on the first render with data only.
  useEffect(() => {
    if (!hasData) return;
    const id = requestAnimationFrame(() => setInitial(false));
    return () => cancelAnimationFrame(id);
  }, [hasData]);

  const visible = useMemo(() => albums.filter((a) => a.name && !a.name.startsWith("[DELETED] ")), [albums]);
  const byId = useMemo(() => new Map(visible.map((a) => [a.id, a])), [visible]);
  const q = query.trim().toLowerCase();
  const results = useMemo(() => (q ? sortList(visible.filter((a) => a.name.toLowerCase().includes(q)), sort) : null), [q, visible, sort]);
  const pinned = useMemo(() => visible.filter((a) => a.pinned_at).sort((a, b) => (b.pinned_at || 0) - (a.pinned_at || 0)), [visible]);
  const rest = useMemo(() => sortList(visible.filter((a) => !a.pinned_at && (!a.parent_id || !byId.has(a.parent_id))), sort), [visible, byId, sort]);
  const animate = initial;

  let stats: React.ReactNode;
  if (view) stats = viewStats;
  else if (!hasData)
    stats = (
      <>
        <span className="sk-light" style={{ width: 68 }} />
        <span className="sk-light" style={{ width: 80 }} />
        <span className="sk-light" style={{ width: 74 }} />
      </>
    );
  else {
    const list = results || visible;
    let photos = 0,
      videos = 0;
    for (const a of list) {
      photos += a.photo_count || 0;
      videos += a.video_count || 0;
    }
    stats = (
      <>
        {results ? <span className="stat-note">ผลการค้นหา</span> : null}
        <span>
          <i className="fas fa-folder" />
          {fmt(list.length)} อัลบั้ม
        </span>
        <span>
          <i className="fa-regular fa-image" />
          {fmt(photos)} รูป
        </span>
        <span>
          <i className="fa-solid fa-video" />
          {fmt(videos)} วิดีโอ
        </span>
      </>
    );
  }
  if (loadError && !hasData && !view) stats = "";

  const [icon, title] = view ? VIEW_TITLES[view] : ["fas fa-images", "อัลบั้มรูป"];
  const inView = !!view;

  const onTrashStats = useCallback(
    (a: number, f: number) =>
      setViewStats(
        <>
          <span>
            <i className="fas fa-folder" />
            {fmt(a)} โฟลเดอร์
          </span>
          <span>
            <i className="fa-regular fa-file" />
            {fmt(f)} ไฟล์
          </span>
        </>,
      ),
    [],
  );
  const onShareStats = useCallback(
    (n: number) =>
      setViewStats(
        <span>
          <i className="fas fa-link" />
          {fmt(n)} ลิงก์ที่ใช้งานอยู่
        </span>,
      ),
    [],
  );

  return (
    <>
      {/* Login Gate */}
      <div id="loginPage" className="photos-login-page" style={auth === "in" ? { display: "none" } : undefined}>
        <div className="photos-login-card">
          <div className="login-icon">
            <i className="fas fa-camera-retro" />
          </div>
          <h2>อัลบั้มรูป NEXT9</h2>
          <p className="login-sub">กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน</p>
          <input
            type="password"
            className="toilet-login-input"
            id="passwordInput"
            placeholder="รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doLogin();
            }}
          />
          <button className="toilet-login-btn" onClick={doLogin}>
            เข้าสู่ระบบ
          </button>
          <div className="toilet-login-error" id="loginError">
            {loginError}
          </div>
        </div>
      </div>

      {/* Main App */}
      <div id="app" style={auth === "in" ? { display: "block" } : { display: "none" }}>
        <div className="photos-page">
          <header className="photos-header" ref={headerRef}>
            <div className="photos-header-inner">
              <div className="header-title-wrap">
                <button type="button" className="back-btn" id="backBtn" aria-label="กลับ" hidden={!inView} onClick={closeView}>
                  <i className="fas fa-arrow-left" />
                </button>
                <div style={{ minWidth: 0 }}>
                  <h1>
                    <i className={icon} id="pageIcon" /> <span id="pageTitle">{title}</span>
                  </h1>
                  <div className="header-stats" id="albumCountText" aria-live="polite">
                    {stats}
                  </div>
                </div>
              </div>
              <div className="header-actions">
                <button className="photos-header-btn" type="button" id="trashBtn" title="ถังขยะ" aria-label="ถังขยะ" hidden={inView} onClick={() => openView("trash")}>
                  <i className="fas fa-trash-can" />
                  <span>ถังขยะ</span>
                </button>
                <button className="photos-header-btn" type="button" id="sharesBtn" title="ลิงก์ที่แชร์" aria-label="ลิงก์ที่แชร์" hidden={inView} onClick={() => openView("shares")}>
                  <i className="fas fa-link" />
                  <span>ลิงก์ที่แชร์</span>
                </button>
                <button className="photos-header-btn" type="button" id="createBtn" aria-label="อัลบั้มใหม่" hidden={inView} onClick={createAlbum}>
                  <i className="fas fa-folder-plus" />
                  <span>อัลบั้มใหม่</span>
                </button>
              </div>
            </div>
            <div className="photos-toolbar" id="albumToolbar" hidden={inView}>
              <label className="search-box">
                <i className="fas fa-search" />
                <input
                  ref={searchRef}
                  type="search"
                  id="searchInput"
                  placeholder="ค้นหาอัลบั้มทั้งหมด (รวมโฟลเดอร์ย่อย)..."
                  autoComplete="off"
                  enterKeyHint="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="search-clear"
                  id="searchClear"
                  aria-label="ล้างคำค้นหา"
                  hidden={!q}
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  <i className="fas fa-xmark" />
                </button>
              </label>
              {/* The sort control. It was a native <select>, whose list is drawn by the operating
                  system — nothing on the page can style it, animate it or put it on glass, which is
                  why it looked like no other menu here. The trigger keeps the header's own
                  translucent look (it sits on the solid red header); the list it opens is glass. */}
              <MorphMenu
                open={sortOpen}
                onOpenChange={setSortOpen}
                align="end"
                side="bottom"
                width={210}
                label="เรียงลำดับ"
                triggerGlass={false}
                className="sort-menu"
                triggerClassName="sort-menu-trigger"
                triggerRadius={8}
                trigger={
                  <>
                    <i className="fa-solid fa-arrow-down-wide-short" />
                    <span>{SORT_LABEL[sort]}</span>
                    <i className="fa-solid fa-chevron-down sort-menu-chev" />
                  </>
                }
              >
                {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
                  <MorphMenuItem
                    key={k}
                    active={k === sort}
                    icon={k === sort ? <i className="fas fa-check" /> : null}
                    onSelect={() => {
                      setSort(k);
                      setSortOpen(false);
                    }}
                  >
                    {SORT_LABEL[k]}
                  </MorphMenuItem>
                ))}
              </MorphMenu>
            </div>
          </header>

          <div className="photos-content">
            <div id="albumPane" hidden={inView}>
              <div
                id="albumGrid"
                className="photos-album-grid"
                ref={gridRef}
                onPointerDown={(e) => warmCard(e.target)}
                onMouseOver={(e) => warmCard(e.target)}
                onClick={(e) => {
                  const t = e.target as Element;
                  if (t.closest("[data-more]")) return;
                  if (folders.shouldSuppressClick()) return;
                  if (t.closest("[data-retry]")) {
                    loadAlbums(true);
                    return;
                  }
                  if (t.closest("#createAlbumBtn")) {
                    createAlbum();
                    return;
                  }
                  const card = t.closest(".photos-album-card[data-id]") as HTMLElement | null;
                  if (card) openAlbum(card.dataset.id!, e.ctrlKey || e.metaKey);
                }}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && (e.target as Element).id === "createAlbumBtn") {
                    e.preventDefault();
                    createAlbum();
                  }
                }}
              >
                {loadError && !hasData ? (
                  <div className="grid-error">
                    <i className="fas fa-wifi" style={{ fontSize: "2rem", opacity: 0.4 }} />
                    <div style={{ marginTop: 10 }}>โหลดอัลบั้มไม่สำเร็จ</div>
                    <button type="button" data-retry>
                      ลองอีกครั้ง
                    </button>
                  </div>
                ) : !hasData ? (
                  <AlbumCardSkeletons />
                ) : results ? (
                  <>
                    <div className="grid-section">
                      <i className="fas fa-magnifying-glass" />
                      <span>ผลการค้นหา</span>
                      <b>{fmt(results.length)}</b>
                    </div>
                    {results.length ? (
                      results.map((a, i) => <AlbumCard key={a.id} a={a} index={i} path={a.parent_id ? pathNames(a, byId) : []} animate={animate} narrow={narrow} draggable={canDrag} />)
                    ) : (
                      <div className="grid-empty">ไม่พบอัลบั้มที่ตรงกับ “{query.trim()}”</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid-section">
                      <i className="fas fa-folder" />
                      <span>อัลบั้มทั้งหมด</span>
                      <b>{fmt(pinned.length + rest.length)}</b>
                    </div>
                    <CreateAlbumCard animate={animate} />
                    {pinned.map((a, i) => (
                      <AlbumCard key={a.id} a={a} index={i + 1} path={a.parent_id ? pathNames(a, byId) : []} animate={animate} narrow={narrow} draggable={canDrag} />
                    ))}
                    {rest.map((a, i) => (
                      <AlbumCard key={a.id} a={a} index={i + 1 + pinned.length} path={[]} animate={animate} narrow={narrow} draggable={canDrag} />
                    ))}
                  </>
                )}
              </div>
            </div>
            <div id="trashPane" hidden={view !== "trash"}>
              {view === "trash" ? <TrashView onStats={onTrashStats} onAlbumsChanged={() => loadAlbums(true)} /> : null}
            </div>
            <div id="sharesPane" hidden={view !== "shares"}>
              {view === "shares" ? <SharesView onStats={onShareStats} /> : null}
            </div>
          </div>
        </div>
        <button
          className={"photos-top-btn lg-glass-dark" + (scrollShow ? " show" : "")}
          id="scrollTopBtn"
          type="button"
          aria-label="เลื่อนขึ้นบนสุด"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <i className="fas fa-arrow-up" />
        </button>
        <nav className="tabbar" id="tabbar" aria-label="มุมมอง" data-tab-bar hidden={inView} ref={tabbarRef}>
          <span className="nav-tab-pill" aria-hidden="true" />
          <button type="button" data-tab="albums" data-tab-item className="active" aria-current="page" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <i className="fas fa-folder" />
            <span>อัลบั้ม</span>
          </button>
          <button
            type="button"
            data-tab="photos"
            data-tab-item
            onClick={() => {
              navProgress.start();
              // The indicator slides first (nav-motion.js), then the page pushes over.
              setTimeout(() => navigate("/photos/album/?view=all"), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
            }}
          >
            <i className="fas fa-images" />
            <span>รูปภาพ</span>
          </button>
        </nav>
      </div>
    </>
  );
}

function descendantsOf(list: Album[], id: string) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of list)
      if (a.parent_id && ids.has(a.parent_id) && !ids.has(a.id)) {
        ids.add(a.id);
        grew = true;
      }
  }
  return ids;
}

