import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

interface NewBadge {
  id: string;
  name: string;
  description: string;
  iconName: string;
  category: string;
}

/**
 * POST /api/badges/check — Evaluate and award any newly-earned badges.
 * Called after each daily log save.
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
    // Fetch user data
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        cigarettesPerDay: true,
        quitDate: true,
        dailyLogs: {
          orderBy: { logDate: "desc" },
          take: 90,
          select: { logDate: true, cigarettesSmoked: true },
        },
        earnedBadges: {
          select: { badgeId: true },
        },
        quizResults: {
          select: { score: true, maxScore: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const allBadges = await prisma.badge.findMany();
    const earnedIds = new Set(user.earnedBadges.map((eb) => eb.badgeId));
    const unearnedBadges = allBadges.filter((b) => !earnedIds.has(b.id));

    if (unearnedBadges.length === 0) {
      return NextResponse.json<APIResponse<{ newBadges: NewBadge[] }>>(
        { success: true, data: { newBadges: [] } },
        { status: 200 }
      );
    }

    // Calculate streak (consecutive smoke-free days from most recent)
    let currentStreak = 0;
    for (const log of user.dailyLogs) {
      if (log.cigarettesSmoked === 0) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Calculate reduction percentage
    const baseline = user.cigarettesPerDay ?? 0;
    let reductionPercent = 0;
    if (baseline > 0 && user.dailyLogs.length > 0) {
      const recent7 = user.dailyLogs.slice(0, 7);
      const avgRecent =
        recent7.reduce((s, l) => s + l.cigarettesSmoked, 0) / recent7.length;
      reductionPercent = Math.round(((baseline - avgRecent) / baseline) * 100);
    }

    // Hours since quit
    const hoursSinceQuit = user.quitDate
      ? (Date.now() - new Date(user.quitDate).getTime()) / (1000 * 60 * 60)
      : 0;

    // Check quiz results for perfect scores
    const hasPerfectQuiz = user.quizResults.some(
      (qr) => qr.score === qr.maxScore && qr.maxScore > 0
    );

    // Evaluate each unearned badge
    const newlyEarned: NewBadge[] = [];

    for (const badge of unearnedBadges) {
      let earned = false;

      switch (badge.category) {
        case "STREAK":
          if (badge.criteriaDays && currentStreak >= badge.criteriaDays) {
            earned = true;
          }
          break;

        case "MILESTONE":
          if (badge.name === "First Step" && user.dailyLogs.length >= 1) {
            earned = true;
          } else if (badge.criteriaValue && reductionPercent >= badge.criteriaValue) {
            earned = true;
          }
          break;

        case "HEALTH":
          if (badge.criteriaDays && hoursSinceQuit >= badge.criteriaDays * 24) {
            earned = true;
          }
          break;

        case "QUIZ":
          if (hasPerfectQuiz) {
            earned = true;
          }
          break;
      }

      if (earned) {
        await prisma.userBadge.create({
          data: {
            userId: auth.userId,
            badgeId: badge.id,
          },
        });
        newlyEarned.push({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          iconName: badge.iconName,
          category: badge.category,
        });
      }
    }

    return NextResponse.json<APIResponse<{ newBadges: NewBadge[] }>>(
      { success: true, data: { newBadges: newlyEarned } },
      { status: 200 }
    );
  } catch (error) {
    console.error("Badge check error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
