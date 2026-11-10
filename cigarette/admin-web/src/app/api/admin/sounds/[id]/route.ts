import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { deleteSoundByUrl, putSound } from "@/lib/storage";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const adminUser = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!adminUser || adminUser.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existingSound = await prisma.sound.findUnique({ where: { id } });
    if (!existingSound) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string | null;
    const duration = formData.get("duration") as string | null;
    const category = formData.get("category") as any || existingSound.category;
    const description = formData.get("description") as string | null;

    let url = existingSound.url;
    let finalDuration = existingSound.duration;

    if (file && duration) {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const fileExt = file.name.split(".").pop() || "mp3";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      url = await putSound(fileName, fileBuffer, file.type);
      finalDuration = parseInt(duration, 10);

      // If we are replacing a non-system sound, or a system sound that already has a custom URL, delete the old custom URL from S3
      if (existingSound.url !== existingSound.defaultUrl) {
        await deleteSoundByUrl(existingSound.url);
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (description !== null) updateData.description = description;
    updateData.category = category;
    updateData.url = url;
    updateData.duration = finalDuration;

    const updatedSound = await prisma.sound.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updatedSound }, { status: 200 });
  } catch (error) {
    console.error("PUT sound error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticateRequest(request);
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const adminUser = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!adminUser || adminUser.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const existingSound = await prisma.sound.findUnique({ where: { id } });
    if (!existingSound) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    if (existingSound.isSystem) {
      // System sounds cannot be deleted, only reset to defaultUrl
      if (existingSound.url !== existingSound.defaultUrl && existingSound.defaultUrl) {
        await deleteSoundByUrl(existingSound.url);

        const resetSound = await prisma.sound.update({
          where: { id },
          data: { url: existingSound.defaultUrl },
        });
        return NextResponse.json({ success: true, data: resetSound, message: "Reset to default" }, { status: 200 });
      } else {
        return NextResponse.json({ success: false, error: "Already at default" }, { status: 400 });
      }
    } else {
      // Custom sounds are fully deleted
      await deleteSoundByUrl(existingSound.url);

      await prisma.sound.delete({ where: { id } });
      return NextResponse.json({ success: true, message: "Deleted successfully" }, { status: 200 });
    }
  } catch (error) {
    console.error("DELETE sound error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
