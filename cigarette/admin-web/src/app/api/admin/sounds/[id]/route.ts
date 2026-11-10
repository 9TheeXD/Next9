import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "MOCK_KEY",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "MOCK_SECRET",
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "nextbreath-sounds";

// Helper to extract S3 key from URL
function getKeyFromUrl(url: string) {
  if (!url || !url.includes("amazonaws.com/")) return null;
  return url.split("amazonaws.com/")[1];
}

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
      const key = `sounds/${fileName}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: fileBuffer,
          ContentType: file.type,
        })
      );

      url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "ap-southeast-1"}.amazonaws.com/${key}`;
      finalDuration = parseInt(duration, 10);

      // If we are replacing a non-system sound, or a system sound that already has a custom URL, delete the old custom URL from S3
      if (existingSound.url !== existingSound.defaultUrl) {
        const oldKey = getKeyFromUrl(existingSound.url);
        if (oldKey) {
          try {
            await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: oldKey }));
          } catch (e) {
            console.error("Failed to delete old sound from S3:", e);
          }
        }
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
        const oldKey = getKeyFromUrl(existingSound.url);
        if (oldKey) {
          try {
            await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: oldKey }));
          } catch (e) {
            console.error("Failed to delete old sound from S3:", e);
          }
        }

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
      const oldKey = getKeyFromUrl(existingSound.url);
      if (oldKey) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: oldKey }));
        } catch (e) {
          console.error("Failed to delete sound from S3:", e);
        }
      }

      await prisma.sound.delete({ where: { id } });
      return NextResponse.json({ success: true, message: "Deleted successfully" }, { status: 200 });
    }
  } catch (error) {
    console.error("DELETE sound error:", error);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
