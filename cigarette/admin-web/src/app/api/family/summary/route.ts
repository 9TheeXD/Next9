import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import type { APIResponse } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyToken(token);
    if (!payload || payload.role !== "FAMILY") {
      return NextResponse.json({ success: false, error: "Forbidden - Family Role required" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { followedSmokers: { select: { id: true, displayId: true, displayName: true } } },
    });

    if (!user || !user.followedSmokers || user.followedSmokers.length === 0) {
      return NextResponse.json({ success: false, error: "No linked smoker found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const targetSmokerId = searchParams.get("targetSmokerId") || user.followedSmokers[0].id;
    
    const isValidTarget = user.followedSmokers.some(s => s.id === targetSmokerId);
    if (!isValidTarget) {
      return NextResponse.json({ success: false, error: "Invalid target smoker" }, { status: 400 });
    }

    // Get today's log for the linked smoker (Bangkok time UTC+7)
    const now = new Date();
    const bkkTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const today = new Date(Date.UTC(bkkTime.getUTCFullYear(), bkkTime.getUTCMonth(), bkkTime.getUTCDate()));

    const log = await prisma.dailyLog.findFirst({
      where: {
        userId: targetSmokerId,
        logDate: { gte: today },
      },
    });

    const smoker = await prisma.user.findUnique({
      where: { id: targetSmokerId },
      select: { displayName: true, cigarettesPerDay: true, xp: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        smokerName: smoker?.displayName,
        targetCigarettes: smoker?.cigarettesPerDay,
        xp: smoker?.xp || 0,
        cigarettesSmoked: log?.cigarettesSmoked || 0,
        cravingCount: log?.cravingCount || 0,
        mood: log?.mood || "ไม่ระบุ",
        notes: log?.notes || "",
        followedSmokers: user.followedSmokers,
        currentSmokerId: targetSmokerId,
      },
    });
  } catch (error) {
    console.error("Family summary error:", (error as Error).message);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
