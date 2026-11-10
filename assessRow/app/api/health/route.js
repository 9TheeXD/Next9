// GET /api/health: is the database reachable with this deployment's settings? Shows only which
// settings are present (never their values) and the first error, for checking a new deployment.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');

export async function GET() {
  const env = Object.fromEntries(
    ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'JWT_SECRET_KEY', 'CRON_SECRET', 'CF_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY']
      .map((k) => [k, !!process.env[k]])
  );
  try {
    const row = await getDb().prepare('SELECT COUNT(*) AS n FROM evaluations').get();
    return NextResponse.json({ ok: true, evaluations: row.n, env });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e && e.message || e).slice(0, 300), env }, { status: 500 });
  }
}
