// Repairs video thumbnails that came out black or flat (the old "frame at 0.1 s" rule). For every
// finished video it asks the running server to look at the current still and, only when that still is
// dark or featureless, pick a new frame (POST /api/photos/images/:id/rethumb?ifDark=1). One video at a
// time, so the server is never downloading more than one video for this.
//
// Run next to the production server:
//   sudo docker exec -i next9-server node --input-type=module - < scripts/video-rethumb.mjs
// Add --dry to only list the videos whose still is dark, without changing them.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const dry = process.argv.includes("--dry");
const dataDir = process.env.NEXT9_DATA_DIR ? path.resolve(ROOT, process.env.NEXT9_DATA_DIR) : path.join(ROOT, "data");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const API = process.env.NEXT9_API || "http://127.0.0.1:8089";
const auth = env.PHOTOS_PASSWORD || "next9";

const db = new Database(path.join(dataDir, "photos.db"), { readonly: true });
const videos = db
  .prepare("SELECT id, original_name FROM images WHERE file_type = 'video' AND processing_status = 'done' AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC")
  .all();
db.close();
console.log(`[rethumb] ${videos.length} videos${dry ? " (dry run: no changes)" : ""}`);

let fixed = 0,
  fine = 0,
  failed = 0;
for (const v of videos) {
  // A dry run asks for the check only: an ifDark request with a still that is fine is skipped by the
  // server, and for a dark one we stop short of regenerating by not sending the request at all.
  if (dry) {
    const r = await fetch(`${API}/api/image/${encodeURIComponent(v.id)}/sd`, { redirect: "follow" });
    if (!r.ok) {
      console.log(`  ? ${v.id} ${v.original_name}: thumbnail not readable (${r.status})`);
      continue;
    }
    const sharp = (await import("sharp")).default;
    const st = await sharp(Buffer.from(await r.arrayBuffer())).stats();
    const ch = st.channels.slice(0, 3);
    const mean = ch.reduce((n, c) => n + c.mean, 0) / ch.length;
    const stdev = ch.reduce((n, c) => n + c.stdev, 0) / ch.length;
    const dark = mean < 24 || stdev < 12;
    if (dark) console.log(`  dark ${v.id} ${v.original_name} (brightness ${mean.toFixed(0)}, detail ${stdev.toFixed(0)})`);
    dark ? fixed++ : fine++;
    continue;
  }
  try {
    const r = await fetch(`${API}/api/photos/images/${encodeURIComponent(v.id)}/rethumb?ifDark=1`, { method: "POST", headers: { Authorization: auth } });
    const d = await r.json();
    if (!d.success) throw new Error(d.message || `HTTP ${r.status}`);
    if (d.skipped) fine++;
    else {
      fixed++;
      const b = d.before ? `brightness ${d.before.mean.toFixed(0)}, detail ${d.before.stdev.toFixed(0)}` : "unreadable";
      console.log(`  fixed ${v.id} ${v.original_name}: ${b} -> frame at ${d.after.at}s (brightness ${d.after.mean.toFixed(0)}, detail ${d.after.stdev.toFixed(0)})`);
    }
  } catch (e) {
    failed++;
    console.log(`  FAILED ${v.id} ${v.original_name}: ${e.message}`);
  }
}
console.log(`[rethumb] ${dry ? "dark" : "fixed"} ${fixed}, fine ${fine}, failed ${failed}`);
