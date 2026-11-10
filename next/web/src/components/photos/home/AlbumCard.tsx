"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Album } from "@/lib/photos/types";
import { sharedObserver } from "@/lib/photos/observe";
import { fmt, formatShortDate, timeAgo } from "@/lib/photos/util";
import { countsOf } from "@/lib/photos/tree";

// ===== Album covers: preview, then thumb near the viewport, then medium last =====
// Covers render at thumbnail quality so the grid appears immediately. Once the page has finished
// loading everything else, each visible cover is re-fetched at medium quality one at a time — the
// covers sharpen in place without competing with the first paint or the thumbnails still streaming.
const loadedThumbs = new Set<string>();
const observeCard = sharedObserver({ rootMargin: "150px" });
const observeCover = sharedObserver({ rootMargin: "300px" });

type MdEntry = { id: string; inView: () => boolean; apply: (src: string) => void; done: boolean };
const md = { enabled: false, running: false, queue: [] as MdEntry[], registered: new Set<MdEntry>() };

function pumpCoverMedium() {
  if (md.running) return;
  const entry = md.queue.shift();
  if (!entry) return;
  if (entry.done || !md.registered.has(entry)) return pumpCoverMedium();
  md.running = true;
  entry.done = true;
  const src = "/api/image/" + entry.id + "/medium";
  const full = new Image();
  const next = () => {
    md.running = false;
    setTimeout(pumpCoverMedium, 120);
  };
  full.onload = () => {
    if (md.registered.has(entry)) entry.apply(src);
    next();
  };
  full.onerror = next;
  full.src = src;
}

function scanCoverMedium() {
  if (!md.enabled) return;
  md.registered.forEach((e) => {
    if (!e.done && e.inView() && !md.queue.includes(e)) md.queue.push(e);
  });
  pumpCoverMedium();
}

let upgradesScheduled = false;
// A sharper cover is a nicety, never worth spending a metered or slow connection on.
export function scheduleCoverUpgrades() {
  if (upgradesScheduled) return;
  upgradesScheduled = true;
  const start = () => {
    if (md.enabled) return;
    const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection || {};
    if (net.saveData || /^(slow-2g|2g)$/.test(net.effectiveType || "")) return;
    md.enabled = true;
    scanCoverMedium();
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener(
      "scroll",
      () => {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(scanCoverMedium, 400);
      },
      { passive: true },
    );
  };
  const kick = () => {
    const idle = window.requestIdleCallback || ((fn: () => void) => setTimeout(fn, 400));
    setTimeout(() => idle(start, { timeout: 4000 }), 1500);
  };
  if (document.readyState === "complete") kick();
  else window.addEventListener("load", kick, { once: true });
}

function CoverImg({ img, alt, cardInView }: { img: { id: string; preview_b64?: string | null }; alt: string; cardInView: () => boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState(() => (loadedThumbs.has(img.id) ? "/api/image/" + img.id + "/thumb" : img.preview_b64 || ""));
  const [loaded, setLoaded] = useState(() => loadedThumbs.has(img.id));

  useEffect(() => {
    const el = ref.current;
    if (!el || loaded) return;
    return observeCover(el, (entry) => {
      if (!entry.isIntersecting) return;
      loadedThumbs.add(img.id);
      const full = new Image();
      full.onload = () => {
        setSrc(full.src);
        setLoaded(true);
      };
      full.src = "/api/image/" + img.id + "/thumb";
    });
  }, [img.id, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const entry: MdEntry = { id: img.id, inView: cardInView, apply: setSrc, done: false };
    md.registered.add(entry);
    if (md.enabled && cardInView()) scanCoverMedium();
    return () => {
      md.registered.delete(entry);
    };
  }, [loaded, img.id, cardInView]);

  return (
    <div className="cover-img-wrapper">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={src || undefined} data-id={img.id} alt={alt} draggable={false} />
    </div>
  );
}

function Cover({ a, cardInView, narrow }: { a: Album; cardInView: () => boolean; narrow: boolean }) {
  if (!a.has_access) {
    return (
      <div className="empty-cover" style={{ flexDirection: "column", gap: 8, background: "#374151" }}>
        <i className="fas fa-lock" style={{ fontSize: "2.4rem", color: "#f59e0b" }} />
        <span style={{ color: "white", fontSize: "0.85rem", fontWeight: 500, opacity: 0.9 }}>Locked</span>
      </div>
    );
  }
  const covers = a.cover_images || [];
  const max = narrow ? 1 : 3;
  const count = Math.min(covers.length, max);
  if (!count) {
    return a.child_count ? (
      <div className="empty-cover" style={{ background: "linear-gradient(135deg,#fdeaea,#f8d3d3)", color: "#b00909" }}>
        <i className="fas fa-folder-tree" />
      </div>
    ) : (
      <div className="empty-cover">
        <i className="fas fa-images" />
      </div>
    );
  }
  return (
    <div className={`cover-collage count-${count}`}>
      {covers.slice(0, max).map((img) => (
        <CoverImg key={img.id} img={img} alt={a.name} cardInView={cardInView} />
      ))}
    </div>
  );
}

export const AlbumCard = memo(function AlbumCard({
  a,
  index,
  path,
  animate,
  narrow,
  draggable,
}: {
  a: Album;
  index: number;
  path: string[];
  animate: boolean;
  narrow: boolean;
  draggable: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useRef(false);
  const [inViewClass, setInViewClass] = useState(false);
  const cardInView = useCallback(() => inView.current, []);
  const counts = countsOf(a);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeCard(el, (e) => {
      inView.current = e.isIntersecting;
      setInViewClass(e.isIntersecting);
    });
  }, []);

  return (
    <div
      ref={ref}
      id={"album-" + a.id}
      className={"photos-album-card" + (a.pinned_at ? " pinned" : "") + (inViewClass ? " in-view" : "")}
      data-id={a.id}
      role="link"
      tabIndex={0}
      draggable={draggable || undefined}
      style={animate ? { animation: `toiletFadeUp .3s ease-out ${Math.min(index * 0.03, 0.4)}s both` } : undefined}
    >
      <div className="photos-album-cover">
        <Cover a={a} cardInView={cardInView} narrow={narrow} />
        {a.has_access ? (
          <div className="cover-badge-time">
            <i className="fa-regular fa-clock" /> <span>{timeAgo(a.updated_at)}</span>
          </div>
        ) : null}
        <div className="cover-actions">
          <button className="cover-more-btn" type="button" data-more aria-label="ตัวเลือกเพิ่มเติม">
            <i className="fas fa-ellipsis-vertical" />
          </button>
        </div>
      </div>
      <div className="photos-album-info">
        <h3>
          {a.pinned_at ? <i className="fas fa-thumbtack pin-ico" /> : null}
          {a.is_locked ? <i className="fas fa-lock lock-ico" /> : null}
          {a.name}
        </h3>
        {path.length ? (
          <div className="album-path">
            <i className="fas fa-folder-tree" />
            {path.join(" › ")}
          </div>
        ) : null}
        <div className="album-meta-row">
          <div className="album-counts">
            {counts.folders ? (
              <span title="โฟลเดอร์ย่อย (รวมทุกชั้น)">
                <i className="fas fa-folder" />
                {fmt(counts.folders)}
              </span>
            ) : null}
            <span title="รูป (รวมโฟลเดอร์ย่อย)">
              <i className="fa-regular fa-image" />
              {fmt(counts.photos)}
            </span>
            {counts.videos ? (
              <span title="วิดีโอ (รวมโฟลเดอร์ย่อย)">
                <i className="fa-solid fa-video" />
                {fmt(counts.videos)}
              </span>
            ) : null}
          </div>
          <div className="album-date">{formatShortDate(a.event_date || a.created_at)}</div>
        </div>
      </div>
    </div>
  );
});

export function CreateAlbumCard({ animate }: { animate: boolean }) {
  return (
    <div id="createAlbumBtn" className="photos-album-card create-card" role="button" tabIndex={0} style={animate ? { animation: "toiletFadeUp .3s ease-out 0s both" } : undefined}>
      <div className="photos-album-cover">
        <i className="fas fa-plus" style={{ fontSize: "2.2rem", color: "var(--accent)" }} />
      </div>
      <div className="photos-album-info">
        <h3 style={{ color: "var(--accent)", marginBottom: 4 }}>สร้างอัลบั้ม</h3>
        <div className="album-meta-row">
          <span>เพิ่มอัลบั้มใหม่</span>
        </div>
      </div>
    </div>
  );
}

// Only the placeholder cards on screen sweep: a highlight running under eight cards at once is work a
// phone pays for and nobody sees.
const observeSkeleton = sharedObserver({});

function SkeletonCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeSkeleton(el, (e) => setOnScreen(e.isIntersecting));
  }, []);

  return (
    <div ref={ref} className={"photos-album-card sk-card" + (onScreen ? " shimmer" : "")} aria-hidden="true">
      <div className="photos-album-cover sk" />
      <div className="photos-album-info">
        <div className="sk sk-line" />
        <div className="sk sk-line short" />
      </div>
    </div>
  );
}

export function AlbumCardSkeletons() {
  return (
    <>
      <div className="grid-section">
        <span className="sk" style={{ width: 90, height: 14, borderRadius: 7 }} />
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </>
  );
}
