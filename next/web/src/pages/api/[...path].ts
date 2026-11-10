// Every /api/* request goes to the site's API (server/api.mjs — formerly server.js on the VPS).
// It is written against Node's (req, res), which Pages Router API routes provide unchanged; the body
// parser is off because the API reads request bodies itself (multipart, raw uploads, beacons).
import type { NextApiRequest, NextApiResponse } from "next";
import { ensureSchema, handleApi } from "../../../server/api.mjs";

export const config = {
  api: { bodyParser: false, responseLimit: false, externalResolver: true },
  // Photo processing continues after the reply (waitUntil) and needs this much time at most.
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const finished = new Promise<void>((resolve) => {
    res.on("finish", () => resolve());
    res.on("close", () => resolve());
  });
  try {
    await ensureSchema();
    await handleApi(req, res);
  } catch (e) {
    console.error("[api]", req.method, req.url, e);
    if (!res.headersSent) res.status(500).json({ success: false, message: "Server error" });
    else res.end();
  }
  // Route handlers inside the API often answer from a callback (req.on("end")) after handleApi
  // returned; the invocation must stay open until the response is actually sent.
  await finished;
}
