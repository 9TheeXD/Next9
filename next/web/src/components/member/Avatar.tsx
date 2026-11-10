"use client";

import { useEffect, useRef, useState } from "react";

// First letter to show, skipping Thai leading vowels (โฮป shows ฮ, not โ).
function initial(nickname: string) {
  return Array.from(nickname.replace(/^[เแโใไ]+/, ""))[0] ?? "";
}

// A member photo; members without one yet (new members, before their photo is uploaded) get their
// nickname's first letter on the site's red instead of a broken image.
export function Avatar({ src, nickname, className }: { src: string; nickname: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  // A 404 that came back before React hydrated fired its error event with no listener attached.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed)
    return (
      <div className={`m-avatar m-avatar-empty ${className ?? ""}`} role="img" aria-label={nickname}>
        <span>{initial(nickname)}</span>
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={img} className={`m-avatar ${className ?? ""}`} src={src} alt={nickname} loading="lazy" onError={() => setFailed(true)} />
  );
}
