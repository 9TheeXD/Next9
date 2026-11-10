// Work that continues after the response has been sent (R2 cleanup, photo processing).
//
// A serverless function may be frozen as soon as its response ends, so a plain fire-and-forget
// promise can be cut off half way. background() hands the promise to Vercel's waitUntil, which keeps
// the invocation alive until it settles (up to the function's maxDuration). Outside Vercel (local
// `next dev` / `next start`) the process stays up anyway and waitUntil is a no-op.
import { waitUntil } from "@vercel/functions"

export function background(promise) {
    const p = Promise.resolve(promise).catch((e) => console.error("[background]", e && e.message ? e.message : e))
    try { waitUntil(p) } catch {}
    return p
}
