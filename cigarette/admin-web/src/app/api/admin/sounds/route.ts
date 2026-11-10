import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";

// Ensure env vars exist
const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-southeast-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "MOCK_KEY",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "MOCK_SECRET",
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "nextbreath-sounds";

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
    
    let url = "";
    
    // Check if AWS is configured
    const isAwsConfigured = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID !== "MOCK_KEY";

    if (isAwsConfigured) {
      const key = `sounds/${fileName}`;
      // Upload to S3
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: fileBuffer,
          ContentType: file.type || "audio/wav",
        })
      );
      // Construct URL
      url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || "ap-southeast-1"}.amazonaws.com/${key}`;
    } else {
      // Fallback to local file system
      const publicDir = path.join(process.cwd(), "public", "sounds");
      await fs.mkdir(publicDir, { recursive: true });
      const filePath = path.join(publicDir, fileName);
      await fs.writeFile(filePath, fileBuffer);
      // Build absolute URL via API route (Next.js doesn't serve post-build static files)
      const host = request.headers.get("host") || "localhost:7011";
      url = `https://${host}/api/sounds/${fileName}`;
    }

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
