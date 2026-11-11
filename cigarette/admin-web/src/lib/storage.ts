// Sound files in Cloudflare R2 (S3-compatible). The VPS kept uploaded sounds on its disk
// (persistent-sounds/); serverless functions have no lasting disk, so uploads go to R2.
// Players always load them through this site's /api/sounds/<file>, which reads the file from R2 and
// lets Vercel's CDN cache it, so no other domain (the bucket's public domain) is needed.
//
// Env: CF_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET (default "assets").
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export const BUCKET = process.env.R2_BUCKET || "assets";
const PREFIX = "next9/nextbreath/sounds/";

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
// What the database stores for an uploaded sound: a path on this site.
export const soundPath = (fileName: string) => `/api/sounds/${encodeURIComponent(fileName)}`;

// The file name behind a stored sound URL: /api/sounds/<file> on any host (old records kept the full
// address of the VPS) or the bucket's public URL (records saved while sounds were served from it).
export function fileFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/api\/sounds\/([^/?#]+)$/.exec(url) || /\/next9\/nextbreath\/sounds\/([^/?#]+)$/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}
export function keyFromUrl(url: string | null | undefined): string | null {
  const f = fileFromUrl(url);
  return f ? soundKey(f) : null;
}

// The address a player should use: our own /api/sounds/ on the host that answered the request, so
// it keeps working whatever domain the site moves to. Other URLs (built-in sounds) are unchanged.
export function playableUrl(url: string, origin: string) {
  const f = fileFromUrl(url);
  return f ? `${origin}${soundPath(f)}` : url;
}

export async function getSound(fileName: string) {
  const out = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: soundKey(fileName) }));
  const body = Buffer.from(await out.Body!.transformToByteArray());
  return { body, contentType: out.ContentType || "application/octet-stream" };
}

export async function putSound(fileName: string, body: Buffer, contentType: string): Promise<string> {
  await s3().send(new PutObjectCommand({ Bucket: BUCKET, Key: soundKey(fileName), Body: body, ContentType: contentType || "application/octet-stream", CacheControl: "public, max-age=31536000, immutable" }));
  return soundPath(fileName);
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
