import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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
    await prisma.surveyResponse.update({
      where: { id },
      data: { isDeleted: true }
    });

    return NextResponse.json<APIResponse<{ deleted: true }>>(
      { success: true, data: { deleted: true } },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin delete survey error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

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
    
    if (body.isDeleted === undefined) {
      return NextResponse.json<APIResponse<never>>(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.surveyResponse.update({
      where: { id },
      data: { isDeleted: body.isDeleted }
    });

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin update survey error:", (error as Error).message);
    return NextResponse.json<APIResponse<never>>(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
