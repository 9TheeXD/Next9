// Audit trail for admin changes to evaluation scores, and restoring those changes.
// detail shapes:
//   edit:            { date, evaluatorId, grade, room, zone, before: { criterion: score }, after: { criterion: score } }
//   delete-*:        { date, rows: [{ evaluator_id, grade, room, zone, criterion, score }] }

function writeAudit(db, action, target, detail) {
  return db.prepare('INSERT INTO admin_audit (action, target, detail) VALUES (?, ?, ?)')
    .run(action, target, detail == null ? null : JSON.stringify(detail)).lastInsertRowid;
}

function parseDetail(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function canRestore(row, detail) {
  if (row.restored_at || !detail || !detail.date) return false;
  if (row.action === 'edit') return !!detail.before && !!detail.evaluatorId;
  if (row.action.startsWith('delete-')) return Array.isArray(detail.rows) && detail.rows.length > 0;
  return false;
}

function recentAudit(db, limit = 30) {
  return db.prepare('SELECT id, action, target, detail, created_at, restored_at FROM admin_audit ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map((row) => {
      const detail = parseDetail(row.detail);
      return { id: row.id, action: row.action, target: row.target, created_at: row.created_at, restored_at: row.restored_at, restorable: canRestore(row, detail) };
    });
}

// Human label for one unit: room 0 is the grade's overall (ภาพรวม) score.
function unitLabel(grade, room) {
  return room === 0 ? `ม.${grade} ภาพรวม` : `ม.${grade} ห้อง ${room}`;
}

// Puts back the scores an audit row describes. Edits restore the previous scores (overwrite).
// Deletes re-insert the removed rows; rows that exist again are left as they are.
// Returns { status, message, restored, skipped }. Runs in one transaction.
function restoreAudit(db, id) {
  const row = db.prepare('SELECT id, action, target, detail, restored_at FROM admin_audit WHERE id = ?').get(id);
  if (!row) return { status: 404, message: 'ไม่พบรายการนี้' };
  if (row.restored_at) return { status: 409, message: 'กู้คืนรายการนี้ไปแล้ว' };
  const detail = parseDetail(row.detail);
  if (!canRestore(row, detail)) return { status: 400, message: 'รายการนี้กู้คืนไม่ได้' };

  const upsert = db.prepare(`
    INSERT INTO evaluations (grade, room, zone, criterion, score, date, evaluator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(grade, room, zone, criterion, date, evaluator_id)
    DO UPDATE SET score = excluded.score
  `);
  const insertIfMissing = db.prepare(`
    INSERT INTO evaluations (grade, room, zone, criterion, score, date, evaluator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(grade, room, zone, criterion, date, evaluator_id) DO NOTHING
  `);

  let restored = 0;
  let skipped = 0;
  db.transaction(() => {
    if (row.action === 'edit') {
      const { date, evaluatorId, grade, room, zone, before } = detail;
      for (const [criterion, score] of Object.entries(before)) {
        upsert.run(grade, room, zone, Number(criterion), score, date, evaluatorId);
        restored++;
      }
      writeAudit(db, 'restore', `กู้คืนคะแนนเดิม ${evaluatorId} · ${unitLabel(grade, room)} · ${date}`, { source: id });
    } else {
      for (const r of detail.rows) {
        const changed = insertIfMissing.run(r.grade, r.room, r.zone, r.criterion, r.score, detail.date, r.evaluator_id).changes;
        restored += changed;
        skipped += 1 - changed;
      }
      writeAudit(db, 'restore', `กู้คืน: ${row.target} (คืน ${restored} คะแนน, ข้าม ${skipped})`, { source: id });
    }
    db.prepare("UPDATE admin_audit SET restored_at = datetime('now', 'localtime') WHERE id = ?").run(id);
  })();

  return { status: 200, message: `กู้คืนแล้ว ${restored} คะแนน${skipped ? ` (ข้าม ${skipped} ที่มีอยู่แล้ว)` : ''}`, restored, skipped };
}

module.exports = { writeAudit, recentAudit, restoreAudit, unitLabel };
