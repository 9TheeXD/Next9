"use client";

import { memo, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent, type DragEvent } from "react";
import { sharedObserver } from "@/lib/photos/observe";
import { resBadgeLabel } from "@/lib/photos/util";
import type { KeyedStore, Photo } from "./model";

// Grid tiles far off screen give up their contents (thumbnail, badges) to keep memory flat on long
// albums; they come back as they near the viewport.
const observeTile = sharedObserver({ rootMargin: "800px" });
// A second, exact observer: is the tile on screen right now? Tiles mount and start their download
// 800px early; the ones actually visible get fetchpriority="high" and the rest "low", so the browser
// fetches what the visitor is looking at first and the look-ahead tiles only with what is left.
const observeVisible = sharedObserver({ rootMargin: "0px" });
const MAX_CACHED_THUMBS = 300;

export type GridHandlers = {
  click: (e: MouseEvent, idx: number, id: string) => void;
  chkPointerDown: (e: PointerEvent, el: HTMLElement, idx: number, id: string) => void;
  bodyPointerDown: (e: PointerEvent, idx: number, id: string) => void;
  chkClick: (e: MouseEvent, idx: number, id: string) => void;
  dragStart: (e: DragEvent, id: string) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
};

export type GridEnv = {
  selection: KeyedStore<true>;
  quality: KeyedStore<"sd" | "medium">;
  loadedThumbs: Set<string>;
  imageUrl: (id: string, variant: string) => string;
  handlers: GridHandlers;
  draggable: boolean;
  /** True while a drag-select is running; its touchmoves must not scroll the page. */
  isDragSelecting: () => boolean;
};

function useStoreHas<V>(store: KeyedStore<V>, id: string) {
  return useSyncExternalStore(
    (l) => store.subscribe(id, l),
    () => store.has(id),
    () => false,
  );
}
function useStoreGet<V>(store: KeyedStore<V>, id: string) {
  return useSyncExternalStore(
    (l) => store.subscribe(id, l),
    () => store.get(id),
    () => undefined,
  );
}

function Check({ env }: { env: GridEnv }) {
  // A hold on the checkmark arms drag-select, after which the finger must drive the selection, not
  // the page — so this one small element carries a scroll-cancelling touchmove listener. Only this
  // element: a non-passive listener makes every scroll that starts under it wait for the main thread.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (env.isDragSelecting() && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [env]);
  return (
    <div ref={ref} className="sel-chk photos-grid-check">
      <i className="fas fa-check" />
    </div>
  );
}

export const GridItem = memo(function GridItem({
  img,
  idx,
  env,
  albumTag,
  isCover,
  hidden,
  day,
}: {
  img: Photo;
  idx: number;
  env: GridEnv;
  albumTag?: string;
  isCover: boolean;
  hidden?: boolean;
  day?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLImageElement>(null);
  const onScreen = useRef(false);
  const selected = useStoreHas(env.selection, img.id);
  const tier = useStoreGet(env.quality, img.id);
  // The first tiles are seeded as mounted so the top of the grid paints without waiting for the
  // observer — but a tile in a collapsed day group is display:none, so it is never on screen and must
  // not fetch anything.
  const seeded = idx < 50 && !hidden;
  const [near, setNear] = useState(seeded);
  const [startedNear, setStartedNear] = useState(seeded);
  const [loaded, setLoaded] = useState(false);
  // The blurred preview under the thumbnail. Once the thumbnail has faded in over it, it is fully
  // covered — but a `filter: blur()` layer is still rasterised and composited under every tile, 50+
  // of them on a page, which is a lot of GPU work on a phone for pixels nobody can see.
  const [previewGone, setPreviewGone] = useState(false);
  // A tile in a collapsed day group is display:none: it holds nothing and fetches nothing until the
  // group opens, so the connection goes to the tiles the visitor can actually see. A thumbnail that
  // already arrived is kept, so opening and closing a group costs no requests.
  const shut = !!hidden && !loaded;
  const mounted = near && !shut;
  const started = startedNear && !shut;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeTile(el, (e) => {
      if (e.isIntersecting) {
        setNear(true);
        setStartedNear(true);
        env.loadedThumbs.add(img.id);
      } else {
        // Aggressive unmounting for off-screen items to prevent memory bloat/lag
        const far = Math.abs(e.boundingClientRect.top) > window.innerHeight * 3;
        if (far || env.loadedThumbs.size > MAX_CACHED_THUMBS) {
          setNear(false);
          setStartedNear(false);
          setLoaded(false);
          setPreviewGone(false);
          env.loadedThumbs.delete(img.id);
        }
      }
    });
  }, [env, img.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeVisible(el, (e) => {
      onScreen.current = e.isIntersecting;
      const t = thumbRef.current;
      if (t) t.fetchPriority = e.isIntersecting ? "high" : "low";
    });
  }, []);

  const [base, ext] = splitName(img.original_name || img.name || "");
  const status = img.processing_status;
  const failed = status === "failed";
  const pending = !!status && status !== "done" && !failed;

  let inner = null;
  if (mounted) {
    if (failed) {
      // The reason matters: a broken original will never process, so that case offers deleting it.
      const why = String(img.last_error || "");
      const broken = /premature|truncat|corrupt|unexpected end|not enough data/i.test(why);
      inner = (
        <>
          <Check env={env} />
          <div className="fail-retry" title={why}>
            <i className="fas fa-triangle-exclamation" style={{ fontSize: "1.1rem" }} />
            <span>{broken ? "ไฟล์ต้นฉบับไม่สมบูรณ์" : "ประมวลผลไม่สำเร็จ"}</span>
            <span className="fail-actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  env.handlers.retry(img.id);
                }}
              >
                ลองใหม่
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  env.handlers.remove(img.id);
                }}
              >
                ลบ
              </button>
            </span>
          </div>
        </>
      );
    } else if (pending) {
      inner = (
        <>
          <Check env={env} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 5 }}>
            <i className="fas fa-cog fa-spin" style={{ color: "#bbb", fontSize: "1.2rem" }} />
            <span style={{ fontSize: ".65rem", color: "#aaa", fontFamily: "'Prompt',sans-serif" }}>กำลังประมวลผล...</span>
          </div>
        </>
      );
    } else {
      inner = (
        <>
          <Check env={env} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img.preview_b64 && !previewGone ? <img className="preview-img" src={img.preview_b64} alt="" draggable={false} /> : null}
          {img.file_type === "video" ? (
            <div className="video-icon">
              <i className="fas fa-play-circle" />
            </div>
          ) : null}
          {img.file_type !== "video" && (img.width || img.height) ? <span className="res-badge">{resBadgeLabel(img.width, img.height)}</span> : null}
          <div className="img-spinner">
            <i className="fas fa-circle-notch fa-spin" />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={(el) => {
              thumbRef.current = el;
              // Set before the src takes effect, from whether the tile is on screen at this moment.
              if (el) el.fetchPriority = onScreen.current ? "high" : "low";
            }}
            className="thumb-img"
            decoding="async"
            src={started ? env.imageUrl(img.id, tier || "thumb") : undefined}
            alt=""
            style={{ opacity: loaded ? 1 : 0 }}
            draggable={false}
            onLoad={() => setLoaded(true)}
            // The fade is what hides the preview, so it goes only once the fade has finished.
            onTransitionEnd={(e) => {
              if (e.propertyName === "opacity" && loaded) setPreviewGone(true);
            }}
          />
          {albumTag ? (
            <span className="album-tag">
              <i className="fas fa-folder" />
              {albumTag}
            </span>
          ) : null}
          {/* Grid view only (.v-grid): file name over a dark fade at the bottom, extension on the right. */}
          <div className="gi-cap">
            <span className="gi-cap-name">{base}</span>
            {ext ? <span className="gi-ext">{ext}</span> : null}
          </div>
          {isCover ? (
            <span className="cover-badge">
              <i className="fas fa-image" /> ปก
            </span>
          ) : null}
        </>
      );
    }
  }

  const cls =
    "photos-grid-item" +
    (selected ? " selected" : "") +
    (pending ? " processing-pending" : "") +
    (failed ? " processing-failed" : "") +
    (!mounted ? " unmounted" : "") +
    (mounted && started && !loaded && !failed && !pending ? " loading" : "");

  return (
    <div
      ref={ref}
      className={cls}
      data-idx={idx}
      data-id={img.id}
      data-day={day}
      hidden={hidden}
      draggable={env.draggable || undefined}
      onDragStart={env.draggable ? (e) => env.handlers.dragStart(e, img.id) : undefined}
      onClick={(e) => {
        const chk = (e.target as Element).closest(".sel-chk");
        if (chk) env.handlers.chkClick(e, idx, img.id);
        else env.handlers.click(e, idx, img.id);
      }}
      // Shift+click selects a range; without this the browser also highlights page text across it.
      onMouseDown={(e) => {
        if (e.shiftKey) e.preventDefault();
      }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest(".photos-grid-check")) env.handlers.chkPointerDown(e, ref.current!, idx, img.id);
        else env.handlers.bodyPointerDown(e, idx, img.id);
      }}
    >
      {inner}
      {/* Shown only in list view (.v-list): name, size and date beside a small thumbnail. */}
      <div className="gi-meta">
        <span className="gi-name">{img.original_name || img.name || ""}</span>
        <span className="gi-sub">{metaLine(img)}</span>
      </div>
    </div>
  );
});

/** "IMG_01.final.jpg" → ["IMG_01.final", "JPG"] */
export function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot + 1).toUpperCase()] : [name, ""];
}

const metaDate = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function metaLine(img: Photo) {
  const parts: string[] = [];
  const b = img.size_bytes || 0;
  if (b) parts.push(b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  if (img.width && img.height) parts.push(img.width + "×" + img.height);
  const t = img.taken_at || img.created_at;
  if (t) parts.push(metaDate.format(t));
  return parts.join(" · ");
}
