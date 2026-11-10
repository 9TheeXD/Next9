import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple in-memory rate limiter (MVP for single-instance Node server)
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 reqs per minute

export default function proxy(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();

  // CORS headers
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = process.env.CORS_ORIGIN || "*";

  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: response.headers,
    });
  }

  // Rate Limiting (apply only to /api routes)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const windowStart = now - WINDOW_MS;
    
    let record = rateLimitMap.get(ip);
    if (!record || record.timestamp < windowStart) {
      record = { count: 0, timestamp: now };
    }
    
    record.count++;
    rateLimitMap.set(ip, record);

    if (record.count > MAX_REQUESTS) {
      return new NextResponse(
        JSON.stringify({ success: false, error: "Too many requests" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
            ...Object.fromEntries(response.headers),
          },
        }
      );
    }
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
