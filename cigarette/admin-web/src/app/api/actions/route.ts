import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, details, metadata } = body;

    if (!action || !details) {
      return NextResponse.json({ success: false, error: "Missing action or details" }, { status: 400 });
    }

    const log = await prisma.userActionLog.create({
      data: {
        userId: auth.userId,
        action,
        details,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return NextResponse.json({ success: true, data: log }, { status: 200 });
  } catch (error: any) {
    console.error("Action Log error:", error.message);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
