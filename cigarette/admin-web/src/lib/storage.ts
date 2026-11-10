// Sound files in Cloudflare R2 (S3-compatible), served from the bucket's public domain.
// The VPS kept uploaded sounds on its disk (persistent-sounds/); serverless functions have no lasting
// disk, so uploads go to R2 and the old /api/sounds/<file> links redirect there.
//
// Env: CF_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET (default "assets"),
//      SOUNDS_PUBLIC_BASE_URL (public domain of the bucket, default https://cdn.yumistack.net)
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const BUCKET = process.env.R2_BUCKET || "assets";
const PREFIX = "next9/nextbreath/sounds/";
const PUBLIC_BASE = (process.env.SOUNDS_PUBLIC_BASE_URL || "https://cdn.yumistack.net").replace(/\/+$/, "");

let client: S3Client | null = null;
function s3() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY || "",
        secretAccessKey: process.env.R2_SECRET_KEY || "",
      },
    });
  }
  return client;
}

export const soundKey = (fileName: string) => PREFIX + fileName;
export const soundPublicUrl = (fileName: string) => `${PUBLIC_BASE}/${soundKey(fileName)}`;

// The R2 key behind a stored sound URL (new public URLs, and the old /api/sounds/<file> links).
export function keyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(PUBLIC_BASE + "/")) return url.slice(PUBLIC_BASE.length + 1);
  const m = /\/api\/sounds\/([^/?#]+)$/.exec(url);
  return m ? soundKey(decodeURIComponent(m[1])) : null;
}

export async function putSound(fileName: string, body: Buffer, contentType: string): Promise<string> {
  await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: soundKey(fileName), Body: body, ContentType: contentType || "application/octet-stream", CacheControl: "public, max-age=31536000, immutable" }));
  return soundPublicUrl(fileName);
}

export async function deleteSoundByUrl(url: string | null | undefined) {
  const key = keyFromUrl(url);
  if (!key || !key.startsWith(PREFIX)) return;
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (e) {
    console.error("Failed to delete old sound from R2:", e);
  }
}
