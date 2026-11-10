import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic';

const { getDb } = require('@/lib/db');
const { writeAudit, recentAudit, restoreAudit, unitLabel } = require('@/lib/audit');
const { CRITERIA, SCORE_LABELS, isValidDateFormat, isValidGrade, isValidRoom, isValidZone, isValidScore } = require('@/lib/config');

const CRITERION_NOS = [1, 2, 3, 4, 5];
// One column per criterion: its score for the (evaluator, unit, date) group, NULL when missing.
const CRITERION_COLUMNS = CRITERION_NOS.map((c) => `MAX(CASE WHEN e.criterion = ${c} THEN e.score END) AS c${c}`).join(', ');

const unauthorized = () => NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
const bad = (message) => NextResponse.json({ success: false, message }, { status: 400 });

async function isAdmin() {
  const session = await getServerSession(authOptions);
  return !!session && session.user.role === 'admin';
}

// Reads the key of one evaluation group (evaluator + unit + date) from a request body.
function parseKey(b) {
  const evaluatorId = typeof b.evaluator_id === 'string' ? b.evaluator_id.trim() : '';
  if (!evaluatorId || evaluatorId.length > 64) return { error: 'รหัสผู้ประเมินไม่ถูกต้อง' };
  if (!isValidDateFormat(b.date)) return { error: 'วันที่ไม่ถูกต้อง' };
  if (typeof b.grade !== 'number' || !isValidGrade(b.grade)) return { error: 'ระดับชั้นไม่ถูกต้อง' };
  if (!isValidZone(b.zone)) return { error: 'โซนไม่ถูกต้อง' };
  if (typeof b.room !== 'number' || !isValidRoom(b.grade, b.room, b.zone)) return { error: 'ห้องเรียนไม่ถูกต้อง' };
  return { date: b.date, evaluatorId, grade: b.grade, room: b.room, zone: b.zone };
}

const KEY_WHERE = 'date = ? AND evaluator_id = ? AND grade = ? AND room = ? AND zone = ?';
const keyArgs = (k) => [k.date, k.evaluatorId, k.grade, k.room, k.zone];

// Lists every evaluation group of one day, plus the latest admin changes.
export async function GET(request) {
  try {
    if (!(await isAdmin())) return unauthorized();

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    if (!isValidDateFormat(date)) return bad('วันที่ไม่ถูกต้อง');
    const grade = parseInt(searchParams.get('grade') || '', 10);
    const q = (searchParams.get('q') || '').trim();

    const where = ['e.date = ?'];
    const params = [date];
    if (isValidGrade(grade)) {
      where.push('e.grade = ?');
      params.push(grade);
    }
    if (q) {
      // Match the id, or the role word (ครู / สภา) using the same rule as the ranking queries.
      const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
      const roleSql = `CASE WHEN w.role = 'council' THEN 'council' WHEN w.role = 'teacher' THEN 'teacher'
        WHEN e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*' THEN 'council' ELSE 'teacher' END`;
      const byRole = q.includes('ครู') ? 'teacher' : q.includes('สภา') ? 'council' : null;
      where.push(byRole ? `(e.evaluator_id LIKE ? ESCAPE '\\' OR ${roleSql} = ?)` : "e.evaluator_id LIKE ? ESCAPE '\\'");
      params.push(like);
      if (byRole) params.push(byRole);
    }

    const db = getDb();
    const records = (await db
      .prepare(
        `SELECT e.evaluator_id, w.role AS role, e.grade, e.room, e.zone, ${CRITERION_COLUMNS}
         FROM evaluations e
         LEFT JOIN whitelist w ON w.prefix = e.evaluator_id
         WHERE ${where.join(' AND ')}
         GROUP BY e.evaluator_id, e.grade, e.room, e.zone
         ORDER BY e.evaluator_id, e.grade, e.room`,
      )
      .all(...params))
      .map((r) => ({
        evaluator_id: r.evaluator_id,
        role: r.role,
        grade: r.grade,
        room: r.room,
        zone: r.zone,
        scores: Object.fromEntries(CRITERION_NOS.map((c) => [c, r[`c${c}`]])),
      }));

    return NextResponse.json({
      date,
      criteria: CRITERIA,
      scoreLabels: SCORE_LABELS,
      records,
      audit: await recentAudit(db, 30),
    });
  } catch (error) {
    console.error('Admin evaluations GET error:', error);
    return NextResponse.json({ message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// Sets all five criterion scores of one evaluation group.
export async function PUT(request) {
  try {
    if (!(await isAdmin())) return unauthorized();

    const body = await request.json();
    const key = parseKey(body || {});
    if (key.error) return bad(key.error);

    const scores = body.scores;
    if (!scores || typeof scores !== 'object') return bad('ข้อมูลคะแนนไม่ถูกต้อง');
    const next = {};
    for (const c of CRITERION_NOS) {
      const s = typeof scores[c] === 'number' ? scores[c] : NaN;
      if (!isValidScore(s)) return bad(`คะแนนข้อ ${c} ไม่ถูกต้อง`);
      next[c] = s;
    }

    const db = getDb();
    const before = await db.prepare(`SELECT criterion, score FROM evaluations WHERE ${KEY_WHERE}`).all(...keyArgs(key));
    if (before.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบการประเมินนี้ (อาจถูกลบไปแล้ว)' }, { status: 404 });
    }

    const upsert = db.prepare(`
      INSERT INTO evaluations (grade, room, zone, criterion, score, date, evaluator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(grade, room, zone, criterion, date, evaluator_id)
      DO UPDATE SET score = excluded.score
    `);
    await db.transaction(async () => {
      for (const c of CRITERION_NOS) {
        await upsert.run(key.grade, key.room, key.zone, c, next[c], key.date, key.evaluatorId);
      }
      await writeAudit(db, 'edit', `แก้ไข ${key.evaluatorId} · ${unitLabel(key.grade, key.room)} · ${key.date}`, {
        date: key.date,
        evaluatorId: key.evaluatorId,
        grade: key.grade,
        room: key.room,
        zone: key.zone,
        before: Object.fromEntries(before.map((r) => [r.criterion, r.score])),
        after: next,
      });
    })();

    return NextResponse.json({ success: true, message: 'บันทึกคะแนนแล้ว' });
  } catch (error) {
    console.error('Admin evaluations PUT error:', error);
    return NextResponse.json({ success: false, message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// Deletes evaluations. scope: 'record' (one unit of one evaluator), 'evaluator' (one evaluator, optionally one grade),
// 'day' (every evaluation of the date; needs `confirm` = the date typed again).
export async function DELETE(request) {
  try {
    if (!(await isAdmin())) return unauthorized();

    const body = (await request.json()) || {};
    const { scope } = body;
    const date = body.date;
    if (!isValidDateFormat(date)) return bad('วันที่ไม่ถูกต้อง');

    let whereSql;
    let args;
    let target;
    let action;
    if (scope === 'record') {
      const key = parseKey(body);
      if (key.error) return bad(key.error);
      whereSql = KEY_WHERE;
      args = keyArgs(key);
      target = `ลบ ${key.evaluatorId} · ${unitLabel(key.grade, key.room)} · ${date}`;
      action = 'delete-record';
    } else if (scope === 'evaluator') {
      const evaluatorId = typeof body.evaluator_id === 'string' ? body.evaluator_id.trim() : '';
      if (!evaluatorId || evaluatorId.length > 64) return bad('รหัสผู้ประเมินไม่ถูกต้อง');
      const hasGrade = body.grade !== undefined && body.grade !== null;
      if (hasGrade && !(typeof body.grade === 'number' && isValidGrade(body.grade))) return bad('ระดับชั้นไม่ถูกต้อง');
      whereSql = hasGrade ? 'date = ? AND evaluator_id = ? AND grade = ?' : 'date = ? AND evaluator_id = ?';
      args = hasGrade ? [date, evaluatorId, body.grade] : [date, evaluatorId];
      target = `ลบของ ${evaluatorId}${hasGrade ? ` ม.${body.grade}` : ''} · ${date}`;
      action = 'delete-evaluator';
    } else if (scope === 'day') {
      if (body.confirm !== date) return bad('พิมพ์วันที่ให้ตรงเพื่อยืนยัน');
      whereSql = 'date = ?';
      args = [date];
      target = `ล้างการประเมินทั้งวัน ${date}`;
      action = 'delete-day';
    } else {
      return bad('ประเภทการลบไม่ถูกต้อง');
    }

    const db = getDb();
    const rows = await db
      .prepare(`SELECT evaluator_id, grade, room, zone, criterion, score FROM evaluations WHERE ${whereSql} ORDER BY evaluator_id, grade, room, criterion`)
      .all(...args);
    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบการประเมินที่จะลบ (อาจถูกลบไปแล้ว)' }, { status: 404 });
    }

    await db.transaction(async () => {
      await db.prepare(`DELETE FROM evaluations WHERE ${whereSql}`).run(...args);
      // Keep the removed rows in the audit detail so the restore button can put them back.
      await writeAudit(db, action, `${target} (${rows.length} คะแนน)`, { date, rows });
    })();

    return NextResponse.json({ success: true, deleted: rows.length, message: `ลบ ${rows.length} คะแนนแล้ว` });
  } catch (error) {
    console.error('Admin evaluations DELETE error:', error);
    return NextResponse.json({ success: false, message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// Restores the scores an audit entry describes (see restoreAudit in lib/audit.js). Body: { id }.
export async function POST(request) {
  try {
    if (!(await isAdmin())) return unauthorized();

    const body = (await request.json()) || {};
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return bad('รายการไม่ถูกต้อง');

    const result = await restoreAudit(getDb(), id);
    return NextResponse.json({ success: result.status === 200, message: result.message, restored: result.restored, skipped: result.skipped }, { status: result.status });
  } catch (error) {
    console.error('Admin evaluations restore error:', error);
    return NextResponse.json({ success: false, message: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
