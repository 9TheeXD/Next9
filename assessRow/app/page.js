'use client';

// Summary page. Everything the original page (now app/v1/page.js) shows is here, but on one
// screen instead of behind four buttons and their modals: one period picker at the top drives every
// number on the page, each grade is a card with its score, trend and criteria, and a tap opens that
// grade's rooms. It reads the same APIs as the original page.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, FileDown, Info, Medal, TrendingDown, TrendingUp, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { getScoreLabel, getScoreLevel } from '@/lib/scoreUtils';
import { useStudentView } from './components/StudentView';
import {
  CRITERIA,
  GRADES,
  ROOMS_PER_GRADE,
  FALLBACK_TERMS,
  bangkokToday,
  studentMaxDate,
  thaiShortDate,
  thaiRange,
  weekRange,
  monthBack,
  weekLabel,
  weeklyTrend,
  mean,
} from '@/lib/dashboardShared';
import './v2/v2.css';

// Loaded on first use (a grade sheet opening), not with the page.
const FullTrendChart = dynamic(() => import('./components/FullTrendChart'), {
  ssr: false,
  loading: () => <div className="v2-empty" style={{ height: 150 }}><span className="v2-spin" /></div>,
});

// The period chips. Terms come from /admin (only those set to show on this page), oldest first;
// their key is t<id>.
const isTermPeriod = (p) => /^t\d+$/.test(p);
function periodsFor(terms, curYear) {
  const shown = terms.filter((t) => t.showOnHome !== false).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return [
    { key: 'week', label: 'สัปดาห์นี้' },
    { key: '1m', label: '1 เดือน' },
    ...shown.map((t) => ({ key: `t${t.id}`, label: t.shortName || t.name })),
    { key: 'year', label: curYear ? `ปีการศึกษา ${curYear}` : 'ปีการศึกษา' },
    { key: 'custom', label: 'กำหนดเอง' },
  ];
}

const BASES = [
  { key: 'rooms', label: 'เฉลี่ยจากทุกห้อง', hint: 'ค่าเฉลี่ยของคะแนนที่ประเมินแยกแต่ละห้อง' },
  { key: 'overall', label: 'ประเมินรวมทั้งระดับ', hint: 'คะแนนที่ประเมินทั้งระดับชั้นพร้อมกัน (สภานักเรียน 40% ครู 60%)' },
];

// Students: "สัปดาห์ 4/ต.ค. – 1/พ.ย.", or one week alone.
const weekRangeText = (r) => {
  const a = weekLabel(r.start);
  const b = weekLabel(r.end);
  return a === b ? `สัปดาห์ ${a}` : `สัปดาห์ ${a} – ${b}`;
};

const fmt = (v) => (v > 0 ? Number(v).toFixed(2) : '-');

// Answers kept for the visit, so going back to a period is instant and periods can be fetched ahead.
// A range that ends before today cannot change any more and is kept for good; one that includes today
// is reused for two minutes.
const responses = new Map();
const FRESH_MS = 2 * 60 * 1000;
function getJson(url, closed) {
  const hit = responses.get(url);
  if (hit && (closed || Date.now() - hit.at < FRESH_MS)) return hit.promise;
  // Started by the inline script in layout.js before this code loaded; used once.
  const early = typeof window !== 'undefined' && window.__dashPre && window.__dashPre[url];
  if (early) delete window.__dashPre[url];
  const promise = (early || fetch(url)).then((r) => {
    if (!r.ok) throw new Error(r.status === 503 ? 'ระบบปิดปรับปรุงชั่วคราว' : 'โหลดข้อมูลไม่สำเร็จ');
    return r.json();
  });
  responses.set(url, { at: Date.now(), promise });
  promise.catch(() => responses.get(url)?.promise === promise && responses.delete(url));
  return promise;
}

// The last answers this browser got, kept so the next visit can draw the page at once (then refresh).
// Only small ranges are kept; a whole term is too big for localStorage.
const SAVED_KEY = 'dash_last_v1';
function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
  } catch {
    return null;
  }
}
function writeSaved(v) {
  try {
    const text = JSON.stringify(v);
    if (text.length < 400000) localStorage.setItem(SAVED_KEY, text);
  } catch {}
}

// Splits a series into one key per term (s1, s2 ...) and drops days outside every term, so each term
// is drawn as its own line and the break between terms is neither joined up nor counted.
function splitByTerm(series, terms) {
  const out = [];
  for (const row of series || []) {
    const t = terms.find((x) => row.date >= x.startDate && row.date <= x.endDate);
    if (!t) continue;
    out.push({ ...row, [`s${t.id}`]: row.score });
  }
  return out;
}
const termKeys = (data) => [...new Set((data || []).flatMap((r) => Object.keys(r).filter((k) => /^s\d+$/.test(k))))];

function ScorePill({ value, size }) {
  const level = getScoreLevel(value || 0);
  return (
    <span className={`v2-pill v2-lv${level}${size === 'lg' ? ' v2-pill-lg' : ''}`}>
      {value > 0 ? getScoreLabel(value) : 'ไม่มีข้อมูล'}
    </span>
  );
}

function ScoreBar({ value }) {
  const level = getScoreLevel(value || 0);
  return (
    <span className="v2-bar">
      <span className={`v2-bar-fill v2-bg${level}`} style={{ width: `${Math.max(0, Math.min(100, ((value || 0) / 5) * 100))}%` }} />
    </span>
  );
}

function TrendChart({ data, height, weekly, color = '#b91c1c', compact }) {
  if (!data || data.length === 0) return <div className="v2-empty" style={{ height }}>ยังไม่มีข้อมูลช่วงนี้</div>;
  if (compact) return <Sparkline data={data} keys={termKeys(data)} height={height} color={color} />;
  return <FullTrendChart data={data} height={height} weekly={weekly} color={color} />;
}

// The small chart on each grade card. Plain SVG: six chart-library charts were most of the time the
// page took to redraw on a phone. One path per term; days without data are skipped over within a term.
function Sparkline({ data, keys, height, color }) {
  const W = 300;
  const pad = 3;
  const n = data.length;
  const x = (i) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const y = (v) => pad + (1 - v / 5) * (height - 2 * pad);
  const paths = keys.map((k) => {
    let d = '';
    data.forEach((row, i) => {
      const v = row[k];
      if (v > 0) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  });
  // Where one term ends and the next begins: a grey line halfway between them, named on each side.
  const breaks = [];
  data.forEach((row, i) => {
    if (i === 0) return;
    const prev = keys.find((k) => data[i - 1][k] !== undefined);
    const cur = keys.find((k) => row[k] !== undefined);
    if (prev && cur && prev !== cur) breaks.push({ at: ((x(i - 1) + x(i)) / 2 / W) * 100, before: prev.slice(1), after: cur.slice(1) });
  });
  return (
    <div className="v2-spark-box">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden>
        {breaks.map((b) => (
          <line key={b.at} x1={(b.at / 100) * W} x2={(b.at / 100) * W} y1="0" y2={height} stroke="#d1d5db" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}
        {paths.map((d, i) => d && <path key={i} d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
      </svg>
      {breaks.map((b) => (
        <TermMark key={b.at} {...b} />
      ))}
    </div>
  );
}

// The two term names beside a term line ("เทอม 1 | เทอม 2"). When the later term is too short
// for its name to fit on the right, both names slide left together so neither leaves the card.
function TermMark({ at, before, after }) {
  const ref = useRef(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!box) return;
    const fit = () => {
      const room = box.clientWidth - (box.clientWidth * at) / 100 - 4;
      setShift(Math.min(0, room - el.lastChild.offsetWidth));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [at]);
  return (
    <span ref={ref} className="v2-spark-term" style={{ left: `${at}%`, transform: shift ? `translateX(${shift}px)` : undefined }}>
      <span className="is-before">เทอม {before}</span>
      <span className="is-after">เทอม {after}</span>
    </span>
  );
}

function Delta({ series }) {
  // First half vs second half of the period: whether the grade is getting better or worse.
  const real = (series || []).filter((d) => d.score > 0);
  if (real.length < 4) return null;
  const half = Math.floor(real.length / 2);
  const a = mean(real.slice(0, half).map((d) => d.score));
  const b = mean(real.slice(real.length - half).map((d) => d.score));
  if (a == null || b == null) return null;
  const diff = b - a;
  if (Math.abs(diff) < 0.05) return <span className="v2-delta">คงที่</span>;
  return (
    <span className={`v2-delta ${diff > 0 ? 'is-up' : 'is-down'}`}>
      {diff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {diff > 0 ? '+' : ''}
      {diff.toFixed(2)}
    </span>
  );
}


// Re-renders only when its own grade's numbers change, not on every loading flag or ranking update.
// Grey shimmering placeholder shown where a number will appear while its data loads.
const Sk = ({ w = '100%', h = 14, r = 8, style }) => <span className="v2-skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden />;

const GradeCard = memo(function GradeCard({ grade: g, gv, series, showCoverage, placeholder, onOpen }) {
  return (
    <div
      className="v2-card v2-grade"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(g)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(g))}
      aria-label={`ดูรายละเอียด ม.${g}`}
    >
      <div className="v2-grade-top">
        <span className="v2-grade-name">ม.{g}</span>
        {gv && <Delta series={series} />}
        <ChevronRight size={18} className="v2-muted" />
      </div>
      <div className="v2-grade-score">
        {gv ? (
          <>
            <span className={`v2-mid v2-tx${getScoreLevel(gv.score || 0)}`}>{fmt(gv.score)}</span>
            <ScorePill value={gv.score} />
          </>
        ) : (
          <>
            <Sk w={82} h={34} />
            <Sk w={46} h={20} r={999} />
          </>
        )}
      </div>
      <div className="v2-spark">{!gv || placeholder ? <Sk h={40} style={{ marginTop: 4 }} /> : <TrendChart data={series} height={48} compact />}</div>
      <div className="v2-crit-mini">
        {CRITERIA.map((c, i) => (
          <div key={c.id} className="v2-crit-mini-row" title={c.text}>
            <span>{c.short}</span>
            {gv ? <ScoreBar value={gv.criteria[i]} /> : <Sk h={8} />}
            {gv ? <b className={`v2-tx${getScoreLevel(gv.criteria[i] || 0)}`}>{fmt(gv.criteria[i])}</b> : <Sk w={30} h={12} style={{ justifySelf: 'end' }} />}
          </div>
        ))}
      </div>
      {showCoverage && gv && (
        <div className="v2-coverage">
          ประเมินแล้ว {gv.evaluated}/{gv.total} ห้อง
        </div>
      )}
    </div>
  );
});

export default function DashboardV2() {
  const { data: session, status } = useSession();
  const { isStudentView } = useStudentView(session);
  const isStaff = status === 'authenticated' && session?.user?.role !== 'student' && !isStudentView;

  const today = useMemo(() => bangkokToday(), []);
  const maxDate = useMemo(() => (isStudentView ? studentMaxDate() : null), [isStudentView]);
  const [terms, setTerms] = useState(FALLBACK_TERMS);
  // Rooms per grade (admin setting); ROOMS_PER_GRADE until it answers.
  const [roomsPerGrade, setRoomsPerGrade] = useState(ROOMS_PER_GRADE);
  useEffect(() => {
    fetch('/api/settings/rooms')
      .then((r) => r.json())
      .then((d) => d.rooms && setRoomsPerGrade(d.rooms))
      .catch(() => {});
  }, []);
  const [currentTerm, setCurrentTerm] = useState('2');
  const [period, setPeriod] = useState('1m');
  const [custom, setCustom] = useState(() => ({ start: monthBack(today), end: today }));
  const [basis, setBasis] = useState('rooms');

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState(null);
  // Which range the numbers on screen belong to. Numbers from another range are never shown while
  // the new ones load (skeletons instead), so nothing on screen belongs to the wrong period.
  const [shownKey, setShownKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openGrade, setOpenGrade] = useState(null);
  const [rankTab, setRankTab] = useState('rooms');
  const [rankGrade, setRankGrade] = useState(0);
  const [ranking, setRanking] = useState({ key: '', rows: [], loading: false });
  const [showAllRanks, setShowAllRanks] = useState(false);
  const [exporting, setExporting] = useState(false);

  // A student sent here from the evaluation page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'unauthorized_eval') {
      setError('คุณไม่มีสิทธิ์ในการประเมิน');
      params.delete('error');
      window.history.replaceState(null, '', '/' + (params.toString() ? '?' + params : ''));
    }
  }, []);

  useEffect(() => {
    fetch('/api/settings/term')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.terms) && d.terms.length) setTerms(d.terms);
        if (d.currentTerm) setCurrentTerm(String(d.currentTerm));
        // For the early requests in layout.js on the next visit ("1 เดือน" starts no earlier than this).
        const cur = d.terms?.find((t) => t.id === String(d.currentTerm));
        try {
          if (cur) localStorage.setItem('dash_term_start', cur.startDate);
        } catch {}
      })
      .catch(() => {});
  }, []);

  const termById = useCallback((id) => terms.find((t) => String(t.id) === id) || FALLBACK_TERMS.find((t) => t.id === id), [terms]);
  const periods = useMemo(() => periodsFor(terms, (termById(currentTerm) || terms[0])?.year), [terms, termById, currentTerm]);

  // The dates every request on the page uses.
  const computeRange = useCallback((period) => {
    const cur = termById(currentTerm) || terms[0] || FALLBACK_TERMS[0];
    const clampEnd = (e) => {
      let end = e > today ? today : e;
      if (maxDate && end > maxDate) end = maxDate;
      return end;
    };
    let r;
    if (period === 'week') r = weekRange(maxDate && maxDate < today ? maxDate : today);
    else if (period === '1m') {
      const back = monthBack(today);
      r = { start: back < cur.startDate ? cur.startDate : back, end: today };
    } else if (isTermPeriod(period)) {
      const t = termById(period.slice(1)) || cur;
      r = { start: t.startDate, end: t.endDate };
    } else if (period === 'year') {
      // From the first term of the current term's academic year.
      const sameYear = terms.filter((t) => t.year === cur.year);
      r = { start: sameYear.length ? sameYear.reduce((m, t) => (t.startDate < m ? t.startDate : m), cur.startDate) : cur.startDate, end: today };
    }
    else r = { start: custom.start, end: custom.end };
    const end = clampEnd(r.end);
    return { start: r.start > end ? end : r.start, end };
  }, [custom, today, maxDate, termById, currentTerm, terms]);
  const range = useMemo(() => computeRange(period), [computeRange, period]);

  const weekly = isStudentView;
  useEffect(() => {
    if (weekly && period === 'week') setPeriod('1m');
  }, [weekly, period]);

  // Summary + trend for the range. A slower answer for a range the user has already left is dropped.
  const reqId = useRef(0);
  const urlsFor = useCallback(
    (r, p) => {
      const q = `startDate=${r.start}&endDate=${r.end}&terms=1`;
      // A finished term has a stored result on the server (see trend/route.js); ask for it that way.
      const t = isTermPeriod(p) ? termById(p.slice(1)) : null;
      const trendQ = t && t.endDate < today ? `period=all&term=${t.id}&terms=1` : q;
      return { summary: `/api/evaluations/summary?${q}`, trend: `/api/evaluations/trend?${trendQ}`, q, closed: r.end < today };
    },
    [today, termById],
  );
  // Requests start straight away rather than after the session check: the API reads the session
  // cookie itself, and waiting cost a full round trip before any data was asked for.
  useEffect(() => {
    const id = ++reqId.current;
    const u = urlsFor(range, period);
    setLoading(true);
    setError('');
    const show = (s, t) => {
      let tr = t;
        if (maxDate) {
          tr = {
            gradeAverages: tr.gradeAverages.filter((d) => d.date <= maxDate),
            roomDetails: tr.roomDetails.filter((d) => d.date <= maxDate),
          };
        }
      if (weekly) tr = weeklyTrend(tr);
      setSummary(s);
      setTrend(tr);
      setShownKey(u.summary);
    };
    // The numbers from the last visit, shown while this visit's are on their way.
    if (!responses.has(u.summary)) {
      const saved = readSaved();
      if (saved && saved.summaryUrl === u.summary && saved.trendUrl === u.trend) show(saved.summary, saved.trend);
    }
    Promise.all([getJson(u.summary, u.closed), getJson(u.trend, u.closed)])
      .then(([s, t]) => {
        if (id !== reqId.current) return;
        show(s, t);
        writeSaved({ summaryUrl: u.summary, trendUrl: u.trend, summary: s, trend: t });
      })
      .catch((e) => id === reqId.current && setError(e.message || 'โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => id === reqId.current && setLoading(false));
  }, [range, period, weekly, maxDate, urlsFor]);

  // Once the page has its first numbers, fetch the other preset periods quietly so switching is instant.
  const prefetched = useRef(false);
  useEffect(() => {
    if (prefetched.current || loading || !summary) return;
    prefetched.current = true;
    const run = () => {
      import('./components/FullTrendChart').catch(() => {});
      [...periods.filter((x) => isTermPeriod(x.key)).map((x) => x.key), 'year', 'week'].forEach((p) => {
        if (p === period) return;
        const r = computeRange(p);
        const u = urlsFor(r, p);
        getJson(u.summary, u.closed).catch(() => {});
        getJson(u.trend, u.closed).catch(() => {});
        getJson(`/api/evaluations/ranking?startDate=${r.start}&endDate=${r.end}&terms=1&type=all_rooms`, u.closed).catch(() => {});
      });
    };
    const t = setTimeout(run, 600);
    return () => clearTimeout(t);
  }, [loading, summary, period, urlsFor, computeRange, periods]);

  // ----- Derived numbers -----
  const currentKey = urlsFor(range, period).summary;
  const ready = !!summary && shownKey === currentKey;
  const view = useMemo(() => {
    if (!summary) return null;
    const roomAvg = summary.roomAverages || [];
    const details = summary.details || [];
    const grades = GRADES.map((g) => {
      const rooms = roomAvg.filter((r) => r.grade === g && r.room !== 0);
      const evaluatedRooms = rooms.filter((r) => r.avg_score > 0);
      const overallRow = roomAvg.find((r) => r.grade === g && r.room === 0);
      const score = basis === 'overall' ? (overallRow?.avg_score > 0 ? overallRow.avg_score : null) : mean(evaluatedRooms.map((r) => r.avg_score));
      const criteria = CRITERIA.map((c) => {
        if (basis === 'overall') {
          const d = details.find((x) => x.grade === g && x.room === 0 && x.criterion === c.id);
          return d?.avg_score > 0 ? d.avg_score : null;
        }
        return mean(details.filter((x) => x.grade === g && x.room !== 0 && x.criterion === c.id).map((x) => x.avg_score));
      });
      return { grade: g, score, criteria, rooms, evaluated: evaluatedRooms.length, total: roomsPerGrade[g] || ROOMS_PER_GRADE[g] };
    });
    const schoolScore = mean(grades.map((g) => g.score));
    const ranked = grades.filter((g) => g.score > 0).sort((a, b) => b.score - a.score);
    const allRooms = roomAvg.filter((r) => r.room !== 0 && r.avg_score > 0).sort((a, b) => b.avg_score - a.avg_score);
    const schoolCriteria = CRITERIA.map((c, i) => ({ ...c, score: mean(grades.map((g) => g.criteria[i])) }));
    return { grades, schoolScore, bestGrade: ranked[0], worstGrade: ranked[ranked.length - 1], topRoom: allRooms[0], schoolCriteria, roomsEvaluated: allRooms.length };
  }, [summary, basis, roomsPerGrade]);

  const gradeSeries = useMemo(() => {
    const out = {};
    if (!trend) return out;
    GRADES.forEach((g) => {
      if (basis === 'overall') {
        out[g] = splitByTerm(
          trend.gradeAverages.filter((r) => r.grade === g).map((r) => ({ date: r.date, score: r.avg_score || null, c1: r.c1, c2: r.c2, c3: r.c3, c4: r.c4, c5: r.c5 })),
          terms,
        );
      } else {
        const byDate = new Map();
        trend.roomDetails.forEach((r) => {
          if (r.grade !== g) return;
          if (!byDate.has(r.date)) byDate.set(r.date, []);
          byDate.get(r.date).push(r);
        });
        out[g] = splitByTerm(
          [...byDate.entries()].map(([date, rows]) => {
            const row = { date, score: mean(rows.map((r) => r.avg_score)) };
            for (let i = 1; i <= 5; i++) row[`c${i}`] = mean(rows.map((r) => r[`c${i}`]));
            return row;
          }),
          terms,
        );
      }
    });
    return out;
  }, [trend, basis, terms]);

  const roomSeries = useCallback(
    (grade, room) =>
      splitByTerm(
        (trend?.roomDetails || [])
          .filter((r) => r.grade === grade && r.room === room)
          .map((r) => ({ date: r.date, score: r.avg_score || null, c1: r.c1, c2: r.c2, c3: r.c3, c4: r.c4, c5: r.c5 })),
        terms,
      ),
    [trend, terms],
  );

  // ----- Ranking (same API and order as the original page's ranking modal) -----
  const rankType = rankTab === 'grades' ? (basis === 'overall' ? 'overall_grade' : 'grade') : rankGrade ? 'specific_grade' : 'all_rooms';
  const rankKey = `${rankType}|${rankGrade}|${range.start}|${range.end}`;
  useEffect(() => {
    let gone = false;
    setRanking((r) => ({ ...r, loading: true }));
    let url = `/api/evaluations/ranking?startDate=${range.start}&endDate=${range.end}&terms=1&type=${rankType}`;
    if (rankType === 'specific_grade') url += `&grade=${rankGrade}`;
    getJson(url, range.end < today)
      .then((d) => !gone && setRanking({ key: rankKey, rows: d.rankings || [], loading: false }))
      .catch(() => !gone && setRanking({ key: rankKey, rows: [], loading: false }));
    return () => {
      gone = true;
    };
  }, [rankKey, rankType, rankGrade, range.start, range.end, status, today]);
  useEffect(() => setShowAllRanks(false), [rankKey]);

  async function exportWord() {
    if (exporting || !ready) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/evaluations/summary?startDate=${range.start}&endDate=${range.end}&terms=1`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const { generateWordDocumentBlob } = await import('@/lib/exportWord');
      const blob = await generateWordDocumentBlob(range.start, range.end, data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `รายงานระเบียบแถว_${range.start}_ถึง_${range.end}.docx`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch {
      setError('สร้างเอกสาร Word ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  }

  const basisInfo = BASES.find((b) => b.key === basis);
  const shown = ready ? view : null;
  const openG = openGrade && shown ? shown.grades.find((g) => g.grade === openGrade) : null;

  return (
    <div className={`v2${weekly ? ' is-student' : ''}`}>
      {/* Period: one control for the whole page */}
      <div className="v2-toolbar">
        <div className="v2-toolbar-inner">
          <div className="v2-chips" role="tablist" aria-label="ช่วงเวลา">
            {/* Students see whole weeks only, so "this week" would be a single point. */}
            {periods.filter((p) => !(weekly && p.key === 'week')).map((p) => (
              <button key={p.key} role="tab" aria-selected={period === p.key} className={`v2-chip${period === p.key ? ' is-on' : ''}`} onClick={() => setPeriod(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="v2-range">
            <CalendarDays size={15} />
            {period === 'custom' ? (
              <span className="v2-custom">
                <input type="date" value={custom.start} max={maxDate || today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: e.target.value }))} aria-label="ตั้งแต่วันที่" />
                <span>ถึง</span>
                <input type="date" value={custom.end} max={maxDate || today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: e.target.value }))} aria-label="ถึงวันที่" />
              </span>
            ) : (
              <span>{weekly ? weekRangeText(range) : thaiRange(range.start, range.end)}</span>
            )}
            {loading && <span className="v2-spin" aria-label="กำลังโหลด" />}
          </div>
        </div>
      </div>

      <div className="v2-page">
        {isStaff && (
          <div className="v2-actions">
            <Link href="/evaluate" className="v2-cta">
              <span>
                <b>ประเมินแถว</b>
                <small>บันทึกคะแนนของวันนี้</small>
              </span>
              <ArrowRight size={22} />
            </Link>
            {/* Disabled until the numbers for the chosen range are on screen, so a quick change of
                period followed by a tap cannot export a range the user has not seen yet. */}
            <button className="v2-btn" onClick={exportWord} disabled={exporting || !ready} aria-busy={exporting || !ready}>
              {exporting || !ready ? <span className="v2-spin" /> : <FileDown size={18} />} {exporting ? 'กำลังสร้างไฟล์…' : !ready ? 'กำลังโหลด…' : 'ส่งออก Word ช่วงนี้'}
            </button>
          </div>
        )}

        {error && <div className="v2-error">{error}</div>}

        {/* Basis: what "the grade's score" means */}
        <div className="v2-basis">
          <div className="v2-seg" role="tablist" aria-label="วิธีคิดคะแนนระดับชั้น">
            {BASES.map((b) => (
              <button key={b.key} role="tab" aria-selected={basis === b.key} className={basis === b.key ? 'is-on' : ''} onClick={() => setBasis(b.key)}>
                {b.label}
              </button>
            ))}
          </div>
          <p className="v2-hint">
            <Info size={14} /> {basisInfo.hint}
          </p>
        </div>

        {/* Headline numbers */}
        <section className="v2-hero">
          <div className="v2-hero-main">
            <span className="v2-label">คะแนนเฉลี่ยทั้งโรงเรียน</span>
            <div className="v2-hero-score">
              {shown ? <span className={`v2-big v2-tx${getScoreLevel(shown.schoolScore || 0)}`}>{fmt(shown.schoolScore)}</span> : <Sk w={96} h={40} />}
              <span className="v2-of">/ 5</span>
            </div>
            {shown ? <ScorePill value={shown.schoolScore} size="lg" /> : <Sk w={64} h={28} r={999} />}
          </div>
          <div className="v2-hero-stats">
            <div className="v2-stat">
              <span className="v2-label">ระดับชั้นที่ดีที่สุด</span>
              {shown ? (
                <>
                  <b>{shown?.bestGrade ? `ม.${shown.bestGrade.grade}` : '-'}</b>
                  <small className={`v2-tx${getScoreLevel(shown?.bestGrade?.score || 0)}`}>{shown?.bestGrade ? fmt(shown.bestGrade.score) : ''}</small>
                </>
              ) : (
                <>
                  <Sk w={56} h={22} style={{ margin: '4px 0' }} />
                  <Sk w={36} h={12} />
                </>
              )}
            </div>
            <div className="v2-stat">
              <span className="v2-label">ห้องคะแนนสูงสุด</span>
              {shown ? (
                <>
                  <b>{shown?.topRoom ? `ม.${shown.topRoom.grade}/${shown.topRoom.room}` : '-'}</b>
                  <small className={`v2-tx${getScoreLevel(shown?.topRoom?.avg_score || 0)}`}>{shown?.topRoom ? fmt(shown.topRoom.avg_score) : ''}</small>
                </>
              ) : (
                <>
                  <Sk w={56} h={22} style={{ margin: '4px 0' }} />
                  <Sk w={36} h={12} />
                </>
              )}
            </div>
            <div className="v2-stat">
              <span className="v2-label">ควรพัฒนา</span>
              {shown ? (
                <>
                  <b>{shown?.worstGrade && shown.worstGrade !== shown.bestGrade ? `ม.${shown.worstGrade.grade}` : '-'}</b>
                  <small className={`v2-tx${getScoreLevel(shown?.worstGrade?.score || 0)}`}>{shown?.worstGrade && shown.worstGrade !== shown.bestGrade ? fmt(shown.worstGrade.score) : ''}</small>
                </>
              ) : (
                <>
                  <Sk w={56} h={22} style={{ margin: '4px 0' }} />
                  <Sk w={36} h={12} />
                </>
              )}
            </div>
          </div>
        </section>

        {/* Grades */}
        <h2 className="v2-h2">รายระดับชั้น</h2>
        <div className="v2-grades">
          {GRADES.map((g) => {
            const gv = shown?.grades.find((x) => x.grade === g);
            const series = ready ? gradeSeries[g] : undefined;
            return (
              <GradeCard key={g} grade={g} gv={gv} series={series} showCoverage={basis === 'rooms'} placeholder={!series} onOpen={setOpenGrade} />
            );
          })}
        </div>

        {/* Criteria across the school */}
        <h2 className="v2-h2">รายข้อ ทั้งโรงเรียน</h2>
        <section className="v2-card v2-criteria">
          {(shown?.schoolCriteria || CRITERIA)
            .slice()
            .sort((a, b) => (a.score ?? 9) - (b.score ?? 9))
            .map((c, i) => (
              <div key={c.id} className="v2-crit-row">
                <div className="v2-crit-text">
                  <span className="v2-crit-no">{c.id}</span>
                  <span>{c.text}</span>
                  {i === 0 && c.score > 0 && <span className="v2-flag">ต่ำสุด</span>}
                </div>
                <div className="v2-crit-val">
                  {shown ? <ScoreBar value={c.score} /> : <Sk h={8} />}
                  {shown ? <b className={`v2-tx${getScoreLevel(c.score || 0)}`}>{fmt(c.score)}</b> : <Sk w={36} h={14} />}
                </div>
              </div>
            ))}
        </section>

        {/* Ranking */}
        <h2 className="v2-h2">อันดับ</h2>
        <section className="v2-card v2-rank">
          <div className="v2-rank-head">
            <div className="v2-seg v2-seg-sm">
              <button className={rankTab === 'rooms' ? 'is-on' : ''} onClick={() => setRankTab('rooms')}>ห้องเรียน</button>
              <button className={rankTab === 'grades' ? 'is-on' : ''} onClick={() => setRankTab('grades')}>ระดับชั้น</button>
            </div>
            {rankTab === 'rooms' && (
              <div className="v2-chips v2-chips-sm">
                {[0, ...GRADES].map((g) => (
                  <button key={g} className={`v2-chip${rankGrade === g ? ' is-on' : ''}`} onClick={() => setRankGrade(g)}>
                    {g ? `ม.${g}` : 'ทุกชั้น'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {rankTab === 'grades' && <p className="v2-hint">{basisInfo.hint}</p>}
          {ranking.key !== rankKey ? (
            <ol className="v2-rank-list" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="v2-rank-row">
                  <Sk w={26} h={14} />
                  <Sk w={56} h={14} />
                  <Sk h={8} />
                  <Sk w={36} h={14} style={{ justifySelf: 'end' }} />
                </li>
              ))}
            </ol>
          ) : ranking.rows.length === 0 ? (
            <div className="v2-empty" style={{ height: 120 }}>ไม่พบข้อมูลในช่วงเวลานี้</div>
          ) : (
            <>
              <ol className="v2-rank-list">
                {(showAllRanks ? ranking.rows : ranking.rows.slice(0, 10)).map((row, idx) => {
                  const rank = ranking.rows.findIndex((r) => r.avg_score === row.avg_score) + 1;
                  return (
                    <li key={idx} className={`v2-rank-row${rank <= 3 ? ` is-top is-top${rank}` : ''}`}>
                      <span className="v2-rank-no">{rank <= 3 ? <Medal size={18} /> : null}{rank}</span>
                      <span className="v2-rank-name">{row.room ? `ม.${row.grade}/${row.room}` : `ม.${row.grade}`}</span>
                      <ScoreBar value={row.avg_score} />
                      <b className={`v2-rank-score v2-tx${getScoreLevel(row.avg_score || 0)}`}>{fmt(row.avg_score)}</b>
                    </li>
                  );
                })}
              </ol>
              {ranking.rows.length > 10 && (
                <button className="v2-more" onClick={() => setShowAllRanks((v) => !v)}>
                  {showAllRanks ? 'แสดงน้อยลง' : `ดูทั้งหมด ${ranking.rows.length} อันดับ`} <ChevronDown size={16} style={{ transform: showAllRanks ? 'rotate(180deg)' : undefined }} />
                </button>
              )}
            </>
          )}
        </section>

        <div className="v2-legend">
          {[5, 4, 3, 2, 1].map((lv) => (
            <span key={lv} className={`v2-pill v2-lv${lv}`}>{getScoreLabel(lv === 5 ? 5 : lv === 4 ? 4 : lv === 3 ? 3 : lv === 2 ? 2 : 1)} {lv === 5 ? '4.80+' : lv === 4 ? '3.80+' : lv === 3 ? '2.80+' : lv === 2 ? '1.80+' : '< 1.80'}</span>
          ))}
        </div>
        <p className="v2-footer">
          <Link href={isStudentView && session?.user?.role !== 'student' ? '/v1?view=student' : '/v1'}>ใช้หน้าแบบเดิม</Link>
        </p>
      </div>

      {openG && (
        <GradeSheet
          grade={openG}
          basis={basis}
          series={gradeSeries[openG.grade]}
          roomSeries={roomSeries}
          weekly={weekly}
          rangeText={weekly ? weekRangeText(range) : thaiRange(range.start, range.end)}
          details={summary?.details || []}
          onClose={() => setOpenGrade(null)}
        />
      )}
    </div>
  );
}

function GradeSheet({ grade, basis, series, roomSeries, weekly, rangeText, details, onClose }) {
  const [openRoom, setOpenRoom] = useState(null);
  const [sort, setSort] = useState('room');
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const rooms = Array.from({ length: grade.total }, (_, i) => {
    const room = i + 1;
    const row = grade.rooms.find((r) => r.room === room);
    return { room, score: row?.avg_score > 0 ? row.avg_score : null };
  });
  const sorted = sort === 'score' ? rooms.slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) : rooms;

  return (
    <div className="v2-sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="v2-sheet" role="dialog" aria-modal="true" aria-label={`ม.${grade.grade}`}>
        <div className="v2-sheet-head">
          <div className="v2-sheet-title">
            <div className="v2-sheet-score">
              <h3>ม.{grade.grade}</h3>
              <span className={`v2-mid v2-tx${getScoreLevel(grade.score || 0)}`}>{fmt(grade.score)}</span>
              <ScorePill value={grade.score} />
            </div>
            <small>{rangeText} · {BASES.find((b) => b.key === basis).label}</small>
          </div>
          <button className="v2-close" onClick={onClose} aria-label="ปิด"><X size={22} /></button>
        </div>
        <div className="v2-sheet-body">
          <h4>แนวโน้ม</h4>
          <div className="v2-card v2-chart"><TrendChart data={series} height={200} weekly={weekly} /></div>

          <h4>รายข้อ</h4>
          <div className="v2-card v2-criteria">
            {CRITERIA.map((c, i) => (
              <div key={c.id} className="v2-crit-row">
                <div className="v2-crit-text"><span className="v2-crit-no">{c.id}</span><span>{c.text}</span></div>
                <div className="v2-crit-val"><ScoreBar value={grade.criteria[i]} /><b className={`v2-tx${getScoreLevel(grade.criteria[i] || 0)}`}>{fmt(grade.criteria[i])}</b></div>
              </div>
            ))}
          </div>

          <div className="v2-rooms-head">
            <h4>รายห้อง <small>ประเมินแล้ว {grade.evaluated}/{grade.total} ห้อง</small></h4>
            <div className="v2-seg v2-seg-sm">
              <button className={sort === 'room' ? 'is-on' : ''} onClick={() => setSort('room')}>ตามห้อง</button>
              <button className={sort === 'score' ? 'is-on' : ''} onClick={() => setSort('score')}>ตามคะแนน</button>
            </div>
          </div>
          <ul className="v2-rooms">
            {sorted.map(({ room, score }) => {
              const open = openRoom === room;
              return (
                <li key={room} className={open ? 'is-open' : ''}>
                  <button className="v2-room-row" onClick={() => setOpenRoom(open ? null : room)} aria-expanded={open}>
                    <span className="v2-room-name">{grade.grade}/{room}</span>
                    <ScoreBar value={score} />
                    <b className={`v2-tx${getScoreLevel(score || 0)}`}>{fmt(score)}</b>
                    <ChevronDown size={16} className="v2-muted v2-caret" />
                  </button>
                  {open && (
                    <div className="v2-room-detail">
                      <TrendChart data={roomSeries(grade.grade, room)} height={150} weekly={weekly} color="#2563eb" />
                      {CRITERIA.map((c) => {
                        const d = details.find((x) => x.grade === grade.grade && x.room === room && x.criterion === c.id);
                        const v = d?.avg_score > 0 ? d.avg_score : null;
                        return (
                          <div key={c.id} className="v2-crit-mini-row">
                            <span>{c.id}. {c.short}</span>
                            <ScoreBar value={v} />
                            <b className={`v2-tx${getScoreLevel(v || 0)}`}>{fmt(v)}</b>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
