"use client";

import { useEffect, type RefObject } from "react";

// The red page header collapses as the page scrolls: its text fades out and it shrinks to a thin
// bar holding only the back and ☰ buttons, then grows back on the way up.
//
// Nothing here changes the header's height. A header that really shrinks moves everything below it
// up by the same amount while the visitor scrolls — the page jumps, the scroll position no longer
// matches what is on screen, and near the threshold it can flip back and forth. Instead the header
// keeps its full height in the page and is made sticky at a NEGATIVE top (collapsed − full height):
// it scrolls away normally until only its bottom strip is left on screen, then sticks there. The
// buttons that stay are translated down by exactly as much as the header has scrolled, so they hold
// still on screen and settle in the middle of the strip; everything else fades out as it leaves.
//
// All of it is opacity and transform. Where the browser has scroll-driven animations (Chrome and
// Android's browsers) it runs as CSS animations on a scroll timeline, on the compositor, with no
// JavaScript per frame at all. Elsewhere one CSS variable is written per animation frame.

const COLLAPSED = 56;

/**
 * @param keep   buttons that stay, carried into the collapsed strip
 * @param stripFrom  optional element that IS the collapsed strip: the header collapses to just this
 *                   element (it stays where it is, at the bottom of the header) — the home page keeps
 *                   its search bar and sort control this way. Falls back to a 56px strip when it is
 *                   hidden.
 */
export function useCollapsingHeader(headerRef: RefObject<HTMLElement | null>, keep: string, stripFrom?: string) {
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const scrollDriven = typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()");
    header.classList.add("hdr-collapsing", scrollDriven ? "hdr-sda" : "hdr-js");

    let range = 1;
    const measure = () => {
      const full = header.offsetHeight;
      let collapsed = COLLAPSED;
      const strip = stripFrom ? header.querySelector<HTMLElement>(stripFrom) : null;
      if (strip && strip.offsetHeight) {
        let top = 0;
        let n: HTMLElement | null = strip;
        while (n && n !== header) {
          top += n.offsetTop;
          n = n.offsetParent as HTMLElement | null;
        }
        // Same breathing room above the strip as the header's own padding below it.
        const pad = parseFloat(getComputedStyle(header).paddingBottom) || 12;
        if (n === header) collapsed = full - top + Math.min(pad, 14);
      }
      range = Math.max(1, full - collapsed);
      header.style.top = -range + "px";
      header.style.setProperty("--hdr-range", range + "px");
      // Each kept button moves from where it sits to the middle of the collapsed strip.
      header.querySelectorAll<HTMLElement>(keep).forEach((el) => {
        let top = 0;
        let n: HTMLElement | null = el;
        while (n && n !== header) {
          top += n.offsetTop;
          n = n.offsetParent as HTMLElement | null;
        }
        if (n !== header) return; // hidden, or not laid out inside the header
        const target = range + (full - range - el.offsetHeight) / 2;
        el.style.setProperty("--hdr-dy", target - top + "px");
      });
      update();
    };

    let collapsed = false;
    let raf = 0;
    const update = () => {
      raf = 0;
      const p = Math.min(1, Math.max(0, window.scrollY / range));
      if (!scrollDriven) header.style.setProperty("--hp", String(p));
      // Faded-out controls must not take taps; this flips once per crossing, not per frame.
      const now = p > 0.5;
      if (now !== collapsed) {
        collapsed = now;
        header.classList.toggle("is-collapsed", now);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    const ro = new ResizeObserver(measure);
    ro.observe(header);
    // A kept button that appears later (the home page's back button, when a view opens) changes
    // where it sits without changing the header's size, so each is watched as well.
    header.querySelectorAll<HTMLElement>(keep).forEach((el) => ro.observe(el));
    if (stripFrom) header.querySelectorAll<HTMLElement>(stripFrom).forEach((el) => ro.observe(el));
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      header.classList.remove("hdr-collapsing", "hdr-sda", "hdr-js", "is-collapsed");
      header.style.top = "";
    };
  }, [headerRef, keep, stripFrom]);
}
