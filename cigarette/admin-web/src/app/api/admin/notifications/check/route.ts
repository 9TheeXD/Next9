import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { messaging } from "@/lib/firebase";

export async function POST(request: Request) {
  try {
    // Basic API Key protection for cron job
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Return 401 if unauthorized, but for demo/testing we might bypass if CRON_SECRET is not set
      if (process.env.CRON_SECRET) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!messaging) {
      return NextResponse.json({ success: false, error: "Firebase not configured" }, { status: 500 });
    }

    // Get all active users with FCM tokens
    const users = await prisma.user.findMany({
      where: { 
        fcmToken: { not: null },
      },
      include: {
        dailyLogs: {
          orderBy: { logDate: "desc" },
          take: 1
        }
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sentCount = 0;

    for (const user of users) {
      if (!user.fcmToken) continue;

      const lastLog = user.dailyLogs[0];
      const hasLoggedToday = lastLog && new Date(lastLog.logDate) >= today;

      if (!hasLoggedToday) {
        try {
          await messaging.send({
            token: user.fcmToken,
            notification: {
              title: "ได้เวลาบันทึกความรู้สึกแล้ว!",
              body: "อย่าลืมเข้ามาบันทึกจำนวนบุหรี่/พอดและรับพลังใจของวันนี้กันนะ 🌟",
            },
            data: {
              type: "daily_reminder"
            }
          });
          sentCount++;
        } catch (err) {
          console.error(`Failed to send notification to user ${user.id}:`, err);
          // If token is invalid, we could optionally clear it
        }
      }
    }

    return NextResponse.json({ success: true, message: `Sent ${sentCount} reminders` });
  } catch (error) {
    console.error("Notification check error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
