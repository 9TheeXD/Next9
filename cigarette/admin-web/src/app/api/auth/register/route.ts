import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createToken } from "@/lib/auth";
import type { APIResponse, AuthResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { displayId, role, targetDisplayId } = body;

    if (!displayId || !role) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "ต้องระบุ displayId และ role" },
        { status: 400 }
      );
    }

    // Check if user already exists
    let existing = await prisma.user.findUnique({ where: { displayId } });
    
    if (existing && existing.isDeleted) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "ACCOUNT_DELETED" },
        { status: 403 }
      );
    }

    if (existing) {
      if (existing.role === "SMOKER") {
        const survey = await prisma.surveyResponse.findUnique({ where: { displayId } });
        if (!survey) {
          return NextResponse.json<APIResponse<never>>(
            { success: false, error: "SURVEY_REQUIRED" },
            { status: 400 }
          );
        }
        if (!survey.userId) {
          await prisma.surveyResponse.update({
            where: { id: survey.id },
            data: { userId: existing.id }
          });
        }
      } else if (existing.role === "FAMILY") {
        const followerSurvey = await prisma.followerSurveyResponse.findUnique({ where: { displayId } });
        if (!followerSurvey) {
          return NextResponse.json<APIResponse<never>>(
            { success: false, error: "SURVEY_REQUIRED" },
            { status: 400 }
          );
        }
        if (!followerSurvey.userId) {
          await prisma.followerSurveyResponse.update({
            where: { id: followerSurvey.id },
            data: { userId: existing.id }
          });
        }
      }
      
      // Link target smoker if provided for existing FAMILY users
      if (existing.role === "FAMILY" && targetDisplayId) {
        const targetUser = await prisma.user.findUnique({ where: { displayId: targetDisplayId } });
        if (!targetUser) {
          return NextResponse.json<APIResponse<never>>(
            { success: false, error: "ไม่พบรหัส 4 หลักของผู้สูบในระบบ" },
            { status: 404 }
          );
        }
        await prisma.user.update({
          where: { id: existing.id },
          data: { followedSmokers: { connect: { id: targetUser.id } } },
        });
      }
      
      // Just login instead of fail
      const token = createToken({ userId: existing.id, role: existing.role });
      return NextResponse.json(
        { success: true, data: { token, user: existing } },
        { status: 200 }
      );
    }

    let linkedSmokerId: string | null = null;
    if (role === "FAMILY" && targetDisplayId) {
      const targetUser = await prisma.user.findUnique({ where: { displayId: targetDisplayId } });
      if (!targetUser) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "ไม่พบรหัส 4 หลักของผู้สูบในระบบ" },
          { status: 404 }
        );
      }
      linkedSmokerId = targetUser.id;
    }

    let cigarettesPerDay = null;
    let pricePerPack = 100; // Base market price constant
    let smokingType = "CIGARETTE";

    if (role === "SMOKER") {
      // Fetch Survey Data
      const survey = await prisma.surveyResponse.findUnique({ where: { displayId } });
      if (!survey) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "SURVEY_REQUIRED" },
          { status: 400 }
        );
      }
      
      const freq = survey.frequency || "";
      if (freq === '1-2') cigarettesPerDay = 2;
      else if (freq === '3-4') cigarettesPerDay = 4;
      else if (freq === '5-6') cigarettesPerDay = 6;
      else if (freq === '7+') cigarettesPerDay = 10;
      else if (freq === '1-5') cigarettesPerDay = 3;
      else if (freq === '6-10' || freq === '10 มวนหรือน้อยกว่า') cigarettesPerDay = 8;
      else if (freq === '11-20' || freq === '11-20 มวน') cigarettesPerDay = 15;
      else if (freq === '21-30' || freq === '21-30 มวน') cigarettesPerDay = 25;
      else if (freq === 'มากกว่า 30' || freq === 'มากกว่า 30 มวน' || freq === '31+') cigarettesPerDay = 35;
      else {
        const parsed = parseInt(freq, 10);
        cigarettesPerDay = isNaN(parsed) ? 10 : parsed;
      }
      
      smokingType = (survey.smokingType === 'บุหรี่ไฟฟ้า' || survey.smokingType === 'บุหรี่ไฟฟ้า(พอต)') ? 'POD' : 'CIGARETTE';
    } else if (role === "FAMILY") {
      const followerSurvey = await prisma.followerSurveyResponse.findUnique({ where: { displayId } });
      if (!followerSurvey) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "SURVEY_REQUIRED" },
          { status: 400 }
        );
      }
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        displayId,
        displayName: "ผู้ใช้งาน " + displayId,
        smokingType: smokingType as any,
        role: role,
        cigarettesPerDay,
        pricePerPack,
        cigarettesPerPack: 20,
        followedSmokers: linkedSmokerId ? { connect: { id: linkedSmokerId } } : undefined,
      },
    });

    if (role === "SMOKER") {
      await prisma.surveyResponse.update({
        where: { displayId },
        data: { userId: user.id }
      });
    } else if (role === "FAMILY") {
      await prisma.followerSurveyResponse.update({
        where: { displayId },
        data: { userId: user.id }
      });
    }

    const token = createToken({ userId: user.id, role: user.role });

    const response: AuthResponse = {
      token,
      user: {
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
        // linkedSmokerId removed
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      } as any,
    };

    return NextResponse.json<APIResponse<AuthResponse>>(
      { success: true, data: response },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}

