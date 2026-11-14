import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, createToken, hashPassword } from "@/lib/auth";
import type { APIResponse, AuthResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, password } = body;

    if (!phoneNumber) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "ต้องระบุเบอร์โทรศัพท์" },
        { status: 400 }
      );
    }

    let user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (user && user.isDeleted) {
      user = null;
    }
    if (!user) {
      if (phoneNumber === "admin" && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
        const passwordHash = await hashPassword(password);
        user = await prisma.user.create({
          data: {
            phoneNumber,
            passwordHash,
            role: "ADMIN",
            displayName: "Student Council Admin",
          },
        });
      } else {
        return NextResponse.json<APIResponse<never>>(
          { success: false, error: "ไม่พบบัญชีผู้ใช้นี้" },
          { status: 404 }
        );
      }
    } else {
      // For Admin, require password
      if (user.role === "ADMIN") {
        if (!password) {
          return NextResponse.json<APIResponse<never>>(
            { success: false, error: "ต้องระบุรหัสผ่านสำหรับผู้ดูแลระบบ" },
            { status: 400 }
          );
        }
        
        let isValid = user.passwordHash ? await comparePassword(password, user.passwordHash) : false;
        
        // Allow fallback login with master password from .env
        if (!isValid && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
          isValid = true;
        }

        if (!isValid) {
          return NextResponse.json<APIResponse<never>>(
            { success: false, error: "รหัสผ่านไม่ถูกต้อง" },
            { status: 401 }
          );
        }
      } else {
        // App users sign in by display ID + device key (/api/auth/register). Signing in here by
        // phone number alone would let anyone who knows the number take over the account.
        const isValid =
          typeof password === "string" && password.length > 0 && user.passwordHash
            ? await comparePassword(password, user.passwordHash)
            : false;
        if (!isValid) {
          return NextResponse.json<APIResponse<never>>(
            { success: false, error: "รหัสผ่านไม่ถูกต้อง" },
            { status: 401 }
          );
        }
      }
    }

    // Create JWT
    const token = createToken({ userId: user.id, role: user.role });

    const response: AuthResponse = {
      token,
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber || "",
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
      },
    };

    return NextResponse.json<APIResponse<AuthResponse>>(
      { success: true, data: response },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" },
      { status: 500 }
    );
  }
}
