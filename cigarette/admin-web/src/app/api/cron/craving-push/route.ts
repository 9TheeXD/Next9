import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// This endpoint should be triggered by an external cron service (e.g. Vercel Cron, node-cron)
// Example trigger: Every hour
export async function GET() {
  try {
    // 1. Fetch all smokers who have FCM tokens
    const smokers = await prisma.user.findMany({
      where: {
        role: "SMOKER",
        fcmToken: { not: null },
      },
      select: {
        id: true,
        displayId: true,
        fcmToken: true,
      },
    });

    if (smokers.length === 0) {
      return NextResponse.json({ success: true, message: "No smokers to notify." });
    }

    // 2. Logic to determine if it's their "craving time". 
    // For simplicity, we assume evening (e.g., 18:00 - 20:00).
    const now = new Date();
    const bkkHour = (now.getUTCHours() + 7) % 24;
    
    // Example: send push only between 18:00 - 20:00
    if (bkkHour < 18 || bkkHour > 20) {
       return NextResponse.json({ success: true, message: "Not craving time yet." });
    }

    const messages = [
      "วันนี้คุณเก่งมากที่พยายามลดบุหรี่! สู้ต่อไปนะ!",
      "เรารู้ว่ามันยาก แต่คุณทำได้! หายใจลึกๆ นะ",
      "ถ้าอยากสูบ ลองดื่มน้ำเย็นๆ หรือเล่นเกมผ่อนคลายในแอปดูสิ",
      "ทุกครั้งที่คุณชนะความอยาก ร่างกายคุณจะแข็งแรงขึ้น 1 สเต็ป!",
    ];

    const randomMsg = messages[Math.floor(Math.random() * messages.length)];

    console.log(`[Cron] Preparing to send push to ${smokers.length} users: "${randomMsg}"`);

    // 3. Mock sending push notifications
    const tokens = smokers.map((s) => s.fcmToken as string);
    
    /*
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tokens.map(to => ({
        to,
        sound: 'default',
        title: 'เราเป็นกำลังใจให้คุณนะ 💙',
        body: randomMsg,
      }))),
    });
    */

    return NextResponse.json({ success: true, message: "Push notifications sent successfully (Mocked)" });
  } catch (error) {
    console.error("Cron Error:", (error as Error).message);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
