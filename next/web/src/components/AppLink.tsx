"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { isAppRoute } from "@/lib/appRoutes";
import { navProgress } from "@/lib/navProgress";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

type NavMotion = {
  direction?: (from: string, to: string) => string | null;
  hint: (dir: string) => void;
  run?: (dir: string, update: () => void) => unknown;
  setupTabBar?: (bar: HTMLElement) => void;
  renderedRoute?: () => void;
  rememberAlbums?: (breadcrumb: { id: string }[], currentId: string, children: { id: string }[], prefix?: string) => void;
};

declare global {
  interface Window {
    navMotion?: NavMotion;
  }
}

// Every in-site link goes through this.
//
// App routes: the click becomes router.push() carrying a transition type worked out at click time
// from the full current and target URLs (album depth included, see /nav-motion.js), so the page
// slides the right way — deeper from the right, up from the left, tabs by their order. No page
// load happens.
//
// Legacy pages (public share links) cannot be rendered client-side; the browser
// loads those directly, and they are never prefetched.
export function AppLink({ href, prefetch, onNavigate, ...props }: Props) {
  const router = useRouter();

  if (isAppRoute(href)) {
    return (
      <Link
        href={href}
        prefetch={prefetch}
        onNavigate={(e) => {
          onNavigate?.(e);
          e.preventDefault();
          navProgress.start();
          const dir = window.navMotion?.direction?.(location.href, new URL(href, location.href).href);
          // nav-root: the slide belongs to the whole-page snapshot (see PageTransition and
          // /nav-motion.js), so it plays whether the destination renders at once or shows its
          // Suspense fallback first.
          router.push(href, { transitionTypes: dir ? [`nav-${dir}`, "nav-root"] : undefined });
        }}
        {...props}
      />
    );
  }
  return (
    <Link
      href={href}
      prefetch={false}
      onNavigate={(e) => {
        onNavigate?.(e);
        e.preventDefault();
        navProgress.start();
        window.location.assign(href);
      }}
      {...props}
    />
  );
}
