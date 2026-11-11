import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getSound } from "@/lib/storage";

/**
 * Uploaded sounds (/api/sounds/<file>), read from R2. File names are unique per upload, so the
 * response is cached for a long time by browsers and Vercel's CDN; the function runs about once per
 * file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const sanitized = path.basename(filename);
  if (sanitized !== filename || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  try {
    const { body, contentType } = await getSound(sanitized);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
