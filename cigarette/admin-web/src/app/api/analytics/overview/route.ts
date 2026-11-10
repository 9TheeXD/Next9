import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface OverviewKPIs {
  totalSmokers: number;
  totalFamily: number;
  totalCigarettesAvoided: number;
  totalMoneySaved: number;
  averageReductionPercent: number;
  smokersReducing: number;
  smokersIncreasing: number;
  smokersStable: number;
}

interface TrendPoint {
  date: string;
  cigarettesSmoked: number;
  cigarettesAvoided: number;
  moneySaved: number;
  activeUsers: number;
}

interface TypeDistribution {
  type: string;
  count: number;
  percentage: number;
}

interface MonthlySaved {
  month: string;
  amount: number;
  cumulative: number;
}

interface OverviewData {
  kpis: OverviewKPIs;
  trendData: TrendPoint[];
  typeDistribution: TypeDistribution[];
  monthlySaved: MonthlySaved[];
  reductionTrend: { date: string; rate: number }[];
  firstUserDate: string | null;
}

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }
  if (auth.role !== "ADMIN") {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    const range = request.nextUrl.searchParams.get("range") || "all";

    // Determine date cutoff
    let dateCutoff: Date | null = null;
    const now = new Date();
    if (range === "1m") {
      dateCutoff = new Date(now);
      dateCutoff.setMonth(dateCutoff.getMonth() - 1);
    } else if (range === "6m") {
      dateCutoff = new Date(now);
      dateCutoff.setMonth(dateCutoff.getMonth() - 6);
    }

    // Get first user date (the baseline for "all" range) for the charts
    const firstUser = await prisma.user.findFirst({
      where: { role: "SMOKER", isDeleted: false },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const firstUserDate = firstUser?.createdAt ?? null;

    // Total counts
    const totalSmokers = await prisma.user.count({ where: { role: "SMOKER", isDeleted: false } });
    const totalFamily = await prisma.user.count({ where: { role: "FAMILY", isDeleted: false } });

    // Type distribution
    const cigaretteCount = await prisma.user.count({
      where: { role: "SMOKER", smokingType: "CIGARETTE", isDeleted: false },
    });
    const podCount = await prisma.user.count({
      where: { role: "SMOKER", smokingType: "POD", isDeleted: false },
    });
    const typeDistribution: TypeDistribution[] = [
      {
        type: "บุหรี่",
        count: cigaretteCount,
        percentage: totalSmokers > 0 ? Math.round((cigaretteCount / totalSmokers) * 1000) / 10 : 0,
      },
      {
        type: "พอต",
        count: podCount,
        percentage: totalSmokers > 0 ? Math.round((podCount / totalSmokers) * 1000) / 10 : 0,
      },
    ];

    // Fetch all smokers with their logs
    const smokers = await prisma.user.findMany({
      where: { role: "SMOKER", isDeleted: false },
      select: {
        id: true,
        cigarettesPerDay: true,
        pricePerPack: true,
        cigarettesPerPack: true,
        createdAt: true,
        dailyLogs: {
          where: dateCutoff ? { logDate: { gte: dateCutoff } } : undefined,
          select: { cigarettesSmoked: true, logDate: true },
          orderBy: { logDate: "asc" },
        },
      },
    });

    // Calculate KPIs
    let totalCigarettesAvoided = 0;
    let totalMoneySaved = 0;
    let totalReductionSum = 0;
    let smokersReducing = 0;
    let smokersIncreasing = 0;
    let smokersStable = 0;
    let usersWithData = 0;

    for (const smoker of smokers) {
      const baseline = smoker.cigarettesPerDay ?? 0;
      if (baseline === 0 || smoker.dailyLogs.length === 0) continue;

      const pricePerCig = (smoker.pricePerPack ?? 0) / (smoker.cigarettesPerPack || 20);

      let userAvoided = 0;
      for (const log of smoker.dailyLogs) {
        const avoided = Math.max(0, baseline - log.cigarettesSmoked);
        userAvoided += avoided;
      }

      totalCigarettesAvoided += userAvoided;
      totalMoneySaved += userAvoided * pricePerCig;

      // Recent average (last 7 logs) vs baseline
      const recentLogs = smoker.dailyLogs.slice(-7);
      const recentAvg =
        recentLogs.reduce((sum, l) => sum + l.cigarettesSmoked, 0) /
        recentLogs.length;
      const reductionPct = ((baseline - recentAvg) / baseline) * 100;

      if (reductionPct > 5) smokersReducing++;
      else if (reductionPct < -5) smokersIncreasing++;
      else smokersStable++;

      totalReductionSum += Math.max(0, reductionPct);
      usersWithData++;
    }

    const kpis: OverviewKPIs = {
      totalSmokers,
      totalFamily,
      totalCigarettesAvoided,
      totalMoneySaved: Math.round(totalMoneySaved * 100) / 100,
      averageReductionPercent:
        usersWithData > 0
          ? Math.round((totalReductionSum / usersWithData) * 10) / 10
          : 0,
      smokersReducing,
      smokersIncreasing,
      smokersStable,
    };

    // Build daily trend data
    const chartStart = dateCutoff ?? firstUserDate ?? new Date();
    const startDate = new Date(chartStart);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const daysDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Aggregate by week if > 90 days, by month if > 180 days
    let aggregation: "day" | "week" | "month" = "day";
    if (daysDiff > 180) aggregation = "month";
    else if (daysDiff > 90) aggregation = "week";

    // Fetch all logs in range
    const allLogs = await prisma.dailyLog.findMany({
      where: {
        logDate: { gte: startDate, lte: endDate },
        user: { isDeleted: false },
      },
      include: {
        user: {
          select: {
            cigarettesPerDay: true,
            pricePerPack: true,
            cigarettesPerPack: true,
          },
        },
      },
      orderBy: { logDate: "asc" },
    });

    // Group logs by period
    const trendMap = new Map<
      string,
      { smoked: number; avoided: number; saved: number; users: Set<string> }
    >();

    for (const log of allLogs) {
      const logDate = new Date(log.logDate);
      let key: string;

      if (aggregation === "month") {
        key = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, "0")}`;
      } else if (aggregation === "week") {
        // Get the Monday of the week
        const d = new Date(logDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        key = d.toISOString().split("T")[0];
      } else {
        key = logDate.toISOString().split("T")[0];
      }

      if (!trendMap.has(key)) {
        trendMap.set(key, { smoked: 0, avoided: 0, saved: 0, users: new Set() });
      }
      const entry = trendMap.get(key)!;

      const baseline = log.user.cigarettesPerDay ?? 0;
      const avoided = Math.max(0, baseline - log.cigarettesSmoked);
      const pricePerCig =
        (log.user.pricePerPack ?? 0) / (log.user.cigarettesPerPack || 20);

      entry.smoked += log.cigarettesSmoked;
      entry.avoided += avoided;
      entry.saved += avoided * pricePerCig;
      entry.users.add(log.userId);
    }

    const trendData: TrendPoint[] = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date: formatTrendDate(date, aggregation),
        cigarettesSmoked: data.smoked,
        cigarettesAvoided: data.avoided,
        moneySaved: Math.round(data.saved * 100) / 100,
        activeUsers: data.users.size,
      }));

    // Monthly money saved (cumulative)
    const monthlyMap = new Map<string, number>();
    for (const log of allLogs) {
      const logDate = new Date(log.logDate);
      const monthKey = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, "0")}`;

      const baseline = log.user.cigarettesPerDay ?? 0;
      const avoided = Math.max(0, baseline - log.cigarettesSmoked);
      const pricePerCig =
        (log.user.pricePerPack ?? 0) / (log.user.cigarettesPerPack || 20);

      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + avoided * pricePerCig);
    }

    let cumulative = 0;
    const monthlySaved: MonthlySaved[] = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => {
        cumulative += amount;
        return {
          month: formatMonthLabel(month),
          amount: Math.round(amount * 100) / 100,
          cumulative: Math.round(cumulative * 100) / 100,
        };
      });

    // Reduction rate trend (weekly)
    const reductionWeekMap = new Map<string, { totalBaseline: number; totalSmoked: number }>();
    for (const log of allLogs) {
      const logDate = new Date(log.logDate);
      const d = new Date(logDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      const weekKey = d.toISOString().split("T")[0];

      if (!reductionWeekMap.has(weekKey)) {
        reductionWeekMap.set(weekKey, { totalBaseline: 0, totalSmoked: 0 });
      }
      const entry = reductionWeekMap.get(weekKey)!;
      entry.totalBaseline += log.user.cigarettesPerDay ?? 0;
      entry.totalSmoked += log.cigarettesSmoked;
    }

    const reductionTrend = Array.from(reductionWeekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date: formatTrendDate(date, "week"),
        rate:
          data.totalBaseline > 0
            ? Math.round(((data.totalBaseline - data.totalSmoked) / data.totalBaseline) * 1000) / 10
            : 0,
      }));

    const overviewData: OverviewData = {
      kpis,
      trendData,
      typeDistribution,
      monthlySaved,
      reductionTrend,
      firstUserDate: firstUserDate?.toISOString() ?? null,
    };

    return NextResponse.json<APIResponse<OverviewData>>(
      { success: true, data: overviewData },
      { status: 200 }
    );
  } catch (error) {
    console.error("Overview analytics error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

function formatTrendDate(dateStr: string, aggregation: "day" | "week" | "month"): string {
  if (aggregation === "month") {
    const [year, month] = dateStr.split("-");
    const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
  }
  const d = new Date(dateStr);
  const day = d.getDate();
  const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${day} ${monthNames[d.getMonth()]}`;
}

function formatMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
}
