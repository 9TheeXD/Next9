import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { NavProgress } from "@/components/NavProgress";
import "./globals.css";
import { fileUrl, getSettings } from "@/lib/settings";

// Name, logo and colour: admin → เว็บไซต์.
export async function generateMetadata(): Promise<Metadata> {
  const site = await getSettings("site");
  return {
    // Relative image URLs in link previews (logo, member photos) resolve against the site address.
    metadataBase: new URL(process.env.SITE_ORIGIN || "http://localhost:8070"),
    title: {
      default: `${site.name} - ${site.council}`,
      template: `%s - ${site.name}`,
    },
    icons: { icon: fileUrl(site.logo) },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const site = await getSettings("site");
  return { themeColor: site.theme_color || "#b00909" };
}

export const revalidate = 3600;

// Same as the legacy photos pages: links opened inside LINE switch to the phone's real browser, and
// Facebook/Instagram in-app browsers on Android hand the page to Chrome (those in-app browsers break
// uploads, downloads and page transitions). Only the pages that upload or download files need it; everything else stays in
// the app the link was opened from.
const OPEN_EXTERNAL = `(function(){if(!/^\\/(photos|s|forms\\/submit_inert)(\\/|$)/.test(location.pathname))return;var ua=navigator.userAgent.toLowerCase();var isLine=ua.indexOf('line')>-1;var isFB=ua.indexOf('fbav')>-1||ua.indexOf('fban')>-1;var isIG=ua.indexOf('instagram')>-1;var isAndroid=ua.indexOf('android')>-1;if(isLine&&location.search.indexOf('openExternalBrowser=1')===-1){location.href=location.href+(location.search?'&':'?')+'openExternalBrowser=1';}else if((isFB||isIG)&&isAndroid){location.href='intent://'+location.href.split('//')[1]+'#Intent;scheme=https;end';}})();`;

// Same as the legacy photos pages: signed-in visitors never see the login screen flash while the
// page hydrates (the photos home hides its login card under html.has-token).
const HAS_TOKEN = `try{if(/(^|;\\s*)photos_token=/.test(document.cookie)||localStorage.getItem('photos_token'))document.documentElement.classList.add('has-token')}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const site = await getSettings("site");
  // The theme colour from settings replaces the default red wherever the styles use the variables.
  const accent = /^#[0-9a-f]{3,8}$/i.test(site.theme_color) && site.theme_color.toLowerCase() !== "#b00909" ? site.theme_color : null;
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        {accent && <style>{`:root{--accent:${accent};--color-primary:${accent};--color-ring:${accent}}`}</style>}
        {/* The legacy site's fonts, loaded the same way, so every inline font-family: 'Prompt' matches. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Prompt:wght@300;400;500;600;700&display=swap"
        />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body>
        <Script id="open-external-browser" strategy="beforeInteractive">
          {OPEN_EXTERNAL}
        </Script>
        <Script id="photos-has-token" strategy="beforeInteractive">
          {HAS_TOKEN}
        </Script>
        {/* Directional slides and the tab bar indicator (shared with the legacy pages). */}
        <Script src="/nav-motion.js" strategy="beforeInteractive" />
        {children}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
      </body>
    </html>
  );
}
