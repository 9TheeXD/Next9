"use client";

import { useEffect, useRef, useState } from "react";
import type { Album } from "@/lib/photos/types";
import { metaText } from "@/lib/photos/tree";
import { cx } from "@/lib/photos/util";

export const defaultImageUrl = (id: string, variant: string) => "/api/image/" + encodeURIComponent(id) + "/" + variant;

let thumbObs: IntersectionObserver | null = null;
const thumbCallbacks = new WeakMap<Element, () => void>();
function observeThumb(el: Element, cb: () => void) {
  if (!("IntersectionObserver" in window)) {
    cb();
    return () => {};
  }
  if (!thumbObs)
    thumbObs = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          thumbObs!.unobserve(en.target);
          thumbCallbacks.get(en.target)?.();
          thumbCallbacks.delete(en.target);
        }),
      { rootMargin: "200px" },
    );
  thumbCallbacks.set(el, cb);
  thumbObs.observe(el);
  return () => {
    thumbObs?.unobserve(el);
    thumbCallbacks.delete(el);
  };
}

// Cover: the tiny inline preview at once, swapped for the thumbnail once it has loaded near the viewport.
function TileCover({ album, imageUrl }: { album: Album; imageUrl: (id: string, variant: string) => string }) {
  const ref = useRef<HTMLImageElement>(null);
  const thumb = album.cover_image_id ? imageUrl(album.cover_image_id, "thumb") : "";
  const [src, setSrc] = useState(album.cover_preview || "");
  useEffect(() => {
    const el = ref.current;
    if (!el || !thumb) return;
    let alive = true;
    const stop = observeThumb(el, () => {
      const full = new Image();
      full.onload = () => {
        if (alive) setSrc(thumb);
      };
      full.src = thumb;
    });
    return () => {
      alive = false;
      stop();
    };
  }, [thumb]);
  return (
    <div className="pf-cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={src || undefined} alt="" draggable={false} />
    </div>
  );
}

export function FolderTile({
  album,
  disabled,
  note,
  menu,
  imageUrl = defaultImageUrl,
  draggable,
}: {
  album: Album;
  disabled?: boolean;
  note?: string;
  menu?: boolean;
  imageUrl?: (id: string, variant: string) => string;
  draggable?: boolean;
}) {
  let cover;
  if (!album.has_access)
    cover = (
      <div className="pf-cover pf-cover-locked">
        <i className="fas fa-lock" />
      </div>
    );
  else if (album.cover_image_id) cover = <TileCover album={album} imageUrl={imageUrl} />;
  else
    cover = (
      <div className="pf-cover pf-cover-empty">
        <i className="fas fa-folder" />
      </div>
    );
  return (
    <div
      className={cx("pf-tile", disabled && "is-disabled", !!album.pinned_at && "is-pinned")}
      data-id={album.id}
      tabIndex={0}
      role="button"
      aria-label={album.name}
      draggable={draggable || undefined}
    >
      {cover}
      <div className="pf-tile-body">
        <div className="pf-tile-name">
          {album.pinned_at ? <i className="fas fa-thumbtack pf-pin" /> : null}
          {album.is_locked ? <i className="fas fa-lock pf-lock" /> : null}
          <span>{album.name}</span>
        </div>
        <div className="pf-tile-meta">{note || metaText(album)}</div>
      </div>
      {menu ? (
        <button className="pf-more" type="button" data-more aria-label="ตัวเลือกเพิ่มเติม">
          <i className="fas fa-ellipsis-vertical" />
        </button>
      ) : null}
    </div>
  );
}

export function FolderTileSkeleton() {
  return (
    <div className="pf-tile pf-skel">
      <div className="pf-cover" />
      <div className="pf-tile-body">
        <div className="pf-skel-line" />
        <div className="pf-skel-line short" />
      </div>
    </div>
  );
}
