import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, validatePasswordStrength } from "@/lib/auth";
import type { APIResponse } from "@/types";

export const dynamic = "force-dynamic";

interface ProfileData {
  id: string;
  phoneNumber: string | null;
  displayId: string;
  role: string;
  displayName: string;
  cigarettesPerDay: number | null;
  pricePerPack: number | null;
  cigarettesPerPack: number;
  quitDate: string | null;
  followedSmokers?: { id: string }[];
  emergencyContact: string | null;
  createdAt: string;
  updatedAt: string;
  xp?: number;
  isDeleted: boolean;
}

/**
 * GET /api/profile — Get the authenticated user's profile.
 * Returns only the requesting user's own data (least privilege).
 */
export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        phoneNumber: true,
        displayId: true,
        role: true,
        displayName: true,
        cigarettesPerDay: true,
        pricePerPack: true,
        cigarettesPerPack: true,
        quitDate: true,
        followedSmokers: { select: { id: true, displayName: true, phoneNumber: true } },
        emergencyContact: true,
        createdAt: true,
        updatedAt: true,
        xp: true,
        isDeleted: true,
        surveyResponse: true,
      },
    });

    if (!user) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const profile: ProfileData = {
      ...user,
      role: user.role,
      quitDate: user.quitDate?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    return NextResponse.json<APIResponse<ProfileData>>(
      { success: true, data: profile },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get profile error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/profile — Update the authenticated user's profile.
 * Only mutable fields are accepted; phoneNumber and password are not changeable here.
 */
export async function PUT(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { displayName, smokingType, cigarettesPerDay, pricePerPack, cigarettesPerPack, quitDate, emergencyContact } = body;

    // Validate field types and ranges
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

    if (cigarettesPerDay !== undefined) {
      if (typeof cigarettesPerDay !== "number" || cigarettesPerDay < 0 || cigarettesPerDay > 200) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "cigarettesPerDay must be 0-200" },
          { status: 400 }
        );
      }
      updateData.cigarettesPerDay = cigarettesPerDay;
    }

    if (pricePerPack !== undefined) {
      if (typeof pricePerPack !== "number" || pricePerPack < 0 || pricePerPack > 1000) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "pricePerPack must be 0-1000" },
          { status: 400 }
        );
      }
      updateData.pricePerPack = pricePerPack;
    }

    if (cigarettesPerPack !== undefined) {
      if (typeof cigarettesPerPack !== "number" || cigarettesPerPack < 1 || cigarettesPerPack > 100) {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "cigarettesPerPack must be 1-100" },
          { status: 400 }
        );
      }
      updateData.cigarettesPerPack = cigarettesPerPack;
    }

    if (quitDate !== undefined) {
      if (quitDate !== null) {
        const parsed = new Date(quitDate);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json<APIResponse<never>>(
            { success: false, error: "quitDate must be a valid ISO date or null" },
            { status: 400 }
          );
        }
        updateData.quitDate = parsed;
      } else {
        updateData.quitDate = null;
      }
    }

    if (emergencyContact !== undefined) {
      if (emergencyContact !== null) {
        if (typeof emergencyContact !== "string" || emergencyContact.length > 20) {
          return NextResponse.json<APIResponse<never>>(
            { success: false, error: "emergencyContact must be a valid phone string" },
            { status: 400 }
          );
        }
        updateData.emergencyContact = emergencyContact.trim();
      } else {
        updateData.emergencyContact = null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id: auth.userId },
      select: {
        id: true,
        phoneNumber: true,
        displayId: true,
        role: true,
        displayName: true,
        cigarettesPerDay: true,
        pricePerPack: true,
        cigarettesPerPack: true,
        quitDate: true,
        followedSmokers: { select: { id: true, displayName: true, phoneNumber: true } },
        emergencyContact: true,
        createdAt: true,
        updatedAt: true,
        xp: true,
        isDeleted: true,
      },
      data: updateData,
    });

    const profile: ProfileData = {
      ...updated,
      role: updated.role,
      quitDate: updated.quitDate?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    return NextResponse.json<APIResponse<ProfileData>>(
      { success: true, data: profile },
      { status: 200 }
    );
  } catch (error) {
    console.error("Update profile error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
