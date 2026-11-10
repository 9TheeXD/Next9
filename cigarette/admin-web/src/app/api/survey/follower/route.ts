import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { APIResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      displayId,
      relation,
      smokingFrequency,
      concern,
      supportMethod,
      reward,
    } = body;

    if (!displayId || !relation || !smokingFrequency || !concern || !supportMethod) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { displayId } });

    const survey = await prisma.followerSurveyResponse.create({
      data: {
        displayId,
        userId: existingUser ? existingUser.id : null,
        relation,
        smokingFrequency,
        concern,
        supportMethod,
        reward,
      },
    });

    return NextResponse.json(
      { success: true, data: survey },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Survey submission error:", error);
    if (error.code === 'P2002') {
      return NextResponse.json({ success: true }, { status: 200 });
    }
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
