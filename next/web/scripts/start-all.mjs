// Production stack (`npm start`, after `npm run build`). Open http://localhost:8092.
//   - Next.js production server on :8093
//   - the gateway on :8092: /api/* to the production API, everything else to Next.js
//   - the legacy static pages on :8072, unless a dev stack already serves them
//
// The production API is the VPS (PROD_API_ORIGIN, default https://next9.yumistack.net): its server.js
// is the only writer of the production database, so this local copy of the site shows and changes
// exactly what the live site does, with no database of its own to keep in sync. On the VPS itself,
// run it with PROD_API_ORIGIN=http://127.0.0.1:8089. server.js is never started here; a local :8089
// is the dev stack's, on data-dev. Ports: scripts/ports.mjs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORTS } from "./ports.mjs";
import { portInUse, runStack } from "./stack.mjs";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_ORIGIN = process.env.PROD_API_ORIGIN || "https://next9.yumistack.net";

const procs = [
  // LEGACY_API_ORIGIN: server-side fetches (link-preview metadata) read the same API.
  { name: "next", cmd: "npx", args: ["next", "start", "-p", String(PORTS.prodNext), "-H", "127.0.0.1"], cwd: WEB, env: { LEGACY_API_ORIGIN: API_ORIGIN } },
  { name: "gateway", cmd: "node", args: ["scripts/gateway.mjs"], cwd: WEB, env: { GATEWAY_PORT: String(PORTS.prodGateway), NEXT_PORT: String(PORTS.prodNext), API_ORIGIN } },
];
if (!(await portInUse(PORTS.legacyStatic))) procs.push({ name: "legacy", cmd: "node", args: ["scripts/legacy-static.mjs"], cwd: WEB });
console.log(`[start] API: ${API_ORIGIN}`);

runStack(procs, "production servers");
