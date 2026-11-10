import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/users/[id] — Full user detail for admin
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  if (!adminUser || adminUser.role !== "ADMIN") {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        dailyLogs: {
          orderBy: { logDate: "desc" },
          take: 90,
        },
        earnedBadges: {
          include: { badge: true },
          orderBy: { earnedAt: "desc" },
        },
        quizResults: {
          orderBy: { completedAt: "desc" },
          take: 50,
        },
        actionLogs: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        chatMessages: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            content: true,
            alias: true,
            createdAt: true,
          },
        },
        sentCheers: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            message: true,
            createdAt: true,
          },
        },
        receivedCheers: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            message: true,
            createdAt: true,
            sender: {
              select: { displayName: true },
            },
          },
        },
        followedSmokers: {
          select: { id: true, displayName: true, phoneNumber: true },
        },
        followers: {
          select: { id: true, displayName: true, phoneNumber: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Build activity timeline
    const activities: Array<{
      type: string;
      date: string;
      description: string;
      details?: string;
    }> = [];

    // Use actionLogs for detailed tracking
    for (const action of user.actionLogs) {
      let iconType = "log";
      let desc = action.action;
      
      if (action.action === "LOG_CIGARETTE") {
        desc = "บันทึกการสูบ";
      } else if (action.action === "LOG_CRAVING") {
        iconType = "craving";
        desc = "บันทึกความอยาก";
      } else if (action.action.startsWith("GAME")) {
        iconType = "quiz";
        desc = "กิจกรรมเล่นเกม";
      } else if (action.action.startsWith("READ")) {
        desc = "อ่านคู่มือ/ความรู้";
      } else if (action.action.startsWith("QUIZ")) {
        iconType = "quiz";
        desc = "ทำแบบทดสอบ";
      } else if (action.action.startsWith("XP")) {
        iconType = "badge";
        desc = "ได้รับ XP";
      } else if (action.action.startsWith("SOUND")) {
        iconType = "log";
        desc = "ฟังเสียงให้กำลังใจ";
      }
      
      // If details are present, sometimes we want to promote them or format better
      if (action.action.startsWith("XP") && action.details) {
        desc = action.details;
        action.details = ""; // clear details so it doesn't duplicate
      } else if (action.action.startsWith("READ") && action.details) {
        desc = action.details;
        action.details = "";
      } else if (action.action === "GAME_PLAYED" && action.details) {
        desc = action.details;
        action.details = "";
      } else if (action.action.startsWith("QUIZ") && action.details) {
        desc = action.details;
        action.details = "";
      }

      activities.push({
        type: iconType,
        date: action.createdAt.toISOString(),
        description: desc,
        details: action.details,
      });
    }

    // Badges
    for (const ub of user.earnedBadges) {
      activities.push({
        type: "badge",
        date: ub.earnedAt.toISOString(),
        description: `ได้รับเหรียญ: ${ub.badge.name}`,
        details: ub.badge.description,
      });
    }

    // Quiz results
    for (const qr of user.quizResults) {
      const hasActionLog = user.actionLogs.some(a => 
        a.action.startsWith("QUIZ") && Math.abs(a.createdAt.getTime() - qr.completedAt.getTime()) < 10000
      );
      if (!hasActionLog) {
        activities.push({
          type: "quiz",
          date: qr.completedAt.toISOString(),
          description: `ทำแบบทดสอบ: ได้ ${qr.score}/${qr.maxScore} คะแนน`,
        });
      }
    }

    // Chat messages
    for (const msg of user.chatMessages) {
      activities.push({
        type: "chat",
        date: msg.createdAt.toISOString(),
        description: `ส่งข้อความในแชท`,
        details: msg.content.substring(0, 100),
      });
    }

    // Sort all by date desc
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate stats
    const baseline = user.cigarettesPerDay ?? 0;
    const totalLogged = user.dailyLogs.length;
    const totalSmoked = user.dailyLogs.reduce((s, l) => s + l.cigarettesSmoked, 0);
    const totalAvoided = user.dailyLogs.reduce((s, l) => {
      return s + Math.max(0, baseline - l.cigarettesSmoked);
    }, 0);
    const pricePerCig = (user.pricePerPack ?? 0) / (user.cigarettesPerPack || 20);
    const totalMoneySaved = totalAvoided * pricePerCig;
    
    const totalGamesPlayed = user.dailyLogs.reduce((s, l) => s + (l.gamesPlayed || 0), 0);
    const totalArticlesRead = user.dailyLogs.reduce((s, l) => s + (l.articlesRead || 0), 0);
    const totalSoundsListened = user.dailyLogs.reduce((s, l) => s + (l.soundsListened || 0), 0);

    // Current streak
    let currentStreak = 0;
    const sortedLogs = [...user.dailyLogs].sort(
      (a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime()
    );
    for (const log of sortedLogs) {
      if (log.cigarettesSmoked < baseline) {
        currentStreak++;
      } else {
        break;
      }
    }

    let survey = null;
    let followerSurvey = null;

    if (user.role === "SMOKER") {
      survey = await prisma.surveyResponse.findUnique({
        where: { displayId: user.displayId },
      });
    } else if (user.role === "FAMILY") {
      followerSurvey = await prisma.followerSurveyResponse.findUnique({
        where: { displayId: user.displayId },
      });
    }

    const result = {
      id: user.id,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      role: user.role,
      smokingType: user.smokingType,
      cigarettesPerDay: user.cigarettesPerDay,
      pricePerPack: user.pricePerPack,
      cigarettesPerPack: user.cigarettesPerPack,
      emergencyContact: user.emergencyContact,
      xp: user.xp,
      isDeleted: user.isDeleted,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      followedSmokers: user.followedSmokers,
      followers: user.followers,
      survey,
      followerSurvey,
      stats: {
        totalLogged,
        totalSmoked,
        totalAvoided,
        totalMoneySaved: Math.round(totalMoneySaved * 100) / 100,
        currentStreak,
        badgesEarned: user.earnedBadges.length,
        quizzesCompleted: user.quizResults.length,
        totalGamesPlayed,
        totalArticlesRead,
        totalSoundsListened,
      },
      dailyLogs: user.dailyLogs.map((l) => ({
        date: l.logDate.toISOString(),
        smoked: l.cigarettesSmoked,
        cravings: l.cravingCount,
        mood: l.mood,
        notes: l.notes,
      })),
      activities: activities.slice(0, 100),
    };

    return NextResponse.json<APIResponse<typeof result>>(
      { success: true, data: result },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin get user detail error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/users/[id] — Update user info (admin)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  if (!adminUser || adminUser.role !== "ADMIN") {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { displayName, phoneNumber, xp, isDeleted } = body;

    const updateData: Record<string, unknown> = {};

    if (displayName !== undefined) {
      if (typeof displayName !== "string" || displayName.trim().length < 1 || displayName.length > 100) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "displayName must be 1-100 characters" },
          { status: 400 }
        );
      }
      updateData.displayName = displayName.trim();
    }

    if (phoneNumber !== undefined) {
      if (typeof phoneNumber !== "string" || phoneNumber.trim().length < 1 || phoneNumber.length > 20) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "phoneNumber must be valid" },
          { status: 400 }
        );
      }
      // Check uniqueness
      const existing = await prisma.user.findUnique({ where: { phoneNumber } });
      if (existing && existing.id !== id) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "Phone number already exists" },
          { status: 409 }
        );
      }
      updateData.phoneNumber = phoneNumber.trim();
    }

    if (xp !== undefined) {
      if (typeof xp !== "number" || xp < 0) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "xp must be a non-negative number" },
          { status: 400 }
        );
      }
      updateData.xp = xp;
    }

    if (isDeleted !== undefined) {
      if (typeof isDeleted !== "boolean") {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "isDeleted must be a boolean" },
          { status: 400 }
        );
      }
      updateData.isDeleted = isDeleted;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, displayName: true, phoneNumber: true, xp: true },
    });

    return NextResponse.json<APIResponse<typeof updated>>(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin update user error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id] — Delete user (cascade)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { role: true },
  });
  if (!adminUser || adminUser.role !== "ADMIN") {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    // Prevent deleting self
    if (id === auth.userId) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { isDeleted: true }
    });


    return NextResponse.json<APIResponse<{ deleted: true }>>(
      { success: true, data: { deleted: true } },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin delete user error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
