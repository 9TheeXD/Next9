import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');
const { validateCsrfToken, CSRF_COOKIE_NAME } = require('@/lib/csrf');
const { isValidGrade, isValidRoom, isValidCriterion, isValidScore, isValidZone, isValidDateFormat, getRoomsForZone, checkSystemLock, getEvalWindow, getEvalDays, evalDayStatus } = require('@/lib/config');

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const grade = searchParams.get('grade');
    const zone = searchParams.get('zone');
    const room = searchParams.get('room');

    const db = getDb();
    
    if (session.user.role !== 'admin' && checkSystemLock(db, session.user.role)) {
      return NextResponse.json({ success: false, message: 'ระบบปิดปรับปรุงชั่วคราว' }, { status: 503 });
    }

    let evaluatorId = session.user.prefix || (session.user.email ? session.user.email.split('@')[0] : 'unknown');

    let query = 'SELECT grade, room, zone, criterion, score, date FROM evaluations WHERE evaluator_id = ?';
    const params = [evaluatorId];

    if (date && isValidDateFormat(date)) {
      query += ' AND date = ?';
      params.push(date);
    }
    if (grade) {
      const g = parseInt(grade, 10);
      if (isValidGrade(g)) {
        query += ' AND grade = ?';
        params.push(g);
      }
    }
    if (zone && isValidZone(zone)) {
      query += ' AND zone = ?';
      params.push(zone);
    }
    if (room !== null) {
      const r = parseInt(room, 10);
      query += ' AND room = ?';
      params.push(r);
    }

    query += ' ORDER BY grade, room, criterion';

    const rows = db.prepare(query).all(...params);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Evaluations GET error occurred');
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role === 'student') {
      return NextResponse.json({ success: false, message: 'นักเรียนทั่วไปไม่มีสิทธิ์ประเมิน' }, { status: 403 });
    }

    const db = getDb();

    // Time restriction check (the window admins set on /admin; 07:00 - 08:30 by default)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    let hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
    const timeInMinutes = hour * 60 + minute;
    const evalWindow = getEvalWindow(db);
    // Days admins closed (weekends, holidays) on /admin.
    const bkkToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const dayStatus = evalDayStatus(getEvalDays(db), bkkToday);
    if (!dayStatus.open) {
      return NextResponse.json({ success: false, message: dayStatus.reason }, { status: 403 });
    }
    if (timeInMinutes < evalWindow.fromMinutes || timeInMinutes > evalWindow.toMinutes) {
      return NextResponse.json({ success: false, message: `หมดเวลาประเมิน หรือยังไม่ถึงเวลา (เปิดให้ประเมิน ${evalWindow.from} - ${evalWindow.to} น.)` }, { status: 403 });
    }
    
    // Check if system is locked
    if (session.user.role !== 'admin' && checkSystemLock(db, session.user.role)) {
      return NextResponse.json({ success: false, message: 'ระบบปิดปรับปรุงชั่วคราว ไม่สามารถประเมินได้' }, { status: 403 });
    }

    const body = await request.json();
    const { grade, room, zone, criterion, score, date, csrfToken } = body;

    // Validate CSRF token
    const { cookies } = require('next/headers');
    const cookieStore = await cookies();
    const storedCsrf = cookieStore.get(CSRF_COOKIE_NAME)?.value;
    if (!validateCsrfToken(csrfToken, storedCsrf)) {
      return NextResponse.json(
        { success: false, message: 'ข้อมูลไม่ถูกต้อง กรุณาลองใหม่' },
        { status: 403 }
      );
    }

    // Validate inputs
    const gradeNum = parseInt(grade, 10);
    const roomNum = parseInt(room, 10);
    const criterionNum = parseInt(criterion, 10);
    const scoreNum = parseInt(score, 10);

    if (!isValidGrade(gradeNum)) {
      return NextResponse.json({ success: false, message: 'ระดับชั้นไม่ถูกต้อง' }, { status: 400 });
    }
    if (!isValidZone(zone)) {
      return NextResponse.json({ success: false, message: 'โซนไม่ถูกต้อง' }, { status: 400 });
    }
    if (!isValidRoom(gradeNum, roomNum, zone)) {
      return NextResponse.json({ success: false, message: 'ห้องเรียนไม่ถูกต้อง' }, { status: 400 });
    }
    if (!isValidCriterion(criterionNum)) {
      return NextResponse.json({ success: false, message: 'เกณฑ์ไม่ถูกต้อง' }, { status: 400 });
    }
    if (!isValidScore(scoreNum)) {
      return NextResponse.json({ success: false, message: 'คะแนนไม่ถูกต้อง' }, { status: 400 });
    }
    if (!isValidDateFormat(date)) {
      return NextResponse.json({ success: false, message: 'วันที่ไม่ถูกต้อง' }, { status: 400 });
    }

    // db is already declared earlier
    
    let evaluatorId = session.user.prefix || (session.user.email ? session.user.email.split('@')[0] : 'unknown');

    if (!evaluatorId) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลผู้ประเมิน กรุณาเข้าสู่ระบบใหม่' }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO evaluations (grade, room, zone, criterion, score, date, evaluator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(grade, room, zone, criterion, date, evaluator_id)
      DO UPDATE SET score = excluded.score
    `).run(gradeNum, roomNum, zone, criterionNum, scoreNum, date, evaluatorId);

    const { logAction } = require('@/lib/logger');
    logAction(evaluatorId, session.user.role, 'evaluate');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Evaluations POST error occurred:', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}
