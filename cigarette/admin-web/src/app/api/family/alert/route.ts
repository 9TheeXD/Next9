import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { messaging, sendPushNotification } from "@/lib/firebase";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Find linked supporters
    const supporters = await prisma.user.findMany({
      where: { followedSmokers: { some: { id: user.id } }, role: "FAMILY", fcmToken: { not: null } }
    });

    if (supporters.length === 0) {
      return NextResponse.json({ success: true, message: "No family member with FCM token found" });
    }

    const tokens = supporters.map(s => s.fcmToken as string);
    await sendPushNotification(
      tokens,
      "🆘 แจ้งเตือนฉุกเฉิน",
      `${user.displayName} กำลังต้องการกำลังใจและความช่วยเหลือจากคุณตอนนี้!`,
      {
        type: "SOS_ALERT",
        smokerId: user.id
      }
    );

    return NextResponse.json({ success: true, message: "Alert sent successfully" });
  } catch (error) {
    console.error("SOS Alert error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
