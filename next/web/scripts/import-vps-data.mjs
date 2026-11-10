// Moves the VPS data into the single database the serverless site uses.
//
//   node scripts/import-vps-data.mjs [--from ../data] [--root ..] [--out ../data-dev/next9.db]
//   node scripts/import-vps-data.mjs --turso          # write straight to TURSO_DATABASE_URL instead
//
// Reads (copy them from the VPS first; nothing here connects to it):
//   <from>/building.db, photos.db, pinkbook.db                 SQLite databases
//   <from>/inert_config.json, pinkbook_config.json, submit_inert.json
//   <root>/toilet_config.json, toilet_submissions.json, students.json, inspectors.json
// Writes every table (schema from server/schema.mjs) and the JSON files as kv_store rows.
//
// Recommended: build the file locally, then upload it with the Turso CLI, which is much faster than
// row inserts over the network:
//   node scripts/import-vps-data.mjs --out ./next9.db
//   turso db create next9 --from-file ./next9.db
//
// Running it again replaces the rows (INSERT OR REPLACE). For the final import add --reset, which
// empties every table first so nothing created while testing remains.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { SCHEMA_SQL } from "../server/schema.mjs";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const FROM = path.resolve(opt("--from", path.join(WEB, "..", "data")));
const ROOT = path.resolve(opt("--root", path.join(WEB, "..")));
const OUT = path.resolve(opt("--out", path.join(WEB, "..", "data-dev", "next9.db")));
const toTurso = args.includes("--turso");

let dest;
if (toTurso) {
  if (!process.env.TURSO_DATABASE_URL) throw new Error("TURSO_DATABASE_URL is not set");
  dest = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  console.log(`[import] -> ${process.env.TURSO_DATABASE_URL}`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  dest = createClient({ url: "file:" + OUT });
  console.log(`[import] -> ${OUT}`);
}

// --reset: empty every table first, so rows created while testing the new site do not survive the
// final import (INSERT OR REPLACE alone keeps them).
if (args.includes("--reset")) {
  const tables = (await dest.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'")).rows.map((r) => r.name);
  await dest.batch(["PRAGMA foreign_keys = OFF", ...tables.map((t) => `DELETE FROM "${t}"`)], "write");
  console.log(`[import] --reset: emptied ${tables.length} tables`);
}
await dest.executeMultiple(SCHEMA_SQL);
for (const sql of ["ALTER TABLE images ADD COLUMN upload_run TEXT"]) {
  try { await dest.execute(sql); } catch {}
}

async function copyDb(file) {
  const src = path.join(FROM, file);
  if (!fs.existsSync(src)) {
    console.warn(`[import] ${src} not found, skipped`);
    return;
  }
  const db = createClient({ url: "file:" + src });
  const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => r.name);
  for (const table of tables) {
    const destCols = new Set((await dest.execute(`PRAGMA table_info("${table}")`)).rows.map((r) => r.name));
    let offset = 0, total = 0;
    for (;;) {
      const page = await db.execute(`SELECT * FROM "${table}" LIMIT 500 OFFSET ${offset}`);
      if (!page.rows.length) break;
      const cols = page.columns.filter((c) => destCols.has(c));
      const sql = `INSERT OR REPLACE INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      await dest.batch(page.rows.map((row) => ({ sql, args: cols.map((c) => row[c] ?? null) })), "write");
      total += page.rows.length;
      offset += page.rows.length;
    }
    console.log(`[import] ${file}:${table} ${total} rows`);
  }
  db.close();
}

for (const f of ["building.db", "photos.db", "pinkbook.db"]) await copyDb(f);

// Serverless hosting does not transcode videos: quality versions that were still waiting are dropped
// (finished ones stay and are still offered), and photos caught mid-processing start over.
await dest.execute("DELETE FROM video_renditions WHERE status != 'done' OR r2_key IS NULL");
await dest.execute("UPDATE images SET processing_status = 'pending', processing_started_at = NULL WHERE processing_status = 'processing'");

const kvFiles = [
  ["inert_config", path.join(FROM, "inert_config.json")],
  ["pinkbook_config", path.join(FROM, "pinkbook_config.json")],
  ["submit_inert", path.join(FROM, "submit_inert.json")],
  ["toilet_config", path.join(ROOT, "toilet_config.json")],
  ["toilet_submissions", path.join(ROOT, "toilet_submissions.json")],
  ["students", path.join(ROOT, "students.json")],
  ["inspectors", path.join(ROOT, "inspectors.json")],
];
for (const [key, file] of kvFiles) {
  if (!fs.existsSync(file)) {
    console.warn(`[import] ${file} not found, kv "${key}" skipped`);
    continue;
  }
  const value = JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8")));
  await dest.execute({
    sql: "INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    args: [key, value, Date.now()],
  });
  console.log(`[import] kv ${key} <- ${path.basename(file)} (${(value.length / 1024).toFixed(0)} KB)`);
}
// Schema is already current: the API skips its setup step.
await dest.execute({ sql: "INSERT INTO kv_store (key, value, updated_at) VALUES ('schema_version', '2', ?) ON CONFLICT(key) DO UPDATE SET value = '2'", args: [Date.now()] });
dest.close();
console.log("[import] done");
