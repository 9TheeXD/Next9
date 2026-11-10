import type { Metadata } from "next";
import "./legacy-home.css";
import "./legacy-album.css";
import "@/components/photos/folders/folders.css";

export const metadata: Metadata = {
  title: "อัลบั้มรูป",
  icons: { icon: "/assets/icons/photos.svg" },
  robots: { index: false, follow: false },
};

// Everything under /photos/ is rendered in memory by the app: moving between the album list, an album
// and All Photos never reloads the page.
export default function PhotosLayout({ children }: LayoutProps<"/photos">) {
  return children;
}
