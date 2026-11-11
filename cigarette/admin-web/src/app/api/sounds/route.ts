import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { playableUrl } from "@/lib/storage";

// Public API for mobile app to fetch active custom sounds
export async function GET(request: Request) {
  try {
    const activeSounds = await prisma.sound.findMany({
      where: {},
      select: { id: true, name: true, url: true, duration: true },
      orderBy: { createdAt: "desc" },
    });
    
    const origin = new URL(request.url).origin;
    return NextResponse.json({ success: true, data: activeSounds.map((s) => ({ ...s, url: playableUrl(s.url, origin) })) }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      }
    });
  } catch (error) {
    console.error("GET public sounds error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
