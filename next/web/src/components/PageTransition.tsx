import { ViewTransition } from "react";
import type { ReactNode } from "react";

// Wrap the content of each page.tsx (not a layout: layouts stay mounted, so they never enter or
// exit). On client-side navigation the page slides along the X axis in the direction the navigation
// carries (see AppLink and /nav-motion.js); a navigation with no direction does not animate. The tab
// bar and everything else outside the wrapper stay still. No fades (see globals.css).
//
// This names the page element, so it is the element that slides whenever the destination renders in
// the same commit as the navigation. When the destination suspends instead, React commits a Suspense
// fallback and forms no enter/exit pair — it defers the enter to the reveal, which carries no
// transition type, so nothing here animates. The arriving page is then part of the browser's root
// snapshot, and the nav-root rules in /nav-motion.js slide that instead. Both paths move the same
// distance in the same direction over the same 300ms, so a navigation looks the same whether or not
// the route was already in the router cache — which is what made the slide a coin flip on a phone.
const MOTION = {
  "nav-forward": "slide-forward",
  "nav-back": "slide-back",
  "nav-tab-forward": "push-forward",
  "nav-tab-back": "push-back",
  default: "none",
};

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={MOTION} exit={MOTION} default="none">
      {children}
    </ViewTransition>
  );
}
