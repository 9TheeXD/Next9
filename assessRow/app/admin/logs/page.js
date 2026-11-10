'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, ClipboardCheck, Activity } from 'lucide-react';
import '../../v2/v2.css';
import '../admin.css';

const LIMIT = 50;
const ACTION_TABS = [
  { key: '', label: 'ทั้งหมด', count: 'all' },
  { key: 'evaluate', label: 'ประเมินกิจกรรม', count: 'evaluate' },
  { key: 'view', label: 'เข้าใช้งานระบบ', count: 'view' },
];
const ACTION_LABEL = { evaluate: 'ประเมินกิจกรรม', view: 'เข้าใช้งานระบบ' };
const ACTION_TONE = { evaluate: 't-emerald', view: 't-blue' };
const ROLE_TONE = { 'แอดมิน': 't-red', 'ครู': 't-amber', 'สภานักเรียน': 't-purple', 'นักเรียน': 't-green' };

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shiftIso = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const thaiDate = (iso) => new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T00:00:00'));

export default function AdminLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'admin';

  // date: '' = every day, otherwise YYYY-MM-DD. Opens on today's log; the chips switch to every day.
  const [date, setDate] = useState(() => todayIso());
  const [action, setAction] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  // The result is stored with the request key it answers, so "loading" is simply "key not answered yet".
  const [result, setResult] = useState({ key: null, data: { logs: [], total: 0, counts: { all: 0, evaluate: 0, view: 0 } }, failed: false });

  const requestKey = JSON.stringify({ date, action, q, page });
  const data = result.data;
  const loading = result.key !== requestKey;
  const failed = !loading && result.failed;

  useEffect(() => {
    if (status === 'unauthenticated' || (status === 'authenticated' && !isAdmin)) {
      router.push('/');
    }
  }, [status, isAdmin, router]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (date) params.set('date', date);
    if (action) params.set('action', action);
    if (q) params.set('q', q);
    fetch(`/api/admin/logs?${params}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!cancelled) setResult({ key: requestKey, data: d, failed: false });
      })
      .catch(() => {
        if (!cancelled) setResult((prev) => ({ key: requestKey, data: prev.data, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, date, action, q, page, requestKey]);

  // Any filter change goes back to page 1.
  const changeFilter = (fn) => {
    setPage(1);
    fn();
  };

  if (status === 'loading' || (status === 'authenticated' && !isAdmin)) {
    return (
      <div className="v2 adm">
        <div className="v2-empty" style={{ height: '50vh' }}><span className="v2-spin" /></div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));
  const today = todayIso();
  const filtered = date !== today || action !== '' || q !== '';
  const showDayHeads = date === '';

  // Rows with a day heading in front of the first row of each day (only when every day is shown).
  const rows = [];
  let lastDay = null;
  for (const log of data.logs) {
    if (showDayHeads && log.date !== lastDay) {
      rows.push(<li key={`day-${log.date}-${log.id}`} className="adm-day-head">{thaiDate(log.date)}</li>);
    }
    lastDay = log.date;
    rows.push(
      <li key={log.id} className="adm-log">
        <span className="adm-log-time">{log.timestamp.slice(11, 16)} น.</span>
        <div className="adm-log-main">
          <span className="adm-log-user">{log.user_id}</span>
          <div className="adm-log-meta">
            <span className={`adm-tag ${ACTION_TONE[log.action] || 't-gray'}`}>{ACTION_LABEL[log.action] || log.action}</span>
            <span className={`adm-tag ${ROLE_TONE[log.role] || 't-gray'}`}>{log.role}</span>
          </div>
        </div>
      </li>,
    );
  }

  return (
    <div className="v2 adm">
      <div className="adm-top">
        <div className="adm-top-inner">
          <div className="adm-title">
            <Link href="/admin" className="adm-icon-btn" aria-label="กลับหน้าจัดการระบบ"><ArrowLeft size={18} /></Link>
            <h1>ประวัติการใช้งานระบบ</h1>
          </div>
          <div className="adm-links">
            <Link href="/admin/evaluations" className="adm-link"><ClipboardCheck size={16} /> จัดการการประเมิน</Link>
            <Link href="/admin" className="adm-link">หน้าจัดการระบบ</Link>
          </div>
        </div>
      </div>

      <div className="v2-page adm-stack">
        <section className="v2-card adm-card">
          <div className="adm-datebar">
            <button className="adm-icon-btn" aria-label="วันก่อนหน้า" disabled={!date} onClick={() => changeFilter(() => setDate(shiftIso(date, -1)))}>
              <ChevronLeft size={18} />
            </button>
            <input className="adm-input adm-date" type="date" aria-label="เลือกวันที่" value={date || ''} max={today} onChange={(e) => changeFilter(() => setDate(e.target.value))} />
            <button className="adm-icon-btn" aria-label="วันถัดไป" disabled={!date || date >= today} onClick={() => changeFilter(() => setDate(shiftIso(date, 1)))}>
              <ChevronRight size={18} />
            </button>
            <button className={`v2-chip${date === today ? ' is-on' : ''}`} onClick={() => changeFilter(() => setDate(today))}>วันนี้</button>
            <button className={`v2-chip${date === '' ? ' is-on' : ''}`} onClick={() => changeFilter(() => setDate(''))}>ทุกวัน</button>
          </div>

          <div className="adm-row">
            <div className="v2-seg v2-seg-sm adm-tabs-seg">
              {ACTION_TABS.map((t) => (
                <button key={t.key || 'all'} className={action === t.key ? 'is-on' : ''} onClick={() => changeFilter(() => setAction(t.key))}>
                  {t.label} <span className="adm-count">{data.counts[t.count] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="adm-row">
            <div className="adm-search">
              <Search size={16} />
              <input placeholder="ค้นหารหัสผู้ใช้" value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="ค้นหารหัสผู้ใช้" />
            </div>
          </div>
        </section>

        <section className="v2-card adm-card">
          <div className="adm-card-head">
            <p className="adm-sub" style={{ margin: 0 }}>
              {loading ? 'กำลังโหลด…' : `พบ ${data.total.toLocaleString('th-TH')} รายการ`}
              {date && ` · ${thaiDate(date)}`}
            </p>
            {filtered && (
              <button className="adm-btn adm-btn-sm" onClick={() => changeFilter(() => { setDate(today); setAction(''); setQInput(''); setQ(''); })}>
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {failed ? (
            <div className="v2-empty" style={{ height: 120 }}>โหลดประวัติไม่สำเร็จ ลองรีเฟรชหน้า</div>
          ) : loading && data.logs.length === 0 ? (
            <div className="v2-empty" style={{ height: 160 }}><span className="v2-spin" /></div>
          ) : data.logs.length === 0 ? (
            <div className="v2-empty adm-empty" style={{ height: 160 }}>
              <Activity size={36} />
              <span>ไม่พบประวัติการใช้งาน ลองเลือกวันอื่นหรือเปลี่ยนตัวกรอง</span>
            </div>
          ) : (
            <ul className={`adm-logs${loading ? ' is-loading' : ''}`}>{rows}</ul>
          )}

          <div className="adm-pager">
            <button className="adm-btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={16} /> ก่อนหน้า
            </button>
            <span className="adm-tag t-gray">หน้า {page} / {totalPages}</span>
            <button className="adm-btn" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              ถัดไป <ChevronRight size={16} />
            </button>
          </div>
        </section>

        <p className="v2-footer">
          <Link href="/">หน้าสรุป</Link> · <Link href="/evaluate">หน้าประเมิน</Link>
        </p>
      </div>
    </div>
  );
}
