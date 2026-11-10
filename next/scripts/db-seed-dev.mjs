// Seeds ./data-dev (the local dev server's data directory) from ./data (the production data, which
// Syncthing keeps in step with the VPS).
//
//   node scripts/db-seed-dev.mjs          create data-dev if it does not exist yet
//   node scripts/db-seed-dev.mjs --force  replace data-dev with a fresh copy
//
// The production files are only ever copied, never opened: opening a SQLite database in WAL mode
// writes to its -shm file (and may checkpoint into the .db), and Syncthing would send that change to
// the VPS while the production server has the same database open. Each .db is copied together with its
// -wal so transactions not yet checkpointed come along; the copy is then checkpointed and checked
// on this side, in data-dev.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data");
const DEST = path.join(ROOT, "data-dev");
const force = process.argv.includes("--force");

if (!fs.existsSync(SRC)) {
  console.error(`[seed] ${SRC} does not exist: nothing to copy.`);
  process.exit(1);
}
if (fs.existsSync(DEST)) {
  if (!force) {
    console.log(`[seed] ${DEST} already exists; leaving it as it is (--force replaces it).`);
    process.exit(0);
  }
  fs.rmSync(DEST, { recursive: true, force: true });
}
fs.mkdirSync(DEST, { recursive: true });

const entries = fs.readdirSync(SRC, { withFileTypes: true }).filter((e) => e.isFile());
const isConflict = (name) => name.includes(".sync-conflict-");
const dbs = entries.map((e) => e.name).filter((n) => n.endsWith(".db") && !isConflict(n));
const others = entries.map((e) => e.name).filter((n) => !/\.db(-wal|-shm)?$/.test(n) && !isConflict(n));

for (const name of dbs) {
  fs.copyFileSync(path.join(SRC, name), path.join(DEST, name));
  const wal = path.join(SRC, name + "-wal");
  if (fs.existsSync(wal)) fs.copyFileSync(wal, path.join(DEST, name + "-wal"));
  const db = new Database(path.join(DEST, name));
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    const check = db.pragma("quick_check", { simple: true });
    console.log(`[seed] ${name}: ${check}`);
    if (check !== "ok") console.warn(`[seed] ${name} copy is damaged; the production file may have been mid-write. Run again with --force.`);
  } finally {
    db.close();
  }
}
for (const name of others) fs.copyFileSync(path.join(SRC, name), path.join(DEST, name));
console.log(`[seed] ${dbs.length} databases and ${others.length} other files copied to ${DEST}`);
