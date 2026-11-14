import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rejectUnlessCron } from "@/lib/cron";
import { messaging, sendPushNotification } from "@/lib/firebase";

const ENCOURAGEMENT_MESSAGES = [
  "ทุกครั้งที่ผ่านความอยากไปได้ คุณแข็งแกร่งขึ้นเสมอ ✌️",
  "ความตั้งใจของคุณในวันนี้ จะส่งผลดีต่อสุขภาพในวันหน้า 🌟",
  "หายใจเข้าลึกๆ คุณเก่งมากที่พยายามมาจนถึงตอนนี้ 🌬️",
  "ถ้าอยากสูบ ลองดื่มน้ำเย็นๆ หรือหาอะไรทำเบี่ยงเบนความสนใจดูนะ 💧",
  "ร่างกายของคุณกำลังฟื้นฟู สู้ๆ นะครับ/คะ ❤️",
  "หนึ่งวันโดยไม่สูบ คือหนึ่งชัยชนะที่ยิ่งใหญ่ 🏆",
  "คุณไม่ได้อยู่คนเดียว เราเป็นกำลังใจให้คุณเสมอ 🤝",
  "คิดถึงเหตุผลที่คุณอยากเลิกไว้ให้มั่น คุณทำได้! 💪",
  "ความพยายามของคุณมีความหมาย อย่าเพิ่งยอมแพ้นะ ✨",
  "ยิ้มรับวันใหม่ที่ปราศจากควันบุหรี่ คุณสุดยอดมาก! 😁"
];

function isTimeInRange(rangeStr: string): boolean {
  // Ranges: '00:00-05:00', '06:00-10:00', '11:00-15:00', '16:00-20:00', '20:00-23:00'
  const now = new Date();
  const currentHour = now.getHours();

  if (!rangeStr) return false;

  const [start, end] = rangeStr.split('-').map(t => parseInt(t.split(':')[0], 10));
  if (isNaN(start) || isNaN(end)) return false;

  // Handle case like 20:00-23:00 (we'll simplify logic)
  return currentHour >= start && currentHour <= end;
}

export async function GET(request: NextRequest) {
  const denied = rejectUnlessCron(request);
  if (denied) return denied;
  try {
    const smokers = await prisma.user.findMany({
      where: { role: "SMOKER", fcmToken: { not: null } }
    });

    const tokensToPush: string[] = [];

    for (const smoker of smokers) {
      // Check their survey craving time
      const survey = await prisma.surveyResponse.findUnique({
        where: { displayId: smoker.displayId }
      });

      const cravingTime = survey?.cravingTime || '16:00-20:00'; // Fallback to evening

      if (isTimeInRange(cravingTime)) {
        tokensToPush.push(smoker.fcmToken as string);
      }
    }

    if (tokensToPush.length === 0) {
      return NextResponse.json({ success: true, message: "No notifications to push at this hour" });
    }

    const randomMsg = ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
    await sendPushNotification(
      tokensToPush,
      "กำลังใจจาก Next Breath 💙",
      randomMsg,
      { type: "DAILY_ENCOURAGEMENT" }
    );

    return NextResponse.json({ success: true, message: `Pushed to ${tokensToPush.length} devices` });
  } catch (error) {
    console.error("Cron notification error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
