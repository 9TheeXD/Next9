import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

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
    const { amount } = body;

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Invalid amount" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data: { xp: { increment: amount } },
      select: { xp: true },
    });

    return NextResponse.json<APIResponse<{ xp: number }>>(
      { success: true, data: { xp: updated.xp } },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Post XP error:", error.message);
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
