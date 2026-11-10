"use client";

import { useEffect, useRef } from "react";

// Touch swipe navigation for the photos pages.
//
//   back:  a swipe that starts at the left edge of the screen and moves right (the iPhone back
//          gesture). The page decides where "back" goes: one level up the app's structure (viewer ->
//          album -> parent album -> albums), never the browser history, which may lead out of the app.
//   left / right: a horizontal swipe anywhere else, for switching the bottom tabs.
//
// A swipe only counts when it is clearly horizontal, long enough and quick, so vertical scrolling,
// taps and slow drags never trigger it. Swipes that start on text fields or inside anything that
// scrolls sideways are left alone. Listeners are passive: scrolling is never delayed.

const EDGE_PX = 32; // start zone for the back gesture
const MIN_DX = 70; // distance to count as a swipe
const MAX_SLOPE = 0.6; // |dy| / |dx| above this is not horizontal
const MAX_MS = 700; // slower than this is a drag, not a swipe

export type SwipeNavOptions = {
  // Checked when a swipe starts; false while a viewer, modal or drag-select owns the touch.
  enabled?: () => boolean;
  onBack?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

// Anything on top of the page (viewer, menus, dialogs, pickers) owns the touch.
const OVERLAY = ".photos-lightbox.active, .quality-modal.show, .app-menu.show, .modal-overlay.show, [role='dialog'][aria-modal='true']";
function overlayOpen() {
  if (document.querySelector(OVERLAY)) return true;
  // Legacy modals open by inline display:flex.
  return Array.from(document.querySelectorAll<HTMLElement>(".modal-overlay, .popup-overlay")).some((m) => m.style.display === "flex");
}

function scrollsSideways(el: Element | null) {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (n.matches("input, textarea, select, [contenteditable], [data-no-swipe]")) return true;
    const ox = getComputedStyle(n).overflowX;
    if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 1) return true;
  }
  return false;
}

// The half-circle arrow that follows the finger during the back gesture, so the user can see it will
// go back (and cancel by sliding back left before letting go).
function makeHint() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:0;top:50%;width:44px;height:44px;margin-top:-22px;border-radius:50%;background:rgba(17,24,39,.72);color:#fff;display:grid;place-items:center;z-index:10050;pointer-events:none;opacity:0;transform:translateX(-44px);transition:opacity .15s;font-size:1rem";
  el.innerHTML = '<i class="fas fa-arrow-left"></i>';
  document.body.appendChild(el);
  return el;
}

export function useSwipeNav(opts: SwipeNavOptions) {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    let start: { x: number; y: number; t: number; edge: boolean } | null = null;
    let hint: HTMLElement | null = null;
    const hideHint = () => {
      if (!hint) return;
      const h = hint;
      hint = null;
      h.style.opacity = "0";
      setTimeout(() => h.remove(), 160);
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1) return;
      const o = optsRef.current;
      if ((o.enabled && !o.enabled()) || overlayOpen()) return;
      const t = e.touches[0];
      const edge = t.clientX <= EDGE_PX && !!o.onBack;
      if (!edge && !o.onSwipeLeft && !o.onSwipeRight) return;
      if (!edge && scrollsSideways(e.target as Element)) return;
      start = { x: t.clientX, y: t.clientY, t: performance.now(), edge };
    };

    const onMove = (e: TouchEvent) => {
      if (!start || !start.edge || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x,
        dy = t.clientY - start.y;
      if (Math.abs(dy) > Math.max(24, dx * MAX_SLOPE)) {
        // Turned into a vertical scroll: not a back gesture.
        start = null;
        hideHint();
        return;
      }
      if (dx > 12) {
        if (!hint) hint = makeHint();
        const p = Math.min(1, dx / MIN_DX);
        hint.style.opacity = String(0.35 + 0.65 * p);
        hint.style.transform = `translateX(${Math.min(dx, MIN_DX) * 0.5 - 20}px) scale(${0.8 + 0.2 * p})`;
      }
    };

    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      hideHint();
      if (!s || e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x,
        dy = t.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dy) > Math.abs(dx) * MAX_SLOPE) return;
      const o = optsRef.current;
      if (s.edge) {
        // The back gesture may be slow: the arrow shows it is armed, and sliding back cancels it.
        if (dx > 0) o.onBack?.();
        return;
      }
      if (performance.now() - s.t > MAX_MS) return;
      if (dx < 0) o.onSwipeLeft?.();
      else o.onSwipeRight?.();
    };

    const onCancel = () => {
      start = null;
      hideHint();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
      hint?.remove();
    };
  }, []);
}
