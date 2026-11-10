import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  try {
    const { fcmToken } = await request.json();

    if (typeof fcmToken !== "string") {
      return NextResponse.json({ success: false, error: "fcmToken must be a string" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { fcmToken }
    });

    return NextResponse.json({ success: true, data: { message: "FCM token updated successfully" } });
  } catch (error) {
    console.error("Update FCM token error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
