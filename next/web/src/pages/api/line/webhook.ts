// LINE Messaging API webhook. Set the channel's Webhook URL to https://<site>/api/line/webhook.
import type { NextApiRequest, NextApiResponse } from "next";
import { handleWebhook, verifySignature } from "../../../../server/line.mjs";

export const config = { api: { bodyParser: false }, maxDuration: 300 };

async function rawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(200).send("LINE webhook");
  const body = await rawBody(req);
  if (!verifySignature(body, String(req.headers["x-line-signature"] || ""))) return res.status(401).end();
  try {
    await handleWebhook(JSON.parse(body));
  } catch (e) {
    console.error("[LINE webhook]", e);
  }
  res.status(200).json({ ok: true });
}
