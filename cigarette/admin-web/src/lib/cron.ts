import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Cron endpoints are called by cron-job.org with the shared CRON_SECRET, either as
 * `?key=<secret>` or as `Authorization: Bearer <secret>`. Returns a 401 response when the
 * secret is missing or wrong, or null when the call may go ahead.
 */
export function rejectUnlessCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: "CRON_SECRET is not set" }, { status: 401 });
  }
  const url = new URL(request.url);
  const auth = request.headers.get("authorization") || "";
  const given = url.searchParams.get("key") || (auth.startsWith("Bearer ") ? auth.slice(7) : "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
