"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The element that stands in for a legacy photos page's <body>: it carries the page's CSS scope
// class and the state classes the legacy page toggled on <html> (sel-mode, all-mode, has-tabbar ...).
const Ctx = createContext<(classes: string) => void>(() => {});

export const useShellClasses = () => useContext(Ctx);

export function PageShell({ scope, children }: { scope: "lp-home" | "lp-album"; children: ReactNode }) {
  const [classes, setClasses] = useState("");
  return (
    <Ctx.Provider value={setClasses}>
      <div className={scope + (classes ? " " + classes : "")} data-nav-content>
        {children}
      </div>
    </Ctx.Provider>
  );
}
