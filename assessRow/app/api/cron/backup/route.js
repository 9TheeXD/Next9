// Vercel cron (vercel.json, once a day): copies the database to R2 (lib/backup.js).
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project.
import { NextResponse } from 'next/server';

const { runBackup } = require('@/lib/backup');

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, ...(await runBackup()) });
  } catch (e) {
    console.error('[cron/backup]', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
