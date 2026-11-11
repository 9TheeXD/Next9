import { getServerSession } from '@/lib/session';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
const { getDb } = require('@/lib/db');
const { isValidDateFormat } = require('@/lib/config');

export const dynamic = 'force-dynamic';

// Every score in a date range as a CSV file (opens in Excel and Google Sheets), one row per evaluator
// per class per day. Meant for keeping a term's raw data outside this system.
// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD[&name=file-name-part]
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!isValidDateFormat(start) || !isValidDateFormat(end) || start > end) return new Response('Invalid range', { status: 400 });

  const rows = await getDb()
    .prepare(
      `SELECT e.date, e.grade, e.room, e.zone, e.evaluator_id,
              CASE WHEN w.role = 'council' THEN 'สภานักเรียน' WHEN w.role = 'teacher' THEN 'ครู'
                   WHEN e.evaluator_id = 'council' OR e.evaluator_id NOT GLOB '*[^0-9]*' THEN 'สภานักเรียน' ELSE 'ครู' END AS role,
              MAX(CASE WHEN e.criterion = 1 THEN e.score END) AS c1,
              MAX(CASE WHEN e.criterion = 2 THEN e.score END) AS c2,
              MAX(CASE WHEN e.criterion = 3 THEN e.score END) AS c3,
              MAX(CASE WHEN e.criterion = 4 THEN e.score END) AS c4,
              MAX(CASE WHEN e.criterion = 5 THEN e.score END) AS c5,
              MAX(e.created_at) AS saved_at
       FROM evaluations e LEFT JOIN whitelist w ON w.prefix = e.evaluator_id
       WHERE e.date >= ? AND e.date <= ?
       GROUP BY e.date, e.grade, e.room, e.zone, e.evaluator_id
       ORDER BY e.date, e.grade, e.room, e.evaluator_id`,
    )
    .all(start, end);

  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['วันที่', 'ชั้น', 'ห้อง', 'ประเภท', 'ผู้ประเมิน', 'บทบาท', 'ข้อ 1', 'ข้อ 2', 'ข้อ 3', 'ข้อ 4', 'ข้อ 5', 'บันทึกเมื่อ'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push(
      [r.date, `ม.${r.grade}`, r.room === 0 ? 'ภาพรวม' : r.room, r.room === 0 ? 'ประเมินรวมทั้งระดับ' : 'รายห้อง', r.evaluator_id, r.role, r.c1, r.c2, r.c3, r.c4, r.c5, r.saved_at]
        .map(cell)
        .join(','),
    );
  }
  // The BOM makes Excel read the Thai text as UTF-8.
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  const name = (searchParams.get('name') || `${start}_${end}`).replace(/[^\w.\-ก-๙/ ]/g, '').replace(/[/ ]/g, '-').slice(0, 60);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="assess-${start}_${end}.csv"; filename*=UTF-8''${encodeURIComponent(`คะแนน-${name}.csv`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
