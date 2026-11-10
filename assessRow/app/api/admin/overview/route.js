import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');
const { GRADE_CONFIG, getLogicalDateString } = require('@/lib/config');

// Admin dashboard numbers: how far today's evaluation has got, who evaluated, and recent activity.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const db = getDb();
    const today = getLogicalDateString();

    const roomRows = await db
      .prepare('SELECT grade, COUNT(DISTINCT room) AS rooms FROM evaluations WHERE date = ? AND room != 0 AND score > 0 GROUP BY grade')
      .all(today);
    const overallRows = await db.prepare('SELECT DISTINCT grade FROM evaluations WHERE date = ? AND room = 0 AND score > 0').all(today);
    const grades = [1, 2, 3, 4, 5, 6].map((g) => ({
      grade: g,
      roomsDone: roomRows.find((r) => r.grade === g)?.rooms || 0,
      roomsTotal: GRADE_CONFIG[g]?.totalRooms || 0,
      overallDone: overallRows.some((r) => r.grade === g),
    }));

    const evaluators = await db
      .prepare(
        `SELECT e.evaluator_id AS id, w.role AS role, COUNT(*) AS scores, COUNT(DISTINCT e.grade || '-' || e.room) AS units
         FROM evaluations e LEFT JOIN whitelist w ON w.prefix = e.evaluator_id
         WHERE e.date = ? AND e.score > 0
         GROUP BY e.evaluator_id ORDER BY scores DESC`,
      )
      .all(today);

    const days = await db
      .prepare(
        `SELECT date, COUNT(*) AS scores, COUNT(DISTINCT evaluator_id) AS evaluators
         FROM evaluations WHERE score > 0 AND date >= date(?, '-20 days') AND date <= ?
         GROUP BY date ORDER BY date DESC`,
      )
      .all(today, today);

    const viewers = (await db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM system_logs WHERE date = ? AND action = 'view'").get(today)).n;
    const totals = {
      evaluations: (await db.prepare('SELECT COUNT(*) AS n FROM evaluations WHERE score > 0').get()).n,
      days: (await db.prepare('SELECT COUNT(DISTINCT date) AS n FROM evaluations WHERE score > 0').get()).n,
      whitelist: (await db.prepare('SELECT COUNT(*) AS n FROM whitelist').get()).n,
    };

    return NextResponse.json({ today, grades, evaluators, days, viewers, totals });
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
