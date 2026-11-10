import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const adminUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });

    if (!adminUser || adminUser.role !== "ADMIN") {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Forbidden. Admin privileges required." },
        { status: 403 }
      );
    }

    const surveys = await prisma.surveyResponse.findMany({
      include: {
        user: {
          select: { displayName: true, phoneNumber: true, role: true }
        }
      },
      orderBy: { createdAt: "desc" },
    });

    const result = surveys.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      user: s.user ? {
        displayName: s.user.displayName,
        phoneNumber: s.user.phoneNumber,
        role: s.user.role
      } : null
    }));

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin GET surveys error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
