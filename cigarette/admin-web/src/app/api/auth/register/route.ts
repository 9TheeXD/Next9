import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, comparePassword, createToken } from "@/lib/auth";
import type { APIResponse } from "@/types";

/**
 * Creates an account for a 4-digit display ID, or signs an existing one back in.
 *
 * The app has no passwords: an account belongs to the device that created it. The device sends a
 * random `deviceKey` (kept on the device); its bcrypt hash is stored in `passwordHash`. Signing in
 * to an existing account needs the same key, so knowing (or guessing) a 4-digit ID is not enough.
 *
 * Accounts made before device keys existed have no hash yet. They can still sign in by ID once, and
 * that sign-in (or POST /api/auth/device-key from an already signed-in app) binds them to the key.
 */

const ALLOWED_ROLES = new Set(["SMOKER", "FAMILY"]);

function bad(error: string, status = 400) {
  return NextResponse.json<APIResponse<never>>({ success: false, error }, { status });
}

function validKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 32 && key.length <= 128;
}

const userInclude = {
  followedSmokers: { select: { id: true, displayId: true, displayName: true } },
} as const;

type UserWithFollowed = NonNullable<Awaited<ReturnType<typeof findUser>>>;

function findUser(displayId: string) {
  return prisma.user.findUnique({ where: { displayId }, include: userInclude });
}

// Never send passwordHash, fcmToken or other internals back to the app.
function publicUser(user: UserWithFollowed) {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    displayId: user.displayId,
    role: user.role,
    displayName: user.displayName,
    smokingType: user.smokingType,
    cigarettesPerDay: user.cigarettesPerDay,
    pricePerPack: user.pricePerPack,
    cigarettesPerPack: user.cigarettesPerPack,
    quitDate: user.quitDate?.toISOString() ?? null,
    emergencyContact: user.emergencyContact,
    xp: user.xp,
    followedSmokers: user.followedSmokers,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
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

async function linkFollower(userId: string, targetDisplayId: string) {
  const target = await prisma.user.findUnique({ where: { displayId: targetDisplayId } });
  if (!target || target.isDeleted || target.role !== "SMOKER") return false;
  await prisma.user.update({
    where: { id: userId },
    data: { followedSmokers: { connect: { id: target.id } } },
  });
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const displayId = typeof body.displayId === "string" ? body.displayId.trim() : "";
    const role = typeof body.role === "string" ? body.role : "";
    const targetDisplayId = typeof body.targetDisplayId === "string" ? body.targetDisplayId.trim() : "";
    const deviceKey: string | null = validKey(body.deviceKey) ? body.deviceKey : null;

    if (!/^\d{4,8}$/.test(displayId) || !role) {
      return bad("ต้องระบุ displayId และ role");
    }
    if (!ALLOWED_ROLES.has(role)) {
      return bad("role ไม่ถูกต้อง");
    }

    const existing = await findUser(displayId);

    if (existing) {
      if (existing.isDeleted) return bad("ACCOUNT_DELETED", 403);
      // Admin accounts sign in with a password at /api/auth/login, never by ID.
      if (existing.role === "ADMIN") return bad("ไม่พบบัญชีผู้ใช้นี้", 404);

      if (existing.passwordHash) {
        const ok = deviceKey ? await comparePassword(deviceKey, existing.passwordHash) : false;
        if (!ok) return bad("DEVICE_KEY_MISMATCH", 401);
      } else if (deviceKey) {
        // Legacy account: bind it to this device from now on.
        await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash: await hashPassword(deviceKey) },
        });
      }

      if (existing.role === "SMOKER") {
        const survey = await prisma.surveyResponse.findUnique({ where: { displayId } });
        if (!survey) return bad("SURVEY_REQUIRED");
        if (!survey.userId) {
          await prisma.surveyResponse.update({ where: { id: survey.id }, data: { userId: existing.id } });
        }
      } else if (existing.role === "FAMILY") {
        const followerSurvey = await prisma.followerSurveyResponse.findUnique({ where: { displayId } });
        if (!followerSurvey) return bad("SURVEY_REQUIRED");
        if (!followerSurvey.userId) {
          await prisma.followerSurveyResponse.update({ where: { id: followerSurvey.id }, data: { userId: existing.id } });
        }
        if (targetDisplayId && !(await linkFollower(existing.id, targetDisplayId))) {
          return bad("ไม่พบรหัส 4 หลักของผู้สูบในระบบ", 404);
        }
      }

      const fresh = (await findUser(displayId))!;
      const token = createToken({ userId: fresh.id, role: fresh.role });
      return NextResponse.json({ success: true, data: { token, user: publicUser(fresh) } }, { status: 200 });
    }

    let linkedSmokerId: string | null = null;
    if (role === "FAMILY" && targetDisplayId) {
      const target = await prisma.user.findUnique({ where: { displayId: targetDisplayId } });
      if (!target || target.isDeleted || target.role !== "SMOKER") {
        return bad("ไม่พบรหัส 4 หลักของผู้สูบในระบบ", 404);
      }
      linkedSmokerId = target.id;
    }

    let cigarettesPerDay: number | null = null;
    let smokingType: "CIGARETTE" | "POD" = "CIGARETTE";

    if (role === "SMOKER") {
      const survey = await prisma.surveyResponse.findUnique({ where: { displayId } });
      if (!survey) return bad("SURVEY_REQUIRED");
      cigarettesPerDay = cigarettesPerDayFrom(survey.frequency || "");
      smokingType =
        survey.smokingType === "บุหรี่ไฟฟ้า" || survey.smokingType === "บุหรี่ไฟฟ้า(พอต)" ? "POD" : "CIGARETTE";
    } else {
      const followerSurvey = await prisma.followerSurveyResponse.findUnique({ where: { displayId } });
      if (!followerSurvey) return bad("SURVEY_REQUIRED");
    }

    const created = await prisma.user.create({
      data: {
        displayId,
        displayName: "ผู้ใช้งาน " + displayId,
        smokingType,
        role: role as "SMOKER" | "FAMILY",
        cigarettesPerDay,
        pricePerPack: 100,
        cigarettesPerPack: 20,
        passwordHash: deviceKey ? await hashPassword(deviceKey) : null,
        followedSmokers: linkedSmokerId ? { connect: { id: linkedSmokerId } } : undefined,
      },
    });

    if (role === "SMOKER") {
      await prisma.surveyResponse.update({ where: { displayId }, data: { userId: created.id } });
    } else {
      await prisma.followerSurveyResponse.update({ where: { displayId }, data: { userId: created.id } });
    }

    const user = (await findUser(displayId))!;
    const token = createToken({ userId: user.id, role: user.role });
    return NextResponse.json({ success: true, data: { token, user: publicUser(user) } }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", (error as Error).message);
    return bad("เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์", 500);
  }
}
