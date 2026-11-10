import type { Metadata } from "next";

import { ensureSchema, sharePreview } from "../../../server/api.mjs";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

type SharePreview = {
  title: string;
  description: string;
  url: string;
  image: string;
  type: "website" | "video.other";
  valid: boolean;
  imageWidth: number | null;
  imageHeight: number | null;
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// The API (server/api.mjs) decides what a share link may show (revoked, expired, deleted); it runs in
// this same process, so the preview is read directly instead of over HTTP.
async function loadPreview(token: string): Promise<SharePreview | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  try {
    await ensureSchema();
    return (await sharePreview(token)) as SharePreview | null;
  } catch {
    return null;
  }
}

// Link previews for share links (LINE, Facebook, Discord, X). Crawlers don't run JavaScript, so the
// title, description and picture must be in the HTML this route sends. Next.js holds the response
// until this resolves for the crawlers listed in next.config.ts (htmlLimitedBots), so the tags land in
// <head>; for everyone else they stream, which does not matter because the page redirects at once.
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const preview = await loadPreview(one((await searchParams).t));
  const robots = { index: false, follow: false };
  if (!preview) return { title: { absolute: "ลิงก์ที่แชร์ - NEXT9" }, robots };
  const images = [{ url: preview.image, width: preview.imageWidth ?? undefined, height: preview.imageHeight ?? undefined, alt: preview.title }];
  return {
    title: { absolute: preview.valid ? `${preview.title} - NEXT9` : preview.title },
    description: preview.description,
    robots,
    openGraph: {
      type: preview.type,
      siteName: "NEXT9",
      locale: "th_TH",
      url: preview.url,
      title: preview.title,
      description: preview.description,
      images,
    },
    twitter: { card: "summary_large_image", title: preview.title, description: preview.description, images },
  };
}

// Short share links (/s/?t=…) open the regular album viewer in share mode. The redirect is client-side
// on purpose: a server redirect would send link-preview crawlers on to the album page too, and they
// would read that page's generic tags instead of this link's.
export default async function SharePage({ searchParams }: Props) {
  const params = await searchParams;
  const t = one(params.t);
  const a = one(params.a);
  const target = `/photos/album/?share=${encodeURIComponent(t)}${a ? `&a=${encodeURIComponent(a)}` : ""}`;
  // "<" escaped so nothing in the value can close the script element.
  const redirect = `location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")})`;
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f5f5", fontFamily: "'Prompt', system-ui, sans-serif", color: "#6b7280" }}>
      <script dangerouslySetInnerHTML={{ __html: redirect }} />
      <div style={{ textAlign: "center" }}>
        <i className="fas fa-circle-notch fa-spin" style={{ fontSize: 28, color: "#b00909", display: "block", marginBottom: 12 }} />
        กำลังเปิดลิงก์…
        <noscript>
          <div style={{ marginTop: 10 }}>
            <a href={target}>แตะเพื่อเปิดลิงก์</a>
          </div>
        </noscript>
      </div>
    </div>
  );
}
