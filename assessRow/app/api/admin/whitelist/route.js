import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
const { getDb } = require('@/lib/db');
const { splitEmail, SCHOOL_DOMAIN } = require('@/lib/roles');

export const dynamic = 'force-dynamic';

async function checkAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return false;
  }
  return true;
}

// Everyone is stored by the part before @, which is also what evaluations are stored under and what
// the score queries join on. Only @sirin.ac.th accounts can sign in (lib/roles.js), so an email
// typed here must be one.
function normalize(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return { error: 'Invalid prefix' };
  if (v.includes('@')) {
    const parts = splitEmail(v);
    if (!parts || parts.domain !== SCHOOL_DOMAIN) return { error: `ใช้ได้เฉพาะอีเมล @${SCHOOL_DOMAIN}` };
    return { prefix: parts.local };
  }
  return { prefix: v };
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const whitelist = db.prepare('SELECT prefix, role, created_at FROM whitelist ORDER BY created_at DESC').all();
    return NextResponse.json({ whitelist });
  } catch (error) {
    console.error('Whitelist GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch whitelist' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validRole = ['teacher', 'council', 'admin'].includes(body.role) ? body.role : 'teacher';
    const n = normalize(body.prefix);
    if (n.error) return NextResponse.json({ error: n.error }, { status: 400 });

    const db = getDb();
    db.prepare('INSERT INTO whitelist (prefix, role) VALUES (?, ?)').run(n.prefix, validRole);
    return NextResponse.json({ success: true, prefix: n.prefix, role: validRole });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return NextResponse.json({ error: 'Prefix already exists in whitelist' }, { status: 400 });
    }
    console.error('Whitelist POST error:', error);
    return NextResponse.json({ error: 'Failed to add prefix' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get('prefix');

    if (!prefix) {
      return NextResponse.json({ error: 'Prefix is required' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM whitelist WHERE prefix = ?').run(prefix.trim().toLowerCase());
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Whitelist DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete prefix' }, { status: 500 });
  }
}

// Change the role of an existing entry.
export async function PUT(request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { prefix, role } = await request.json();
    if (!prefix || typeof prefix !== 'string' || !['teacher', 'council', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    const key = prefix.trim().toLowerCase();
    const db = getDb();
    const r = db.prepare('UPDATE whitelist SET role = ? WHERE prefix = ?').run(role, key);
    if (!r.changes) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Whitelist PUT error:', error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}
