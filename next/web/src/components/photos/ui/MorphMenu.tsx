"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import type React from "react";
import { GlassSurface } from "@/components/ui/liquid-glass";
import { cn } from "@/lib/utils";

// A button that becomes its own menu.
//
// The point of the shared `layoutId` is that there is only ever ONE element: closed, it is the
// button; open, it is the panel. Framer Motion measures the box it had before and the box it has
// now and interpolates between them, so the button genuinely grows into the menu, carrying its
// background, its radius and its position with it.
//
// This is what the previous attempts could not do. They rendered a separate popup somewhere else in
// the document and animated a transform on it to make it *look* as though it had come out of the
// button — which is why it was always slightly detached, why the coordinates drifted whenever the
// popup had a transition of its own, and why the contents flashed before the animation started:
// they were mounted, painted, and only then animated by a CSS class arriving a frame later.
//
// The panel is positioned relative to the wrapper the button sits in, so it is anchored to the
// button by layout rather than by measurement. Nothing is measured, so nothing can be measured
// wrong.

export type MorphMenuAlign = "start" | "end";

// Performance on phones — why the animations below are written the way they are.
//
// Motion hands an animation to the browser's compositor (WAAPI, off the main thread, no repaint)
// only for `opacity`, `transform`, `filter` and `clipPath`. Its shorthand values — `scale`, `y` —
// are instead computed in JavaScript and written to the element on every frame, and each write
// repaints the element. For these menus a repaint is expensive: a backdrop blur, a nine-layer inset
// shadow and the rows, every frame, which a mid-range phone (tested on a Vivo Y72) cannot do at 60fps.
// So every animation here is written as a full `transform` string, which Motion runs on the
// compositor, and the morphing elements carry `will-change: transform` so the layout animation's
// per-frame transform moves an existing GPU layer instead of repainting it.
//
// The one thing that cannot be composited is Motion's corner-radius correction during a morph: it
// rewrites border-radius every frame, which repaints. It is kept on desktop, where it is cheap; on a
// touch screen the corners are left to the stylesheet, so they stretch slightly for the ~250ms of
// the morph and the whole animation stays on the GPU.
const FINE_POINTER = "(hover: hover) and (pointer: fine)";
function subscribePointer(cb: () => void) {
  const mq = window.matchMedia(FINE_POINTER);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useFinePointer() {
  return useSyncExternalStore(
    subscribePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => true,
  );
}

export function MorphMenu({
  open,
  onOpenChange,
  trigger,
  children,
  align = "end",
  side = "bottom",
  className,
  panelClassName,
  triggerClassName,
  label,
  width = 230,
  triggerGlass = true,
  id,
  listId,
  maxHeight,
  triggerId,
  triggerTitle,
  tone = "glass",
  triggerRadius = 22,
  triggerKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the button shows when closed. */
  trigger: ReactNode;
  /** The rows. Each direct child is faded in after the panel has taken its shape. */
  children: ReactNode;
  align?: MorphMenuAlign;
  side?: "top" | "bottom";
  className?: string;
  panelClassName?: string;
  triggerClassName?: string;
  label?: string;
  width?: number;
  /** False for a trigger that sits on a solid surface and keeps its own look (the header's sort
   *  control); the panel it opens is glass either way. */
  triggerGlass?: boolean;
  /** id on the wrapper, which stays in the document whether the menu is open or closed. */
  id?: string;
  /** id on the element that directly holds the rows. Share mode hides actions with direct-child
   *  selectors (`#sbActionsMenu > :not([data-share-ok])`), so the id has to sit on the rows'
   *  own parent — on the panel it would match the glass layers and the list, not the rows. */
  listId?: string;
  /** Long menus scroll inside the panel instead of running off the screen. */
  maxHeight?: string;
  triggerId?: string;
  triggerTitle?: string;
  /** "accent" for a menu opened from a solid red button: the panel stays red (frosted red glass,
   *  white rows) instead of changing into a white pane. */
  tone?: "glass" | "accent" | "viewer";
  /** Changes when the button's label means something new ("กำลังแสดง SD+" → "กำลังแสดง HD");
   *  the old label fades out and the new one in, instead of the text being swapped in place. */
  triggerKey?: string;
  /** The button's corner radius in px. Given to Motion as a style value so the corners morph into
   *  the panel's 14px instead of being stretched with the box. Default fits a 44px pill. */
  triggerRadius?: number;
}) {
  const layoutId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();

  // Closed by pressing anywhere else, or Escape. Previously each caller wired this up itself, and
  // not all of them did. Escape is taken in the capture phase and stopped there, so closing a menu
  // inside the image viewer does not also close the viewer behind it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current?.contains(e.target as Node)) return;
      onOpenChange(false);
      // The press that dismisses a menu does only that. Its click would otherwise go on to whatever
      // is underneath — in the viewer, the backdrop (closing the viewer) or the video (toggling
      // playback). This used to need a full-screen invisible backdrop per menu, which also sat on
      // top of any menu drawn inside the viewer.
      swallowClickOfThisPress();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrap} id={id} className={cn("relative inline-flex", className)}>
      {/* An invisible copy of the button is what takes up room in the line — always, open or not.
          The real button and the panel are both absolutely positioned on top of it, so nothing that
          happens between them can move the page. Measured frame by frame before this: the copy was
          only there while open, and the closing button stays mounted (fading) for the whole morph,
          so for ~0.9s both were in the flow and the wrapper was twice the button's width —
          everything beside the ดำเนินการ button was pushed along and then snapped back. */}
      <span aria-hidden="true" className={cn(TRIGGER_BASE, triggerClassName)} style={{ visibility: "hidden" }}>
        <span className="relative z-10 inline-flex items-center gap-2">{trigger}</span>
      </span>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            layoutId={layoutId}
            layoutDependency={open}
            role="menu"
            aria-label={label}
            // The radius is a style value, not only a class, so Motion corrects it for the scale it
            // applies while morphing. As a class it was scaled with the box: at the first frame the
            // panel is ~0.5 x 0.26 of its size and its 14px corners were drawn as 7 x 3.6px ellipses.
            style={{
              width,
              willChange: "transform",
              ...(fine ? { borderRadius: 14 } : null),
              [side === "bottom" ? "top" : "bottom"]: 0,
              [align === "end" ? "right" : "left"]: 0,
            }}
            className={cn(
              "absolute z-[9600] flex flex-col gap-0.5 overflow-hidden rounded-[14px] p-[5px] text-[#16181d]",
              side === "bottom" ? "origin-top" : "origin-bottom",
              tone === "accent" && "morph-accent",
              tone === "viewer" && "morph-viewer",
              panelClassName,
            )}
            transition={SPRING}
            // No crossfade between the button and the panel (see the trigger for why). Closing, the
            // panel drops beneath the button (zIndex 0 against the button's 1) — the button starts
            // the morph at the panel's full size and covers it on the first frame, so the panel can
            // simply go. Sampled before this: the panel sat on top at full size, fading over 200ms
            // while the button shrank under it — an empty pane ghosting over the real one.
            layoutCrossfade={false}
            exit={{ opacity: 0, zIndex: 0, transition: { opacity: { duration: 0.06 } } }}
            // Presses inside the menu are the menu's business. Without this a row click also
            // reached whatever the menu floats over — in the video player, the picture, which
            // toggled playback every time a quality was chosen.
            onClick={(e) => e.stopPropagation()}
          >
            {/* The accent tone is not glass: it continues a solid red button, so it is the same solid
                red (background from the stylesheet, .morph-accent). */}
            {tone === "accent" ? null : <GlassSurface tint={TONE_TINT[tone]} />}
            {/* The rows arrive once the panel has its shape. They are inside the same
                AnimatePresence tree as the panel, so they cannot mount, paint and then be animated
                by something that turns up a frame later. */}
            <motion.div
              id={listId}
              className={cn("relative z-10 flex flex-col", maxHeight && "overflow-y-auto overscroll-contain")}
              style={maxHeight ? { maxHeight } : undefined}
              variants={LIST}
              initial="hidden"
              animate="shown"
              exit="hidden"
            >
              {children}
            </motion.div>
          </motion.div>
        ) : (
          <motion.button
            key="trigger"
            layoutId={layoutId}
            // Only the open/close morph is a layout animation. Without this Motion treats ANY change
            // in where the button sits as one: the video player's ⋮ is mounted while the player is
            // display:none (a 0×0 box at the corner), so the first time it was shown it "animated"
            // in from there — invisible on the first video, sliding in from the side on the next —
            // and the viewer's buttons slid about whenever a photo change nudged the layout.
            layoutDependency={open}
            type="button"
            aria-haspopup="menu"
            aria-expanded={false}
            aria-label={label}
            id={triggerId}
            title={triggerTitle}
            onClick={(e) => {
              e.stopPropagation();
              onOpenChange(true);
            }}
            className={cn(TRIGGER_BASE, "[border-radius:var(--morph-r)]", tone === "viewer" && "morph-viewer-trigger", triggerClassName)}
            // Placed over its invisible copy (above), so its own coming and going never moves the line.
            // Inline, so it outranks legacy rules such as `.lb-video-quality-btn { position: relative }`.
            style={
              {
                position: "absolute",
                left: 0,
                top: 0,
                zIndex: 1,
                willChange: "transform",
                // Touch: the radius comes from the class below via this variable (not corrected
                // during the morph, so never repainted by it). Desktop: an inline value Motion corrects.
                "--morph-r": `${triggerRadius}px`,
                ...(fine ? { borderRadius: triggerRadius } : null),
              } as React.CSSProperties
            }
            // Motion's default is to crossfade the two ends of a shared layout. Both ends are glass,
            // so halfway through two half-transparent panes were stacked (0.77 over 0.23 at 21ms):
            // the blur thinned out and the photo behind showed through for a few frames. Each end
            // stays fully opaque instead and the one on top fades.
            layoutCrossfade={false}
            // Pressed in place on the way down; the menu opens on release, which is what onClick is.
            whileTap={{ scale: 0.95 }}
            // No exit animation and no opacity of its own: opening, the panel is drawn over the
            // button from the first frame, so the button can simply go. Anything that animated the
            // button's opacity could leave it at 0 if the menu was closed again mid-fade (seen on
            // the album sort button) — a control on the page, clickable and invisible.
            transition={SPRING}
          >
            {triggerGlass ? <GlassSurface tint={TONE_TINT[tone]} /> : null}
            {/* `layout` on the label is what keeps it its real size while the button is scaled
                from the panel's box back down to its own: without it Motion scaled the text with
                the box, and the video showed a giant "กำลังแสดง HD" filling the shrinking pane. It
                also only fades in as the button settles (it has nothing to say at panel size), and
                a new label crossfades with the old one rather than replacing it between frames. */}
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={triggerKey ?? "label"}
                layout="position"
                layoutDependency={open}
                className="relative z-10 inline-flex items-center gap-2"
                style={{ willChange: "transform" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.18, delay: 0.1 } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                {trigger}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Cancels the click that belongs to the press being handled right now — and only that one. The
 * guard ends at the next press: a press that produces no click (a drag, a scroll, a long touch)
 * used to leave it armed for 800ms, and the visitor's next, real tap (the › arrow, measured) was
 * silently eaten.
 */
function swallowClickOfThisPress() {
  const swallow = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    disarm();
  };
  const disarm = () => {
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("pointerdown", disarm, true);
    clearTimeout(timer);
  };
  window.addEventListener("click", swallow, true);
  // Registered after this press has finished dispatching, so it only sees the next one.
  setTimeout(() => window.addEventListener("pointerdown", disarm, true), 0);
  const timer = setTimeout(disarm, 1500);
}

/** One row of a MorphMenu. */
export function MorphMenuItem({
  children,
  onSelect,
  danger,
  active,
  disabled,
  icon,
  trailing,
  className,
  role = "menuitem",
  ...rest
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  /** Right-aligned extra: a shortcut chip, a check mark, a status pill. */
  trailing?: ReactNode;
  className?: string;
  role?: string;
} & RowAttrs) {
  const pressed = useRef(false);
  return (
    <motion.button
      type="button"
      role={role}
      disabled={disabled}
      data-danger={danger || undefined}
      {...rest}
      // With a mouse the choice is made on press, so the menu starts closing the moment the button
      // goes down — waiting for release left it sitting open for as long as the button was held
      // (0.4s in the recording). Touch still chooses on release, so a scroll that starts on a row
      // does not pick it; keyboard and touch arrive as click.
      onPointerDown={(e) => {
        if (disabled || e.pointerType !== "mouse" || e.button !== 0) return;
        e.preventDefault();
        pressed.current = true;
        // The menu is gone by the time the button comes back up, so the click that follows lands
        // on whatever was underneath — in the viewer, the backdrop, which would close the viewer.
        swallowClickOfThisPress();
        onSelect?.();
      }}
      onClick={() => {
        if (pressed.current) {
          pressed.current = false;
          return;
        }
        onSelect?.();
      }}
      variants={ITEM}
      // The press is CSS (`scale` property): the row's entrance animates `transform` on the
      // compositor, and a Motion `scale` on the same element would pull it back onto the main thread.
      className={cn(
        // appearance-none/border-0/bg-transparent are not decoration: Tailwind's Preflight is
        // disabled in this project (it would restyle the hand-written pages), so without these a
        // <button> keeps the UA's opaque ButtonFace grey and its border — which is what turned every
        // row into a solid grey chip and hid the glass behind it entirely.
        "appearance-none border-0 bg-transparent font-[inherit]",
        "flex min-h-10 w-full items-center gap-2.5 rounded-[9px] px-3.5 py-2 text-left text-[0.88rem] font-medium transition-colors",
        "hover:bg-black/[0.06] active:bg-black/[0.1] active:scale-[0.985] disabled:cursor-not-allowed disabled:text-black/30 disabled:hover:bg-transparent",
        danger ? "text-[#c81e1e]" : active ? "font-semibold text-[#b00909]" : "text-[#16181d]",
        className,
      )}
    >
      {icon ? <span className="grid w-[18px] shrink-0 place-items-center">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="ml-auto inline-flex shrink-0 items-center">{trailing}</span> : null}
    </motion.button>
  );
}

export function MorphMenuSeparator(props: RowAttrs) {
  return <motion.div variants={ITEM} {...props} className="mx-2 my-[5px] h-px shrink-0 bg-black/10" />;
}

/** A small heading inside a menu ("คุณภาพ"). */
export function MorphMenuLabel({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={ITEM} className="px-3.5 pt-1.5 pb-1 text-[0.72rem] font-medium text-black/50">
      {children}
    </motion.div>
  );
}

// What a row passes straight through to its element: the ids other code looks rows up by, and the
// data-share-* markers share mode filters on.
type RowAttrs = {
  id?: string;
  style?: React.CSSProperties;
  title?: string;
  "aria-checked"?: boolean;
  [data: `data-${string}`]: string | boolean | undefined;
};

const TRIGGER_BASE =
  "relative inline-flex cursor-pointer appearance-none items-center justify-center overflow-hidden rounded-full border-0 bg-transparent font-[inherit] text-[#16181d]";


// Per tone, the pane's tint over its blur. "viewer" is for controls inside the image viewer, which
// sit on an 88%-black backdrop: the light tint used everywhere else has nothing to show through
// there, so 62% white over near-black rendered as a flat opaque grey-white slab (seen in a screen
// recording). A thin white tint with white contents reads as glass on dark instead.
const TONE_TINT: Record<"glass" | "accent" | "viewer", string | undefined> = {
  glass: undefined,
  accent: undefined,
  viewer: "rgba(255, 255, 255, 0.16)",
};

// A spring rather than a duration: the panel settles like something with weight, and because the
// same spring drives the shared layout it also drives the morph out of the button.
const SPRING = { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.9 };

const LIST = {
  // Leaving, the rows go at once and together: the panel starts shrinking immediately, and rows
  // still visible inside a box being scaled 0.9 x 0.85 are squashed text.
  hidden: { transition: { staggerChildren: 0 } },
  // The rows wait for the panel to have most of its shape, then come in from the top.
  shown: { transition: { delayChildren: 0.12, staggerChildren: 0.032 } },
};

const ITEM = {
  hidden: { opacity: 0, transform: "translateY(-10px)", transition: { duration: 0.07 } },
  shown: { opacity: 1, transform: "translateY(0px)", transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } },
};

/**
 * The same opening, for the menus that cannot be a button and a panel in one wrapper: the
 * right-click menu, the ☰ menu, the album-card ⋮ menu. Those are portal-style popups placed at
 * measured coordinates, so there is no shared element to hand a layoutId to — instead the panel
 * scales out of the point it was summoned from, which is the button's centre or the pointer.
 *
 * The reason this replaces the old MutationObserver path is not that it looks different. It is that
 * Motion applies the opening state while the element is being rendered, so the panel's FIRST painted
 * frame is already the small, transparent one. The observer could only add a class after React had
 * rendered and the browser had painted, so the menu appeared fully formed and was then snapped back
 * to nothing — the flash, then the stagger down, every single time.
 */
export function MorphSurface({
  open,
  left,
  top,
  originX,
  originY,
  className,
  id,
  role = "menu",
  style,
  children,
  onKeyDown,
  onClick,
  onContextMenu,
  innerRef,
  cssPlaced,
  origin,
}: {
  open: boolean;
  /** The stylesheet positions this surface; only the growth point is set here. */
  cssPlaced?: boolean;
  /** transform-origin to use with cssPlaced, e.g. "calc(100% - 22px) calc(100% + 34px)". */
  origin?: string;
  /** Measured placement. Null while the menu is still being measured. */
  left: number | null;
  top: number | null;
  /** The viewport point the menu grows out of. */
  originX: number;
  originY: number;
  className?: string;
  id?: string;
  role?: string;
  style?: React.CSSProperties;
  children: ReactNode;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const placed = cssPlaced || (left !== null && top !== null);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={innerRef}
          id={id}
          role={role}
          className={cn("morph-surface", className)}
          // Children are DIRECT children, with no list wrapper. Share mode hides destructive
          // actions with `#lbSheet > :not([data-share-ok])` and friends — direct-child selectors —
          // so wrapping the rows would quietly expose delete and move on public share links.
          style={{
            ...(cssPlaced
              ? { transformOrigin: origin || "center" }
              : {
                  position: "fixed" as const,
                  left: placed ? (left as number) : 0,
                  top: placed ? (top as number) : 0,
                  // Grows out of the point it was summoned from.
                  transformOrigin: placed ? `${originX - (left as number)}px ${originY - (top as number)}px` : "center",
                }),
            // Hidden until measured, rather than drawn in the wrong place for a frame.
            visibility: placed ? "visible" : "hidden",
            ...style,
          }}
          initial={{ opacity: 0, transform: "scale(0.82)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          exit={{ opacity: 0, transform: "scale(0.95)", transition: { duration: 0.12 } }}
          transition={SPRING}
          onKeyDown={onKeyDown}
          onClick={onClick}
          onContextMenu={onContextMenu}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * The phone presentation of a menu: a sheet that rises from the bottom edge. Same material and the
 * same Motion-driven entry as MorphSurface — the first painted frame is already below the screen,
 * so it never appears fully formed and then jumps — only the direction of travel differs, because a
 * sheet belongs to the edge of the screen rather than to the point it was summoned from.
 *
 * Children are direct children for the same share-mode reason as MorphSurface.
 */
export function MorphSheet({
  open,
  className,
  children,
  onClick,
  onKeyDown,
  innerRef,
  role = "menu",
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  innerRef?: React.Ref<HTMLDivElement>;
  role?: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={innerRef}
          role={role}
          className={cn("morph-surface", className)}
          // Inline, so it outranks any keyframe animation a legacy class still names.
          style={{ animation: "none", transition: "none" }}
          initial={{ transform: "translateY(100%)" }}
          animate={{ transform: "translateY(0%)" }}
          exit={{ transform: "translateY(100%)", transition: { duration: 0.17, ease: [0.4, 0, 1, 1] } }}
          transition={SHEET_SPRING}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// Stiffer and fully damped: a sheet that overshoots the bottom edge shows a gap under itself.
const SHEET_SPRING = { type: "spring" as const, stiffness: 520, damping: 46, mass: 0.9 };
