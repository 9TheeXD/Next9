// One-time: copies the sounds the VPS kept on disk (persistent-sounds/) to R2, where the app serves
// them from now on (src/lib/storage.ts). Old /api/sounds/<file> links redirect to the same files.
//
//   CF_ACCOUNT_ID=... R2_ACCESS_KEY=... R2_SECRET_KEY=... R2_BUCKET=assets node scripts/upload-sounds.mjs [dir]
import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const dir = path.resolve(process.argv[2] || "persistent-sounds");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY },
});
const types = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".webm": "audio/webm", ".m4a": "audio/mp4", ".mp4": "audio/mp4" };
for (const f of fs.readdirSync(dir)) {
  const file = path.join(dir, f);
  if (!fs.statSync(file).isFile()) continue;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET || "assets",
    Key: `next9/nextbreath/sounds/${f}`,
    Body: fs.readFileSync(file),
    ContentType: types[path.extname(f).toLowerCase()] || "application/octet-stream",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  console.log("uploaded", f);
}
