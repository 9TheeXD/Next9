"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { navProgress } from "@/lib/navProgress";

// Thin bar across the top of the screen: appears in the same frame as the tap that starts a
// navigation, creeps forward while the next page loads, then fills and fades once it has rendered.
// Only transform and opacity animate, so it stays smooth on phones.
export function NavProgress() {
  const state = useSyncExternalStore(navProgress.subscribe, navProgress.get, () => "idle" as const);
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const first = useRef(true);

  // The new URL has rendered: finish the bar, and release a browser Back that /nav-motion.js is
  // holding. Back carries no transition type of its own, so nav-motion.js starts the transition and
  // waits here for the commit — without this call it can only guess when the new page is on screen,
  // and a snapshot taken too early makes Back cut instead of slide.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    navProgress.done();
    window.navMotion?.renderedRoute?.();
  }, [pathname, search]);

  useEffect(() => {
    if (state === "done") {
      const t = setTimeout(navProgress.reset, 400);
      return () => clearTimeout(t);
    }
    if (state === "loading") {
      // A navigation that never commits (cancelled, same URL) must not leave the bar stuck.
      const t = setTimeout(navProgress.reset, 15000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return <div className="nav-progress" data-state={state} aria-hidden="true" />;
}
