import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/session';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');
const { getEvalWindow, evalTimeToMinutes, getEvalDays, normalizeEvalDays, evalDayStatus } = require('@/lib/config');

// The daily window in which evaluations can be entered (Bangkok time).
export async function GET() {
  try {
    const db = getDb();
    const { from, to } = await getEvalWindow(db);
    const days = await getEvalDays(db);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return NextResponse.json({ from, to, days, today, todayStatus: evalDayStatus(days, today) });
  } catch {
    return NextResponse.json({ from: '07:00', to: '08:30' });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const db = getDb();
    const set = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);

    // { days: { weekdays, closed, open } } updates only which days are open.
    if (body.days) {
      const days = normalizeEvalDays(body.days);
      await set.run('eval_days', JSON.stringify(days));
      return NextResponse.json({ success: true, days, message: 'บันทึกวันประเมินแล้ว' });
    }

    const { from, to } = body;
    const f = evalTimeToMinutes(from);
    const t = evalTimeToMinutes(to);
    if (f === null || t === null || f >= t || t >= 24 * 60) {
      return NextResponse.json({ message: 'เวลาไม่ถูกต้อง (เวลาเปิดต้องมาก่อนเวลาปิด)' }, { status: 400 });
    }
    await set.run('eval_open_from', from);
    await set.run('eval_open_to', to);
    return NextResponse.json({ success: true, from, to, message: `ตั้งเวลาประเมินเป็น ${from} – ${to} น. แล้ว` });
  } catch (error) {
    console.error('Failed to set evaluation time:', error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
