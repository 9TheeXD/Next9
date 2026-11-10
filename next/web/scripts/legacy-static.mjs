// Static server for the pages that have not been migrated to Next.js yet.
// It serves the old site from the project root (one level up), the way nginx does in production.
//
// The project root also holds secrets and private data (.env, service-account.json, lineBot/,
// data/*.db, students.json), so this server only hands out public file types and refuses
// private paths outright instead of serving the whole directory.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORTS } from "./ports.mjs";

// The site root: one level above web/ locally; LEGACY_ROOT in the Docker container, where the site is
// mounted read-only at a separate path.
const ROOT = path.resolve(process.env.LEGACY_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
const PORT = Number(process.env.LEGACY_STATIC_PORT ?? PORTS.legacyStatic);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json; charset=utf-8",
};

// Server-side code and private data. member/ is NOT here: its pages are public (the council roster).
const BLOCKED_SEGMENTS = new Set([
  "data", "lineBot", "discordBot", "node_modules", "lib", "scripts", "web", ".git",
]);
const BLOCKED_FILES = new Set(["server.js", "query_db.js", "sync_students.js", "update_nginx.mjs"]);
// JSON sits next to private data (students.json, service-account.json, toilet_submissions.json),
// so only the files the pages actually fetch are served.
const PUBLIC_JSON = new Set(["inspectors.json", "server_start_time.json"]);

function isPrivate(rel) {
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.some((p) => p.startsWith(".") || BLOCKED_SEGMENTS.has(p))) return true;
  const name = parts[parts.length - 1] ?? "";
  if (BLOCKED_FILES.has(name)) return true;
  // The building form's room lists (forms/building/rooms/<building>.json) are public too.
  const isRoomList = parts.length === 4 && parts[0] === "forms" && parts[1] === "building" && parts[2] === "rooms" && /^\d+\.json$/.test(name);
  if (name.endsWith(".json")) return !(parts.length === 1 && PUBLIC_JSON.has(name)) && parts[0] !== "assets" && !isRoomList;
  return false;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      // nginx behaviour: a folder URL without its slash redirects to the slashed one. The Location
      // is relative so it resolves against whatever host the browser used (the gateway on :8070 or :8092).
      if (!url.pathname.endsWith("/")) {
        res.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      file = path.join(file, "index.html");
      rel = path.join(rel, "index.html");
    }
    const type = TYPES[path.extname(file).toLowerCase()];
    if (isPrivate(rel) || !type) {
      res.writeHead(404).end("Not found");
      return;
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(body);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`[legacy-static] ${ROOT} on http://127.0.0.1:${PORT}`));
