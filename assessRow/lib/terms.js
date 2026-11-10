// School terms, kept in the `terms` table so admins can add next year's terms and fix dates on /admin.
// Days outside every term (the break between terms) are not part of the school year: the dashboard
// asks the evaluation APIs to leave them out (terms=1) and draws each term as its own line.
const { getDb } = require('./db');

const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

function termName(semester, year) {
  return `เทอม ${semester}/${year}`;
}

// All terms, newest first. `id` is a string because the dashboard keys its chart lines as s<id>.
function getTerms(db = getDb()) {
  return db
    .prepare('SELECT id, semester, year, start_date, end_date, show_on_home FROM terms ORDER BY start_date DESC')
    .all()
    .map((r) => ({
      id: String(r.id),
      semester: r.semester,
      year: r.year,
      name: termName(r.semester, r.year),
      shortName: `เทอม ${r.semester}/${r.year}`,
      startDate: r.start_date,
      endDate: r.end_date,
      showOnHome: !!r.show_on_home,
    }));
}

// The term the dashboard treats as "now". An admin may pin one (setting current_term = its id);
// otherwise ("auto") it is the term that contains today, or else the latest one that has started,
// so a new term takes over on its first day without anyone touching the settings.
function getCurrentTerm(db = getDb(), today, terms = getTerms(db)) {
  if (!terms.length) return { term: null, mode: 'auto' };
  const pinned = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_term')?.value;
  const pin = pinned && pinned !== 'auto' ? terms.find((t) => t.id === pinned) : null;
  if (pin) return { term: pin, mode: 'manual' };
  const inside = terms.find((t) => t.startDate <= today && today <= t.endDate);
  const started = terms.find((t) => t.startDate <= today); // newest first
  return { term: inside || started || terms[terms.length - 1], mode: 'auto' };
}

// SQL fragment (and its params) that keeps only dates inside a term. `col` is the date column.
function termDateFilter(col, db = getDb()) {
  const terms = getTerms(db);
  if (!terms.length) return { sql: '', params: [] };
  return {
    sql: ' AND (' + terms.map(() => `(${col} >= ? AND ${col} <= ?)`).join(' OR ') + ')',
    params: terms.flatMap((t) => [t.startDate, t.endDate]),
  };
}

// Checks a term from the admin form. Returns an error message, or null when it can be saved.
function validateTerm(db, t, ignoreId = null) {
  if (![1, 2, 3].includes(t.semester)) return 'เทอมต้องเป็น 1, 2 หรือ 3';
  if (!Number.isInteger(t.year) || t.year < 2500 || t.year > 2700) return 'ปีการศึกษาต้องเป็นปี พ.ศ. เช่น 2570';
  if (!isIsoDate(t.startDate) || !isIsoDate(t.endDate)) return 'วันที่ไม่ถูกต้อง';
  if (t.startDate > t.endDate) return 'วันเปิดเทอมต้องมาก่อนวันปิดเทอม';
  const others = getTerms(db).filter((x) => x.id !== String(ignoreId));
  const same = others.find((x) => x.semester === t.semester && x.year === t.year);
  if (same) return `มี${same.name}อยู่แล้ว`;
  const overlap = others.find((x) => t.startDate <= x.endDate && x.startDate <= t.endDate);
  if (overlap) return `ช่วงวันที่ซ้อนกับ${overlap.name}`;
  return null;
}

module.exports = { getTerms, getCurrentTerm, termDateFilter, validateTerm, termName, isIsoDate };
