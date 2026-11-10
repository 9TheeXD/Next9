import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');
const { isValidDateFormat, getStudentMaxDate, checkSystemLock } = require('@/lib/config');
const { termDateFilter } = require('@/lib/terms');
const { cachedJson } = require('@/lib/resultCache');

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    
    if (session.user.role !== 'admin' && await checkSystemLock(db, session.user.role)) {
      return NextResponse.json({ success: false, message: 'ระบบปิดปรับปรุงชั่วคราว' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    const type = searchParams.get('type'); // 'grade', 'all_rooms', 'specific_grade'
    const grade = searchParams.get('grade');

    if (session.user.role === 'student') {
      const studentMax = getStudentMaxDate();
      if (!endDate || endDate > studentMax) {
        endDate = studentMax;
      }
      if (startDate && startDate > studentMax) {
        startDate = studentMax;
      }
    }

    if (!startDate || !isValidDateFormat(startDate) || !endDate || !isValidDateFormat(endDate)) {
      return NextResponse.json({ message: 'รูปแบบวันที่ไม่ถูกต้อง' }, { status: 400 });
    }


    let query = '';
    let params = [startDate, endDate];

    // NOTE: The average is calculated using raw floats. The rounding will be handled by the frontend.
    if (type === 'grade') {
      query = `
        WITH stats AS (
          SELECT grade, 
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as council_avg,
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as teacher_avg
          FROM evaluations e
          LEFT JOIN whitelist w ON e.evaluator_id = w.prefix
          WHERE e.date >= ? AND e.date <= ? AND e.room != 0
          GROUP BY grade
        )
        SELECT grade,
               ROUND(
                 CASE 
                   WHEN council_avg IS NOT NULL AND teacher_avg IS NOT NULL THEN (council_avg + teacher_avg) / 2.0
                   WHEN council_avg IS NOT NULL THEN council_avg
                   WHEN teacher_avg IS NOT NULL THEN teacher_avg
                   ELSE NULL
                 END, 3) as avg_score
        FROM stats
        ORDER BY avg_score DESC
      `;
    } else if (type === 'overall_grade') {
      query = `
        WITH stats AS (
          SELECT grade, 
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as council_avg,
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as teacher_avg
          FROM evaluations e
          LEFT JOIN whitelist w ON e.evaluator_id = w.prefix
          WHERE e.date >= ? AND e.date <= ? AND e.room = 0
          GROUP BY grade
        )
        SELECT grade,
               ROUND(
                 CASE 
                   WHEN council_avg IS NOT NULL AND teacher_avg IS NOT NULL THEN (council_avg * 0.4) + (teacher_avg * 0.6)
                   WHEN council_avg IS NOT NULL THEN council_avg
                   WHEN teacher_avg IS NOT NULL THEN teacher_avg
                   ELSE NULL
                 END, 3) as avg_score
        FROM stats
        ORDER BY avg_score DESC
      `;
    } else if (type === 'all_rooms') {
      query = `
        WITH stats AS (
          SELECT grade, room, 
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as council_avg,
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as teacher_avg
          FROM evaluations e
          LEFT JOIN whitelist w ON e.evaluator_id = w.prefix
          WHERE e.date >= ? AND e.date <= ? AND e.room != 0
          GROUP BY grade, room
        )
        SELECT grade, room,
               CASE 
                 WHEN council_avg IS NOT NULL AND teacher_avg IS NOT NULL THEN (council_avg + teacher_avg) / 2.0
                 WHEN council_avg IS NOT NULL THEN council_avg
                 WHEN teacher_avg IS NOT NULL THEN teacher_avg
                 ELSE NULL
               END as avg_score
        FROM stats
        WHERE (council_avg IS NOT NULL OR teacher_avg IS NOT NULL)
        ORDER BY avg_score DESC, grade ASC, room ASC
      `;
    } else if (type === 'specific_grade') {
      if (!grade) {
        return NextResponse.json({ message: 'กรุณาระบุสายชั้น' }, { status: 400 });
      }
      query = `
        WITH stats AS (
          SELECT grade, room, 
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as council_avg,
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as teacher_avg
          FROM evaluations e
          LEFT JOIN whitelist w ON e.evaluator_id = w.prefix
          WHERE e.date >= ? AND e.date <= ? AND e.grade = ? AND e.room != 0
          GROUP BY grade, room
        )
        SELECT grade, room,
               CASE 
                 WHEN council_avg IS NOT NULL AND teacher_avg IS NOT NULL THEN (council_avg + teacher_avg) / 2.0
                 WHEN council_avg IS NOT NULL THEN council_avg
                 WHEN teacher_avg IS NOT NULL THEN teacher_avg
                 ELSE NULL
               END as avg_score
        FROM stats
        WHERE (council_avg IS NOT NULL OR teacher_avg IS NOT NULL)
        ORDER BY avg_score DESC, room ASC
      `;
      params.push(parseInt(grade, 10));
    } else {
      return NextResponse.json({ message: 'ประเภทการจัดอันดับไม่ถูกต้อง' }, { status: 400 });
    }

    // terms=1 (sent by /v2): leave out days between terms.
    if (searchParams.get('terms') === '1') {
      const f = await termDateFilter('e.date');
      query = query.replace('e.date >= ? AND e.date <= ?', 'e.date >= ? AND e.date <= ?' + f.sql);
      params = [params[0], params[1], ...f.params, ...params.slice(2)];
    }

    const cacheKey = JSON.stringify(['ranking', query, params]);
    const json = await cachedJson(db, cacheKey, startDate, endDate, async () => ({ rankings: await db.prepare(query).all(...params) }));
    return new NextResponse(json, { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Ranking GET error occurred:', error);
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}
