// Date and trend helpers for the /v2 dashboard. Same rules as the original summary page (app/page.js),
// which keeps its own copies so it is not affected by changes here.

export const CRITERIA = [
  { id: 1, text: 'จัดระเบียบแถวเป็นระเบียบเรียบร้อย', short: 'จัดระเบียบแถว' },
  { id: 2, text: 'ไม่พูดคุยขณะทำกิจกรรม', short: 'ไม่พูดคุย' },
  { id: 3, text: 'ร้องเพลงชาติ และเพลงสรรเสริญพระบารมีได้ถูกต้อง เสียงดังชัดเจน โดยพร้อมเพรียงกัน', short: 'ร้องเพลงชาติฯ' },
  { id: 4, text: 'ตั้งใจสวดมนต์ไหว้พระ แผ่เมตตา', short: 'สวดมนต์แผ่เมตตา' },
  { id: 5, text: 'การเดินแถวเข้าชั้นเรียนเป็นระเบียบ', short: 'เดินแถวเป็นระเบียบ' },
];

export const GRADES = [1, 2, 3, 4, 5, 6];
export const ROOMS_PER_GRADE = { 1: 14, 2: 14, 3: 14, 4: 16, 5: 16, 6: 16 };

// Used only until /api/settings/term answers.
export const FALLBACK_TERMS = [
  { id: '2', semester: 2, year: 2569, name: 'เทอม 2/2569', shortName: 'เทอม 2/2569', startDate: '2026-10-26', endDate: '2027-03-31', showOnHome: true },
  { id: '1', semester: 1, year: 2569, name: 'เทอม 1/2569', shortName: 'เทอม 1/2569', startDate: '2026-05-16', endDate: '2026-10-10', showOnHome: true },
];

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const pad = (n) => String(n).padStart(2, '0');
export const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
};

// Today in Bangkok, as YYYY-MM-DD.
export function bangkokToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// The last day a student may see: the most recent Friday that has passed 09:00 (same as
// getStudentMaxDateFrontend in app/page.js and getStudentMaxDate on the server).
export function studentMaxDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
  const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const d = new Date(get('year'), get('month') - 1, get('day'), hour);
  const dow = d.getDay();
  let back;
  if (dow === 5) back = hour < 9 ? 7 : 0;
  else if (dow < 5) back = dow + 2;
  else back = 1;
  d.setDate(d.getDate() - back);
  return toIso(d);
}

export function thaiShortDate(iso, withYear = false) {
  if (!iso) return '';
  const d = fromIso(iso);
  const base = `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
  return withYear ? `${base} ${String(d.getFullYear() + 543).slice(-2)}` : base;
}

export function thaiRange(start, end) {
  if (!start || !end) return '';
  if (start === end) return thaiShortDate(start, true);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${thaiShortDate(start, !sameYear)} – ${thaiShortDate(end, true)}`;
}

// Monday to Friday of the week that contains `todayIso`.
export function weekRange(todayIso) {
  const now = fromIso(todayIso);
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(mon.getDate() - day + 1);
  const fri = new Date(now);
  fri.setDate(fri.getDate() - day + 5);
  return { start: toIso(mon), end: toIso(fri) };
}

export function monthBack(todayIso) {
  const d = fromIso(todayIso);
  d.setMonth(d.getMonth() - 1);
  return toIso(d);
}

// Groups daily trend rows into school weeks (labelled by their Friday), as the student view of the
// original page does.
export function weeklyTrend(data) {
  const label = (dStr) => {
    const d = fromIso(dStr);
    const day = d.getDay() || 7;
    const fri = new Date(d);
    fri.setDate(fri.getDate() + (5 - day));
    return toIso(fri);
  };
  const group = (arr, keyFn) => {
    const order = [];
    const map = {};
    arr.forEach((item) => {
      const k = keyFn(item) + '|' + label(item.date);
      if (!map[k]) {
        order.push(k);
        map[k] = { ...item, date: label(item.date), _n: 0, _s: 0, _c: [0, 0, 0, 0, 0] };
      }
      const g = map[k];
      g._n++;
      g._s += item.avg_score || 0;
      for (let i = 0; i < 5; i++) g._c[i] += item[`c${i + 1}`] || 0;
    });
    return order.map((k) => {
      const g = map[k];
      const out = { ...g, avg_score: g._s / g._n };
      for (let i = 0; i < 5; i++) out[`c${i + 1}`] = g._c[i] / g._n;
      delete out._n;
      delete out._s;
      delete out._c;
      return out;
    });
  };
  return {
    gradeAverages: group(data.gradeAverages, (r) => r.grade),
    roomDetails: group(data.roomDetails, (r) => `${r.grade}-${r.room}`),
  };
}

export const mean = (values) => {
  const v = values.filter((x) => typeof x === 'number' && x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// A school week as students see it: "n/เดือน" = the n-th week of that month, counted by the week's
// Friday (as on the original page's student view). `iso` is any day of the week.
export function weekLabel(iso, long = false) {
  const d = fromIso(iso);
  const day = d.getDay() || 7;
  const fri = new Date(d);
  fri.setDate(fri.getDate() + (5 - day));
  const n = Math.ceil(fri.getDate() / 7);
  const month = THAI_MONTHS_SHORT[fri.getMonth()];
  return long ? `สัปดาห์ที่ ${n} ${month} ${String(fri.getFullYear() + 543).slice(-2)}` : `${n}/${month}`;
}
