// Room configuration for each grade
const GRADE_CONFIG = {
  1: { totalRooms: 14, poolRooms: [1,2,3,4,5,6], building1Rooms: [7,8,9,10,11,12] },
  2: { totalRooms: 14, poolRooms: [1,2,3,4,5,6], building1Rooms: [7,8,9,10,11,12] },
  3: { totalRooms: 14, poolRooms: [1,2,3,4,5,6], building1Rooms: [7,8,9,10,11,12] },
  4: { totalRooms: 16, poolRooms: [1,2,3,4], building1Rooms: [5,6,7,8] },
  5: { totalRooms: 16, poolRooms: [1,2,3,4], building1Rooms: [5,6,7,8] },
  6: { totalRooms: 16, poolRooms: [1,2,3,4], building1Rooms: [5,6,7,8] },
};

function getRoomsForZone(grade, zone) {
  const config = GRADE_CONFIG[grade];
  if (!config) return [];
  return Array.from({ length: config.totalRooms }, (_, i) => i + 1);
}

function isValidRoom(grade, room, zone) {
  if (room === 0) return true;
  const rooms = getRoomsForZone(grade, zone);
  return rooms.includes(room);
}

function isValidGrade(grade) {
  return Number.isInteger(grade) && grade >= 1 && grade <= 6;
}

function isValidCriterion(criterion) {
  return Number.isInteger(criterion) && criterion >= 1 && criterion <= 5;
}

function isValidScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= 5;
}

function isValidZone(zone) {
  return zone === 'pool' || zone === 'building1';
}

function isValidDateFormat(dateStr) {
  if (typeof dateStr !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

const CRITERIA = [
  { id: 1, text: 'จัดระเบียบแถวเป็นระเบียบเรียบร้อย' },
  { id: 2, text: 'ไม่พูดคุยขณะทำกิจกรรม' },
  { id: 3, text: 'ร้องเพลงชาติ และเพลงสรรเสริญพระบารมีได้ถูกต้อง เสียงดังชัดเจน' },
  { id: 4, text: 'ตั้งใจสวดมนต์ไหว้พระ แผ่เมตตา' },
  { id: 5, text: 'การเดินแถวเข้าชั้นเรียนเป็นระเบียบ' },
];

const SCORE_LABELS = {
  0: '-',
  1: 'ไม่ผ่าน',
  2: 'ปรับปรุง',
  3: 'พอใช้',
  4: 'ดี',
  5: 'ดีมาก',
};

function getLogicalDateString() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find(p => p.type === type).value;
  
  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  let hour = parseInt(getPart('hour'), 10);
  
  if (hour === 24) hour = 0;

  const bkkDate = new Date(year, month - 1, day, hour);
  if (hour < 7) {
    bkkDate.setDate(bkkDate.getDate() - 1);
  }
  
  const yyyy = bkkDate.getFullYear();
  const mm = String(bkkDate.getMonth() + 1).padStart(2, '0');
  const dd = String(bkkDate.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
}

function getLogicalDate() {
  // Returns a Date object for date math, aligned to the logical day
  const dateStr = getLogicalDateString();
  return new Date(dateStr + 'T00:00:00Z');
}

function getStudentMaxDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find(p => p.type === type).value;
  
  const year = parseInt(getPart('year'), 10);
  const month = parseInt(getPart('month'), 10);
  const day = parseInt(getPart('day'), 10);
  let hour = parseInt(getPart('hour'), 10);
  if (hour === 24) hour = 0;
  
  const bkkTime = new Date(year, month - 1, day, hour);
  
  let dayOfWeek = bkkTime.getDay();
  let daysToSubtract = 0;
  
  if (dayOfWeek === 5) {
    if (hour < 9) {
      daysToSubtract = 7;
    } else {
      daysToSubtract = 0;
    }
  } else if (dayOfWeek < 5) {
    daysToSubtract = dayOfWeek + 2;
  } else {
    daysToSubtract = 1;
  }
  
  bkkTime.setDate(bkkTime.getDate() - daysToSubtract);
  
  const yyyy = bkkTime.getFullYear();
  const mm = String(bkkTime.getMonth() + 1).padStart(2, '0');
  const dd = String(bkkTime.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
}

function checkSystemLock(db, userRole = null) {
  const lockedRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('system_locked');
  if (lockedRow && lockedRow.value === 'true') {
    const untilRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('lock_until');
    if (untilRow && untilRow.value) {
      const untilDate = new Date(untilRow.value);
      if (new Date() > untilDate) {
        return false;
      }
    }
    
    if (userRole) {
      const targetRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('lock_target');
      const lockTarget = targetRow ? targetRow.value : 'all';
      if (lockTarget === 'student' && userRole !== 'student') {
        return false;
      }
    }
    
    return true;
  }
  return false;
}

module.exports = {
  GRADE_CONFIG,
  getRoomsForZone,
  isValidRoom,
  isValidGrade,
  isValidCriterion,
  isValidScore,
  isValidZone,
  isValidDateFormat,
  getLogicalDateString,
  getLogicalDate,
  getStudentMaxDate,
  CRITERIA,
  SCORE_LABELS,
  checkSystemLock,
};

// When evaluations may be entered, in Bangkok time. Admins set it on /admin (settings eval_open_from /
// eval_open_to, "HH:MM"); 07:00 – 08:30 when unset.
const EVAL_WINDOW_DEFAULT = { from: '07:00', to: '08:30' };
const toMinutes = (hhmm) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};
function getEvalWindow(db) {
  const get = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  let from = get('eval_open_from');
  let to = get('eval_open_to');
  if (toMinutes(from) === null || toMinutes(to) === null || toMinutes(from) >= toMinutes(to)) ({ from, to } = EVAL_WINDOW_DEFAULT);
  return { from, to, fromMinutes: toMinutes(from), toMinutes: toMinutes(to) };
}

module.exports.getEvalWindow = getEvalWindow;
module.exports.evalTimeToMinutes = toMinutes;

// Which days evaluations may be entered on. Admins set it on /admin (setting eval_days, JSON):
//   weekdays    days of the week that are open, 0 = Sunday ... 6 = Saturday (all seven when unset)
//   closed      [{ date: 'YYYY-MM-DD', note }] days closed although their weekday is open (holidays)
//   open        [{ date: 'YYYY-MM-DD', note }] days open although their weekday is closed (make-up days)
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
function cleanDayList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .filter((d) => d && isIsoDate(d.date) && !seen.has(d.date) && seen.add(d.date))
    .map((d) => ({ date: d.date, note: String(d.note || '').slice(0, 100) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
function normalizeEvalDays(v) {
  const weekdays = Array.isArray(v?.weekdays) ? [...new Set(v.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : ALL_WEEKDAYS;
  return { weekdays, closed: cleanDayList(v?.closed), open: cleanDayList(v?.open) };
}
function getEvalDays(db) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('eval_days');
    return normalizeEvalDays(row ? JSON.parse(row.value) : null);
  } catch {
    return normalizeEvalDays(null);
  }
}
const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
// Whether `dateStr` (YYYY-MM-DD, Bangkok) is an evaluation day, and why not when it is not.
function evalDayStatus(days, dateStr) {
  const extra = days.open.find((d) => d.date === dateStr);
  if (extra) return { open: true, reason: '' };
  const closed = days.closed.find((d) => d.date === dateStr);
  if (closed) return { open: false, reason: closed.note ? `วันนี้ปิดประเมิน (${closed.note})` : 'วันนี้ปิดประเมิน' };
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (!days.weekdays.includes(dow)) return { open: false, reason: `ไม่เปิดประเมินวัน${THAI_WEEKDAYS[dow]}` };
  return { open: true, reason: '' };
}

module.exports.getEvalDays = getEvalDays;
module.exports.normalizeEvalDays = normalizeEvalDays;
module.exports.evalDayStatus = evalDayStatus;
