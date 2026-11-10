import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { AlbumRoute } from "@/components/photos/AlbumRoute";
import { AlbumFallback } from "@/components/photos/album/AlbumPage";

const API_ORIGIN = process.env.LEGACY_API_ORIGIN ?? "http://127.0.0.1:8089";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

// Link previews for shared album links (LINE, Facebook, Discord, X): crawlers don't run JavaScript, so
// the album's title and cover must be in the HTML. server.js decides what an album may show (a locked
// album never exposes a photo) and answers GET /api/photos/og.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { id } = await searchParams;
  if (typeof id !== "string" || !id) return {};
  try {
    const res = await fetch(`${API_ORIGIN}/api/photos/og?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return {};
    const og: { title: string; description: string; url: string; image: string } = await res.json();
    return {
      title: { absolute: og.title },
      description: og.description,
      openGraph: { type: "website", url: og.url, title: og.title, description: og.description, images: [og.image] },
      twitter: { card: "summary_large_image", title: og.title, description: og.description, images: [og.image] },
    };
  } catch {
    return {};
  }
}

// Album page, All Photos (?view=all) and public share links (?share=).
//
// The fallback carries its own PageTransition, like the one in loading.tsx: when the album has not
// arrived yet the navigation commits this fallback instead of AlbumRoute, and a fallback with no
// ViewTransition around it has no name to animate — the new page would appear in place while the old
// one slides away. That is what made the slide play only for albums already in the router cache.
export default function AlbumPageRoute() {
  return (
    <Suspense
      fallback={
        <PageTransition>
          <AlbumFallback />
        </PageTransition>
      }
    >
      <AlbumRoute />
    </Suspense>
  );
}
