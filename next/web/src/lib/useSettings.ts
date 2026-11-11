"use client";

import { useEffect, useState } from "react";
import type { Settings, SectionName } from "./settings";

// Public settings sections for client components: null while loading, the defaults the server
// returns otherwise. One request per set of sections, shared by every component asking for it.
const pending = new Map<string, Promise<Partial<Settings>>>();

export function loadPublicSettings<K extends SectionName>(sections: K[]): Promise<Pick<Settings, K>> {
  const key = [...sections].sort().join(",");
  let p = pending.get(key);
  if (!p) {
    p = fetch(`/api/settings/public?s=${key}`)
      .then((r) => r.json())
      .then((j) => (j.success ? j.settings : {}))
      .catch(() => ({}));
    pending.set(key, p);
  }
  return p as Promise<Pick<Settings, K>>;
}

export function usePublicSettings<K extends SectionName>(...sections: K[]): Pick<Settings, K> | null {
  const [value, setValue] = useState<Pick<Settings, K> | null>(null);
  const key = sections.join(",");
  useEffect(() => {
    let alive = true;
    loadPublicSettings(key.split(",") as K[]).then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, [key]);
  return value;
}
