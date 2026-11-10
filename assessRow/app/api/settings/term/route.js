import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
const { getDb } = require('@/lib/db');
const { getTerms, getCurrentTerm, validateTerm } = require('@/lib/terms');
const { getLogicalDateString } = require('@/lib/config');

export const dynamic = 'force-dynamic';

async function payload(db) {
  const today = getLogicalDateString();
  const terms = await getTerms(db);
  const { term, mode } = await getCurrentTerm(db, today, terms);
  return { success: true, currentTerm: term ? term.id : null, currentMode: mode, today, terms };
}

export async function GET() {
  try {
    return NextResponse.json(await payload(getDb()));
  } catch (error) {
    console.error('Failed to get term settings:', error);
    return NextResponse.json({ success: false, currentTerm: null, terms: [] }, { status: 500 });
  }
}

function readTerm(b) {
  return {
    semester: Number(b.semester),
    year: Number(b.year),
    startDate: String(b.startDate || ''),
    endDate: String(b.endDate || ''),
    showOnHome: b.showOnHome !== false,
  };
}

// Admin changes:
//   { term: id | 'auto' }                                   pin the current term, or follow the date
//   { action: 'create', semester, year, startDate, endDate, showOnHome }
//   { action: 'update', id, semester, year, startDate, endDate, showOnHome }
//   { action: 'show', id, showOnHome }                      show or hide on the summary page
//   { action: 'delete', id }
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const b = (await request.json().catch(() => null)) || {};
    const db = getDb();
    const bad = (message, status = 400) => NextResponse.json({ success: false, message }, { status });
    const exists = async (id) => (await getTerms(db)).some((t) => t.id === String(id));

    if (b.term !== undefined) {
      const term = String(b.term);
      if (term !== 'auto' && !await exists(term)) return bad('ไม่พบเทอมนี้');
      await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('current_term', ?, datetime('now'))
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(term);
      return NextResponse.json(await payload(db));
    }

    if (b.action === 'create' || b.action === 'update') {
      const t = readTerm(b);
      const err = await validateTerm(db, t, b.action === 'update' ? b.id : null);
      if (err) return bad(err);
      if (b.action === 'create') {
        await db.prepare('INSERT INTO terms (semester, year, start_date, end_date, show_on_home) VALUES (?, ?, ?, ?, ?)').run(t.semester, t.year, t.startDate, t.endDate, t.showOnHome ? 1 : 0);
      } else {
        const r = await db.prepare('UPDATE terms SET semester = ?, year = ?, start_date = ?, end_date = ?, show_on_home = ? WHERE id = ?').run(t.semester, t.year, t.startDate, t.endDate, t.showOnHome ? 1 : 0, Number(b.id));
        if (!r.changes) return bad('ไม่พบเทอมนี้', 404);
      }
      return NextResponse.json(await payload(db));
    }

    if (b.action === 'show') {
      const r = await db.prepare('UPDATE terms SET show_on_home = ? WHERE id = ?').run(b.showOnHome ? 1 : 0, Number(b.id));
      if (!r.changes) return bad('ไม่พบเทอมนี้', 404);
      return NextResponse.json(await payload(db));
    }

    if (b.action === 'delete') {
      if ((await getTerms(db)).length <= 1) return bad('ต้องมีเทอมอย่างน้อย 1 เทอม');
      const r = await db.prepare('DELETE FROM terms WHERE id = ?').run(Number(b.id));
      if (!r.changes) return bad('ไม่พบเทอมนี้', 404);
      // A pin on the deleted term falls back to following the date.
      await db.prepare("UPDATE settings SET value = 'auto' WHERE key = 'current_term' AND value = ?").run(String(b.id));
      return NextResponse.json(await payload(db));
    }

    return bad('Invalid request');
  } catch (error) {
    console.error('Failed to update term setting:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
