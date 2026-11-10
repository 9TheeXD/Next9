"use client";

import { useSearchParams } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { AlbumPage } from "./album/AlbumPage";
import type { Mode } from "./album/model";

// /photos/album/?id=<album>, ?view=all or ?share=<token>[&a=<album>]. The same route serves every
// album, so the page is keyed by which one is showing: moving between albums is one page leaving and
// another entering, and they slide.
export function AlbumRoute() {
  const search = useSearchParams();
  const share = search.get("share");
  const mode: Mode = share !== null ? { kind: "share", token: share, albumId: search.get("a") || "" } : search.get("view") === "all" ? { kind: "all" } : { kind: "album", id: search.get("id") || "" };
  const key = mode.kind === "all" ? "all" : mode.kind === "share" ? `share:${mode.token}:${mode.albumId}` : `album:${mode.id}`;
  return (
    <PageTransition key={key}>
      <AlbumPage key={key} mode={mode} />
    </PageTransition>
  );
}
