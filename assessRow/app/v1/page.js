'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronDown, BarChart3, Trophy, TrendingUp, Medal, ArrowRight, FileDown } from 'lucide-react';
import Link from 'next/link';
import { getScoreLabel, getScoreLevel } from '@/lib/scoreUtils';
import { useSession } from 'next-auth/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Modal from '../components/Modal';
import ExportWordModal from '../components/ExportWordModal';
import Toast from '../components/Toast';
import { useStudentView } from '../components/StudentView';


const CRITERIA = [
  { id: 1, text: 'จัดระเบียบแถวเป็นระเบียบเรียบร้อย' },
  { id: 2, text: 'ไม่พูดคุยขณะทำกิจกรรม' },
  { id: 3, text: 'ร้องเพลงชาติ และเพลงสรรเสริญพระบารมีได้ถูกต้อง เสียงดังชัดเจน โดยพร้อมเพรียงกัน' },
  { id: 4, text: 'ตั้งใจสวดมนต์ไหว้พระ แผ่เมตตา' },
  { id: 5, text: 'การเดินแถวเข้าชั้นเรียนเป็นระเบียบ' },
];

const GRADE_CONFIG = {
  1: { totalRooms: 14 },
  2: { totalRooms: 14 },
  3: { totalRooms: 14 },
  4: { totalRooms: 16 },
  5: { totalRooms: 16 },
  6: { totalRooms: 16 },
};

const LINE_COLORS = ['#b91c1c', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed', '#ec4899', '#059669', '#dc2626', '#1d4ed8', '#15803d', '#a16207', '#6d28d9'];


function getLogicalDateString() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find(p => p.type === type).value;
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

function getStudentMaxDateFrontend() {
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

function formatTrendHeaderAvg(avg) {
  if (!avg || avg <= 0) return 'เฉลี่ย -';
  return `เฉลี่ย ${avg.toFixed(2)} - ${getScoreLabel(avg)}`;
}

function getDefaultDateRange() {
  const logicalStr = getLogicalDateString();
  const [yyyy, mm, dd] = logicalStr.split('-');
  const now = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(mon.getDate() - day + 1);
  const fri = new Date(now);
  fri.setDate(fri.getDate() - day + 5);
  
  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayOfMonth}`;
  };
  return { start: formatDate(mon), end: formatDate(fri) };
}

import ReactDOM from 'react-dom';

const SHORT_CRITERIA = {
  1: 'จัดระเบียบแถว',
  2: 'ไม่พูดคุย',
  3: 'ร้องเพลงชาติฯ',
  4: 'สวดมนต์แผ่เมตตา',
  5: 'เดินแถวเป็นระเบียบ',
};

const CustomTooltipOuter = ({ active, payload, label }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (active && payload && payload.length && typeof document !== 'undefined') {
    const data = payload[0].payload;
    const d = new Date(label);
    const dateStr = isNaN(d.getTime()) ? label : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;

    let left = pos.x + 15;
    let top = pos.y + 15;
    if (typeof window !== 'undefined') {
      if (left + 250 > window.innerWidth) left = pos.x - 260;
      if (top + 150 > window.innerHeight) top = pos.y - 160;
    }

    return ReactDOM.createPortal(
      <div style={{ position: 'fixed', left, top, backgroundColor: '#fff', border: '1px solid #ccc', padding: '10px', borderRadius: '4px', fontSize: '13px', width: 'max-content', maxWidth: '280px', whiteSpace: 'normal', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 99999, pointerEvents: 'none' }}>
        <p style={{ margin: '0 0 5px', fontWeight: 'bold' }}>{dateStr}</p>
        {!data._isRealData && data.score ? (
          <div style={{ margin: '0 0 10px', color: '#d97706', backgroundColor: '#fef3c7', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
            *ไม่มีข้อมูล (แสดงค่าประมาณการจากกราฟ)
          </div>
        ) : null}
        {(!data.score && !data._isRealData) ? (
          <p style={{ margin: '0 0 10px', color: '#9ca3af' }}>ไม่มีข้อมูล</p>
        ) : (
          <>
            <p className={`score-${getScoreLevel(data.score)}`} style={{ margin: '0 0 10px', fontWeight: 'bold' }}>
              คะแนนเฉลี่ยรวม: {Number(data.score).toFixed(2)} - {getScoreLabel(data.score)}
            </p>
            <div>
              {CRITERIA.map(c => {
                const val = data[`c${c.id}`];
                const hasData = val !== null && val !== undefined && val > 0;
                return (
                <div key={c.id} style={{ marginBottom: '4px', lineHeight: '1.2' }}>
                  {c.id}. {SHORT_CRITERIA[c.id]} : <span className={`score-${getScoreLevel(hasData ? val : 0)}`} style={{ fontWeight: 'bold' }}>
                    {hasData ? `เฉลี่ย ${Number(val).toFixed(2)} - ${getScoreLabel(val)}` : '-'}
                  </span>
                </div>
                );
              })}
            </div>
          </>
        )}
      </div>,
      document.body
    );
  }
  return null;
};

const CustomTooltipInner = ({ active, payload, label }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handleMouseMove = (e) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (active && payload && payload.length && typeof document !== 'undefined') {
    const data = payload[0].payload;
    const d = new Date(label);
    const dateStr = isNaN(d.getTime()) ? label : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
    const color = payload[0].stroke || '#b91c1c';

    let left = pos.x + 15;
    let top = pos.y + 15;
    if (typeof window !== 'undefined') {
      if (left + 250 > window.innerWidth) left = pos.x - 260;
      if (top + 150 > window.innerHeight) top = pos.y - 160;
    }

    return ReactDOM.createPortal(
      <div style={{ position: 'fixed', left, top, backgroundColor: '#fff', border: '1px solid #ccc', padding: '10px', borderRadius: '4px', fontSize: '13px', width: 'max-content', maxWidth: '280px', whiteSpace: 'normal', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 99999, pointerEvents: 'none' }}>
        <p style={{ margin: '0 0 5px', fontWeight: 'bold' }}>{dateStr}</p>
        {!data._isRealData && data.score ? (
          <div style={{ margin: '0 0 10px', color: '#d97706', backgroundColor: '#fef3c7', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
            *ไม่มีข้อมูล (แสดงค่าประมาณการจากกราฟ)
          </div>
        ) : null}
        {(!data.score && !data._isRealData) ? (
          <p style={{ margin: '0 0 10px', color: '#9ca3af' }}>ไม่มีข้อมูล</p>
        ) : (
          <>
            <p className={`score-${getScoreLevel(data.score)}`} style={{ margin: '0 0 10px', fontWeight: 'bold' }}>
              คะแนนรวม: {Number(data.score).toFixed(2)} - {getScoreLabel(data.score)}
            </p>
            <div>
              {CRITERIA.map(c => {
                const val = data[`c${c.id}`];
                const hasData = val !== null && val !== undefined && val > 0;
                return (
                <div key={c.id} style={{ marginBottom: '4px', lineHeight: '1.2' }}>
                  {c.id}. {SHORT_CRITERIA[c.id]} : <span className={`score-${getScoreLevel(hasData ? val : 0)}`} style={{ fontWeight: 'bold' }}>
                    {hasData ? `${Number(val).toFixed(2)} - ${getScoreLabel(val)}` : '-'}
                  </span>
                </div>
                );
              })}
            </div>
          </>
        )}
      </div>,
      document.body
    );
  }
  return null;
};

function transformToWeeklyTrend(data) {
  const getWeekLabel = (dStr) => {
     const [y, m, d] = dStr.split('-');
     const dObj = new Date(parseInt(y, 10), parseInt(m, 10)-1, parseInt(d, 10));
     const day = dObj.getDay() || 7;
     const fri = new Date(dObj);
     fri.setDate(fri.getDate() + (5 - day)); // Shift to Friday
     
     const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
     const weekNum = Math.ceil(fri.getDate() / 7);
     const yearShort = (fri.getFullYear() + 543).toString().slice(-2);
     return `สัปดาห์ที่ ${weekNum} ${monthNames[fri.getMonth()]} ${yearShort}`;
  };

  const groupData = (arr, keyFn) => {
    const keysOrder = [];
    const map = {};
    arr.forEach(item => {
      const wLabel = getWeekLabel(item.date);
      const groupKey = keyFn(item) + '|' + wLabel;
      if (!map[groupKey]) {
        keysOrder.push(groupKey);
        map[groupKey] = { ...item, date: wLabel, _count: 0, _sumScore: 0, _c1:0, _c2:0, _c3:0, _c4:0, _c5:0 };
      }
      map[groupKey]._count++;
      map[groupKey]._sumScore += (item.avg_score || 0);
      map[groupKey]._c1 += (item.c1 || 0);
      map[groupKey]._c2 += (item.c2 || 0);
      map[groupKey]._c3 += (item.c3 || 0);
      map[groupKey]._c4 += (item.c4 || 0);
      map[groupKey]._c5 += (item.c5 || 0);
    });
    return keysOrder.map(k => {
      const g = map[k];
      const res = { ...g };
      res.avg_score = Number((g._sumScore / g._count).toFixed(2));
      res.c1 = Number((g._c1 / g._count).toFixed(2));
      res.c2 = Number((g._c2 / g._count).toFixed(2));
      res.c3 = Number((g._c3 / g._count).toFixed(2));
      res.c4 = Number((g._c4 / g._count).toFixed(2));
      res.c5 = Number((g._c5 / g._count).toFixed(2));
      delete res._count; delete res._sumScore; delete res._c1; delete res._c2; delete res._c3; delete res._c4; delete res._c5;
      return res;
    });
  };

  return {
    gradeAverages: groupData(data.gradeAverages, r => r.grade),
    roomDetails: groupData(data.roomDetails, r => `${r.grade}-${r.room}`)
  };
}

export default function SummaryPage() {
  const { data: session, status } = useSession();
  const { isStudentView } = useStudentView(session);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [scoreModalType, setScoreModalType] = useState('overall');
  const [startDate, setStartDate] = useState(getLogicalDateString());
  const [endDate, setEndDate] = useState(getLogicalDateString());
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [expandedGrade, setExpandedGrade] = useState(null);
  const [expandedRoom, setExpandedRoom] = useState(null);
  const [trendPeriod, setTrendPeriod] = useState('1m');
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendType, setTrendType] = useState('overall');
  const [drilldownGrade, setDrilldownGrade] = useState(null);
  const [drilldownModalOpen, setDrilldownModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const [rankingModalOpen, setRankingModalOpen] = useState(false);
  const [rankingStartDate, setRankingStartDate] = useState(getDefaultDateRange().start);
  const [rankingEndDate, setRankingEndDate] = useState(getDefaultDateRange().end);
  const [rankingType, setRankingType] = useState('grade');
  const [rankingGrade, setRankingGrade] = useState(1);
  const [rankingData, setRankingData] = useState([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [studentMaxDate, setStudentMaxDate] = useState(null);
  const [studentWeeks, setStudentWeeks] = useState([]);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' });

  useEffect(() => {
    if (isStudentView) {
      const maxD = getStudentMaxDateFrontend();
      setStudentMaxDate(maxD);
      
      const weeks = [];
      const [y, m, d] = maxD.split('-');
      const maxDateObj = new Date(parseInt(y, 10), parseInt(m, 10)-1, parseInt(d, 10));
      for (let i = 0; i < 20; i++) {
        const fri = new Date(maxDateObj);
        fri.setDate(fri.getDate() - (i * 7));
        const mon = new Date(fri);
        mon.setDate(mon.getDate() - 4);
        
        const formatDate = (dObj) => {
          return `${dObj.getFullYear()}-${String(dObj.getMonth()+1).padStart(2,'0')}-${String(dObj.getDate()).padStart(2,'0')}`;
        };
        
        const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        const weekNum = Math.ceil(fri.getDate() / 7);
        const yearShort = (fri.getFullYear() + 543).toString().slice(-2);
        const label = `สัปดาห์ที่ ${weekNum} ${monthNames[fri.getMonth()]} ${yearShort}`;
        
        weeks.push({
          label,
          start: formatDate(mon),
          end: formatDate(fri),
          valueKey: formatDate(mon) // Use Monday as the key/value
        });
      }
      setStudentWeeks(weeks);
      
      if (weeks.length > 0) {
        setStartDate(weeks[0].start);
        setEndDate(weeks[0].end);
        setRankingStartDate(weeks[0].start);
        setRankingEndDate(weeks[0].end);
      }
    }
  }, [isStudentView]);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia('(hover: none) and (pointer: coarse)').matches);
    
    // Check for unauthorized eval error
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error') === 'unauthorized_eval') {
        setTimeout(() => setToast({ message: 'คุณไม่มีสิทธิ์ในการประเมิน', type: 'error', visible: true }), 100);
        window.history.replaceState(null, '', '/v1');
      }
    }
  }, []);



  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/evaluations/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (err) {
      console.error('Failed to fetch summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [startDate, endDate]);

  // Term 1 is finished, so its trend is kept for the rest of the visit: switching back to it is instant.
  const trendResponseCache = useRef(new Map());
  const trendRequest = useRef(0);
  const fetchTrend = useCallback(async () => {
    // A slower answer for a period the user has already left must not replace the current one.
    const requestId = ++trendRequest.current;
    const cacheable = trendPeriod === 't1';
    const cacheKey = `${trendPeriod}-${isStudentView ? 'student' : 'staff'}`;
    if (cacheable && trendResponseCache.current.has(cacheKey)) {
      setTrendData(trendResponseCache.current.get(cacheKey));
      setTrendLoading(false);
      return;
    }
    setTrendLoading(true);
    try {
      // 't1' / 't2' = a whole term, 'all' = the whole academic year (both terms), '1m' = last month of the current term.
      const query = trendPeriod === 't1' || trendPeriod === 't2' ? `period=all&term=${trendPeriod.slice(1)}` : trendPeriod === 'all' ? 'period=all&term=all' : `period=${encodeURIComponent(trendPeriod)}`;
      const res = await fetch(`/api/evaluations/trend?${query}`);
      if (res.ok) {
        let data = await res.json();
        if (isStudentView) {
          const maxD = getStudentMaxDateFrontend();
          data.gradeAverages = data.gradeAverages.filter(d => d.date <= maxD);
          data.roomDetails = data.roomDetails.filter(d => d.date <= maxD);
          data = transformToWeeklyTrend(data);
        }
        if (cacheable) trendResponseCache.current.set(cacheKey, data);
        if (requestId === trendRequest.current) setTrendData(data);
      }
    } catch (err) {
      console.error('Failed to fetch trend');
    } finally {
      if (requestId === trendRequest.current) setTrendLoading(false);
    }
  }, [trendPeriod, isStudentView]);

  useEffect(() => {
    if (status !== 'loading') {
      fetchTrend();
    }
  }, [fetchTrend, status]);

  const fetchRanking = useCallback(async () => {
    setRankingLoading(true);
    try {
      let url = `/api/evaluations/ranking?startDate=${encodeURIComponent(rankingStartDate)}&endDate=${encodeURIComponent(rankingEndDate)}&type=${encodeURIComponent(rankingType)}`;
      if (rankingType === 'specific_grade') url += `&grade=${rankingGrade}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRankingData(data.rankings || []);
      }
    } catch (e) {
      console.error("Failed to fetch ranking", e);
    } finally {
      setRankingLoading(false);
    }
  }, [rankingStartDate, rankingEndDate, rankingType, rankingGrade]);

  useEffect(() => {
    if (rankingModalOpen) {
      fetchRanking();
    }
  }, [rankingModalOpen, fetchRanking]);

  useEffect(() => {
    if (scoreModalOpen) {
      fetchSummary();
    }
  }, [scoreModalOpen, fetchSummary]);

  function getRoomAverages(grade, isOverall = false) {
    if (!summaryData) return [];
    if (isOverall) {
      return summaryData.roomAverages.filter(r => r.grade === grade && r.room === 0);
    }
    return summaryData.roomAverages.filter(r => r.grade === grade && r.room !== 0);
  }

  function getSummaryGradeAverage(grade) {
    if (!summaryData) return 0;
    const rooms = summaryData.roomAverages.filter(r => r.grade === grade && r.room !== 0 && r.avg_score !== null && r.avg_score > 0);
    if (rooms.length === 0) return 0;
    const sum = rooms.reduce((acc, curr) => acc + curr.avg_score, 0);
    return Number((sum / rooms.length).toFixed(2));
  }

  function getCriterionDetails(grade, room) {
    if (!summaryData) return [];
    return summaryData.details.filter(d => d.grade === grade && d.room === room);
  }

  function interpolateData(data) {
    if (!data || data.length === 0) return data;
    const result = data.map(d => ({ ...d, _isRealData: (d.score !== null && d.score > 0) || (d.c1 > 0 || d.c2 > 0 || d.c3 > 0 || d.c4 > 0 || d.c5 > 0) }));
    const keys = ['score', 'c1', 'c2', 'c3', 'c4', 'c5'];
    
    for (const key of keys) {
      for (let i = 0; i < result.length; i++) {
        if (data[i][key] === null || data[i][key] === 0) {
          let prevIdx = -1;
          for (let j = i - 1; j >= 0; j--) {
            if (data[j][key] !== null && data[j][key] > 0) {
              prevIdx = j; break;
            }
          }
          let nextIdx = -1;
          for (let j = i + 1; j < data.length; j++) {
            if (data[j][key] !== null && data[j][key] > 0) {
              nextIdx = j; break;
            }
          }
          
          if (prevIdx !== -1 && nextIdx !== -1) {
            const prevVal = data[prevIdx][key];
            const nextVal = data[nextIdx][key];
            const fraction = (i - prevIdx) / (nextIdx - prevIdx);
            result[i][key] = prevVal + fraction * (nextVal - prevVal);
          } else if (prevIdx !== -1 && nextIdx === -1) {
            result[i][key] = data[prevIdx][key];
          }
        }
      }
    }
    return result;
  }

  // The graph series are derived from trendData on every render (and getGradeTrendData several times
  // per grade). Keep each result for as long as the same trendData object is on screen.
  const trendMemo = useRef({ data: null, values: new Map() });
  function memoTrend(key, compute) {
    if (trendMemo.current.data !== trendData) trendMemo.current = { data: trendData, values: new Map() };
    const values = trendMemo.current.values;
    if (!values.has(key)) values.set(key, compute());
    return values.get(key);
  }

  function getGradeTrendData(grade) {
    return memoTrend(`grade-${trendType}-${grade}`, () => computeGradeTrendData(grade));
  }

  function computeGradeTrendData(grade) {
    if (!trendData) return [];
    
    let rawData = [];
    if (trendType === 'overall') {
      rawData = trendData.gradeAverages
        .filter(r => r.grade === grade)
        .map(r => ({
          date: r.date,
          score: r.avg_score || null,
          c1: r.c1 || null, c2: r.c2 || null, c3: r.c3 || null, c4: r.c4 || null, c5: r.c5 || null
        }));
    } else {
      const roomData = trendData.roomDetails.filter(r => r.grade === grade);
      const byDate = new Map();
      for (const r of roomData) {
        if (!byDate.has(r.date)) byDate.set(r.date, []);
        byDate.get(r.date).push(r);
      }
      const dates = [...byDate.keys()];
      
      rawData = dates.map(date => {
        const dForDate = byDate.get(date);
        const valid = dForDate.filter(r => r.avg_score > 0);
        const avg = valid.length > 0 ? valid.reduce((sum, r) => sum + r.avg_score, 0) / valid.length : null;

        const calcC = (cName) => {
          const v = dForDate.filter(r => r[cName] > 0);
          return v.length > 0 ? v.reduce((sum, r) => sum + r[cName], 0) / v.length : null;
        };

        return {
          date,
          score: avg,
          c1: calcC('c1'),
          c2: calcC('c2'),
          c3: calcC('c3'),
          c4: calcC('c4'),
          c5: calcC('c5'),
        };
      });
    }

    return interpolateData(rawData);
  }

  function getGradeOverallAverage(grade) {
    const data = getGradeTrendData(grade);
    if (data.length === 0) return 0;
    const valid = data.filter(d => d.score !== null);
    if (valid.length === 0) return 0;
    const sum = valid.reduce((acc, curr) => acc + curr.score, 0);
    return Number((sum / valid.length).toFixed(2));
  }

  function getIndividualRoomTrendData(grade) {
    return memoTrend(`rooms-${grade}`, () => computeIndividualRoomTrendData(grade));
  }

  function computeIndividualRoomTrendData(grade) {
    if (!trendData) return { roomSeries: [] };
    const roomData = trendData.roomDetails.filter(r => r.grade === grade);
    const rooms = [...new Set(roomData.map(r => r.room))].sort((a, b) => a - b);
    const dates = [...new Set(roomData.map(r => r.date))];

    const byKey = new Map(roomData.map(r => [`${r.date}|${r.room}`, r]));
    const roomSeries = rooms.map(room => {
      const series = dates.map(date => {
        const found = byKey.get(`${date}|${room}`);
        if (found) {
          return { date, score: found.avg_score || null, c1: found.c1 || null, c2: found.c2 || null, c3: found.c3 || null, c4: found.c4 || null, c5: found.c5 || null };
        }
        return { date, score: null, c1: null, c2: null, c3: null, c4: null, c5: null };
      });
      return { room, data: interpolateData(series) };
    });

    return { roomSeries };
  }

  return (
    <div className="container">
      {/* Call to Action: Go to Evaluate Page */}
      {status === 'authenticated' && session?.user?.role !== 'student' && !isStudentView && (
        <Link href="/v1/evaluate" className="btn-pulse">
          <span>ไปที่หน้าประเมินแถว</span>
          <ArrowRight size={24} />
        </Link>
      )}

      {/* Part 1: Ranking Section */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ marginBottom: '16px', textAlign: 'center', color: '#1f2937', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <Trophy size={28} /> อันดับ
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px' }}>
          <button
            className="btn btn-secondary btn-lg"
            onClick={() => { setRankingType('overall_grade'); setRankingModalOpen(true); }}
            style={{ backgroundColor: '#b91c1c', color: 'white', border: 'none', minWidth: '250px', flex: '0 1 auto' }}
          >
            ภาพรวมระดับชั้น
          </button>
          <button
            className="btn btn-secondary btn-lg"
            onClick={() => { setRankingType('all_rooms'); setRankingModalOpen(true); }}
            style={{ backgroundColor: '#b91c1c', color: 'white', border: 'none', minWidth: '250px', flex: '0 1 auto' }}
          >
            แต่ละห้องเรียน
          </button>
        </div>
      </section>

      {/* Part 2: Score Section */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ marginBottom: '16px', textAlign: 'center', color: '#1f2937', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={28} /> คะแนน
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px' }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => { setScoreModalType('overall'); setScoreModalOpen(true); }}
            style={{ backgroundColor: '#b91c1c', color: 'white', border: 'none', minWidth: '250px', flex: '0 1 auto' }}
          >
            ภาพรวมระดับชั้น
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => { setScoreModalType('room'); setScoreModalOpen(true); }}
            style={{ backgroundColor: '#b91c1c', color: 'white', border: 'none', minWidth: '250px', flex: '0 1 auto' }}
          >
            แต่ละห้องเรียน
          </button>
        </div>
      </section>

      {/* Score Modal */}
      <Modal
        isOpen={scoreModalOpen}
        onClose={() => {
          setScoreModalOpen(false);
          setExpandedGrade(null);
          setExpandedRoom(null);
        }}
        title={scoreModalType === 'overall' ? "คะแนนภาพรวมระดับชั้น" : "คะแนนของแต่ละห้อง"}
      >
        {/* Date filter */}
        <div className="date-filter">
          {isStudentView ? (
            <>
              <label>ตั้งแต่:</label>
              <select value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                {studentWeeks.map(w => <option key={`score-start-${w.valueKey}`} value={w.valueKey}>{w.label}</option>)}
              </select>
              <label>ถึง:</label>
              <select value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                {studentWeeks.map(w => <option key={`score-end-${w.valueKey}`} value={w.valueKey}>{w.label}</option>)}
              </select>
            </>
          ) : (
            <>
              <label>ตั้งแต่:</label>
              <input
                type="date"
                max={studentMaxDate || undefined}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <label>ถึง:</label>
              <input
                type="date"
                max={studentMaxDate || undefined}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </>
          )}
          <button className="btn btn-primary btn-sm" onClick={fetchSummary}>
            ค้นหา
          </button>
        </div>

        {/* Grade hierarchy */}
        {summaryLoading ? (
          <div className="empty-state" style={{ padding: '40px' }}>
            <span className="spinner" style={{ color: '#b91c1c', marginRight: '8px' }}></span> กำลังโหลดข้อมูล...
          </div>
        ) : (
          <>
            {scoreModalType === 'overall' && (
              <ul className="grade-list" style={{ marginBottom: '24px' }}>
                {[1, 2, 3, 4, 5, 6].map((grade) => {
                  const overallAvg = getRoomAverages(grade, true)[0];
                  return (
                    <li key={`overall-${grade}`} className="grade-item">
                      <button
                        className="room-item"
                        onClick={() => setExpandedRoom(expandedRoom === `${grade}-overall` ? null : `${grade}-overall`)}
                        style={{ width: '100%', border: 'none', cursor: 'pointer', backgroundColor: '#f8fafc', padding: '12px' }}
                      >
                        <span style={{ fontWeight: 'bold' }}>ภาพรวม ม.{grade}</span>
                        <span className={`room-score score-${getScoreLevel(overallAvg?.avg_score || 0)}`}>
                          {overallAvg?.avg_score > 0 ? `${Number(overallAvg.avg_score).toFixed(2)} - ${getScoreLabel(overallAvg.avg_score)}` : '-'}
                        </span>
                        {expandedRoom === `${grade}-overall` ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>

                      {expandedRoom === `${grade}-overall` && (
                        <div className="criterion-detail">
                          {getCriterionDetails(grade, 0).length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#9ca3af' }}>ยังไม่มีข้อมูล</p>
                          ) : (
                            CRITERIA.map((c) => {
                              const detail = getCriterionDetails(grade, 0).find(d => d.criterion === c.id);
                              const score = detail ? detail.avg_score : null;
                              return (
                                <div className="criterion-row" key={c.id}>
                                  <span>{c.id}. {c.text}</span>
                                  <span className={`score-${getScoreLevel(score || 0)}`} style={{ fontWeight: 600 }}>
                                    {score > 0 ? `${Number(score).toFixed(2)} - ${getScoreLabel(score)}` : '-'}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {scoreModalType === 'room' && (
              <ul className="grade-list">
              {[1, 2, 3, 4, 5, 6].map((grade) => (
                <li key={grade} className="grade-item">
                  <button
                    className="grade-header"
                    onClick={() => {
                      setExpandedGrade(expandedGrade === grade ? null : grade);
                      setExpandedRoom(null);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span>ม.{grade}</span>
                      <span className={`score-${getScoreLevel(getSummaryGradeAverage(grade) || 0)}`} style={{ fontSize: '0.9em', marginRight: '8px' }}>
                        {formatTrendHeaderAvg(getSummaryGradeAverage(grade))}
                      </span>
                    </div>
                    {expandedGrade === grade ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>

                  {expandedGrade === grade && (
                    <ul className="room-list">
                      {getRoomAverages(grade, false).length === 0 ? (
                        <li className="empty-state" style={{ padding: '16px' }}>ยังไม่มีข้อมูล</li>
                      ) : (
                        getRoomAverages(grade, false).map((room) => (
                          <li key={room.room}>
                            <button
                              className="room-item"
                              onClick={() => setExpandedRoom(expandedRoom === `${grade}-${room.room}` ? null : `${grade}-${room.room}`)}
                              style={{ width: '100%', border: 'none', cursor: 'pointer' }}
                            >
                              <span>{grade}/{room.room}</span>
                              <span className={`room-score score-${getScoreLevel(room.avg_score || 0)}`}>
                                {room.avg_score > 0 ? `${Number(room.avg_score).toFixed(2)} - ${getScoreLabel(room.avg_score)}` : '-'}
                              </span>
                              {expandedRoom === `${grade}-${room.room}` ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>

                            {expandedRoom === `${grade}-${room.room}` && (
                              <div className="criterion-detail">
                                {getCriterionDetails(grade, room.room).length === 0 ? (
                                  <p style={{ textAlign: 'center', color: '#9ca3af' }}>ยังไม่มีข้อมูล</p>
                                ) : (
                                  CRITERIA.map((c) => {
                                    const detail = getCriterionDetails(grade, room.room).find(d => d.criterion === c.id);
                                    const score = detail ? detail.avg_score : null;
                                    return (
                                      <div className="criterion-row" key={c.id}>
                                        <span>{c.id}. {c.text}</span>
                                        <span className={`score-${getScoreLevel(score || 0)}`} style={{ fontWeight: 600 }}>
                                          {score > 0 ? `${Number(score).toFixed(2)} - ${getScoreLabel(score)}` : '-'}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              ))}
              </ul>
            )}
          </>
        )}
      </Modal>

      {/* Part 3: Trend Line Graphs */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ marginBottom: '16px', textAlign: 'center', color: '#1f2937', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={28} /> แนวโน้ม
        </h2>

        {/* Trend Type Toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <button
            className={`btn ${trendType === 'overall' ? 'btn-primary' : ''}`}
            onClick={() => setTrendType('overall')}
            style={{ minWidth: '150px', backgroundColor: trendType === 'overall' ? '#b91c1c' : '#f1f5f9', color: trendType === 'overall' ? 'white' : '#475569', border: 'none' }}
          >
            ภาพรวมระดับชั้น
          </button>
          <button
            className={`btn ${trendType === 'room_avg' ? 'btn-primary' : ''}`}
            onClick={() => setTrendType('room_avg')}
            style={{ minWidth: '150px', backgroundColor: trendType === 'room_avg' ? '#b91c1c' : '#f1f5f9', color: trendType === 'room_avg' ? 'white' : '#475569', border: 'none' }}
          >
            แต่ละห้องเรียน
          </button>
        </div>

        {/* Time selector and Export */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <div className="time-selector" style={{ margin: 0, justifyContent: 'center' }}>
            {[
              { key: '1m', label: '1 เดือน' },
              { key: 't1', label: 'ภาคเรียนที่ 1' },
              { key: 't2', label: 'ภาคเรียนที่ 2' },
              { key: 'all', label: 'ตลอดปีการศึกษา' },
            ].map((t) => (
              <button
                key={t.key}
                className={trendPeriod === t.key ? 'active' : ''}
                onClick={() => setTrendPeriod(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          
          {status === 'authenticated' && session?.user?.role !== 'student' && !isStudentView && (
            <button
              className="btn"
              onClick={() => setExportModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#10b981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '20px' }}
            >
              <FileDown size={20} />
              ส่งออก Word
            </button>
          )}
        </div>

        {/* Graph grid */}
        <div className="graph-grid">
          {[1, 2, 3, 4, 5, 6].map((grade) => {
            const data = getGradeTrendData(grade);
            return (
              <div key={grade} className="graph-card">
                <div
                  className="graph-header"
                  onClick={() => {
                    if (trendType !== 'overall') {
                      setDrilldownGrade(grade);
                      setDrilldownModalOpen(true);
                    }
                  }}
                  style={{ cursor: trendType === 'overall' ? 'default' : 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%' }}
                >
                  <span>
                    ม.{grade}
                    <span className={`score-${getScoreLevel(getGradeOverallAverage(grade) || 0)}`} style={{ marginLeft: '16px', fontWeight: 'normal', fontSize: '1rem' }}>
                      {formatTrendHeaderAvg(getGradeOverallAverage(grade))}
                    </span>
                  </span>
                  {trendType !== 'overall' && <ChevronRight size={18} />}
                </div>
                <div className="graph-wrapper">
                  {trendLoading ? (
                    <div className="empty-state" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="spinner" style={{ color: '#b91c1c', marginRight: '8px' }}></span> กำลังโหลดข้อมูล...
                    </div>
                  ) : data.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          label={{ value: isStudentView ? 'Week' : 'Date', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#999' }}
                          tickFormatter={(v) => {
                            const d = new Date(v);
                            if (isNaN(d.getTime())) {
                              if (typeof v === 'string' && v.startsWith('สัปดาห์ที่')) {
                                const parts = v.split(' ');
                                if (parts.length >= 3) {
                                  return `${parts[1]}/${parts[2]}`;
                                }
                              }
                              return v;
                            }
                            return `${d.getDate()}/${d.getMonth() + 1}`;
                          }}
                        />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} label={{ value: 'Score', angle: -90, position: 'insideLeft', offset: 15, fontSize: 11, fill: '#666' }} />
                        {!isTouchDevice && <Tooltip content={<CustomTooltipOuter />} wrapperStyle={{ visibility: 'hidden' }} cursor={{ stroke: '#ccc', strokeWidth: 1 }} />}
                        <Line type="monotone" dataKey="score" stroke="#b91c1c" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="empty-state" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ยังไม่มีข้อมูล
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Drilldown Modal */}
      <Modal
        isOpen={drilldownModalOpen}
        onClose={() => {
          setDrilldownModalOpen(false);
          setDrilldownGrade(null);
        }}
        title={drilldownGrade ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: '10px' }}>
            <span>ม.{drilldownGrade}</span>
            <span className={`score-${getScoreLevel(getGradeOverallAverage(drilldownGrade) || 0)}`} style={{ fontWeight: 'normal' }}>
              {formatTrendHeaderAvg(getGradeOverallAverage(drilldownGrade))}
            </span>
          </div>
        ) : ''}
      >
        {drilldownGrade && (() => {
          if (trendLoading) {
            return <div className="empty-state" style={{ padding: '40px' }}><span className="spinner" style={{ color: '#b91c1c', marginRight: '8px' }}></span> กำลังโหลดข้อมูล...</div>;
          }
          const { roomSeries } = getIndividualRoomTrendData(drilldownGrade);
          if (!roomSeries || roomSeries.length === 0) {
            return <div className="empty-state" style={{ padding: '40px' }}>ยังไม่มีข้อมูล</div>;
          }
          return (
            <div className="graph-grid">
              {roomSeries.map(({ room, data }, idx) => {
                const validScores = data.filter(d => d.score > 0);
                const avg = validScores.length > 0 ? Number((validScores.reduce((acc, curr) => acc + curr.score, 0) / validScores.length).toFixed(2)) : 0;
                return (
                  <div key={room} className="graph-card">
                    <div className="graph-header" style={{ cursor: 'default', display: 'flex', justifyContent: 'space-between' }}>
                      <span>ห้อง {drilldownGrade}/{room}</span>
                      <span className={`score-${getScoreLevel(avg || 0)}`} style={{ fontWeight: 'normal', fontSize: '1rem' }}>
                        {formatTrendHeaderAvg(avg)}
                      </span>
                    </div>
                    <div className="graph-wrapper">
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          label={{ value: isStudentView ? 'Week' : 'Date', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#999' }}
                          tickFormatter={(v) => {
                            const d = new Date(v);
                            if (isNaN(d.getTime())) {
                              if (typeof v === 'string' && v.startsWith('สัปดาห์ที่')) {
                                const parts = v.split(' ');
                                if (parts.length >= 3) {
                                  return `${parts[1]}/${parts[2]}`;
                                }
                              }
                              return v;
                            }
                            return `${d.getDate()}/${d.getMonth() + 1}`;
                          }}
                        />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} label={{ value: 'Score', angle: -90, position: 'insideLeft', offset: 15, fontSize: 11, fill: '#666' }} />
                        {!isTouchDevice && <Tooltip content={<CustomTooltipInner />} wrapperStyle={{ visibility: 'hidden' }} cursor={{ stroke: '#ccc', strokeWidth: 1 }} />}
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
              })}
            </div>
          );
        })()}
      </Modal>
      {/* Ranking Modal */}
      <Modal
        isOpen={rankingModalOpen}
        onClose={() => setRankingModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={20} />
            {rankingType === 'overall_grade' ? 'อันดับภาพรวมระดับชั้น' : 'อันดับคะแนนรายห้อง'}
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Date range pickers */}
          {isStudentView ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>ตั้งแต่สัปดาห์</label>
                <select value={rankingStartDate} onChange={(e) => setRankingStartDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff' }}>
                  {studentWeeks.map(w => <option key={`rstart-${w.valueKey}`} value={w.valueKey}>{w.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>ถึงสัปดาห์</label>
                <select value={rankingEndDate} onChange={(e) => setRankingEndDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#fff' }}>
                  {studentWeeks.map(w => <option key={`rend-${w.valueKey}`} value={w.valueKey}>{w.label}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>ตั้งแต่วันที่</label>
                <input type="date" value={rankingStartDate} onChange={(e) => setRankingStartDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>ถึงวันที่</label>
                <input type="date" value={rankingEndDate} onChange={(e) => setRankingEndDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
            </div>
          )}

          {/* Type selector */}
          {rankingType !== 'overall_grade' && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>รูปแบบการจัดอันดับ</label>
                <select value={rankingType} onChange={(e) => setRankingType(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                  <option value="all_rooms">ทุกห้องเรียน (ทั้งโรงเรียน)</option>
                  <option value="grade">ทุกสายชั้น (ค่าเฉลี่ยจากทุกห้อง)</option>
                  <option value="specific_grade">เฉพาะห้องในสายชั้น...</option>
                </select>
              </div>
              {rankingType === 'specific_grade' && (
                <div style={{ flex: 1, minWidth: '100px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem' }}>เลือกสายชั้น</label>
                  <select value={rankingGrade} onChange={(e) => setRankingGrade(parseInt(e.target.value, 10))} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                    {[1,2,3,4,5,6].map(g => <option key={g} value={g}>ม.{g}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          <div style={{ marginTop: '10px', maxHeight: '400px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
            {rankingLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                <span className="spinner" style={{ color: '#b91c1c', marginRight: '8px' }}></span> กำลังโหลด...
              </div>
            ) : rankingData.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>ไม่พบข้อมูลในช่วงเวลานี้</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', padding: '12px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', width: '60px', zIndex: 10, color: '#1a1a1a' }}>อันดับ</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', zIndex: 10, color: '#1a1a1a' }}>ชื่อ</th>
                    <th style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', padding: '12px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', zIndex: 10, color: '#1a1a1a' }}>คะแนนเฉลี่ย</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingData.map((row, idx, arr) => {
                    const rank = arr.findIndex(r => r.avg_score === row.avg_score) + 1;
                    
                    let rankStyle = { color: '#64748b' };
                    if (rank === 1) rankStyle = { color: '#eab308', fontSize: '1.2em' };
                    else if (rank === 2) rankStyle = { color: '#94a3b8', fontSize: '1.1em' };
                    else if (rank === 3) rankStyle = { color: '#b45309', fontSize: '1.1em' };
                    
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', ...rankStyle }}>
                          {rank <= 3 ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <Medal size={18} color={rank === 1 ? '#eab308' : rank === 2 ? '#94a3b8' : '#b45309'} />
                              {rank}
                            </div>
                          ) : (
                            rank
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'left', fontWeight: '500' }}>
                          {row.room ? `ม.${row.grade}/${row.room}` : `ม.${row.grade}`}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }} className={`score-${getScoreLevel(row.avg_score || 0)}`}>
                          {row.avg_score > 0 ? `${Number(row.avg_score).toFixed(2)} - ${getScoreLabel(row.avg_score)}` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>

      <Toast 
        visible={toast.visible} 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast({ ...toast, visible: false })} 
      />

      <ExportWordModal 
        isOpen={exportModalOpen} 
        onClose={() => setExportModalOpen(false)} 
      />
    </div>
  );
}
