// Copies the legacy (not yet migrated) static pages into public/ before `next build` / `next dev`,
// so Vercel serves them as static files. On the VPS nginx served them from the project root; locally
// scripts/legacy-static.mjs did. Same filter as legacy-static.mjs: only public file types, never the
// server code or private data that sits in the same folder.
//
// Folder URLs (/forms/building/) map to their index.html through the fallback rewrites in
// next.config.ts. The copied files are generated: they are listed in .gitignore, edit the originals
// one level up (next/forms, next/viewforms, ...).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
const OUT = path.join(WEB, "public");

const EXTS = new Set([".html", ".css", ".js", ".mjs", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".webmanifest", ".json"]);
const BLOCKED_SEGMENTS = new Set(["data", "data-dev", "lineBot", "discordBot", "node_modules", "lib", "scripts", "web", "member"]);
const BLOCKED_FILES = new Set(["server.js", "query_db.js", "sync_students.js", "update_nginx.mjs", "package.json", "package-lock.json"]);
// Private data sits next to the pages as JSON; only these JSON files are public.
function jsonAllowed(parts) {
  const name = parts[parts.length - 1];
  if (parts[0] === "assets") return true;
  return parts.length === 4 && parts[0] === "forms" && parts[1] === "building" && parts[2] === "rooms" && /^\d+\.json$/.test(name);
}

const copied = [];
function walk(rel) {
  const abs = path.join(ROOT, rel);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const childRel = rel ? path.join(rel, entry.name) : entry.name;
    const parts = childRel.split(path.sep);
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      if (BLOCKED_SEGMENTS.has(entry.name)) continue;
      walk(childRel);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTS.has(ext) || BLOCKED_FILES.has(entry.name)) continue;
    if (ext === ".json" && !jsonAllowed(parts)) continue;
    const dest = path.join(OUT, childRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, childRel), dest);
    copied.push(childRel);
  }
}

walk("");

// ShiftManager (duty check-in, ../../ShiftManager) is served by this site at /duty/, so its photo
// uploads go to the same origin. Only the web pages: not the Apps Script source, archive or docs.
const SHIFT = path.resolve(WEB, "..", "..", "ShiftManager");
const SHIFT_SKIP = new Set(["apps-script", "archive", "README.md", ".env", ".gitignore", ".nojekyll"]);
function copyShift(rel) {
  const abs = path.join(SHIFT, rel);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SHIFT_SKIP.has(entry.name)) continue;
    const childRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) { copyShift(childRel); continue; }
    if (!EXTS.has(path.extname(entry.name).toLowerCase())) continue;
    const dest = path.join(OUT, "duty", childRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(SHIFT, childRel), dest);
    copied.push(path.join("duty", childRel));
  }
}
if (fs.existsSync(SHIFT)) copyShift("");
// The old pages poll this to reload themselves after a deploy.
fs.writeFileSync(path.join(OUT, "server_start_time.json"), JSON.stringify({ version: Date.now() }));
// Folders that hold an index.html, for the slash redirects in next.config.ts.
const dirs = [...new Set(copied.filter((f) => path.basename(f) === "index.html").map((f) => path.dirname(f)).filter((d) => d !== "."))];
fs.writeFileSync(path.join(WEB, "legacy-dirs.json"), JSON.stringify(dirs.sort(), null, 2) + "\n");
console.log(`[legacy] copied ${copied.length} files into public/ (${dirs.length} page folders)`);
