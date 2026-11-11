import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/session';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');
const { isValidGrade, getLogicalDateString, checkSystemLock } = require('@/lib/config');
const { termDateFilter, getTerms, getCurrentTerm } = require('@/lib/terms');
const { cachedJson } = require('@/lib/resultCache');

// Results for a range that has already ended (a finished term) are stored and served as-is: those
// evaluations no longer change, and recomputing them meant aggregating ~50k rows on every visit.
// Each stored result carries a fingerprint of its rows and of the whitelist (which decides council
// vs teacher weighting), so if anything in the range is edited after all, it is recomputed.
const memoryCache = new Map();

async function ensureCacheTable(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS trend_cache (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT DEFAULT (datetime(\'now\')))');
}

async function rangeFingerprint(db, startDateStr, endDateStr) {
  const e = await db.prepare('SELECT COUNT(*) AS n, TOTAL(score) AS s, TOTAL(id * score) AS w, MAX(id) AS m FROM evaluations WHERE date >= ? AND date <= ?').get(startDateStr || '0000-00-00', endDateStr);
  const w = await db.prepare("SELECT COUNT(*) AS n, GROUP_CONCAT(prefix || ':' || IFNULL(role, ''), ',') AS g FROM (SELECT prefix, role FROM whitelist ORDER BY prefix)").get();
  return [e.n, e.s, e.w, e.m, w.n, w.g].join('|');
}

function jsonResponse(payload) {
  return new NextResponse(payload, { headers: { 'Content-Type': 'application/json' } });
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const gradeParam = searchParams.get('grade');
    const period = searchParams.get('period') || '1m';
    const term = searchParams.get('term') || '';

    const db = getDb();

    if (session.user.role !== 'admin' && await checkSystemLock(db, session.user.role)) {
      return NextResponse.json({ success: false, message: 'ระบบปิดปรับปรุงชั่วคราว' }, { status: 503 });
    }

    // Calculate start date based on period
    const logicalTodayStr = getLogicalDateString();
    const [yStr, mStr, dStr] = logicalTodayStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1; // 0-indexed
    const day = parseInt(dStr, 10);

    let startUtcMs;
    switch (period) {
      case '6m':
        startUtcMs = Date.UTC(year, month - 6, day);
        break;
      case '1y':
        startUtcMs = Date.UTC(year - 1, month, day);
        break;
      case 'all':
        break;
      default: // '1m'
        startUtcMs = Date.UTC(year, month - 1, day);
        break;
    }

    let startDateStr = startUtcMs ? new Date(startUtcMs).toISOString().split('T')[0] : null;

    let endDateStr = null;
    if (session.user.role === 'student') {
      const { getStudentMaxDate } = require('@/lib/config');
      endDateStr = getStudentMaxDate();
    }

    // An explicit range (used by /v2) replaces the period and term boundaries; a student still never
    // sees past getStudentMaxDate.
    const rangeStart = searchParams.get('startDate');
    const rangeEnd = searchParams.get('endDate');
    const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const explicitRange = isDate(rangeStart) && isDate(rangeEnd);
    if (explicitRange) {
      startDateStr = rangeStart;
      if (!endDateStr || rangeEnd < endDateStr) endDateStr = rangeEnd;
    }

    // Apply term date boundaries: term=<id> keeps to that term, no term keeps to the current one
    // (from its first day), term=all to every term.
    const terms = await getTerms(db);
    let termRow = null;
    if (explicitRange || term === 'all') {
      // already bounded above, or the whole history
    } else if (term) {
      termRow = terms.find((t) => t.id === term) || null;
      if (termRow) {
        if (!startDateStr || startDateStr < termRow.startDate) startDateStr = termRow.startDate;
        if (!endDateStr || endDateStr > termRow.endDate) endDateStr = termRow.endDate;
      }
    } else {
      const cur = (await getCurrentTerm(db, logicalTodayStr, terms)).term;
      if (cur && (!startDateStr || startDateStr < cur.startDate)) startDateStr = cur.startDate;
    }

    // Only a finished term is stored: its range has a fixed end that is already in the past.
    const closed = !!termRow && termRow.endDate < logicalTodayStr && !!endDateStr && endDateStr < logicalTodayStr;
    let cacheKey = null, fingerprint = null;
    if (closed) {
      try {
        await ensureCacheTable(db);
        cacheKey = JSON.stringify({ v: 1, start: startDateStr, end: endDateStr, grade: gradeParam || null });
        fingerprint = await rangeFingerprint(db, startDateStr, endDateStr);
        const mem = memoryCache.get(cacheKey);
        if (mem && mem.fingerprint === fingerprint) return jsonResponse(mem.payload);
        const row = await db.prepare('SELECT fingerprint, payload FROM trend_cache WHERE key = ?').get(cacheKey);
        if (row && row.fingerprint === fingerprint) {
          memoryCache.set(cacheKey, row);
          return jsonResponse(row.payload);
        }
      } catch (e) {
        console.error('Trend cache read failed');
        cacheKey = null;
      }
    }

    // terms=1 (sent by /v2): leave out days between terms.
    const termsOnly = searchParams.get('terms') === '1';

    let query = `
      WITH stats AS (
        SELECT date, grade,
               AVG(CASE WHEN e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c,
               AVG(CASE WHEN e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as t,
               AVG(CASE WHEN e.criterion = 1 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c1c,
               AVG(CASE WHEN e.criterion = 1 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c1t,
               AVG(CASE WHEN e.criterion = 2 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c2c,
               AVG(CASE WHEN e.criterion = 2 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c2t,
               AVG(CASE WHEN e.criterion = 3 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c3c,
               AVG(CASE WHEN e.criterion = 3 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c3t,
               AVG(CASE WHEN e.criterion = 4 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c4c,
               AVG(CASE WHEN e.criterion = 4 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c4t,
               AVG(CASE WHEN e.criterion = 5 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c5c,
               AVG(CASE WHEN e.criterion = 5 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c5t
        FROM evaluations e
        LEFT JOIN whitelist w ON e.evaluator_id = w.prefix
        WHERE e.room = 0
    `;
    const params = [];

    if (startDateStr) {
      query += ' AND e.date >= ?';
      params.push(startDateStr);
    }
    if (endDateStr) {
      query += ' AND e.date <= ?';
      params.push(endDateStr);
    }
    if (termsOnly) {
      const f = await termDateFilter('e.date');
      query += f.sql;
      params.push(...f.params);
    }

    if (gradeParam) {
      const g = parseInt(gradeParam, 10);
      if (isValidGrade(g)) {
        query += ' AND e.grade = ?';
        params.push(g);
      }
    }

    query += `
      GROUP BY date, grade
      )
      SELECT date, grade,
             COALESCE(c * 0.4 + t * 0.6, c, t) as avg_score,
             COALESCE(c1c * 0.4 + c1t * 0.6, c1c, c1t) as c1,
             COALESCE(c2c * 0.4 + c2t * 0.6, c2c, c2t) as c2,
             COALESCE(c3c * 0.4 + c3t * 0.6, c3c, c3t) as c3,
             COALESCE(c4c * 0.4 + c4t * 0.6, c4c, c4t) as c4,
             COALESCE(c5c * 0.4 + c5t * 0.6, c5c, c5t) as c5
      FROM stats
      ORDER BY date ASC, grade ASC
    `;


    // Also get per-room trend for drill-down
    let roomQuery = `
      WITH stats AS (
        SELECT date, grade, room,
               AVG(CASE WHEN e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c,
               AVG(CASE WHEN e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as t,
               AVG(CASE WHEN e.criterion = 1 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c1c,
               AVG(CASE WHEN e.criterion = 1 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c1t,
               AVG(CASE WHEN e.criterion = 2 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c2c,
               AVG(CASE WHEN e.criterion = 2 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c2t,
               AVG(CASE WHEN e.criterion = 3 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c3c,
               AVG(CASE WHEN e.criterion = 3 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c3t,
               AVG(CASE WHEN e.criterion = 4 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c4c,
               AVG(CASE WHEN e.criterion = 4 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c4t,
               AVG(CASE WHEN e.criterion = 5 AND e.score > 0 AND (w.role = 'council' OR (w.role IS NULL AND (e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c5c,
               AVG(CASE WHEN e.criterion = 5 AND e.score > 0 AND (w.role = 'teacher' OR (w.role IS NULL AND (e.evaluator_id != 'council' AND e.evaluator_id GLOB '*[^0-9]*'))) THEN score ELSE NULL END) as c5t
        FROM evaluations e
        LEFT JOIN whitelist w ON e.evaluator_id = w.prefix
        WHERE e.room != 0
    `;
    const roomParams = [];

    if (startDateStr) {
      roomQuery += ' AND e.date >= ?';
      roomParams.push(startDateStr);
    }
    if (endDateStr) {
      roomQuery += ' AND e.date <= ?';
      roomParams.push(endDateStr);
    }
    if (termsOnly) {
      const f = await termDateFilter('e.date');
      roomQuery += f.sql;
      roomParams.push(...f.params);
    }

    if (gradeParam) {
      const g = parseInt(gradeParam, 10);
      if (isValidGrade(g)) {
        roomQuery += ' AND e.grade = ?';
        roomParams.push(g);
      }
    }

    roomQuery += `
      GROUP BY date, grade, room
      )
      SELECT date, grade, room,
             COALESCE((c + t) / 2.0, c, t) as avg_score,
             COALESCE((c1c + c1t) / 2.0, c1c, c1t) as c1,
             COALESCE((c2c + c2t) / 2.0, c2c, c2t) as c2,
             COALESCE((c3c + c3t) / 2.0, c3c, c3t) as c3,
             COALESCE((c4c + c4t) / 2.0, c4c, c4t) as c4,
             COALESCE((c5c + c5t) / 2.0, c5c, c5t) as c5
      FROM stats
      ORDER BY date ASC, grade ASC, room ASC
    `;

    const compute = async () => ({
      gradeAverages: await db.prepare(query).all(...params),
      roomDetails: await db.prepare(roomQuery).all(...roomParams),
    });
    // A finished term is stored in trend_cache below; anything else is kept in memory while its
    // evaluations are unchanged.
    const payload = cacheKey
      ? JSON.stringify(await compute())
      : await cachedJson(db, JSON.stringify(['trend', query, params, roomQuery, roomParams]), startDateStr, endDateStr, compute);
    if (cacheKey) {
      try {
        await db.prepare('INSERT OR REPLACE INTO trend_cache (key, fingerprint, payload) VALUES (?, ?, ?)').run(cacheKey, fingerprint, payload);
        memoryCache.set(cacheKey, { fingerprint, payload });
      } catch (e) {
        console.error('Trend cache write failed');
      }
    }
    return jsonResponse(payload);
  } catch (error) {
    console.error('Trend error occurred');
    return NextResponse.json(
      { message: 'เกิดข้อผิดพลาด' },
      { status: 500 }
    );
  }
}
