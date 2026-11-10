import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { messaging, sendPushNotification } from "@/lib/firebase";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { 
        followers: {
          where: { isDeleted: false }
        }
      },
    });

    if (!user || user.followers.length === 0) {
      return NextResponse.json(
        { success: false, error: "No family member linked" },
        { status: 404 }
      );
    }

    const tokens = user.followers
      .map((f: any) => f.fcmToken)
      .filter((t: any) => t != null) as string[];

    if (tokens.length === 0) {
      console.log(`No push tokens available for family members.`);
      return NextResponse.json({
        success: true,
        data: { message: "No tokens available, but ping handled" },
      });
    }

    try {
      await sendPushNotification(
        tokens,
        "ขอความช่วยเหลือ!",
        `${user.displayId} กำลังรู้สึกอยากสูบบุหรี่ ส่งกำลังใจให้เขาหน่อยสิ!`
      );
    } catch (err) {
      console.error("Failed to send push notification:", err);
    }

    return NextResponse.json({
      success: true,
      data: { message: "Ping sent successfully" },
    });
  } catch (error) {
    console.error("Ping SOS error:", (error as Error).message);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
