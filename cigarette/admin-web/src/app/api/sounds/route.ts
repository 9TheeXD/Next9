import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public API for mobile app to fetch active custom sounds
export async function GET() {
  try {
    const activeSounds = await prisma.sound.findMany({
      where: {},
      select: { id: true, name: true, url: true, duration: true },
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json({ success: true, data: activeSounds }, {
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
