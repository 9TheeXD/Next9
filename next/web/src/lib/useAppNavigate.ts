"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { isAppRoute } from "@/lib/appRoutes";
import { navProgress } from "@/lib/navProgress";

// Client-side navigation from code (not a <Link>): router.push with the slide direction for the
// page transition, worked out from the current and target URLs by /nav-motion.js. The progress bar
// starts at once. URLs the app does not render load normally.
export function useAppNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string, opts: { replace?: boolean } = {}) => {
      navProgress.start();
      if (!isAppRoute(href)) {
        if (opts.replace) location.replace(href);
        else location.assign(href);
        return;
      }
      const target = new URL(href, location.href);
      const rel = target.pathname + target.search + target.hash;
      if (target.href === location.href) {
        navProgress.reset();
        return;
      }
      const dir = opts.replace ? null : window.navMotion?.direction?.(location.href, target.href);
      // nav-root: the whole-page snapshot is what slides (see PageTransition and /nav-motion.js).
      const options = { transitionTypes: dir ? [`nav-${dir}`, "nav-root"] : undefined };
      if (opts.replace) router.replace(rel, options);
      else router.push(rel, options);
    },
    [router],
  );
}

// Warms the route a tap is about to open (touch start, mouse hover), so the page is usually ready by
// the time the finger lifts. Each URL is prefetched at most once a minute.
const warmed = new Map<string, number>();
export function usePrefetch() {
  const router = useRouter();
  return useCallback(
    (href: string | null | undefined) => {
      if (!href || !isAppRoute(href)) return;
      const target = new URL(href, location.href);
      const rel = target.pathname + target.search;
      const last = warmed.get(rel);
      if (last && Date.now() - last < 60000) return;
      warmed.set(rel, Date.now());
      router.prefetch(rel);
    },
    [router],
  );
}
