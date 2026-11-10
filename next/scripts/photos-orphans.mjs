// Finds photo rows whose original file is not in R2 (orphans), and with --apply moves them to the trash.
//
// Orphans came from the time the local dev server wrote the production database through Syncthing:
// its uploads were stored only in the laptop's .dev-r2 folder, so production got rows for files that
// were never in the bucket. They show as broken tiles and fail processing forever.
//
// Run it on the machine that owns the database, next to the running server (SQLite coordinates the
// two processes through its own locks; never run it against a copy that a file sync will carry back):
//
//   sudo docker exec -i next9-server node --input-type=module - < scripts/photos-orphans.mjs            # report
//   sudo docker exec -i next9-server node --input-type=module - --apply < scripts/photos-orphans.mjs    # clean up
//
// Only a definite 404 from R2 counts as missing; any other answer (network error, 403, 5xx) leaves the
// row alone and is reported. --apply first writes a consistent backup of the database (SQLite online
// backup) and a JSON list of the rows it changes to data/backup/, then soft-deletes them exactly like
// the delete button does, so they sit in the trash for 30 days and can still be inspected.
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const apply = process.argv.includes("--apply");
const dataDir = process.env.NEXT9_DATA_DIR ? path.resolve(ROOT, process.env.NEXT9_DATA_DIR) : path.join(ROOT, "data");
const ORPHAN_NOTE = "ORPHAN: original file missing from R2";

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { CF_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET } = env;
if (!CF_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET) throw new Error("R2 credentials missing from .env");

const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// HEAD with a SigV4 query signature (same scheme as presignR2Get in server.js). Resolves the status code.
function headR2(key) {
  const host = `${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const uri = `/${R2_BUCKET}/${key.split("/").map(rfc3986).join("/")}`;
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${R2_ACCESS_KEY}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "300",
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(params).sort().map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`).join("&");
  const canonical = ["HEAD", uri, query, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, crypto.createHash("sha256").update(canonical).digest("hex")].join("\n");
  const hmac = (k, m) => crypto.createHmac("sha256", k).update(m).digest();
  const kSigning = hmac(hmac(hmac(hmac("AWS4" + R2_SECRET_KEY, dateStamp), "auto"), "s3"), "aws4_request");
  const sig = crypto.createHmac("sha256", kSigning).update(toSign).digest("hex");
  return new Promise((resolve) => {
    const req = https.request({ host, method: "HEAD", path: `${uri}?${query}&X-Amz-Signature=${sig}`, timeout: 20000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(0));
    req.end();
  });
}

const db = new Database(path.join(dataDir, "photos.db"));
db.pragma("busy_timeout = 15000");
const rows = db
  .prepare("SELECT id, album_id, original_name, r2_key_original, processing_status, created_at FROM images WHERE original_name NOT LIKE '[DELETED] %'")
  .all();
console.log(`[orphans] ${dataDir}/photos.db — checking ${rows.length} photos against R2 bucket "${R2_BUCKET}"`);

const missing = [];
const unknown = [];
let next = 0;
async function worker() {
  while (next < rows.length) {
    const row = rows[next++];
    if (!row.r2_key_original) {
      missing.push(row);
      continue;
    }
    let status = await headR2(row.r2_key_original);
    if (status !== 200 && status !== 404) status = await headR2(row.r2_key_original); // one retry for blips
    if (status === 404) missing.push(row);
    else if (status !== 200) unknown.push({ ...row, status });
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const fmt = (r) => `  ${r.id}  album=${r.album_id}  ${r.processing_status}  ${new Date(r.created_at).toISOString()}  ${r.original_name}`;
console.log(`[orphans] missing from R2: ${missing.length}`);
missing.forEach((r) => console.log(fmt(r)));
if (unknown.length) {
  console.log(`[orphans] could not check (left alone): ${unknown.length}`);
  unknown.forEach((r) => console.log(fmt(r) + `  status=${r.status}`));
}
if (!apply) {
  console.log(missing.length ? "[orphans] report only; run again with --apply to move them to the trash" : "[orphans] nothing to do");
  process.exit(0);
}
if (!missing.length) {
  console.log("[orphans] nothing to do");
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(dataDir, "backup");
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `photos-before-orphans-${stamp}.db`);
await db.backup(backupFile);
fs.writeFileSync(path.join(backupDir, `orphans-${stamp}.json`), JSON.stringify(missing, null, 2));
console.log(`[orphans] backup: ${backupFile}`);

const now = Date.now();
const trash = db.prepare(
  "UPDATE images SET original_name = '[DELETED] ' || original_name, deleted_at = ?, trash_root_id = NULL, last_error = ? WHERE id = ? AND original_name NOT LIKE '[DELETED] %'",
);
// Same bookkeeping the delete endpoint does, once per touched album.
const count = db.prepare("SELECT COUNT(*) AS cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'");
const latest = db.prepare("SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1");
const setAlbum = db.prepare("UPDATE albums SET photo_count = ?, cover_image_id = ?, updated_at = ? WHERE id = ?");
const changed = db.transaction(() => {
  let n = 0;
  for (const r of missing) n += trash.run(now, ORPHAN_NOTE, r.id).changes;
  for (const albumId of new Set(missing.map((r) => r.album_id))) {
    setAlbum.run(count.get(albumId).cnt, latest.get(albumId)?.id ?? null, now, albumId);
  }
  return n;
})();
db.close();
console.log(`[orphans] moved ${changed} rows to the trash`);
