import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');
const { isValidDateFormat, isValidGrade, getStudentMaxDate, checkSystemLock } = require('@/lib/config');
const { termDateFilter } = require('@/lib/terms');
const { cachedJson } = require('@/lib/resultCache');

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb();
    
    if (session.user.role !== 'admin' && await checkSystemLock(db, session.user.role)) {
      return NextResponse.json({ success: false, message: 'ระบบปิดปรับปรุงชั่วคราว' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    const gradeParam = searchParams.get('grade');

    if (session.user.role === 'student') {
      const studentMax = getStudentMaxDate();
      if (!endDate || endDate > studentMax) {
        endDate = studentMax;
      }
      if (startDate && startDate > studentMax) {
        startDate = studentMax;
      }
    }


    let query = `
      WITH stats AS (
        SELECT grade, e.room, e.criterion, 
               AVG(CASE WHEN e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN e.score ELSE NULL END) as council_avg,
               AVG(CASE WHEN e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN e.score ELSE NULL END) as teacher_avg,
               COUNT(CASE WHEN e.score > 0 THEN 1 ELSE NULL END) as eval_count
        FROM evaluations e
        LEFT JOIN whitelist w ON e.evaluator_id = w.prefix
        WHERE 1=1
    `;

    const params = [];

    if (startDate && isValidDateFormat(startDate)) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate && isValidDateFormat(endDate)) {
      query += ' AND date <= ?';
      params.push(endDate);
    }
    // terms=1 (sent by /v2): leave out days between terms.
    const termsOnly = searchParams.get('terms') === '1';
    if (termsOnly) {
      const f = await termDateFilter('date');
      query += f.sql;
      params.push(...f.params);
    }
    if (gradeParam) {
      const g = parseInt(gradeParam, 10);
      if (isValidGrade(g)) {
        query += ' AND grade = ?';
        params.push(g);
      }
    }

    query += `
      GROUP BY grade, room, criterion
      )
      SELECT grade, room, criterion,
             ROUND(teacher_avg, 3) as teacher_avg,
             ROUND(council_avg, 3) as council_avg,
             ROUND(
               CASE 
                 WHEN room = 0 THEN
                   CASE 
                     WHEN council_avg IS NOT NULL AND teacher_avg IS NOT NULL THEN (council_avg * 0.4) + (teacher_avg * 0.6)
                     WHEN council_avg IS NOT NULL THEN council_avg
                     WHEN teacher_avg IS NOT NULL THEN teacher_avg
                     ELSE NULL
                   END
                 ELSE
                   CASE 
                     WHEN council_avg IS NOT NULL AND teacher_avg IS NOT NULL THEN (council_avg + teacher_avg) / 2.0
                     WHEN council_avg IS NOT NULL THEN council_avg
                     WHEN teacher_avg IS NOT NULL THEN teacher_avg
                     ELSE NULL
                   END
               END, 3) as avg_score,
             eval_count
      FROM stats
      ORDER BY grade, room, criterion
    `;

    // The room query below is built from the same inputs, so these identify the whole answer.
    const cacheKey = JSON.stringify(['summary', query, params]);
    const json = await cachedJson(db, cacheKey, startDate && isValidDateFormat(startDate) ? startDate : null, endDate && isValidDateFormat(endDate) ? endDate : null, async () => {
      const rows = await db.prepare(query).all(...params);

      // Also compute per-room averages (average across all criteria)
      let roomQuery = `
        WITH stats AS (
          SELECT grade, e.room,
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN e.score ELSE NULL END) as council_avg,
                 AVG(CASE WHEN e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN e.score ELSE NULL END) as teacher_avg
          FROM evaluations e
          LEFT JOIN whitelist w ON e.evaluator_id = w.prefix
          WHERE 1=1
      `;

      const roomParams = [];

      if (startDate && isValidDateFormat(startDate)) {
        roomQuery += ' AND date >= ?';
        roomParams.push(startDate);
      }
      if (endDate && isValidDateFormat(endDate)) {
        roomQuery += ' AND date <= ?';
        roomParams.push(endDate);
      }
      if (termsOnly) {
        const f = await termDateFilter('date');
        roomQuery += f.sql;
        roomParams.push(...f.params);
      }
      if (gradeParam) {
        const g = parseInt(gradeParam, 10);
        if (isValidGrade(g)) {
          roomQuery += ' AND grade = ?';
          roomParams.push(g);
        }
      }

      roomQuery += `
        GROUP BY grade, room
        )
        SELECT grade, room,
               ROUND(teacher_avg, 3) as teacher_avg,
               ROUND(council_avg, 3) as council_avg,
               ROUND(
                 CASE 
                   WHEN room = 0 THEN
                     CASE 
                       WHEN council_avg IS NOT NULL AND teacher_avg IS NOT NULL THEN (council_avg * 0.4) + (teacher_avg * 0.6)
                       WHEN council_avg IS NOT NULL THEN council_avg
                       WHEN teacher_avg IS NOT NULL THEN teacher_avg
                       ELSE NULL
                     END
                   ELSE
                     CASE 
                       WHEN council_avg IS NOT NULL AND teacher_avg IS NOT NULL THEN (council_avg + teacher_avg) / 2.0
                       WHEN council_avg IS NOT NULL THEN council_avg
                       WHEN teacher_avg IS NOT NULL THEN teacher_avg
                       ELSE NULL
                     END
                 END, 3) as avg_score
        FROM stats
        ORDER BY grade, room
      `;

      const roomRows = await db.prepare(roomQuery).all(...roomParams);
      return { details: rows, roomAverages: roomRows };
    });
    return new NextResponse(json, { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Summary error occurred');
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}
