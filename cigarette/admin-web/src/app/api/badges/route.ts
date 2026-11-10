import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

/**
 * GET /api/badges — Returns all badges + which ones the authenticated user has earned.
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
    const [badges, earned] = await Promise.all([
      prisma.badge.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          iconName: true,
          category: true,
          criteriaDays: true,
          criteriaValue: true,
        },
      }),
      prisma.userBadge.findMany({
        where: { userId: auth.userId },
        select: {
          id: true,
          badgeId: true,
          earnedAt: true,
        },
      }),
    ]);

    return NextResponse.json<
      APIResponse<{
        badges: typeof badges;
        earned: Array<{ id: string; badgeId: string; earnedAt: string }>;
      }>
    >(
      {
        success: true,
        data: {
          badges,
          earned: earned.map((e) => ({
            ...e,
            earnedAt: e.earnedAt.toISOString(),
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get badges error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
