// URLs rendered by the Next.js app. Everything else (the rest of the legacy site) is a normal page load.
export function isAppPath(u: URL) {
  const path = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
  return path === "/dev-status/" || path === "/photos/" || path === "/photos/album/" || isMemberPath(path) || SITE_PAGES.has(path);
}

export function isAppRoute(href: string) {
  const base = typeof window === "undefined" ? "http://app.local/" : window.location.href;
  try {
    const u = new URL(href, base);
    return u.origin === new URL(base).origin && isAppPath(u);
  } catch {
    return false;
  }
}

// /member/, its departments, /member/grade/ and the profiles (/member/profile/<slug>.html/).
function isMemberPath(path: string) {
  return /^\/member\/((academic|affairs|general|grade|editor)\/|profile\/[^/]+\.html\/)?$/.test(path);
}

// The public pages and the internal links hub.
// /links/ is left out on purpose: it is reached only by its direct link, never linked or prefetched.
const SITE_PAGES = new Set(["/", "/about/", "/policy/", "/problem/"]);
