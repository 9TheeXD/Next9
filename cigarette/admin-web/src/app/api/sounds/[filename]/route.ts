import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

/**
 * Serves uploaded sound files from the local filesystem.
 * Next.js `next start` only serves static files that existed at build time,
 * so dynamically uploaded files need a dedicated API route.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Sanitize filename to prevent path traversal
  const sanitized = path.basename(filename);
  if (sanitized !== filename || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "public", "sounds", sanitized);

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(filePath);

    // Determine content type from extension
    const ext = path.extname(sanitized).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
      ".ogg": "audio/ogg",
      ".webm": "audio/webm",
      ".mp4": "audio/mp4",
      ".m4a": "audio/mp4",
    };
    const contentType = contentTypes[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
