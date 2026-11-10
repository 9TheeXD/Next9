import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { soundPublicUrl } from "@/lib/storage";

/**
 * Old links to uploaded sounds (/api/sounds/<file>, stored in the database while the files were on the
 * VPS disk). The files are in R2 now; this sends the player there.
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
  return NextResponse.redirect(soundPublicUrl(sanitized), {
    status: 308,
    headers: { "Cache-Control": "public, max-age=86400" },
  });
}
