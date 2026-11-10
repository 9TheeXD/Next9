import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const adminUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });

    if (!adminUser || adminUser.role !== "ADMIN") {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "Forbidden. Admin privileges required." },
        { status: 403 }
      );
    }

    // Parse query params
    const roleFilter = request.nextUrl.searchParams.get("role") || "SMOKER";
    const sortBy = request.nextUrl.searchParams.get("sortBy") || "createdAt";
    const sortOrder = request.nextUrl.searchParams.get("sortOrder") || "desc";

    const validRoles = ["SMOKER", "FAMILY"];
    const validSortFields = ["createdAt", "updatedAt", "displayName", "phoneNumber", "cigarettesPerDay"];
    const validOrders = ["asc", "desc"];

    const role = validRoles.includes(roleFilter) ? roleFilter : "SMOKER";
    const orderField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const order = validOrders.includes(sortOrder) ? sortOrder : "desc";

    const users = await prisma.user.findMany({
      where: { role: role as "SMOKER" | "FAMILY" },
      include: {
        dailyLogs: {
          orderBy: { logDate: "desc" },
          take: 1,
        },
        followedSmokers: role === "FAMILY" ? {
          select: { id: true, phoneNumber: true, displayName: true },
        } : false,
        followers: role === "SMOKER" ? {
          select: { id: true, phoneNumber: true, displayName: true },
        } : false,
      },
      orderBy: { [orderField]: order },
    });

    const result = users.map((user) => {
      const lastLog = user.dailyLogs[0];
      const baseline = user.cigarettesPerDay ?? 0;
      let status = "ไม่มีข้อมูล";

      if (lastLog) {
        if (lastLog.cigarettesSmoked === 0) status = "ปลอดบุหรี่";
        else if (lastLog.cigarettesSmoked < baseline) status = "กำลังลด";
        else if (lastLog.cigarettesSmoked === baseline) status = "คงที่";
        else status = "เพิ่มขึ้น";
      }

      return {
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        role: user.role,
        smokingType: user.smokingType,
        cigarettesPerDay: user.cigarettesPerDay,
        pricePerPack: user.pricePerPack,
        status,
        lastLogDate: lastLog?.logDate?.toISOString() ?? null,
        lastLogSmoked: lastLog?.cigarettesSmoked ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        xp: user.xp,
        isDeleted: user.isDeleted,
        linkedSmokerId: (user as any).followedSmokers?.[0]?.id ?? null,
        linkedSmokerPhone: (user as any).followedSmokers?.[0]?.phoneNumber ?? null,
        linkedSmokerName: (user as any).followedSmokers?.[0]?.displayName ?? null,
        followers: (user as any).followers ?? [],
        followerCount: (user as any).followers?.length ?? 0,
      };
    });

    return NextResponse.json<APIResponse<typeof result>>(
      { success: true, data: result },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin GET users error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
