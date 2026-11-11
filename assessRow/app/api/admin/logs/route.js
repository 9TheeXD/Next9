import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/session';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';
const { getDb } = require('@/lib/db');
const { isValidDateFormat } = require('@/lib/config');

// Filters: date (YYYY-MM-DD, empty = all days), action (evaluate | view, empty = all), q (part of user id).
// `counts` are per action for the date + q filter, so the tabs can show how many each has.
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const date = searchParams.get('date');
    const action = searchParams.get('action');
    const q = (searchParams.get('q') || '').trim();

    const where = [];
    const params = [];
    if (isValidDateFormat(date)) {
      where.push('date = ?');
      params.push(date);
    }
    if (q) {
      // Match the id or the role name (ครู / สภานักเรียน / นักเรียน).
      const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      where.push("(user_id LIKE ? ESCAPE '\\' OR role LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const db = getDb();

    const countRows = await db.prepare(`SELECT action, COUNT(*) AS n FROM system_logs${whereSql} GROUP BY action`).all(...params);
    const counts = { all: 0, evaluate: 0, view: 0 };
    for (const r of countRows) {
      counts[r.action] = r.n;
      counts.all += r.n;
    }

    const listWhere = [...where];
    const listParams = [...params];
    if (action === 'evaluate' || action === 'view') {
      listWhere.push('action = ?');
      listParams.push(action);
    }
    const listWhereSql = listWhere.length ? ` WHERE ${listWhere.join(' AND ')}` : '';

    const total = (await db.prepare(`SELECT COUNT(*) AS n FROM system_logs${listWhereSql}`).get(...listParams)).n;
    const logs = await db
      .prepare(`SELECT id, action, user_id, role, date, timestamp FROM system_logs${listWhereSql} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...listParams, limit, (page - 1) * limit);

    return NextResponse.json({ logs, total, page, limit, counts });
  } catch (error) {
    console.error('Admin Logs GET error:', error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
