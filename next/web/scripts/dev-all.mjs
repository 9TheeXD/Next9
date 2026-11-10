// Local development stack (`npm run dev`). Open http://localhost:8070 (or this machine's LAN IP).
//   - server.js API on :8089, with NEXT9_DEV_READONLY=1 so nothing reaches the real R2 bucket or
//     the council's Google Sheets, and NEXT9_DATA_DIR=data-dev so nothing reaches the production data
//   - the legacy static pages on :8072
//   - Next.js dev on :8071
//   - the gateway on :8070, routing like nginx does in production
// Ctrl+C stops all four. Ports: scripts/ports.mjs.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORTS } from "./ports.mjs";
import { runStack } from "./stack.mjs";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");

// First run: give the dev server a copy of the production data to work on (no-op once data-dev exists).
execFileSync("node", ["scripts/db-seed-dev.mjs"], { cwd: ROOT, stdio: "inherit" });

runStack(
  [
    // Own data directory: ./data is production's, synced with the VPS (see the Data directory note in server.js).
    { name: "api", cmd: "node", args: ["server.js"], cwd: ROOT, env: { NEXT9_DEV_READONLY: "1", NEXT9_DATA_DIR: "data-dev" } },
    { name: "legacy", cmd: "node", args: ["scripts/legacy-static.mjs"], cwd: WEB },
    { name: "next", cmd: "npx", args: ["next", "dev", "-p", String(PORTS.devNext), "-H", "127.0.0.1"], cwd: WEB },
    { name: "gateway", cmd: "node", args: ["scripts/gateway.mjs"], cwd: WEB, env: { GATEWAY_PORT: String(PORTS.devGateway), NEXT_PORT: String(PORTS.devNext) } },
  ],
  "dev servers",
);
