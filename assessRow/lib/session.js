// getServerSession, plus one more way to be an admin: the NEXT9 admin page calls these APIs from its
// server with `Authorization: Bearer <secret>`, so the council manages this system from NEXT9's
// /admin/ without signing in twice.
// Without NEXT9_ASSESS_SECRET, both projects derive the same secret from the R2 key they already
// share (R2_SECRET_KEY), so nothing extra has to be set up.
import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { getServerSession as nextAuthSession } from 'next-auth/next';

export function integrationSecret() {
  if (process.env.NEXT9_ASSESS_SECRET) return process.env.NEXT9_ASSESS_SECRET;
  const r2 = process.env.R2_SECRET_KEY || '';
  return r2 ? crypto.createHash('sha256').update(`next9-assess-integration:${r2}`).digest('hex') : '';
}

export function integrationSecretOk(authorization) {
  const secret = integrationSecret();
  return secret.length >= 16 && authorization === `Bearer ${secret}`;
}

export async function getServerSession(authOptions) {
  try {
    const h = await headers();
    if (integrationSecretOk(h.get('authorization'))) {
      return { user: { role: 'admin', email: 'next9-admin', name: 'หน้าจัดการ NEXT9' } };
    }
  } catch {}
  return nextAuthSession(authOptions);
}
