"use client";

import { useEffect, useRef, useState } from "react";
import { sharedObserver } from "@/lib/photos/observe";

// Empty tile shown where a photo is not fetched yet. Only the ones on screen shimmer: a moving
// highlight on every tile of a long grid is what makes a phone stutter, and a placeholder nobody can
// see has nothing to communicate.
const observeSkel = sharedObserver({});

export function GridSkel() {
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeSkel(el, (e) => setOnScreen(e.isIntersecting));
  }, []);

  return <div ref={ref} className={"grid-skel" + (onScreen ? " shimmer" : "")} aria-hidden="true" />;
}
