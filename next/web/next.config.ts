import type { NextConfig } from "next";

// The site moves to Next.js one route at a time. Anything this app does not render yet is handed to
// the existing stack, so the whole site keeps working at every step of the migration:
//   - /api/* goes to server.js (the backend stays as it is)
//   - every other path without a Next.js route falls back to the legacy static files
// In production nginx can do the same split; these origins are overridable for that setup.
const API_ORIGIN = process.env.LEGACY_API_ORIGIN ?? "http://127.0.0.1:8089";
const STATIC_ORIGIN = process.env.LEGACY_STATIC_ORIGIN ?? "http://127.0.0.1:8072";

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
  async rewrites() {
    return {
      afterFiles: [
        { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      ],
      // Only reached when no Next.js route matches, so a migrated page automatically wins.
      fallback: [
        { source: "/:path*/", destination: `${STATIC_ORIGIN}/:path*/` },
        { source: "/:path*", destination: `${STATIC_ORIGIN}/:path*` },
      ],
    };
  },
};

export default nextConfig;
