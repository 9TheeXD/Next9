// Front door for the dev (:8070) and production (:8092) stacks, doing what nginx does in front of the
// site: /api/* goes to server.js streamed untouched; everything else goes to Next.js (dev :8071 /
// production :8093), which falls back to the legacy pages where nothing is migrated.
//
// Where /api goes: API_ORIGIN when set (the production stack sets it to the VPS, so local prod shows
// and changes the one real database), else the local server.js on :8089 (the dev stack's, on data-dev).
//
// Why not let Next.js proxy /api itself: Next.js buffers the body of every request it proxies in
// memory with a 10 MB cap, so photo and video uploads through it were cut off and failed. Piping
// here never holds a body, exactly like nginx in production.
import http from "node:http";
import https from "node:https";
import net from "node:net";

import { PORTS } from "./ports.mjs";

const PORT = Number(process.env.GATEWAY_PORT ?? PORTS.devGateway);
const API_URL = new URL(process.env.API_ORIGIN || `http://127.0.0.1:${process.env.LEGACY_API_PORT ?? PORTS.api}`);
const API_TLS = API_URL.protocol === "https:";
const API = { host: API_URL.hostname, port: Number(API_URL.port || (API_TLS ? 443 : 80)), remote: !!process.env.API_ORIGIN };
const NEXT = { host: "127.0.0.1", port: Number(process.env.NEXT_PORT ?? PORTS.devNext) };

function targetFor(url = "/") {
  const pathname = url.split("?")[0];
  if (pathname.startsWith("/api/")) return API;
  // Every page goes through Next.js; next.config.ts sends pages it does not render to the legacy files.
  return NEXT;
}

const server = http.createServer((req, res) => {
  const target = targetFor(req.url);
  const headers = { ...req.headers, "x-forwarded-for": req.socket.remoteAddress ?? "" };
  // A remote API (the VPS behind nginx) routes by Host, so it must see its own name, not localhost.
  if (target === API && API.remote) headers.host = API_URL.host;
  const client = target === API && API_TLS ? https : http;
  const upstream = client.request(
    { host: target.host, port: target.port, method: req.method, path: req.url, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`gateway: ${target === API ? `server.js (${API_URL.origin})` : "Next.js"} unreachable (${err.code ?? err.message})`);
  });
  req.pipe(upstream);
});

// WebSocket upgrades (Next.js hot reload) are passed straight through as raw sockets.
server.on("upgrade", (req, socket, head) => {
  const target = targetFor(req.url);
  const upstream = net.connect(target.port, target.host, () => {
    const headers = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

// 0.0.0.0 so other devices on the network (a phone) can reach the site by this machine's IP.
const HOST = process.env.GATEWAY_HOST ?? "0.0.0.0";
server.listen(PORT, HOST, async () => {
  const { networkInterfaces } = await import("node:os");
  const lan = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  console.log(`listening on ${HOST}:${PORT}  (api ${API_URL.origin}, next :${NEXT.port})`);
  console.log(`open http://localhost:${PORT}${lan.length ? "  or  " + lan.join("  ") : ""}`);
});
