"use client";

import { cn } from "@/lib/utils";

// The liquid glass material from 21st.dev, as one piece of shared markup rather than as a pile of
// CSS overrides. It is three layers that have to sit in this order:
//
//   1. the backdrop layer — what shows through, blurred, and fed through the SVG displacement
//      filter below so the edges bend the way real glass does;
//   2. the shadow layer — the stack of inset highlights that draw the pane's thickness and its lit
//      and shaded edges. This is what makes it read as glass rather than as a grey card, and it is
//      the part every hand-rolled version of this kept leaving out;
//   3. the contents.
//
// ONE THING TO KNOW ABOUT THE FILTER: `backdrop-filter: url(#…)` is applied by Firefox alone.
// Chrome, Edge and Safari parse it, accept it, and render nothing at all — there is no console
// warning and no visible failure, the pane just does not distort. So the filter goes on as an
// enhancement on top of a real blur that works everywhere, never as the thing the material depends
// on. A pane built only on the filter is a plain rectangle in every browser this site is used in.

export const GLASS_FILTER_ID = "container-glass";

// The shadow stack, exactly as specified. These are WHITE inset highlights, which is the give-away
// that the material they were written for is a light one: on a dark pane they are the only light in
// the picture and it reads as a grey card with a rim, which is what kept coming back here.
// The shadow stack, exactly as specified — as a plain CSS string, NOT a Tailwind arbitrary class.
// Written as shadow-[0_0_8px_rgba(…)…] it silently produced nothing: the browser reported the
// computed box-shadow as "rgba(0,0,0,0) 0px 0px 0px 0px, …", i.e. Tailwind's empty shadow slots.
// Every inset highlight and rim — the whole reason the pane reads as glass — was missing, which is
// what left it looking like a flat grey card. There is no build warning for this; it has to be read
// off the live element.
export const GLASS_SHADOW = [
  "0 0 8px rgba(0,0,0,0.03)",
  "0 2px 6px rgba(0,0,0,0.08)",
  "inset 3px 3px 0.5px -3.5px rgba(255,255,255,0.09)",
  "inset -3px -3px 0.5px -3.5px rgba(255,255,255,0.85)",
  "inset 1px 1px 1px -0.5px rgba(255,255,255,0.6)",
  "inset -1px -1px 1px -0.5px rgba(255,255,255,0.6)",
  "inset 0 0 6px 6px rgba(255,255,255,0.12)",
  "inset 0 0 2px 2px rgba(255,255,255,0.06)",
  "0 0 12px rgba(0,0,0,0.15)",
].join(", ");

/**
 * The glass itself: put it as the first child of a positioned container and give that container the
 * radius you want. It fills the container and sits behind everything else in it.
 */
export function GlassSurface({ className, tint = "rgba(255,255,255,0.62)" }: { className?: string; tint?: string }) {
  return (
    <>
      {/* 1. What shows through. Blur and saturation only — NO url() here. Firefox is the only engine
             that applies an SVG filter in backdrop-filter, and an unsupported url() in the list
             risks Chromium throwing the whole declaration away, blur included, which leaves a flat
             grey box. */}
      <span
        aria-hidden="true"
        data-share-ok
        className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}
        style={{
          background: tint,
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
        }}
      />
      {/* 2. The distortion, in the one place every engine honours it: an ordinary `filter` on a
             sheen laid over the pane. The turbulence pushes the highlight about so the gloss breaks
             up the way it does on real glass instead of sitting there as a clean gradient. */}
      <span
        aria-hidden="true"
        data-share-ok
        // The turbulence filter is applied by class (.glass-sheen, globals.css) so touch screens can
        // skip it: an SVG filter is rasterised on the CPU, and while a menu morphs its corner radius
        // changes every frame, so the whole turbulence + displacement chain re-ran on every frame of
        // every opening — on a phone, the stutter in each menu animation.
        className="glass-sheen pointer-events-none absolute inset-0 rounded-[inherit] opacity-50"
        style={{
          background:
            "radial-gradient(120% 80% at 22% -10%, rgba(255,255,255,0.5), rgba(255,255,255,0) 55%), radial-gradient(90% 70% at 85% 110%, rgba(255,255,255,0.22), rgba(255,255,255,0) 60%)",
        }}
      />
      {/* 3. The thickness and the lit edges — the spec's stack, verbatim. */}
      <span aria-hidden="true" data-share-ok className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ boxShadow: GLASS_SHADOW }} />
    </>
  );
}

/**
 * The SVG the pane's backdrop filter points at. Rendered once for the whole page — the original put
 * one inside every button, so a page with several of them had several elements all answering to the
 * same id.
 */
export function GlassFilter() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute h-0 w-0" focusable="false">
      <defs>
        <filter id={GLASS_FILTER_ID} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves="1" seed="1" result="turbulence" />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="70" xChannelSelector="R" yChannelSelector="B" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
