"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MorphSurface } from "@/components/photos/ui/MorphMenu";

// The one floating menu of the album page: right-click on a photo, right-click on empty space, and the
// header's ☰ menu all render through this, so they look and behave the same.
//
// Placement is measured, not guessed: the menu renders hidden, its real size is read, and it is then
// put where it fits inside the window (8 px margin):
//   - at a point (right-click): opens right/down from the pointer, flipping left and/or up near the
//     right and bottom edges;
//   - under a button (☰): below the button, right-aligned to it, flipping above when there is no room.
// Only a menu taller than the whole window gets a scrollbar; any other menu shows every item.

export type MenuAnchor = { x: number; y: number } | { rect: DOMRect; align?: "start" | "end"; el?: HTMLElement | null };

const MARGIN = 8;

export function PopupMenu({
  id,
  open,
  closing,
  anchor,
  className,
  children,
}: {
  id?: string;
  open: boolean;
  closing?: boolean;
  anchor: MenuAnchor | null;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !anchor || !el) {
      // Measured afresh every time it opens. The element only exists while open now (Motion mounts
      // and unmounts it), so this runs on the mount that put it there.
      setPos(null);
      return;
    }
    // Natural size, with no height limit from an earlier placement.
    el.style.maxHeight = "none";
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const vw = window.innerWidth,
      vh = window.innerHeight;
    let left: number, top: number;
    if ("rect" in anchor) {
      const r = anchor.rect;
      left = anchor.align === "start" ? r.left : r.right - w;
      top = r.bottom + MARGIN;
      if (top + h > vh - MARGIN && r.top - MARGIN - h >= MARGIN) top = r.top - MARGIN - h; // above the button
    } else {
      left = anchor.x;
      top = anchor.y;
      if (left + w > vw - MARGIN) left = anchor.x - w; // open to the left of the pointer
      if (top + h > vh - MARGIN) top = anchor.y - h; // open upwards
    }
    left = Math.max(MARGIN, Math.min(left, vw - MARGIN - w));
    let maxHeight: number | undefined;
    if (h > vh - 2 * MARGIN) {
      top = MARGIN;
      maxHeight = vh - 2 * MARGIN; // the only case that scrolls
    } else top = Math.max(MARGIN, Math.min(top, vh - MARGIN - h));
    setPos({ left, top, maxHeight });

  }, [open, anchor]);

  // Where the menu grows from: the button that opened it, or the pointer for a right-click.
  const originX = anchor ? ("rect" in anchor ? anchor.rect.left + anchor.rect.width / 2 : anchor.x) : 0;
  const originY = anchor ? ("rect" in anchor ? anchor.rect.top + anchor.rect.height / 2 : anchor.y) : 0;

  return (
    <MorphSurface
      innerRef={ref}
      id={id}
      open={open}
      left={pos ? pos.left : null}
      top={pos ? pos.top : null}
      originX={originX}
      originY={originY}
      className={"app-menu show" + (closing ? " closing" : "") + (className ? " " + className : "")}
      style={pos?.maxHeight ? { maxHeight: pos.maxHeight, overflowY: "auto" } : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </MorphSurface>
  );
}

// Keyboard shortcut chip shown at the right of a menu item.
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export function Kbd({ k }: { k: "selectAll" | "escape" }) {
  // The server cannot know the platform: the chip may read Ctrl+A in the HTML and ⌘A once in a Mac browser.
  return (
    <kbd className="app-menu-kbd" suppressHydrationWarning>
      {k === "selectAll" ? (IS_MAC ? "⌘A" : "Ctrl+A") : "Esc"}
    </kbd>
  );
}
