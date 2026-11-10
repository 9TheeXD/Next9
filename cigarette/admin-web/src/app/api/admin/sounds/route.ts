import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { putSound } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const sounds = await prisma.sound.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: sounds });
  } catch (error) {
    console.error("GET sounds error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const adminUser = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!adminUser || adminUser.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string | null;
    const duration = formData.get("duration") as string | null;
    const category = formData.get("category") as any || "UI";
    const description = formData.get("description") as string | null;

    if (!file || !name || !duration) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name.split(".").pop() || "wav";
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    const url = await putSound(fileName, fileBuffer, file.type || "audio/wav");

    const sound = await prisma.sound.create({
      data: {
        name,
        description,
        url,
        duration: parseInt(duration, 10),
        category,
        isSystem: false,
      },
    });

    return NextResponse.json({ success: true, data: sound }, { status: 201 });
  } catch (error) {
    console.error("POST sound error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
