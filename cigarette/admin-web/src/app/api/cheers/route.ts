import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

/**
 * GET /api/cheers — Returns cheers received by the authenticated user.
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
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 100);

    const cheers = await prisma.cheer.findMany({
      where: { receiverId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        sender: {
          select: { displayName: true },
        },
      },
    });

    const formatted = cheers.map((c) => ({
      id: c.id,
      senderName: c.sender.displayName,
      message: c.message,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json<APIResponse<typeof formatted>>(
      { success: true, data: formatted },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get cheers error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cheers — Send a cheer from a FAMILY user to their linked smoker.
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
    // Verify sender is a FAMILY user with a linked smoker
    const sender = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true, followedSmokers: { select: { id: true } } },
    });

    if (!sender || sender.role !== "FAMILY") {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Only FAMILY users can send cheers" },
        { status: 403 }
      );
    }

    if (!sender.followedSmokers || sender.followedSmokers.length === 0) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "No linked smoker. Link a smoker first via /api/family/link" },
        { status: 400 }
      );
    }

    const body = await request.json();
    let { message, targetSmokerId } = body;
    
    // Find target smoker in followed list
    const targetId = targetSmokerId || sender.followedSmokers[0].id;
    const isValidTarget = sender.followedSmokers.some(s => s.id === targetId);
    
    if (!isValidTarget) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Invalid target smoker" },
        { status: 400 }
      );
    }

    // Validate and sanitize
    if (typeof message !== "string" || message.trim().length === 0) {
      message = "Keep going!";
    }

    // Truncate to 200 chars to prevent abuse
    message = message.trim().slice(0, 200);

    const cheer = await prisma.cheer.create({
      data: {
        senderId: auth.userId,
        receiverId: targetId,
        message,
      },
    });

    return NextResponse.json<APIResponse<{ id: string; createdAt: string }>>(
      {
        success: true,
        data: {
          id: cheer.id,
          createdAt: cheer.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Post cheer error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
