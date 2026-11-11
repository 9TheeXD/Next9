// Terms and rooms per grade come from the NEXT9 site's admin page (one place for every system):
// https://<NEXT9_URL>/api/settings/public?s=school. They are copied into this database (terms table,
// settings current_term / rooms_per_grade) at most every 5 minutes, so the dashboard keeps working
// with the last copy if NEXT9 cannot be reached.
//
// Env: NEXT9_URL (default https://next9-web.vercel.app). NEXT9_SYNC=off turns the copy off and the
// terms are then edited here as before.
const NEXT9_URL = (process.env.NEXT9_URL || 'https://next9-web.vercel.app').replace(/\/+$/, '');
const ENABLED = process.env.NEXT9_SYNC !== 'off';
const EVERY_MS = 5 * 60 * 1000;

let last = 0;
let running = null;

const syncEnabled = () => ENABLED;

async function fetchSchool() {
  const res = await fetch(`${NEXT9_URL}/api/settings/public?s=school`, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
  if (!res.ok) throw new Error(`NEXT9 HTTP ${res.status}`);
  const j = await res.json();
  return j?.settings?.school || null;
}

async function apply(db, school) {
  const list = Array.isArray(school.termList) ? school.termList.filter((t) => t.start && t.end) : [];
  if (list.length) {
    const local = await db.prepare('SELECT id, semester, year, start_date, end_date FROM terms').all();
    const keep = new Set();
    for (const t of list) {
      const row = local.find((r) => r.semester === t.semester && r.year === t.year);
      if (row) {
        keep.add(row.id);
        if (row.start_date !== t.start || row.end_date !== t.end) {
          await db.prepare('UPDATE terms SET start_date = ?, end_date = ? WHERE id = ?').run(t.start, t.end, row.id);
        }
      } else {
        const r = await db.prepare('INSERT INTO terms (semester, year, start_date, end_date, show_on_home) VALUES (?, ?, ?, ?, 1)').run(t.semester, t.year, t.start, t.end);
        keep.add(Number(r.lastInsertRowid));
      }
    }
    for (const r of local) if (!keep.has(r.id)) await db.prepare('DELETE FROM terms WHERE id = ?').run(r.id);
    // The term pinned on NEXT9 (or "auto").
    let pin = 'auto';
    if (school.mode === 'pinned' && school.current) {
      const row = await db.prepare('SELECT id FROM terms WHERE semester = ? AND year = ?').get(school.current.semester, school.current.year);
      if (row) pin = String(row.id);
    }
    await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('current_term', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE settings.value <> excluded.value`).run(pin);
  }
  if (Array.isArray(school.grades) && school.grades.length) {
    const rooms = {};
    for (const g of school.grades) if (g.grade >= 1 && g.grade <= 6 && g.rooms > 0) rooms[g.grade] = g.rooms;
    await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('rooms_per_grade', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE settings.value <> excluded.value`).run(JSON.stringify(rooms));
  }
}

// Copies NEXT9's terms and rooms if the last copy is older than 5 minutes (force: now).
async function syncFromNext9(db, { force = false } = {}) {
  if (!ENABLED) return false;
  if (!force && Date.now() - last < EVERY_MS) return false;
  if (running) return running;
  last = Date.now();
  running = (async () => {
    try {
      const school = await fetchSchool();
      if (school) await apply(db, school);
      return true;
    } catch (e) {
      console.warn('[next9-sync] skipped:', e.message);
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

module.exports = { syncFromNext9, syncEnabled, NEXT9_URL };
