"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { resBadgeLabel, hotkey } from "@/lib/photos/util";
import { MorphMenu, MorphMenuItem, MorphMenuSeparator } from "@/components/photos/ui/MorphMenu";
import type { KeyedStore, Photo } from "./model";
import { VideoPlayer, type VideoPlayerHandle } from "./VideoPlayer";

// The album page's photo viewer (legacy lightbox): progressive tiers (preview → thumb → sd, medium past
// 1.5x zoom, original past 3x) with a quality indicator and manual tier menu, focal wheel/pinch zoom,
// double-click zoom, drag/touch pan, swipe and arrow navigation with slide animation, the custom
// video player, the actions sheet, the "เลือกแล้ว" badge, and the slideshow with its speed chip.

export type SheetAction = "select" | "download" | "slideshow" | "openAlbum" | "convert" | "move" | "copy" | "cover" | "share" | "rename" | "delete";

// The photo goes on screen as soon as ANY copy of it has arrived: the 280 px thumbnail is already in
// the browser's cache from the grid behind, so that is immediate. The spinner stays on top of it
// until a copy worth looking at — this tier — has landed, so the visitor sees the photo they clicked
// straight away and is told it is still sharpening. (The tiny inline preview is still never used:
// blown up to the size of the window it is a smear, not a picture.)
const LB_SHARP_TIER = "sd" as const;
// The sharpest tier each photo has actually been shown at, for as long as the page is open. Opening
// a photo again goes back to what it was last seen at instead of starting from scratch and waiting
// for the visitor to zoom in before it sharpens again.
const bestTierSeen = new Map<string, "thumb" | "sd" | "medium" | "original">();

const LB_MEDIUM_ZOOM = 1.5;
const LB_ORIGINAL_ZOOM = 3;
const LB_TIER_ORDER = ["thumb", "sd", "medium", "original"] as const;
type Tier = (typeof LB_TIER_ORDER)[number];
const LB_TIER_RANK: Record<Tier, number> = { thumb: 0, sd: 1, medium: 2, original: 3 };
const LB_TIER_NAME: Record<Tier, string> = { thumb: "เร็วสุด", sd: "เร็ว", medium: "มาตรฐาน", original: "ต้นฉบับ" };
const SLIDE_STEPS = [3000, 4000, 6000, 10000];
// How long the mouse has to sit still before the viewer gets out of the way: every button, the
// arrows, the counter and the pointer itself go, leaving only the picture. This happens only while
// a clip is playing — with a photo, a paused clip or a finished one there is nothing to get out of
// the way of, and controls that vanish while you are looking at a still are just controls you have
// to go and find again.
const LB_IDLE_MS = 2600;

// Approximate resolution label for a tier of THIS image (thumb/sd cap at fixed edges, medium only
// resizes when the source was >= 512 KB, original is the real dimensions).
function approxTierLabel(tier: Tier, img: Photo) {
  const origEdge = Math.max(img.width || 0, img.height || 0) || 1;
  let edge = origEdge;
  if (tier === "thumb") edge = Math.min(origEdge, 280);
  else if (tier === "sd") edge = Math.min(origEdge, 640);
  else if (tier === "medium") edge = (img.size_bytes || 0) >= 512 * 1024 ? Math.min(origEdge, 1600) : origEdge;
  const label = resBadgeLabel(edge, 0);
  // resBadgeLabel calls everything under 1280 px "SD", which left the two fastest tiers — a 280 px
  // thumbnail and a 640 px copy — reading the same in the menu with no way to tell them apart.
  return label === "SD" && edge >= 480 ? "SD+" : label;
}

type Props = {
  imgs: Photo[];
  total: number;
  more: boolean;
  index: number;
  onIndex: (i: number) => void;
  // Pages the album forward until the photo at this index exists. Resolves false when the album has
  // no more pages to give.
  ensureIndex?: (i: number) => Promise<boolean>;
  onClose: () => void;
  imageUrl: (id: string, variant: string) => string;
  onTierViewed: (id: string, tier: string) => void;
  selection: KeyedStore<true>;
  isAll: boolean;
  coverId: string | null | undefined;
  shareAllows: (action: string) => boolean;
  onAction: (action: SheetAction, id: string) => void | Promise<void>;
  toast: (m: string, t?: "success" | "error") => void;
};

export function Lightbox({ imgs, total, more, index, onIndex, ensureIndex, onClose, imageUrl, onTierViewed, selection, isAll, coverId, shareAllows, onAction, toast }: Props) {
  const open = index !== -1 && !!imgs[index];
  const p = open ? imgs[index] : null;
  const isVideo = p?.file_type === "video";

  const lbRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const video = useRef<VideoPlayerHandle>(null);
  const idxRef = useRef(index);
  const imgsRef = useRef(imgs);
  const moreRef = useRef(more);
  const totalRef = useRef(total);
  const ensureIndexRef = useRef(ensureIndex);
  useLayoutEffect(() => {
    idxRef.current = index;
    imgsRef.current = imgs;
    moreRef.current = more;
    totalRef.current = total;
    ensureIndexRef.current = ensureIndex;
  });

  const [loadingCls, setLoadingCls] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [qualityMenu, setQualityMenu] = useState(false);
  const [indicator, setIndicator] = useState<{ inFlight: Tier | null; have: Tier }>({ inFlight: null, have: "thumb" });
  const [openKey, setOpenKey] = useState(0);
  const [slideOn, setSlideOn] = useState(false);
  const [slideDelay, setSlideDelay] = useState(4000);
  // Everything the viewer draws on top of the photo is hidden once the mouse has been still a while.
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Something is open that the visitor is in the middle of using: nothing goes away under them.
  const idleBlocked = useRef(false);
  const idleRef = useRef(false);
  // Whether a clip is running right now, reported by the player below.
  const [videoPlaying, setVideoPlaying] = useState(false);
  const playingRef = useRef(false);
  // A click that arrives while everything is hidden only brings it back. Without this, clicking
  // without first moving the mouse would land on the backdrop — every control being
  // pointer-events:none at that moment — and close the viewer.
  const clickWoke = useRef(false);

  const selected = useSyncExternalStore(
    (l) => (p ? selection.subscribe(p.id, l) : () => {}),
    () => (p ? selection.has(p.id) : false),
    () => false,
  );

  // Zoom/pan state lives in refs and is written straight to the image's style: gestures run at
  // frame rate without re-rendering.
  const z = useRef({ zoom: 1, panX: 0, panY: 0, mousePanning: false, startMouseX: 0, startMouseY: 0 });
  // What a gesture in progress needs, kept off React state so pinching never re-renders:
  //   raf/animate - the pending style write, so many touchmove events in one frame write once;
  //   active      - a finger (or a wheel) is on it, which holds back anything expensive;
  //   vw/vh       - the viewport, read on open and on resize instead of during every move.
  const g2 = useRef({ raf: 0, animate: false, active: false, idle: null as ReturnType<typeof setTimeout> | null, vw: 0, vh: 0 });
  const tiers = useRef<{ loaded: Tier | ""; fetching: string; inFlight: Tier | null; zoomTimeout: ReturnType<typeof setTimeout> | null }>({ loaded: "", fetching: "", inFlight: null, zoomTimeout: null });
  const slideDir = useRef(0);
  const slide = useRef<{ timer: ReturnType<typeof setTimeout> | null; videoHandler: (() => void) | null }>({ timer: null, videoHandler: null });

  useEffect(() => {
    try {
      const s = parseInt(localStorage.getItem("photos_slide_delay") || "");
      // Restores the saved slideshow speed after mount (localStorage is browser-only).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (SLIDE_STEPS.includes(s)) setSlideDelay(s);
    } catch {}
  }, []);

  // A gesture is running: the image is handed to the compositor, so a pinch scales a texture that is
  // already on the GPU instead of re-rastering a 4K photo on every frame.
  //
  // Every gesture event bumps this, and it lets go by itself once they stop. It used to be switched
  // on and off in pairs, and one handler returned early without its "off", which wedged the viewer
  // in gesture mode for good.
  //
  // It now only promotes the image to its own GPU layer. It no longer turns blurs off and back on:
  // every glass control and the backdrop changing look the instant a zoom stopped was the flash at
  // the end of every gesture. The viewer's backdrop has no blur at all now (see the CSS), and the
  // small glass controls are cheap enough to keep theirs.
  const BUSY_IDLE_MS = 220;
  const bumpBusy = useCallback(() => {
    const gg = g2.current;
    gg.active = true;
    lbRef.current?.classList.add("lb-busy");
    if (gg.idle) clearTimeout(gg.idle);
    gg.idle = setTimeout(() => {
      gg.idle = null;
      gg.active = false;
      lbRef.current?.classList.remove("lb-busy");
    }, BUSY_IDLE_MS);
  }, []);

  const flushZoom = useCallback(() => {
    const el = imgRef.current;
    const gg = g2.current;
    gg.raf = 0;
    if (!el) return;
    const s = z.current;
    const want = gg.animate ? "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease" : "opacity 0.3s ease";
    // Rewriting the same transition string every frame is itself work; only touch it when it changes.
    if (el.style.transition !== want) el.style.transition = want;
    // translate3d keeps the image on its own compositor layer, so pan and zoom stay off the main thread.
    el.style.transform = `translate3d(${s.panX}px, ${s.panY}px, 0) scale(${s.zoom})`;
    if (!s.mousePanning) el.style.cursor = s.zoom > 1 ? "grab" : "";
    setZoomed(s.zoom > 1);
  }, []);

  // While a finger is on the image the writes are coalesced to one per frame: a pinch fires
  // touchmove far more often than the screen refreshes, and every extra write was a layout the phone
  // could not afford. Everything else — opening a photo, the zoom button, the keyboard, the settle
  // after a gesture — still applies straight away, because those callers expect the image to have
  // moved by the time they return.
  const updateZoom = useCallback(
    (animate = true) => {
      const gg = g2.current;
      gg.animate = animate;
      if (!gg.active) {
        if (gg.raf) {
          cancelAnimationFrame(gg.raf);
          gg.raf = 0;
        }
        flushZoom();
        return;
      }
      if (gg.raf) return;
      gg.raf = requestAnimationFrame(flushZoom);
    },
    [flushZoom],
  );

  const resetZoom = useCallback(() => {
    Object.assign(z.current, { zoom: 1, panX: 0, panY: 0 });
    updateZoom(true);
    if (imgRef.current) imgRef.current.style.cursor = "";
  }, [updateZoom]);

  const clampPan = useCallback(() => {
    const s = z.current;
    const el = imgRef.current!;
    if (s.zoom <= 1.02) {
      s.panX = 0;
      s.panY = 0;
      return;
    }
    const vw = g2.current.vw || window.innerWidth,
      vh = g2.current.vh || window.innerHeight;
    const nw = el.naturalWidth || vw,
      nh = el.naturalHeight || vh;
    const ratio = Math.min(vw / nw, vh / nh);
    const scaledW = nw * ratio * s.zoom,
      scaledH = nh * ratio * s.zoom;
    if (scaledW > vw) {
      const m = (scaledW - vw) / 2;
      s.panX = Math.max(-m, Math.min(m, s.panX));
    } else s.panX = 0;
    if (scaledH > vh) {
      const m = (scaledH - vh) / 2;
      s.panY = Math.max(-m, Math.min(m, s.panY));
    } else s.panY = 0;
  }, []);

  const refreshIndicator = useCallback(() => setIndicator({ inFlight: tiers.current.inFlight, have: (tiers.current.loaded || "thumb") as Tier }), []);

  // Uncovers the photo, and takes the spinner away once there is nothing better on the way. Until
  // the first copy arrives the <img> is transparent and the viewer is just the spinner over the
  // backdrop.
  const reveal = useCallback((have: Tier, nothingMoreComing: boolean) => {
    if (imgRef.current) imgRef.current.style.opacity = "1";
    if (nothingMoreComing || LB_TIER_RANK[have] >= LB_TIER_RANK[LB_SHARP_TIER]) setLoadingCls(false);
  }, []);

  // opts.force bypasses the "already have this or better" guard (manual pick); opts.onLoaded fires once
  // the fetch lands (used to chain the neighbour preload).
  const loadTierRef = useRef<(tier: Tier, opts?: { force?: boolean; onLoaded?: () => void }) => void>(() => {});
  const onZoomChanged = useCallback(() => {
    const s = z.current;
    if (s.zoom >= LB_ORIGINAL_ZOOM) loadTierRef.current("original");
    else if (s.zoom >= LB_MEDIUM_ZOOM) loadTierRef.current("medium");
  }, []);

  // Puts a decoded tier on the <img>. The element is decoding="sync" so the new source is painted in
  // the same frame the old one goes — "async" allowed a frame with no image at all, the flash. During
  // a gesture the image is a will-change layer, which Chrome rasterises once at the scale it was
  // promoted at and then only stretches; a sharper source put into it would still be drawn at that
  // old, low raster scale until the gesture ended. Dropping will-change for one frame makes Chrome
  // raster it again at the current zoom, so the new detail is visible straight away.
  const swapTo = useCallback((url: string) => {
    const el = imgRef.current;
    if (!el) return;
    el.src = url;
    if (!g2.current.active) return;
    el.style.willChange = "auto";
    requestAnimationFrame(() => requestAnimationFrame(() => (el.style.willChange = "")));
  }, []);

  const loadTier = useCallback(
    (tier: Tier, opts: { force?: boolean; onLoaded?: () => void } = {}) => {
      const cur = imgsRef.current[idxRef.current];
      if (!cur || cur.file_type === "video") return;
      const t = tiers.current;
      const startHave = t.loaded;
      if (!opts.force && startHave && LB_TIER_RANK[startHave] >= LB_TIER_RANK[tier]) return;
      // Strict progression: 'original' (tens of MB for big camera files) only after 'medium' landed.
      if (!opts.force && tier === "original" && LB_TIER_RANK[startHave || "thumb"] < LB_TIER_RANK.medium) tier = "medium";
      const url = imageUrl(cur.id, tier);
      if (!opts.force && t.fetching === url) return;
      t.fetching = url;
      t.inFlight = tier;
      refreshIndicator();
      const settle = (ok: boolean) => {
        if (t.fetching === url) t.fetching = "";
        let landed = false;
        const now = imgsRef.current[idxRef.current];
        if (now && now.id === cur.id) {
          // Never let a slower lower tier clobber a higher tier that already landed (unless forced).
          const nowHave = t.loaded;
          if (ok && (opts.force || !nowHave || LB_TIER_RANK[tier] >= LB_TIER_RANK[nowHave])) {
            // On screen the moment it is ready, gesture or no gesture. It used to be parked until the
            // zoom had been still for 220ms, so zooming in showed the old blurry copy for as long as
            // the visitor kept moving and then changed under them at the end. The swap itself is
            // cheap here: tempImg.decode() below has already decoded it off the main thread.
            swapTo(url);
            t.loaded = tier;
            const prevBest = bestTierSeen.get(cur.id);
            if (!prevBest || LB_TIER_RANK[tier] > LB_TIER_RANK[prevBest]) bestTierSeen.set(cur.id, tier);
            onTierViewed(cur.id, tier);
            landed = true;
          }
          if (ok && opts.onLoaded) opts.onLoaded();
          // Whatever has arrived goes on screen; the spinner stays over it until the copy worth
          // looking at is in. A request that failed also stops the spinner — a tier that never lands
          // must not leave the viewer spinning over a photo it already has.
          const have = t.loaded;
          if (have) reveal(have, !ok);
        }
        if (t.inFlight === tier) t.inFlight = null;
        refreshIndicator();
        if (landed && !opts.force) requestAnimationFrame(onZoomChanged);
      };
      const tempImg = new Image();
      tempImg.src = url;
      // Safari can reject decode() for images that load fine; fall back to the load event.
      tempImg
        .decode()
        .catch(
          () =>
            new Promise<void>((resolve, reject) => {
              if (tempImg.complete) return tempImg.naturalWidth > 0 ? resolve() : reject();
              tempImg.onload = () => resolve();
              tempImg.onerror = reject;
            }),
        )
        .then(() => requestAnimationFrame(() => settle(true)))
        .catch(() => settle(false));
    },
    [imageUrl, onTierViewed, refreshIndicator, onZoomChanged, reveal, swapTo],
  );
  useLayoutEffect(() => {
    loadTierRef.current = loadTier;
  });

  // Preload 'sd' for the 2 images before/after, closest first — images only. The immediate
  // neighbours wrap around the ends, so the first photo preloads the last one and vice versa, which
  // is what makes pressing back from the first photo feel instant. Wrapping only happens once the
  // whole album is loaded: with pages still to come, index -1 is not the album's last photo but
  // whatever happens to sit at the end of what has been fetched so far, and preloading that is a
  // request spent on the wrong file.
  const preloadNeighborsSD = useCallback(
    (center: number) => {
      const list = imgsRef.current;
      const n = list.length;
      if (!n) return;
      const wrap = (i: number) => ((i % n) + n) % n;
      const complete = !moreRef.current;
      const wanted = [center + 1, center - 1, center + 2, center - 2]
        .map((i) => (complete ? wrap(i) : i))
        .filter((i) => i >= 0 && i < n && i !== center);
      new Set(wanted).forEach((i) => {
        const nb = list[i];
        if (!nb || nb.file_type === "video") return;
        const im = new Image();
        im.onload = () => onTierViewed(nb.id, "sd");
        im.src = imageUrl(nb.id, "sd");
      });
    },
    [imageUrl, onTierViewed],
  );

  // ----- Slideshow -----
  const clearSlideTimer = useCallback(() => {
    const s = slide.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    const v = video.current?.video();
    if (s.videoHandler && v) v.removeEventListener("ended", s.videoHandler);
    s.videoHandler = null;
  }, []);
  const stopSlideshow = useCallback(
    (msg?: string) => {
      setSlideOn((on) => {
        if (on && msg) toast(msg, "success");
        return false;
      });
      clearSlideTimer();
    },
    [clearSlideTimer, toast],
  );

  // ----- Open an index: the legacy openLB -----
  useEffect(() => {
    if (!open || !p) return;
    const lbImg = imgRef.current!;
    Object.assign(z.current, { zoom: 1, panX: 0, panY: 0 });
    // Opening an image is driven imperatively (slide animation, tier loading); the zoom button resets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoomed(false);
    tiers.current.inFlight = null;
    const dir = slideDir.current;
    slideDir.current = 0;
    // Keep the grid scrolled to the tile behind the current image (the backdrop is translucent).
    document.querySelector(`.photos-grid-item[data-idx="${idxRef.current}"]`)?.scrollIntoView({ block: "center" });

    if (p.file_type === "video") {
      lbImg.style.display = "none";
      const wrap = video.current?.wrap();
      if (wrap) {
        if (dir !== 0) {
          wrap.style.transition = "none";
          wrap.style.transform = `translate(${dir * 100}vw, 0)`;
          wrap.style.opacity = "0";
          void wrap.offsetWidth;
          wrap.style.transition = "transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease";
          wrap.style.transform = "translate(0, 0)";
          wrap.style.opacity = "1";
        } else {
          wrap.style.transition = "";
          wrap.style.transform = "";
          wrap.style.opacity = "1";
        }
      }
      // A new video opening restarts the player.
      setOpenKey((k) => k + 1);
      setLoadingCls(false);
      refreshIndicator();
      preloadNeighborsSD(idxRef.current);
    } else {
      setUiHidden(false);
      lbImg.style.display = "block";
      tiers.current.loaded = "";
      tiers.current.fetching = "";
      // Transparent until a tier worth looking at has landed (see reveal); the spinner holds the
      // screen until then. The slide keeps its transform so a photo already in the browser's cache —
      // the neighbours are preloaded — still slides in the moment it is decoded.
      lbImg.style.opacity = "0";
      if (dir !== 0) {
        lbImg.style.transition = "none";
        lbImg.style.transform = `translate(${dir * 100}vw, 0)`;
        void lbImg.offsetWidth;
        lbImg.style.transition = "transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease";
        lbImg.style.transform = "translate(0, 0) scale(1)";
      } else {
        updateZoom(false);
      }
      // thumb first — the grid behind has it cached, so it paints at once and the visitor is looking
      // at their photo rather than at an empty screen — then sd in parallel, which replaces it and
      // stops the spinner. The tiny inline preview is deliberately never used as the source: blown
      // up to the size of the window it is a smear, not a picture. Neighbour preload follows sd.
      lbImg.removeAttribute("src");
      setLoadingCls(true);
      refreshIndicator();
      loadTier("thumb");
      loadTier("sd", { onLoaded: () => preloadNeighborsSD(idxRef.current) });
      // Seen sharper than that before? Go straight back to it — it is in the browser's cache, and
      // making the visitor zoom in again to get the quality they had already chosen is not right.
      const seen = bestTierSeen.get(p.id);
      if (seen && LB_TIER_RANK[seen] > LB_TIER_RANK[LB_SHARP_TIER]) loadTier(seen, { force: true });
    }
    // Keyed on WHICH PHOTO is open, not on where it sits in the list. A photo that finishes
    // uploading while the viewer is open is put at the front of the grid, so everything below it
    // moves down one; the album page follows the open photo to its new index, and if that index were
    // a dependency here the viewer would treat the move as opening a new picture — resetting the
    // zoom, dropping back to the spinner and re-fetching every tier for the photo already on screen.
    // The index is still read inside, through idxRef, which is current on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p?.id]);

  // Starts the countdown, and only while a clip is running.
  const armIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    if (!playingRef.current) return;
    // Still in a menu or the actions sheet when the time is up: wait, and ask again later.
    const fire = () => {
      if (idleBlocked.current) idleTimer.current = setTimeout(fire, LB_IDLE_MS);
      else setIdle(true);
    };
    idleTimer.current = setTimeout(fire, LB_IDLE_MS);
  }, []);
  const wake = useCallback(() => {
    setIdle(false);
    armIdle();
  }, [armIdle]);

  // Playback starting arms the countdown; pausing, ending or moving to a photo brings everything
  // back and leaves it back. The setIdle here is the "already showing" case almost every time, and
  // React bails on a state write that changes nothing, so there is no cascade to worry about.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdle(false);
    armIdle();
  }, [videoPlaying, open, armIdle]);

  // Kept in a ref so the idle timer reads the latest value without being rebuilt. Nothing has to
  // un-hide here: whatever opened a menu was a click, and a click wakes the viewer anyway.
  useLayoutEffect(() => {
    idleBlocked.current = sheet || qualityMenu;
    idleRef.current = idle;
    playingRef.current = videoPlaying;
  });

  // Armed by the mouse and nothing else. It is never started when the viewer opens, so a visitor on
  // a touch screen — who never moves a mouse — keeps their controls: there is no pointer to hide,
  // and a tap on a photo that had quietly lost its buttons would just close the viewer.
  useEffect(() => {
    if (!open) return;
    const on = () => wake();
    const onDown = () => {
      clickWoke.current = idleRef.current;
      wake();
    };
    document.addEventListener("mousemove", on);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", on);
    document.addEventListener("wheel", on, { passive: true });
    return () => {
      document.removeEventListener("mousemove", on);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", on);
      document.removeEventListener("wheel", on);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = null;
      setIdle(false);
    };
  }, [open, wake]);

  // Nothing pending outlives the viewer.
  useEffect(
    () => () => {
      const gg = g2.current;
      if (gg.raf) cancelAnimationFrame(gg.raf);
      if (gg.idle) clearTimeout(gg.idle);
    },
    [],
  );

  // Scroll lock while open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  // Slideshow scheduling follows the open index.
  useEffect(() => {
    clearSlideTimer();
    if (!slideOn || !open || !p) return;
    const advance = () => {
      if (idxRef.current >= imgsRef.current.length - 1 && !more) {
        stopSlideshow("จบสไลด์โชว์แล้ว");
        return;
      }
      navRef.current(1);
    };
    const v = video.current?.video();
    if (p.file_type === "video" && v) {
      slide.current.videoHandler = advance;
      v.addEventListener("ended", advance, { once: true });
      // A video that never starts (blocked autoplay, failed load) must not stall the slideshow.
      slide.current.timer = setTimeout(() => {
        if (v.paused && !v.currentTime) advance();
      }, 20000);
    } else slide.current.timer = setTimeout(advance, slideDelay);
    return clearSlideTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideOn, slideDelay, open, index, openKey]);

  const close = useCallback(() => {
    const v = video.current?.video();
    // The viewer closes at once; the audio fades briefly first, with a hard timeout so the stop
    // never depends on the fade finishing.
    if (v && !v.paused) {
      Promise.race([video.current!.fadeOut(180), new Promise((r) => setTimeout(r, 250))])
        .catch(() => {})
        .finally(() => {
          v.pause();
          v.removeAttribute("src");
          v.load();
        });
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (imgRef.current) imgRef.current.style.opacity = "0";
    Object.assign(z.current, { zoom: 1, panX: 0, panY: 0 });
    updateZoom(true);
    setSheet(false);
    setQualityMenu(false);
    setUiHidden(false);
    setLoadingCls(false);
    stopSlideshow();
    onClose();
  }, [onClose, updateZoom, stopSlideshow]);

  const nav = useCallback(
    async (d: number) => {
      const list = imgsRef.current;
      // Wrap on how many photos the ALBUM has, not on how many have been fetched. "1 / 227" is shown
      // from the first page, so back from the first photo must reach the 227th even with a hundred
      // loaded — anything else makes the counter a lie.
      const count = Math.max(totalRef.current || 0, list.length);
      if (!count) return;
      let n = idxRef.current + d;
      if (n < 0) n = count - 1;
      if (n >= count) n = 0;
      if (n >= list.length) {
        // The far end has not been fetched. Say so while the pages come in — this can be several
        // requests on a long album — and settle for the last one loaded if they run out.
        if (!ensureIndexRef.current) n = list.length - 1;
        else {
          setLoadingCls(true);
          const ok = await ensureIndexRef.current(n);
          if (!ok || n >= imgsRef.current.length) n = imgsRef.current.length - 1;
          if (idxRef.current === -1) return; // closed while the pages were arriving
        }
      }
      if (n === idxRef.current || n < 0) {
        setLoadingCls(false);
        return;
      }
      const leavingVideo = imgsRef.current[idxRef.current]?.file_type === "video";
      const outEl = leavingVideo ? video.current?.wrap() : imgRef.current;
      if (outEl) {
        // Slide the outgoing photo/video away (imperative DOM animation).
        // eslint-disable-next-line react-hooks/immutability
        outEl.style.transition = "transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.28s ease";
        outEl.style.transform = `translate(${d * -50}vw, 0) scale(1)`;
        outEl.style.opacity = "0";
      }
      const proceed = () => {
        slideDir.current = d;
        onIndex(n);
      };
      if (leavingVideo)
        Promise.race([video.current!.fadeOut(180), new Promise((r) => setTimeout(r, 200))])
          .catch(() => {})
          .finally(proceed);
      else setTimeout(proceed, 200);
    },
    [onIndex],
  );
  const navRef = useRef(nav);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    navRef.current = nav;
  });
  // The touch handlers are bound once; they reach the current close() through this.
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });

  const toggleZoom = () => {
    const s = z.current;
    if (s.zoom > 1) resetZoom();
    else {
      Object.assign(s, { zoom: 2.2, panX: 0, panY: 0 });
      updateZoom(true);
      onZoomChanged();
    }
  };

  const toggleSlideshow = useCallback(() => {
    setSlideOn((on) => {
      if (on) {
        toast("หยุดสไลด์โชว์", "success");
        return false;
      }
      toast("เริ่มสไลด์โชว์ · กด P เพื่อหยุด", "success");
      return true;
    });
  }, [toast]);
  const cycleSlideDelay = () => {
    const next = SLIDE_STEPS[(SLIDE_STEPS.indexOf(slideDelay) + 1) % SLIDE_STEPS.length];
    try {
      localStorage.setItem("photos_slide_delay", String(next));
    } catch {}
    setSlideDelay(next);
  };

  // ----- Touch pinch/pan/swipe, wheel zoom, mouse pan (need non-passive listeners) -----
  useEffect(() => {
    const lb = lbRef.current;
    const im = imgRef.current;
    if (!lb || !im) return;
    const s = z.current;
    const g = { pinching: false, panning: false, swiping: false, startDist: 0, startZoom: 1, startPanX: 0, startPanY: 0, midX: 0, midY: 0, cx: 0, cy: 0, tx: 0, ty: 0, sx: 0, sy: 0, vw: window.innerWidth, vh: window.innerHeight };
    const current = () => imgsRef.current[idxRef.current];

    const onLbTouchMove = (e: TouchEvent) => {
      if (e.target !== im) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = current();
      if (idxRef.current === -1 || !cur || cur.file_type === "video") return;
      bumpBusy();
      const dirn = e.deltaY < 0 ? 1 : -1;
      const oldZoom = s.zoom;
      const newZoom = Math.max(1, Math.min(s.zoom * (1 + dirn * 0.15), 6));
      if (newZoom <= 1.02) {
        resetZoom();
        return;
      }
      const ratio = newZoom / oldZoom;
      const cx = window.innerWidth / 2 + s.panX,
        cy = window.innerHeight / 2 + s.panY;
      s.panX -= (e.clientX - cx) * (ratio - 1);
      s.panY -= (e.clientY - cy) * (ratio - 1);
      s.zoom = newZoom;
      clampPan();
      updateZoom(false);
      if (tiers.current.zoomTimeout) clearTimeout(tiers.current.zoomTimeout);
      tiers.current.zoomTimeout = setTimeout(onZoomChanged, 300);
    };
    const onTouchStart = (e: TouchEvent) => {
      const cur = current();
      if (!cur || cur.file_type === "video") return;
      bumpBusy();
      g.vw = g2.current.vw = window.innerWidth;
      g.vh = g2.current.vh = window.innerHeight;
      if (e.touches.length === 2) {
        g.pinching = true;
        g.panning = g.swiping = false;
        const [t1, t2] = [e.touches[0], e.touches[1]];
        g.startDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        g.startZoom = s.zoom;
        g.startPanX = s.panX;
        g.startPanY = s.panY;
        g.midX = (t1.clientX + t2.clientX) / 2;
        g.midY = (t1.clientY + t2.clientY) / 2;
        g.cx = g.vw / 2 + s.panX;
        g.cy = g.vh / 2 + s.panY;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        if (s.zoom > 1.05) {
          g.panning = true;
          g.swiping = false;
          g.tx = t.clientX - s.panX;
          g.ty = t.clientY - s.panY;
        } else {
          g.swiping = true;
          g.sx = t.clientX;
          g.sy = t.clientY;
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (idxRef.current === -1) return;
      bumpBusy();
      e.preventDefault(); // never scroll the page behind
      if (g.pinching && e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const mx = (t1.clientX + t2.clientX) / 2,
          my = (t1.clientY + t2.clientY) / 2;
        const newZoom = Math.max(0.8, Math.min(g.startZoom * (dist / (g.startDist || 1)), 6));
        const ratio = newZoom / (g.startZoom || 1);
        s.panX = mx - g.midX + g.startPanX - (g.midX - g.cx) * (ratio - 1);
        s.panY = my - g.midY + g.startPanY - (g.midY - g.cy) * (ratio - 1);
        s.zoom = newZoom;
        updateZoom(false);
      } else if (g.panning && e.touches.length === 1 && s.zoom > 1.05) {
        const t = e.touches[0];
        s.panX = t.clientX - g.tx;
        s.panY = t.clientY - g.ty;
        updateZoom(false);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (g.pinching) {
        if (e.touches.length < 2) {
          g.pinching = false;
          if (s.zoom <= 1.05) resetZoom();
          else {
            clampPan();
            updateZoom(true);
            onZoomChanged();
          }
        }
      } else if (g.panning) {
        g.panning = false;
        if (s.zoom > 1.05) {
          clampPan();
          updateZoom(true);
          onZoomChanged();
        } else resetZoom();
      } else if (g.swiping && e.changedTouches.length === 1 && s.zoom <= 1.05) {
        g.swiping = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - g.sx,
          dy = t.clientY - g.sy;
        // Back to the album, one level up: a swipe from the left edge (the phone's back gesture, which
        // would otherwise just show the previous photo) or a swipe down.
        if (g.sx <= 32 && dx > 70 && Math.abs(dy) < dx * 0.6) closeRef.current();
        else if (dy > 110 && dy > Math.abs(dx) * 1.4) closeRef.current();
        else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) navRef.current(dx > 0 ? -1 : 1);
      }
    };
    const onDbl = (e: MouseEvent) => {
      if (s.zoom > 1) resetZoom();
      else {
        const nz = 2.4;
        s.panX = -(e.clientX - window.innerWidth / 2) * (nz - 1);
        s.panY = -(e.clientY - window.innerHeight / 2) * (nz - 1);
        s.zoom = nz;
        clampPan();
        updateZoom(true);
        onZoomChanged();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (s.zoom > 1.05 && e.button === 0) {
        e.preventDefault();
        s.mousePanning = true;
        bumpBusy();
        s.startMouseX = e.clientX - s.panX;
        s.startMouseY = e.clientY - s.panY;
        im.style.cursor = "grabbing";
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (s.mousePanning && s.zoom > 1.05) {
        e.preventDefault();
        bumpBusy();
        s.panX = e.clientX - s.startMouseX;
        s.panY = e.clientY - s.startMouseY;
        updateZoom(false);
      }
    };
    const onMouseUp = () => {
      if (!s.mousePanning) return;
      s.mousePanning = false;
      if (s.zoom > 1.05) {
        clampPan();
        updateZoom(true);
        onZoomChanged();
      }
      im.style.cursor = s.zoom > 1 ? "grab" : "";
    };
    const onResize = () => {
      g.vw = g2.current.vw = window.innerWidth;
      g.vh = g2.current.vh = window.innerHeight;
    };
    onResize();
    window.addEventListener("resize", onResize);
    lb.addEventListener("touchmove", onLbTouchMove, { passive: false });
    lb.addEventListener("wheel", onWheel, { passive: false });
    im.addEventListener("touchstart", onTouchStart, { passive: false });
    im.addEventListener("touchmove", onTouchMove, { passive: false });
    im.addEventListener("touchend", onTouchEnd);
    im.addEventListener("dblclick", onDbl);
    im.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("resize", onResize);
      lb.removeEventListener("touchmove", onLbTouchMove);
      lb.removeEventListener("wheel", onWheel);
      im.removeEventListener("touchstart", onTouchStart);
      im.removeEventListener("touchmove", onTouchMove);
      im.removeEventListener("touchend", onTouchEnd);
      im.removeEventListener("dblclick", onDbl);
      im.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [clampPan, updateZoom, resetZoom, onZoomChanged, bumpBusy]);

  // ----- Keyboard -----
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (idxRef.current === -1) return;
      if (document.querySelector(".custom-modal-overlay.show, .quality-modal.show")) return;
      const s = z.current;
      if (e.key === "Escape") {
        close();
        return;
      }
      if (hotkey(e, "p") && !e.shiftKey && shareAllows("slideshow")) {
        toggleSlideshow();
        return;
      }
      const cur = imgsRef.current[idxRef.current];
      if (cur && cur.file_type === "video") {
        video.current?.keydown(e);
        return;
      }
      if (hotkey(e, "=", "+")) {
        s.zoom = Math.min(s.zoom * 1.4, 5);
        clampPan();
        updateZoom(true);
        onZoomChanged();
      } else if (hotkey(e, "-")) {
        s.zoom = Math.max(s.zoom / 1.4, 1);
        if (s.zoom <= 1.05) resetZoom();
        else {
          clampPan();
          updateZoom(true);
        }
      } else if (hotkey(e, "0")) resetZoom();
      else if (s.zoom > 1.05) {
        const step = 80;
        if (e.key === "ArrowLeft") s.panX += step;
        else if (e.key === "ArrowRight") s.panX -= step;
        else if (e.key === "ArrowUp") s.panY += step;
        else if (e.key === "ArrowDown") s.panY -= step;
        else return;
        clampPan();
        updateZoom(true);
      } else if (e.key === "ArrowLeft") nav(-1);
      else if (e.key === "ArrowRight") nav(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, nav, shareAllows, toggleSlideshow, clampPan, updateZoom, onZoomChanged, resetZoom]);

  // Quality menu closes on any click outside it.
  useEffect(() => {
    if (!qualityMenu) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Element;
      // The chip and its panel are one element now, so one ancestor covers both.
      if (!t.closest(".lb-quality-anchor")) setQualityMenu(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [qualityMenu]);

  const sheetAction = async (action: SheetAction) => {
    setSheet(false);
    if (!shareAllows(action) || !p) return;
    if (action === "slideshow") {
      toggleSlideshow();
      return;
    }
    if (action === "move" || action === "copy" || action === "openAlbum") {
      close();
      onAction(action, p.id);
      return;
    }
    if (action === "delete") {
      // Stay open: the album drops the file from the list and the viewer moves on to whatever takes
      // its place (the next file, or the previous one at the end). Only an emptied album closes it.
      await onAction(action, p.id);
      return;
    }
    onAction(action, p.id);
  };

  // The actions menu's rows, used by both ⋮ menus (photo and video). They must stay DIRECT children
  // of #lbSheet (MorphMenu's listId): share mode hides delete/move/copy/cover with
  // `#lbSheet > :not([data-share-ok])`.
  const sheetRows = (
    <>
      <MorphMenuItem
        data-share-ok
        onSelect={() => sheetAction("select")}
        icon={<i className={"fas " + (selected ? "fa-times-circle" : "fa-check-circle")} style={{ color: selected ? "#dc2626" : "var(--accent)" }} />}
      >
        {selected ? "ยกเลิกการเลือก" : "เลือกรูป"}
      </MorphMenuItem>
      <MorphMenuItem data-share-ok data-share-dl onSelect={() => sheetAction("download")} icon={<i className="fas fa-download" style={{ color: "#6366f1" }} />}>
        ดาวน์โหลด
      </MorphMenuItem>
      <MorphMenuItem data-share-ok onSelect={() => sheetAction("slideshow")} icon={<i className="fas fa-play" style={{ color: "#8b5cf6" }} />}>
        {slideOn ? "หยุดสไลด์โชว์" : "เริ่มสไลด์โชว์ (" + slideDelay / 1000 + " วิ)"}
      </MorphMenuItem>
      <MorphMenuItem style={{ display: isAll && p?.album_id ? "flex" : "none" }} onSelect={() => sheetAction("openAlbum")} icon={<i className="fas fa-folder-open" style={{ color: "#f59e0b" }} />}>
        เปิดในอัลบั้ม
      </MorphMenuItem>
      <MorphMenuItem style={{ display: isVideo ? "none" : "flex" }} onSelect={() => sheetAction("convert")} icon={<i className="fas fa-exchange-alt" style={{ color: "#10b981" }} />}>
        แปลงไฟล์
      </MorphMenuItem>
      <MorphMenuItem onSelect={() => sheetAction("move")} icon={<i className="fas fa-folder-tree" style={{ color: "#0ea5e9" }} />}>
        ย้ายอัลบั้ม
      </MorphMenuItem>
      <MorphMenuItem onSelect={() => sheetAction("copy")} icon={<i className="fas fa-copy" style={{ color: "#8b5cf6" }} />}>
        คัดลอกไปอัลบั้มอื่น
      </MorphMenuItem>
      <MorphMenuItem style={{ display: isAll || (p && coverId === p.id) ? "none" : "flex" }} onSelect={() => sheetAction("cover")} icon={<i className="fas fa-image" style={{ color: "#f59e0b" }} />}>
        ตั้งเป็นปกอัลบั้ม
      </MorphMenuItem>
      <MorphMenuItem data-share-edit onSelect={() => sheetAction("rename")} icon={<i className="fas fa-pen" style={{ color: "#6366f1" }} />}>
        เปลี่ยนชื่อ
      </MorphMenuItem>
      <MorphMenuItem onSelect={() => sheetAction("share")} icon={<i className="fas fa-share-nodes" style={{ color: "#0369a1" }} />}>
        แชร์ไฟล์นี้…
      </MorphMenuItem>
      <MorphMenuSeparator />
      <MorphMenuItem data-share-edit danger onSelect={() => sheetAction("delete")} icon={<i className="fas fa-trash" />}>
        ลบรูปนี้
      </MorphMenuItem>
    </>
  );

  const showQuality = open && !isVideo;
  const indicatorText = p && !isVideo ? (indicator.inFlight ? null : "กำลังแสดง " + approxTierLabel(indicator.have, p)) : "";

  return (
    <>
      <div
        ref={lbRef}
        className={"photos-lightbox" + (open ? " active" : "") + (sheet || qualityMenu ? " lb-menu-open" : "") + (loadingCls && open ? " loading" : "") + (uiHidden && isVideo ? " video-ui-hidden" : "") + (idle && videoPlaying ? " lb-idle" : "")}
        id="lb"
        onClick={(e) => {
          // That click was the one that brought the controls back; it does nothing else.
          if (clickWoke.current) {
            clickWoke.current = false;
            return;
          }
          if (e.target === e.currentTarget || (e.target as Element).classList.contains("photos-lightbox-close")) close();
        }}
      >
        <button className="photos-lightbox-close lg-glass" onClick={close}>
          <i className="fas fa-times" />
        </button>
        {/* File name, top centre — for photos and videos alike. */}
        <div className="lb-filename" title={p?.original_name || ""} hidden={!open}>
          {p?.original_name || p?.name || ""}
        </div>
        <div className={"lb-selected-badge" + (selected ? " show" : "")} id="lbSelectedBadge">
          <i className="fas fa-check-circle" /> เลือกแล้ว
        </div>
        <div className="lb-slide-chip lg-glass" id="lbSlideChip" hidden={!slideOn}>
          <button
            type="button"
            aria-label="หยุดสไลด์โชว์"
            onClick={(e) => {
              e.stopPropagation();
              stopSlideshow("หยุดสไลด์โชว์");
            }}
          >
            <i className="fas fa-pause" />
          </button>
          <button
            type="button"
            aria-label="เปลี่ยนความเร็ว"
            onClick={(e) => {
              e.stopPropagation();
              cycleSlideDelay();
            }}
          >
            <i className="fa-regular fa-clock" /> <span id="lbSlideSecs">{slideDelay / 1000 + " วิ"}</span>
          </button>
        </div>
        <button
          className="lb-zoom-btn lg-glass"
          style={{ display: isVideo ? "none" : "flex" }}
          onClick={toggleZoom}
          id="lbZoomBtn"
        >
          <i className={"fas " + (zoomed ? "fa-search-minus" : "fa-search-plus")} />
        </button>
        <button className="photos-lightbox-nav photos-lightbox-prev lg-glass" onClick={() => nav(-1)}>
          <i className="fas fa-chevron-left" />
        </button>
        <button className="photos-lightbox-nav photos-lightbox-next lg-glass" onClick={() => nav(1)}>
          <i className="fas fa-chevron-right" />
        </button>
        <div className="img-spinner">
          <i className="fas fa-circle-notch fa-spin" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img className="photos-lightbox-img" id="lbImg" ref={imgRef} draggable={false} decoding="sync" />
        <VideoPlayer
          ref={video}
          active={open && isVideo}
          src={open && isVideo && p ? imageUrl(p.id, "original") : ""}
          poster={p?.preview_b64 || ""}
          openKey={openKey}
          onNav={nav}
          menuOpen={sheet}
          onMenuOpenChange={setSheet}
          menuRows={sheetRows}
          onUiHidden={setUiHidden}
          onPlayState={setVideoPlaying}
          quality={open && isVideo && p ? { listUrl: imageUrl(p.id, "renditions"), urlFor: (variant) => imageUrl(p.id, variant) } : undefined}
        />
        <div className="photos-lightbox-counter" id="lbCnt">
          {open ? index + 1 + " / " + total : ""}
        </div>
        {/* The ⋮ button becomes the actions menu. Its rows are shared with the video player's ⋮. */}
        {!isVideo ? (
          <div className="lb-actions-anchor">
            <MorphMenu
              open={sheet}
              onOpenChange={setSheet}
              side="top"
              align="end"
              width={240}
              maxHeight="min(70vh, 540px)"
              listId="lbSheet"
              triggerId="lbActionsBtn"
              triggerClassName="lb-round-trigger"
              tone="viewer"
              label="ตัวเลือกเพิ่มเติม"
              trigger={<i className="fas fa-ellipsis-v" />}
            >
              {sheetRows}
            </MorphMenu>
          </div>
        ) : null}
        {/* The chip and its menu are one element: closed it is the chip, open it is the panel, and
            the shared layoutId is what carries one into the other (see MorphMenu). */}
        <div className="lb-quality-anchor" style={{ display: showQuality ? "block" : "none" }}>
          <MorphMenu
            open={qualityMenu}
            onOpenChange={(v) => setQualityMenu(v && !!p && !isVideo)}
            side="top"
            align="start"
            width={210}
            label="คุณภาพรูป"
            triggerClassName="lb-quality-trigger"
            tone="viewer"
            triggerKey={indicator.inFlight ? "loading-" + indicator.inFlight : "showing-" + indicator.have}
            trigger={
              indicator.inFlight && p ? (
                <>
                  <i className="fas fa-circle-notch fa-spin" /> กำลังโหลด {approxTierLabel(indicator.inFlight, p)}
                </>
              ) : (
                <span>{indicatorText}</span>
              )
            }
          >
            {p
              ? LB_TIER_ORDER.map((t) => {
                  const isCur = t === indicator.have;
                  return (
                    <MorphMenuItem
                      key={t}
                      active={isCur}
                      // Every row keeps the check's slot, so the labels line up whichever tier is chosen.
                      icon={<i className="fas fa-check" style={{ visibility: isCur ? "visible" : "hidden" }} />}
                      onSelect={() => {
                        setQualityMenu(false);
                        loadTier(t, { force: true });
                      }}
                    >
                      {LB_TIER_NAME[t]} ({approxTierLabel(t, p)})
                    </MorphMenuItem>
                  );
                })
              : null}
          </MorphMenu>
        </div>
      </div>

    </>
  );
}
