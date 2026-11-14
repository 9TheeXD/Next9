import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, createToken } from "@/lib/auth";

// "Try the app" accounts can become a quitter or a supporter later, keeping their coins and ID.
// The caller has already sent the matching survey (POST /api/survey or /api/survey/follower).
// Body: { role: "SMOKER" | "FAMILY", targetDisplayId?: string }

function bad(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

function cigarettesPerDayFrom(freq: string): number {
  if (freq === "1-2") return 2;
  if (freq === "3-4") return 4;
  if (freq === "5-6") return 6;
  if (freq === "7+") return 10;
  if (freq === "1-5") return 3;
  if (freq === "6-10" || freq === "10 มวนหรือน้อยกว่า") return 8;
  if (freq === "11-20" || freq === "11-20 มวน") return 15;
  if (freq === "21-30" || freq === "21-30 มวน") return 25;
  if (freq === "มากกว่า 30" || freq === "มากกว่า 30 มวน" || freq === "31+") return 35;
  const parsed = parseInt(freq, 10);
  return isNaN(parsed) ? 10 : parsed;
}

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) return bad("Authentication required", 401);

  try {
    const body = await request.json();
    const role = body.role === "SMOKER" || body.role === "FAMILY" ? (body.role as "SMOKER" | "FAMILY") : null;
    const targetDisplayId = typeof body.targetDisplayId === "string" ? body.targetDisplayId.trim() : "";
    if (!role) return bad("role ไม่ถูกต้อง");

    const me = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!me || me.isDeleted) return bad("User not found", 404);
    if (me.role !== "EXPLORER") return bad("เปลี่ยนบทบาทได้เฉพาะบัญชีที่กำลังลองใช้งาน", 409);

    let smokingType: "CIGARETTE" | "POD" = "CIGARETTE";
    let cigarettesPerDay: number | null = null;
    let linkId: string | null = null;

    if (role === "SMOKER") {
      const survey = await prisma.surveyResponse.findUnique({ where: { displayId: me.displayId } });
      if (!survey) return bad("SURVEY_REQUIRED");
      cigarettesPerDay = cigarettesPerDayFrom(survey.frequency || "");
      smokingType =
        survey.smokingType === "บุหรี่ไฟฟ้า" || survey.smokingType === "บุหรี่ไฟฟ้า(พอต)" ? "POD" : "CIGARETTE";
    } else {
      const survey = await prisma.followerSurveyResponse.findUnique({ where: { displayId: me.displayId } });
      if (!survey) return bad("SURVEY_REQUIRED");
      if (targetDisplayId) {
        const target = await prisma.user.findUnique({ where: { displayId: targetDisplayId } });
        if (!target || target.isDeleted || target.role !== "SMOKER") {
          return bad("ไม่พบรหัส 4 หลักของผู้สูบในระบบ", 404);
        }
        linkId = target.id;
      }
    }

    const updated = await prisma.user.update({
      where: { id: me.id },
      data: {
        role,
        smokingType,
        cigarettesPerDay,
        followedSmokers: linkId ? { connect: { id: linkId } } : undefined,
      },
      include: { followedSmokers: { select: { id: true, displayId: true, displayName: true } } },
    });

    if (role === "SMOKER") {
      await prisma.surveyResponse.updateMany({ where: { displayId: me.displayId, userId: null }, data: { userId: me.id } });
    } else {
      await prisma.followerSurveyResponse.updateMany({ where: { displayId: me.displayId, userId: null }, data: { userId: me.id } });
    }

    const token = createToken({ userId: updated.id, role: updated.role });
    return NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: updated.id,
          phoneNumber: updated.phoneNumber,
          displayId: updated.displayId,
          role: updated.role,
          displayName: updated.displayName,
          smokingType: updated.smokingType,
          cigarettesPerDay: updated.cigarettesPerDay,
          pricePerPack: updated.pricePerPack,
          cigarettesPerPack: updated.cigarettesPerPack,
          quitDate: updated.quitDate?.toISOString() ?? null,
          emergencyContact: updated.emergencyContact,
          xp: updated.xp,
          followedSmokers: updated.followedSmokers,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Change role error:", (error as Error).message);
    return bad("เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์", 500);
  }
}
