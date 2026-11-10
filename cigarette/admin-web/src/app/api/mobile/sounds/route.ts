import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const filter: any = {};
    if (category) {
      filter.category = category;
    }

    const sounds = await prisma.sound.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        url: true,
        duration: true,
        category: true,
      }
    });

    return NextResponse.json({ success: true, data: sounds });
  } catch (error) {
    console.error("GET mobile sounds error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
