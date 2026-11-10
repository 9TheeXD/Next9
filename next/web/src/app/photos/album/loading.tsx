import { PageTransition } from "@/components/PageTransition";
import { AlbumFallback } from "@/components/photos/album/AlbumPage";

// Prefetched ahead of time, so opening an album slides in at once (header and photo placeholders)
// while the page itself comes from the server, instead of waiting on the server before anything moves.
export default function Loading() {
  return (
    <PageTransition>
      <AlbumFallback />
    </PageTransition>
  );
}
