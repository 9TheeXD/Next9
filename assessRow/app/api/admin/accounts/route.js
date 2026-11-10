import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
const { getDb } = require('@/lib/db');
const { USERNAME_RE, hashPassword, listAccounts, passwordProblem } = require('@/lib/adminAccounts');

export const dynamic = 'force-dynamic';

// Admin accounts for the username/password form (see lib/adminAccounts.js).
// GET lists them, POST { username, displayName, password } adds one,
// PUT { username, displayName?, password? } changes the name or password, DELETE ?username= removes.

async function adminSession() {
  const session = await getServerSession(authOptions);
  return session && session.user.role === 'admin' ? session : null;
}
const bad = (message, status = 400) => NextResponse.json({ success: false, message }, { status });
const cleanName = (v) => String(v || '').trim().slice(0, 60);

function payload(db, session) {
  return {
    success: true,
    accounts: listAccounts(db),
    envUsername: (process.env.ADMIN_USERNAME || '').toLowerCase() || null,
    me: session.user.prefix || null,
  };
}

export async function GET() {
  const session = await adminSession();
  if (!session) return bad('Unauthorized', 401);
  return NextResponse.json(payload(getDb(), session));
}

export async function POST(request) {
  const session = await adminSession();
  if (!session) return bad('Unauthorized', 401);
  const b = (await request.json().catch(() => null)) || {};
  const username = String(b.username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return bad('ชื่อผู้ใช้ใช้ a-z 0-9 . _ - ยาว 3–32 ตัว');
  if (username === (process.env.ADMIN_USERNAME || '').toLowerCase()) return bad('ชื่อนี้ใช้กับบัญชีหลักใน .env แล้ว');
  const problem = passwordProblem(b.password);
  if (problem) return bad(problem);
  const db = getDb();
  try {
    db.prepare('INSERT INTO admin_accounts (username, display_name, password_hash) VALUES (?, ?, ?)').run(username, cleanName(b.displayName), hashPassword(b.password));
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return bad('มีชื่อผู้ใช้นี้แล้ว');
    throw e;
  }
  return NextResponse.json(payload(db, session));
}

export async function PUT(request) {
  const session = await adminSession();
  if (!session) return bad('Unauthorized', 401);
  const b = (await request.json().catch(() => null)) || {};
  const username = String(b.username || '').trim().toLowerCase();
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM admin_accounts WHERE username = ?').get(username)) return bad('ไม่พบบัญชีนี้', 404);
  if (b.displayName !== undefined) db.prepare('UPDATE admin_accounts SET display_name = ? WHERE username = ?').run(cleanName(b.displayName), username);
  if (b.password !== undefined) {
    const problem = passwordProblem(b.password);
    if (problem) return bad(problem);
    db.prepare('UPDATE admin_accounts SET password_hash = ? WHERE username = ?').run(hashPassword(b.password), username);
  }
  return NextResponse.json(payload(db, session));
}

export async function DELETE(request) {
  const session = await adminSession();
  if (!session) return bad('Unauthorized', 401);
  const username = String(new URL(request.url).searchParams.get('username') || '').trim().toLowerCase();
  const db = getDb();
  const r = db.prepare('DELETE FROM admin_accounts WHERE username = ?').run(username);
  if (!r.changes) return bad('ไม่พบบัญชีนี้', 404);
  return NextResponse.json(payload(db, session));
}
