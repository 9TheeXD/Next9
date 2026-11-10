import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

/**
 * GET /api/quizzes — Returns all quiz results for the authenticated user.
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
    const results = await prisma.quizResult.findMany({
      where: { userId: auth.userId },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        quizId: true,
        score: true,
        maxScore: true,
        completedAt: true,
      },
    });

    const formatted = results.map((r) => ({
      ...r,
      completedAt: r.completedAt.toISOString(),
    }));

    return NextResponse.json<APIResponse<typeof formatted>>(
      { success: true, data: formatted },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get quizzes error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/quizzes — Submit a new quiz result.
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
    const { quizId, score, maxScore } = body;

    if (
      typeof quizId !== "string" ||
      typeof score !== "number" ||
      typeof maxScore !== "number" ||
      score < 0 ||
      maxScore < 1 ||
      score > maxScore
    ) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Invalid quiz result data" },
        { status: 400 }
      );
    }

    const result = await prisma.quizResult.create({
      data: {
        userId: auth.userId,
        quizId,
        score,
        maxScore,
      },
    });

    return NextResponse.json<APIResponse<{ id: string; completedAt: string }>>(
      {
        success: true,
        data: {
          id: result.id,
          completedAt: result.completedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Post quiz result error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
