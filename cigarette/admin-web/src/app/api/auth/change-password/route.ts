import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import bcrypt from "bcryptjs";
import type { APIResponse } from "@/types";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "ต้องมีการยืนยันตัวตน" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { adminPassword, newPassword } = body;

    // Check against the server's .env.local ADMIN_PASSWORD
    if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง" },
        { status: 403 }
      );
    }

    if (!newPassword) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "ต้องระบุรหัสผ่านใหม่" },
        { status: 400 }
      );
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: auth.userId },
    });

    if (!adminUser || adminUser.role !== "ADMIN") {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "ปฏิเสธการเข้าถึง ต้องใช้สิทธิ์ผู้ดูแลระบบ" },
        { status: 403 }
      );
    }

    // Hash the new password
    const saltRounds = 12; // High salt rounds for admin password
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update the database
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { passwordHash },
    });

    return NextResponse.json<APIResponse<null>>(
      { success: true, data: null },
      { status: 200 }
    );
  } catch (error) {
    console.error("Change password error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
