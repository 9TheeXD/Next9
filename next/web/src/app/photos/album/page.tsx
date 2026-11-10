import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { AlbumRoute } from "@/components/photos/AlbumRoute";
import { AlbumFallback } from "@/components/photos/album/AlbumPage";

import { albumPreview, ensureSchema } from "../../../../server/api.mjs";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

// Link previews for shared album links (LINE, Facebook, Discord, X): crawlers don't run JavaScript, so
// the album's title and cover must be in the HTML. the API (server/api.mjs) decides what an album may show (a locked
// album never exposes a photo) and answers GET /api/photos/og.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { id } = await searchParams;
  if (typeof id !== "string" || !id) return {};
  try {
    await ensureSchema();
    const og = (await albumPreview(id)) as { title: string; description: string; url: string; image: string } | null;
    if (!og) return {};
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
