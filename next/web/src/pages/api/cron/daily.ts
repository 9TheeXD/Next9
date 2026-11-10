// Vercel cron (vercel.json, once a day): trash purge, stuck photo processing, table cleanup.
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project.
import type { NextApiRequest, NextApiResponse } from "next";
import { runDailyMaintenance } from "../../../../server/api.mjs";

export const config = { maxDuration: 300 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ success: false });
  try {
    const result = await runDailyMaintenance();
    res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error("[cron/daily]", e);
    res.status(500).json({ success: false, message: e instanceof Error ? e.message : String(e) });
  }
}
