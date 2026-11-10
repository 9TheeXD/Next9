import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
const { getDb } = require('@/lib/db');
const { RULE_ROLES, LOCAL_KINDS, getRules, resolveRole } = require('@/lib/roles');

export const dynamic = 'force-dynamic';

// Email rules for Google sign-in (see lib/roles.js). GET lists them; ?test=<email> also says which
// role that email would get. POST adds, PUT edits or reorders, DELETE removes.

async function isAdmin() {
  const session = await getServerSession(authOptions);
  return !!session && session.user.role === 'admin';
}
const bad = (message, status = 400) => NextResponse.json({ success: false, message }, { status });

function parseRule(b) {
  const local_kind = LOCAL_KINDS.includes(b?.local_kind) ? b.local_kind : null;
  if (!local_kind) return { error: 'รูปแบบชื่อไม่ถูกต้อง' };
  const local_value = String(b.local_value || '').trim().toLowerCase().slice(0, 60);
  if ((local_kind === 'starts' || local_kind === 'contains') && !local_value) return { error: 'ใส่ข้อความที่ชื่อต้องขึ้นต้นหรือมี' };
  // Every account is @sirin.ac.th (see lib/roles.js), so rules only look at the name.
  const domain = '';
  const role = RULE_ROLES.includes(b.role) ? b.role : null;
  if (!role) return { error: 'บทบาทไม่ถูกต้อง' };
  return { rule: { local_kind, local_value: local_kind === 'starts' || local_kind === 'contains' ? local_value : '', domain, role } };
}

export async function GET(request) {
  if (!(await isAdmin())) return bad('Unauthorized', 401);
  const db = getDb();
  const test = new URL(request.url).searchParams.get('test');
  const body = { rules: getRules(db) };
  if (test) body.test = { email: test, result: resolveRole(db, test) };
  return NextResponse.json(body);
}

export async function POST(request) {
  if (!(await isAdmin())) return bad('Unauthorized', 401);
  const p = parseRule(await request.json().catch(() => null));
  if (p.error) return bad(p.error);
  const db = getDb();
  const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM email_rules').get().m;
  const r = p.rule;
  db.prepare('INSERT INTO email_rules (local_kind, local_value, domain, role, position) VALUES (?, ?, ?, ?, ?)').run(r.local_kind, r.local_value, r.domain, r.role, max + 1);
  return NextResponse.json({ success: true, rules: getRules(db) });
}

// { id, ...rule } edits one rule; { order: [id, id, ...] } sets the checking order.
export async function PUT(request) {
  if (!(await isAdmin())) return bad('Unauthorized', 401);
  const b = await request.json().catch(() => null);
  const db = getDb();
  if (Array.isArray(b?.order)) {
    const set = db.prepare('UPDATE email_rules SET position = ? WHERE id = ?');
    db.transaction(() => b.order.forEach((id, i) => set.run(i + 1, Number(id))))();
    return NextResponse.json({ success: true, rules: getRules(db) });
  }
  const p = parseRule(b);
  if (p.error) return bad(p.error);
  const r = p.rule;
  const res = db.prepare('UPDATE email_rules SET local_kind = ?, local_value = ?, domain = ?, role = ? WHERE id = ?').run(r.local_kind, r.local_value, r.domain, r.role, Number(b.id));
  if (!res.changes) return bad('ไม่พบกฎนี้', 404);
  return NextResponse.json({ success: true, rules: getRules(db) });
}

export async function DELETE(request) {
  if (!(await isAdmin())) return bad('Unauthorized', 401);
  const id = Number(new URL(request.url).searchParams.get('id'));
  const db = getDb();
  const res = db.prepare('DELETE FROM email_rules WHERE id = ?').run(id);
  if (!res.changes) return bad('ไม่พบกฎนี้', 404);
  return NextResponse.json({ success: true, rules: getRules(db) });
}
