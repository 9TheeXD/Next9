import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

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
      select: { followedSmokers: { select: { id: true } } },
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


    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const skip = parseInt(searchParams.get("skip") || "0", 10);

    // Fetch paginated logs
    const logs = await prisma.dailyLog.findMany({
      where: { userId: targetSmokerId },
      orderBy: { logDate: "desc" },
      take: limit,
      skip: skip,
    });

    // Format logs
    const formattedLogs = logs.map((log) => ({
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

    // Fetch summary stats only on first page
    let summary = null;
    let trend = null;
    let smokerXp = 0;

    if (skip === 0) {
      const [aggregates, quizCount, smoker, allLogs, badgesCount] = await Promise.all([
        prisma.dailyLog.aggregate({
          where: { userId: targetSmokerId },
          _count: { id: true },
          _sum: {
            cravingCount: true,
            articlesRead: true,
            gamesPlayed: true,
            soundsListened: true,
            cigarettesSmoked: true,
          },
        }),
        prisma.quizResult.count({
          where: { userId: targetSmokerId },
        }),
        prisma.user.findUnique({
          where: { id: targetSmokerId },
          select: { xp: true, cigarettesPerDay: true, smokingType: true, pricePerPack: true, cigarettesPerPack: true },
        }),
        prisma.dailyLog.findMany({
          where: { userId: targetSmokerId },
          orderBy: { logDate: "desc" },
          select: { logDate: true, cigarettesSmoked: true },
        }),
        prisma.userBadge.count({
          where: { userId: targetSmokerId },
        }),
      ]);

      smokerXp = smoker?.xp || 0;
      
      const baseline = smoker?.cigarettesPerDay || 0;
      const pricePerCig = (smoker?.pricePerPack || 0) / (smoker?.cigarettesPerPack || 20);
      
      const totalAvoided = allLogs.reduce((s, l) => {
        return s + Math.max(0, baseline - l.cigarettesSmoked);
      }, 0);
      
      const totalMoneySaved = totalAvoided * pricePerCig;
      
      let currentStreak = 0;
      for (const log of allLogs) {
        if (log.cigarettesSmoked < baseline) {
          currentStreak++;
        } else {
          break;
        }
      }

      summary = {
        totalLoggedDays: aggregates._count.id || 0,
        totalCravings: aggregates._sum.cravingCount || 0,
        totalArticlesRead: aggregates._sum.articlesRead || 0,
        totalQuizzesDone: quizCount || 0,
        totalGamesPlayed: aggregates._sum.gamesPlayed || 0,
        totalSoundsListened: aggregates._sum.soundsListened || 0,
        xp: smokerXp,
        targetCigarettes: smoker?.cigarettesPerDay || null,
        smokingType: smoker?.smokingType || "CIGARETTE",
        totalAvoided,
        totalMoneySaved: Math.round(totalMoneySaved * 100) / 100,
        currentStreak,
        badgesEarned: badgesCount,
      };

      // 30-day trend data (Bangkok time)
      const now = new Date();
      const bkkTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const today = new Date(Date.UTC(bkkTime.getUTCFullYear(), bkkTime.getUTCMonth(), bkkTime.getUTCDate()));
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const trendLogs = await prisma.dailyLog.findMany({
        where: {
          userId: targetSmokerId,
          logDate: { gte: thirtyDaysAgo },
        },
        orderBy: { logDate: "asc" },
        select: {
          logDate: true,
          cigarettesSmoked: true,
          cravingCount: true,
        },
      });

      trend = trendLogs.map((log) => ({
        date: log.logDate.toISOString(),
        cigarettesSmoked: log.cigarettesSmoked,
        cravingCount: log.cravingCount,
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        logs: formattedLogs,
        summary,
        trend,
      },
    });
  } catch (error) {
    console.error("Family history error:", (error as Error).message);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
