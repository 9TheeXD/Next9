import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

/**
 * POST /api/family/link — Link a FAMILY user to a SMOKER user via the smoker's phone number.
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
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });

    if (!user || user.role !== "FAMILY") {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Only FAMILY accounts can link to a smoker" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { smokerPhoneNumber } = body;

    if (!smokerPhoneNumber || typeof smokerPhoneNumber !== "string") {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "smokerPhoneNumber is required" },
        { status: 400 }
      );
    }

    // Find the target smoker
    const targetSmoker = await prisma.user.findUnique({
      where: { phoneNumber: smokerPhoneNumber.trim() },
    });

    if (!targetSmoker) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Smoker not found with that phone number" },
        { status: 404 }
      );
    }

    if (targetSmoker.role !== "SMOKER") {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Target user is not a smoker account" },
        { status: 400 }
      );
    }

    // Link them
    await prisma.user.update({
      where: { id: auth.userId },
      data: { followedSmokers: { connect: { id: targetSmoker.id } } },
    });

    return NextResponse.json<APIResponse<{ success: boolean }>>(
      { success: true, data: { success: true } },
      { status: 200 }
    );
  } catch (error) {
    console.error("Family link error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
