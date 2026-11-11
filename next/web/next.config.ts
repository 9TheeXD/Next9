import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// Everything runs in this one Next.js app (one Vercel project):
//   - /api/*  the site's API, server/api.mjs, mounted by src/pages/api/[...path].ts
//   - pages that are not migrated yet: the legacy static files, copied into public/ by
//     scripts/build-legacy-public.mjs before every build; a folder URL maps to its index.html below.
//     (/forms/building -> /forms/building/ is a redirect in vercel.json: a Next.js redirect here would
//     loop with trailingSlash, and Vercel's routing matches the exact path.)
let LEGACY_DIRS: string[] = [];
try {
  LEGACY_DIRS = JSON.parse(fs.readFileSync(path.join(__dirname, "legacy-dirs.json"), "utf8"));
} catch {}

const nextConfig: NextConfig = {
  // The legacy site's package-lock.json one level up made Next.js treat the whole project folder
  // (data/, node_modules/, backups) as its workspace and watch all of it. The app lives in web/.
  turbopack: { root: __dirname },
  // The dev server listens on 0.0.0.0 so phones on the same network can open it by IP. Next.js
  // blocks dev assets for hostnames other than localhost unless listed; these are private ranges.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],
  outputFileTracingRoot: __dirname,
  // Existing links, bookmarks and share URLs all use trailing slashes (/photos/, /s/?t=...).
  trailingSlash: true,
  // The built-in slash redirect would also send /api/photos/albums to /api/photos/albums/ with a
  // 308, making every API call a second round trip and an upload re-send its whole body. It is off.
  // Legacy folders get their slash from the legacy static server (as nginx does in production);
  // Next.js pages answer with or without it.
  //
  // Deliberately no proxy.ts either: when a proxy file exists Next.js buffers every request body in
  // memory with a 10 MB cap, which cut photo and video uploads off mid-file.
  skipTrailingSlashRedirect: true,
  // Crawlers that get page metadata in <head> instead of streamed later (link previews: /s/, albums).
  // Setting this replaces Next.js's built-in list, so that list is repeated here (from
  // next/dist/shared/lib/router/utils/html-bots.js) followed by the chat apps it lacks. LINE's crawler
  // sends "facebookexternalhit … line-poker", already covered; Telegram, Kakao, Viber, Zalo, Pinterest,
  // Mastodon and the embed services are not.
  htmlLimitedBots:
    /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|line-poker|TelegramBot|kakaotalk-scrap|Viber|Zalo|Pinterest|Mastodon|Embedly|Iframely|Snapchat/i,
  // Link previews and server pages read the API in-process; nothing here talks to a separate server.
  serverExternalPackages: ["sharp", "@libsql/client", "libsql", "@google-cloud/dialogflow"],
  // Next.js image optimisation has a small free quota on Vercel; photos come from R2 already sized.
  images: { unoptimized: true },
  async rewrites() {
    return {
      beforeFiles: [
        // inspectors.json used to be a file beside the pages; it is kept in the database now.
        { source: "/inspectors.json", destination: "/api/inspectors" },
        // Building rooms and ShiftManager's member list/config are settings now (admin pages); the
        // pages still ask for the old file names.
        { source: "/forms/building/rooms/:n.json", destination: "/api/building/rooms/:n" },
        { source: "/duty/js/config.js", destination: "/api/duty/config.js" },
        { source: "/duty/js/data.js", destination: "/api/duty/data.js" },
      ],
      // Only reached when no Next.js route matches, so a migrated page automatically wins.
      fallback: LEGACY_DIRS.map((d) => ({ source: `/${d}/`, destination: `/${d}/index.html` })),
    };
  },
};

export default nextConfig;
