import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hashPassword } from "@/lib/auth";

/**
 * Binds a signed-in account that has no device key yet (made before device keys existed) to the
 * key of the device it is signed in on. Afterwards signing in by display ID needs that key.
 * An account that already has a key is left alone.
 */
export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { deviceKey } = await request.json();
    if (typeof deviceKey !== "string" || deviceKey.length < 32 || deviceKey.length > 128) {
      return NextResponse.json({ success: false, error: "Invalid device key" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, role: true, passwordHash: true },
    });
    if (!user || user.role === "ADMIN") {
      return NextResponse.json({ success: false, error: "Not allowed" }, { status: 403 });
    }
    if (user.passwordHash) {
      return NextResponse.json({ success: true, data: { bound: false } });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(deviceKey) },
    });
    return NextResponse.json({ success: true, data: { bound: true } });
  } catch (error) {
    console.error("Device key error:", (error as Error).message);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
