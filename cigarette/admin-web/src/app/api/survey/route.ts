import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { APIResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      displayId, ageGroup, gender, occupation, smokingType, frequency, cravingTime,
      duration, addictionLevel, wantedToQuit, reasonToQuit, previousMethods,
      longestQuit, interestedInApp, desiredHelp,
      riskScore, riskLevel, smokesWithin30Min, cravingIntensity,
      failedQuitAttempt, copingStrategy, hatedCigarette,
      smokesWhenIll, smokesMoreMorning, motivationLevel
    } = body;

    const resolvedFrequency = frequency || body.ftnd4 || body.amountPerDay || "10 มวนหรือน้อยกว่า";
    const resolvedDuration = duration || body.smokingDuration || "6 เดือน - 2 ปี";
    const resolvedSmokingType = smokingType || "บุหรี่ธรรมดา";

    if (!displayId || !ageGroup || !gender) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { displayId } });

    const survey = await prisma.surveyResponse.create({
      data: {
        displayId,
        userId: existingUser ? existingUser.id : null,
        ageGroup,
        gender,
        occupation,
        smokingType: resolvedSmokingType,
        frequency: resolvedFrequency,
        cravingTime,
        duration: resolvedDuration,
        addictionLevel: addictionLevel || "",
        wantedToQuit: wantedToQuit || "",
        reasonToQuit: reasonToQuit || "",
        previousMethods,
        longestQuit,
        interestedInApp,
        desiredHelp,
        riskScore,
        riskLevel,
        smokesWithin30Min,
        cravingIntensity,
        failedQuitAttempt,
        copingStrategy,
        hatedCigarette,
        smokesWhenIll,
        smokesMoreMorning,
        motivationLevel,
      }
    });

    return NextResponse.json(
      { success: true, data: survey },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Survey submission error:", error);
    // If uniqueness constraint on displayId fails, just return success since it's already recorded
    if (error.code === 'P2002') {
      return NextResponse.json({ success: true }, { status: 200 });
    }
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
