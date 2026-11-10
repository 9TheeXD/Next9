import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse, KPIData, SuccessRateData, DailyTrendPoint } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface AnalyticsData {
  kpis: KPIData;
  successRates: SuccessRateData[];
  dailyTrends: DailyTrendPoint[];
}

/**
 * GET /api/analytics — Aggregated KPIs for the admin dashboard.
 * Only accessible by ADMIN role users.
 */
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  // Authorize: admin only
  if (auth.role !== "ADMIN") {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    // Total active users (users who logged in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = await prisma.user.count({
      where: {
        role: "SMOKER",
        dailyLogs: { some: { logDate: { gte: thirtyDaysAgo } } },
      },
    });

    // Total cigarettes avoided — sum of (baseline - actual) for all logs
    const smokers = await prisma.user.findMany({
      where: { role: "SMOKER", cigarettesPerDay: { not: null } },
      select: {
        cigarettesPerDay: true,
        pricePerPack: true,
        cigarettesPerPack: true,
        dailyLogs: {
          select: { cigarettesSmoked: true, logDate: true },
          orderBy: { logDate: "asc" },
        },
      },
    });

    let totalCigarettesAvoided = 0;
    let totalMoneySaved = 0;
    let totalReductionSum = 0;
    let usersWithData = 0;

    for (const smoker of smokers) {
      const baseline = smoker.cigarettesPerDay ?? 0;
      if (baseline === 0 || smoker.dailyLogs.length === 0) continue;

      const pricePerCig =
        (smoker.pricePerPack ?? 0) / (smoker.cigarettesPerPack || 20);

      let userAvoided = 0;
      for (const log of smoker.dailyLogs) {
        const avoided = Math.max(0, baseline - log.cigarettesSmoked);
        userAvoided += avoided;
      }

      totalCigarettesAvoided += userAvoided;
      totalMoneySaved += userAvoided * pricePerCig;

      // Recent average (last 7 logs)
      const recentLogs = smoker.dailyLogs.slice(-7);
      const recentAvg =
        recentLogs.reduce((sum, l) => sum + l.cigarettesSmoked, 0) /
        recentLogs.length;
      const reductionPct = ((baseline - recentAvg) / baseline) * 100;
      totalReductionSum += Math.max(0, reductionPct);
      usersWithData++;
    }

    const kpis: KPIData = {
      totalActiveUsers: activeUsers,
      totalCigarettesAvoided,
      totalMoneySaved: Math.round(totalMoneySaved * 100) / 100,
      averageReductionPercent:
        usersWithData > 0
          ? Math.round((totalReductionSum / usersWithData) * 10) / 10
          : 0,
    };

    // Success rates for 7, 14, 30 day periods
    const successRates: SuccessRateData[] = [];
    for (const days of [7, 14, 30]) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const usersInPeriod = await prisma.user.findMany({
        where: {
          role: "SMOKER",
          cigarettesPerDay: { not: null },
          dailyLogs: { some: { logDate: { gte: cutoff } } },
        },
        select: {
          cigarettesPerDay: true,
          dailyLogs: {
            where: { logDate: { gte: cutoff } },
            select: { cigarettesSmoked: true },
          },
        },
      });

      let successful = 0;
      for (const user of usersInPeriod) {
        const baseline = user.cigarettesPerDay ?? 0;
        if (baseline === 0 || user.dailyLogs.length === 0) continue;
        const avg =
          user.dailyLogs.reduce((s, l) => s + l.cigarettesSmoked, 0) /
          user.dailyLogs.length;
        if (avg <= baseline * 0.5) successful++;
      }

      successRates.push({
        period: `${days} Days`,
        days,
        successRate:
          usersInPeriod.length > 0
            ? Math.round((successful / usersInPeriod.length) * 1000) / 10
            : 0,
        totalUsers: usersInPeriod.length,
        successfulUsers: successful,
      });
    }

    // Daily trends for last 30 days
    const dailyTrends: DailyTrendPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);

      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayLogs = await prisma.dailyLog.findMany({
        where: { logDate: { gte: day, lt: nextDay } },
        include: {
          user: {
            select: {
              cigarettesPerDay: true,
              pricePerPack: true,
              cigarettesPerPack: true,
            },
          },
        },
      });

      let avoided = 0;
      let saved = 0;
      for (const log of dayLogs) {
        const baseline = log.user.cigarettesPerDay ?? 0;
        const dayAvoided = Math.max(0, baseline - log.cigarettesSmoked);
        avoided += dayAvoided;
        const pricePerCig =
          (log.user.pricePerPack ?? 0) / (log.user.cigarettesPerPack || 20);
        saved += dayAvoided * pricePerCig;
      }

      dailyTrends.push({
        date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        cigarettesAvoided: avoided,
        moneySaved: Math.round(saved * 100) / 100,
        activeUsers: dayLogs.length,
      });
    }

    return NextResponse.json<APIResponse<AnalyticsData>>(
      { success: true, data: { kpis, successRates, dailyTrends } },
      { status: 200 }
    );
  } catch (error) {
    console.error("Analytics error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
