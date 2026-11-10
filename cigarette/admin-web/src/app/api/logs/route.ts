import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { messaging, sendPushNotification } from "@/lib/firebase";
import type { APIResponse, DailyLog } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/logs — Retrieve daily logs for the authenticated user
 */
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const skip = parseInt(searchParams.get("skip") || "0", 10);

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true, followedSmokers: { select: { id: true } } }
    });

    if (!user) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const targetSmokerId = searchParams.get("targetSmokerId");
    const targetUserId = user.role === "FAMILY" && user.followedSmokers && user.followedSmokers.length > 0
      ? (targetSmokerId || user.followedSmokers[0].id) 
      : auth.userId;

    const logs = await prisma.dailyLog.findMany({
      where: { userId: targetUserId },
      orderBy: { logDate: "desc" },
      take: limit,
      skip: skip,
    });

    const formatted: DailyLog[] = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      logDate: log.logDate.toISOString(),
      cigarettesSmoked: log.cigarettesSmoked,
      cravingCount: log.cravingCount,
      mood: log.mood,
      notes: log.notes,
      articlesRead: log.articlesRead,
      gamesPlayed: log.gamesPlayed,
      soundsListened: log.soundsListened,
      createdAt: log.createdAt.toISOString(),
    }));

    return NextResponse.json<APIResponse<DailyLog[]>>(
      { success: true, data: formatted },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Get logs error:", error.message);
    if (error.code === 'P2025' || error.code === 'P2003') {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/logs — Create or update today's daily log (upsert)
 */
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { cigarettesSmoked, cravingCount, mood, notes, articlesRead, gamesPlayed, soundsListened } = body;

    // Validate
    if (cigarettesSmoked !== undefined) {
      if (typeof cigarettesSmoked !== "number" || cigarettesSmoked < 0) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "cigarettesSmoked must be a non-negative number" },
          { status: 400 }
        );
      }

      if (cigarettesSmoked > 200) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "cigarettesSmoked exceeds reasonable limit" },
          { status: 400 }
        );
      }
    }

    // Today's date as a Date object (date-only) in Bangkok time (UTC+7)
    const now = new Date();
    const bkkTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const today = new Date(Date.UTC(bkkTime.getUTCFullYear(), bkkTime.getUTCMonth(), bkkTime.getUTCDate()));

    // Upsert: create today's log or update it if it already exists
    const log = await prisma.dailyLog.upsert({
      where: {
        userId_logDate: {
          userId: auth.userId,
          logDate: today,
        },
      },
      update: {
        ...(cigarettesSmoked !== undefined && { cigarettesSmoked }),
        ...(cravingCount !== undefined && { cravingCount: { increment: cravingCount } }),
        ...(mood !== undefined && { mood }),
        ...(notes !== undefined && { notes }),
        articlesRead: articlesRead !== undefined ? { increment: articlesRead } : undefined,
        gamesPlayed: gamesPlayed !== undefined ? { increment: gamesPlayed } : undefined,
        soundsListened: soundsListened !== undefined ? { increment: soundsListened } : undefined,
      },
      create: {
        userId: auth.userId,
        logDate: today,
        cigarettesSmoked: cigarettesSmoked ?? 0,
        cravingCount: cravingCount ?? 0,
        mood: mood ?? null,
        notes: notes ?? null,
        articlesRead: articlesRead ?? 0,
        gamesPlayed: gamesPlayed ?? 0,
        soundsListened: soundsListened ?? 0,
      },
    });

    const formatted: DailyLog = {
      id: log.id,
      userId: log.userId,
      logDate: log.logDate.toISOString(),
      cigarettesSmoked: log.cigarettesSmoked,
      cravingCount: log.cravingCount,
      mood: log.mood,
      notes: log.notes,
      articlesRead: log.articlesRead,
      gamesPlayed: log.gamesPlayed,
      soundsListened: log.soundsListened,
      createdAt: log.createdAt.toISOString(),
    };

    // --- Send Push Notification to Family Members ---
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { 
        followers: {
          where: { isDeleted: false }
        } 
      }
    });

    if (user && user.followers.length > 0) {
      const tokens = user.followers
        .map((f) => f.fcmToken)
        .filter((t) => t != null) as string[];

      if (tokens.length > 0) {
        let title = "มีการอัปเดตข้อมูล";
        let body = `${user.displayId} ได้บันทึกข้อมูลวันนี้แล้ว`;

        if (cigarettesSmoked !== undefined) {
          title = "อัปเดตจำนวนบุหรี่";
          body = `${user.displayId} บันทึกว่าสูบไปรวม ${cigarettesSmoked} มวนแล้ววันนี้`;
        } else if (cravingCount !== undefined) {
          title = "บันทึกความอยากสูบ";
          body = `${user.displayId} กำลังมีความรู้สึกอยากสูบ ส่งกำลังใจให้เขาหน่อย!`;
        } else if (mood !== undefined) {
          title = "บันทึกอารมณ์";
          body = `${user.displayId} ได้บันทึกอารมณ์ของวันนี้: ${mood}`;
        }

        try {
          await sendPushNotification(tokens, title, body);
        } catch (error) {
          console.error("Failed to send push notification:", error);
        }
      }
    }

    return NextResponse.json<APIResponse<DailyLog>>(
      { success: true, data: formatted },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Post log error:", error.message);
    if (error.code === 'P2025' || error.code === 'P2003') {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
