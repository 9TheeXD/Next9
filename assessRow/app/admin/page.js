'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { LogOut, Trash2, Lock, Unlock, FileText, LayoutDashboard, Users, CalendarRange, Activity, Check, Eye, ExternalLink, RotateCcw, HelpCircle, Clock, ClipboardCheck, LogIn } from 'lucide-react';
import Link from 'next/link';
import Toast from '../components/Toast';
import { LockCard } from '../components/LockOverlay';
import TermsPanel from './TermsPanel';
import PeoplePanel from './PeoplePanel';
import '../v2/v2.css';
import './admin.css';

const TABS = [
  { key: 'today', label: 'วันนี้', icon: Activity },
  { key: 'lock', label: 'ปิดปรับปรุง', icon: Lock },
  { key: 'people', label: 'ผู้ใช้และสิทธิ์', icon: Users },
  { key: 'time', label: 'วัน/เวลาประเมิน', icon: Clock },
  { key: 'term', label: 'เทอม', icon: CalendarRange },
];

const QUICK_MINUTES = [15, 30, 60, 120];

const pad = (n) => String(n).padStart(2, '0');
// Value for <input type="datetime-local"> in the browser's own time zone.
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const thaiDateTime = (iso) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const thaiDay = (iso) => new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso + 'T00:00:00'));

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState('today');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const [confirmBox, setConfirmBox] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adminError, setAdminError] = useState('');

  // Lock
  const [lock, setLock] = useState({ locked: false, lockUntil: null, target: 'all', title: '', message: '' });
  const [lockForm, setLockForm] = useState({ mode: 'minutes', minutes: '60', until: '', target: 'all', title: '', message: '' });
  const [lockBusy, setLockBusy] = useState(false);

  // Overview / term
  const [overview, setOverview] = useState(null);
  const [term, setTerm] = useState(null); // answer of /api/settings/term
  const [evalTime, setEvalTime] = useState(null);
  const [evalTimeForm, setEvalTimeForm] = useState({ from: '07:00', to: '08:30' });
  const [days, setDays] = useState(null); // saved
  const [daysForm, setDaysForm] = useState(null); // being edited
  const [dayInput, setDayInput] = useState({ kind: 'closed', from: '', to: '', note: '' });

  const isAdmin = session?.user?.role === 'admin';
  const showToast = useCallback((message, type = 'info') => setToast({ visible: true, message, type }), []);
  const ask = (text, ok, onYes, danger) => setConfirmBox({ text, ok, onYes, danger });

  const fetchLock = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/lock', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setLock({ locked: d.locked, lockUntil: d.lockUntil, target: d.target || 'all', title: d.title || '', message: d.message || '' });
        setLockForm((f) => ({ ...f, title: d.title || '', message: d.message || '', target: d.target || f.target }));
      }
    } catch {}
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store' });
      if (res.ok) setOverview(await res.json());
    } catch {}
  }, []);

  const fetchTerm = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/term', { cache: 'no-store' });
      if (res.ok) setTerm(await res.json());
    } catch {}
  }, []);

  const fetchEvalTime = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/eval-time', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        setEvalTime(d);
        setEvalTimeForm({ from: d.from, to: d.to });
        if (d.days) {
          setDays(d.days);
          setDaysForm(d.days);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchEvalTime();
    fetchLock();
    fetchOverview();
    fetchTerm();
    const t = setInterval(() => {
      fetchOverview();
      fetchLock();
    }, 30000);
    return () => clearInterval(t);
  }, [isAdmin, fetchLock, fetchOverview, fetchTerm, fetchEvalTime]);

  if (status === 'loading') {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <div className="spinner" style={{ color: '#b91c1c' }}></div>
      </div>
    );
  }

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminError('');
    const res = await signIn('credentials', { redirect: false, username, password });
    if (res?.error) setAdminError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ผิด 5 ครั้งติดกันต้องรอ 5 นาที)');
  };

  if (status === 'unauthenticated' || !isAdmin) {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <div className="card" style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'left' }}>
          <h2 style={{ textAlign: 'center', color: '#b91c1c', marginBottom: '8px' }}>Admin Login</h2>
          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>กรุณาเข้าสู่ระบบด้วยบัญชีแอดมิน</p>
          <form onSubmit={handleAdminLogin}>
            {adminError && <div style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '10px' }}>{adminError}</div>}
            <div style={{ marginBottom: '12px' }}>
              <input type="text" autoCapitalize="none" autoComplete="username" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} required />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>เข้าสู่ระบบแอดมิน</button>
          </form>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0 14px', color: '#9ca3af', fontSize: '13px' }}>
            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />หรือ<span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>
          <button type="button" onClick={() => signIn('google', { callbackUrl: '/admin' })} className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db' }}>
            <LogIn size={18} /> เข้าสู่ระบบแอดมินด้วย Google
          </button>
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '12px', marginTop: '8px' }}>ใช้ได้เฉพาะอีเมล @sirin.ac.th ที่เพิ่มเป็นแอดมินไว้แล้ว</p>
          {session?.user && !isAdmin && (
            <p style={{ textAlign: 'center', color: '#b91c1c', fontSize: '13px', marginTop: '12px' }}>บัญชีที่เข้าอยู่ตอนนี้ไม่ใช่แอดมิน</p>
          )}
          {session?.user && !isAdmin && (
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button onClick={() => signOut()} className="btn btn-secondary" style={{ backgroundColor: '#f3f4f6', color: '#4b5563', border: 'none', width: '100%' }}>
                ออกจากระบบบัญชีปัจจุบัน
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ----- Actions -----
  async function postLock(body, okText) {
    setLockBusy(true);
    try {
      const res = await fetch('/api/settings/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(okText || data.message, 'success');
        fetchLock();
      } else showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
    } catch {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    } finally {
      setLockBusy(false);
    }
  }

  function doLock() {
    const body = { action: 'lock', target: lockForm.target, title: lockForm.title, message: lockForm.message };
    if (lockForm.mode === 'minutes') {
      const m = parseInt(lockForm.minutes, 10);
      if (m > 0) body.minutes = m;
    } else if (lockForm.mode === 'until') {
      if (!lockForm.until) return showToast('เลือกเวลาที่จะเปิดระบบ', 'error');
      body.until = new Date(lockForm.until).toISOString();
    }
    const who = lockForm.target === 'student' ? 'นักเรียน' : 'ทุกคน (ยกเว้นแอดมิน)';
    ask(`ปิดระบบสำหรับ${who}${lockForm.mode === 'forever' ? ' จนกว่าจะเปิดเอง' : ''}?`, 'ปิดระบบ', () => postLock(body), true);
  }

  async function saveEvalTime(from, to) {
    try {
      const res = await fetch('/api/settings/eval-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || 'บันทึกแล้ว', 'success');
        fetchEvalTime();
      } else showToast(data.message || 'บันทึกไม่สำเร็จ', 'error');
    } catch {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    }
  }

  async function saveDays() {
    try {
      const res = await fetch('/api/settings/eval-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: daysForm }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || 'บันทึกแล้ว', 'success');
        fetchEvalTime();
      } else showToast(data.message || 'บันทึกไม่สำเร็จ', 'error');
    } catch {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    }
  }

  function addDays() {
    const { kind, from, note } = dayInput;
    const to = dayInput.to || from;
    if (!from) return showToast('เลือกวันที่', 'error');
    if (to < from) return showToast('วันสุดท้ายต้องไม่ก่อนวันแรก', 'error');
    const list = [];
    for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= to && list.length < 120; d.setUTCDate(d.getUTCDate() + 1)) list.push({ date: d.toISOString().slice(0, 10), note: note.trim() });
    const other = kind === 'closed' ? 'open' : 'closed';
    setDaysForm((f) => ({
      ...f,
      [kind]: [...f[kind].filter((x) => !list.some((y) => y.date === x.date)), ...list].sort((a, b) => a.date.localeCompare(b.date)),
      [other]: f[other].filter((x) => !list.some((y) => y.date === x.date)),
    }));
    setDayInput((i) => ({ ...i, from: '', to: '', note: '' }));
  }

  // ----- Views -----
  const lockBadge = lock.locked ? (
    <span className="adm-badge is-bad"><Lock size={14} /> ปิดระบบอยู่</span>
  ) : (
    <span className="adm-badge is-ok"><Unlock size={14} /> เปิดใช้งานปกติ</span>
  );

  const todayView = (
    <div className="adm-stack">
      <div className="adm-stats">
        <div className="adm-stat"><span>ผู้ประเมินวันนี้</span><b>{overview ? overview.evaluators.length : '…'}</b></div>
        <div className="adm-stat"><span>คนเปิดดูวันนี้</span><b>{overview ? overview.viewers : '…'}</b></div>
        <div className="adm-stat"><span>วันที่มีการประเมิน</span><b>{overview ? overview.totals.days : '…'}</b></div>
        <div className="adm-stat"><span>ผู้มีสิทธิ์ประเมิน</span><b>{overview ? overview.totals.whitelist : '…'}</b></div>
      </div>

      <section className="v2-card adm-card">
        <div className="adm-card-head">
          <h3>ความคืบหน้าการประเมินวันนี้</h3>
          <button className="adm-icon-btn" onClick={fetchOverview} aria-label="รีเฟรช"><RotateCcw size={16} /></button>
        </div>
        {!overview ? (
          <div className="v2-empty" style={{ height: 120 }}><span className="v2-spin" /></div>
        ) : (
          <div className="adm-progress">
            {overview.grades.map((g) => {
              const pct = g.roomsTotal ? (g.roomsDone / g.roomsTotal) * 100 : 0;
              return (
                <div key={g.grade} className="adm-prog-row">
                  <b>ม.{g.grade}</b>
                  <span className="v2-bar"><span className={`v2-bar-fill ${pct >= 100 ? 'v2-bg4' : pct > 0 ? 'v2-bg3' : 'v2-bg0'}`} style={{ width: `${pct}%` }} /></span>
                  <span className="adm-prog-num">{g.roomsDone}/{g.roomsTotal} ห้อง</span>
                  <span className={`adm-chip ${g.overallDone ? 'is-ok' : ''}`}>{g.overallDone ? <><Check size={12} /> ภาพรวม</> : 'ภาพรวม -'}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="adm-grid2">
        <section className="v2-card adm-card">
          <h3>ใครประเมินวันนี้</h3>
          {!overview ? null : overview.evaluators.length === 0 ? (
            <div className="v2-empty" style={{ height: 80 }}>ยังไม่มีการประเมินวันนี้</div>
          ) : (
            <ul className="adm-list">
              {overview.evaluators.map((e) => (
                <li key={e.id}>
                  <span className="adm-name">{e.id}</span>
                  <span className="adm-role">{e.role === 'council' ? 'สภานักเรียน' : e.role === 'teacher' ? 'ครู' : /^\d+$/.test(e.id) || e.id === 'council' ? 'สภานักเรียน' : 'ครู'}</span>
                  <span className="adm-num">{e.units} ห้อง/ชั้น · {e.scores} คะแนน</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="v2-card adm-card">
          <h3>ย้อนหลัง 3 สัปดาห์</h3>
          {!overview ? null : (
            <ul className="adm-list adm-days">
              {overview.days.map((d) => {
                const max = Math.max(...overview.days.map((x) => x.scores), 1);
                return (
                  <li key={d.date}>
                    <span className="adm-name">{thaiDay(d.date)}</span>
                    <span className="v2-bar"><span className="v2-bar-fill v2-bg4" style={{ width: `${(d.scores / max) * 100}%` }} /></span>
                    <span className="adm-num">{d.evaluators} คน</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );

  const preview = (
    <div className="adm-preview">
      <div className="adm-preview-label"><Eye size={14} /> ตัวอย่างที่ผู้ใช้จะเห็น</div>
      <div className="adm-preview-stage">
        <LockCard
          title={lockForm.title}
          message={lockForm.message}
          lockUntil={
            lockForm.mode === 'minutes' && parseInt(lockForm.minutes, 10) > 0
              ? new Date(Date.now() + parseInt(lockForm.minutes, 10) * 60000).toISOString()
              : lockForm.mode === 'until' && lockForm.until
                ? new Date(lockForm.until).toISOString()
                : null
          }
        />
      </div>
    </div>
  );

  const lockView = (
    <div className="adm-stack">
      <section className={`v2-card adm-card adm-lock-state ${lock.locked ? 'is-locked' : ''}`}>
        <div className="adm-card-head">
          <div>
            {lockBadge}
            {lock.locked && (
              <p className="adm-sub">
                {lock.target === 'student' ? 'เฉพาะนักเรียน' : 'ทุกคน (ยกเว้นแอดมิน)'} · {lock.lockUntil ? `เปิดเองอัตโนมัติ ${thaiDateTime(lock.lockUntil)} น.` : 'จนกว่าจะเปิดเอง'}
              </p>
            )}
          </div>
          {lock.locked && (
            <button className="adm-btn is-green" disabled={lockBusy} onClick={() => postLock({ action: 'unlock' })}>
              <Unlock size={16} /> เปิดระบบตอนนี้
            </button>
          )}
        </div>
      </section>

      <div className="adm-grid2">
        <section className="v2-card adm-card">
          <h3>{lock.locked ? 'แก้ข้อความ / ปิดใหม่' : 'ปิดระบบชั่วคราว'}</h3>
          <label className="adm-label">หัวข้อ</label>
          <input className="adm-input" maxLength={120} placeholder="ระบบปิดปรับปรุงชั่วคราว" value={lockForm.title} onChange={(e) => setLockForm((f) => ({ ...f, title: e.target.value }))} />
          <label className="adm-label">ข้อความ</label>
          <textarea className="adm-input" rows={4} maxLength={1000} placeholder={'ขออภัยในความไม่สะดวก\nขณะนี้ระบบไม่สามารถใช้งานได้'} value={lockForm.message} onChange={(e) => setLockForm((f) => ({ ...f, message: e.target.value }))} />
          <p className="adm-sub">เว้นว่าง = ใช้ข้อความมาตรฐาน · ขึ้นบรรทัดใหม่ได้</p>

          <label className="adm-label">ใครจะเห็น</label>
          <div className="v2-seg v2-seg-sm adm-seg">
            <button className={lockForm.target === 'all' ? 'is-on' : ''} onClick={() => setLockForm((f) => ({ ...f, target: 'all' }))}>ทุกคน (ยกเว้นแอดมิน)</button>
            <button className={lockForm.target === 'student' ? 'is-on' : ''} onClick={() => setLockForm((f) => ({ ...f, target: 'student' }))}>เฉพาะนักเรียน</button>
          </div>

          <label className="adm-label">เปิดระบบอีกครั้งเมื่อ</label>
          <div className="v2-seg v2-seg-sm adm-seg">
            <button className={lockForm.mode === 'minutes' ? 'is-on' : ''} onClick={() => setLockForm((f) => ({ ...f, mode: 'minutes' }))}>อีกกี่นาที</button>
            <button className={lockForm.mode === 'until' ? 'is-on' : ''} onClick={() => setLockForm((f) => ({ ...f, mode: 'until', until: f.until || toLocalInput(new Date(Date.now() + 3600000)) }))}>ถึงเวลา</button>
            <button className={lockForm.mode === 'forever' ? 'is-on' : ''} onClick={() => setLockForm((f) => ({ ...f, mode: 'forever' }))}>เปิดเอง</button>
          </div>
          {lockForm.mode === 'minutes' && (
            <div className="adm-row">
              {QUICK_MINUTES.map((m) => (
                <button key={m} className={`v2-chip${String(m) === lockForm.minutes ? ' is-on' : ''}`} onClick={() => setLockForm((f) => ({ ...f, minutes: String(m) }))}>
                  {m >= 60 ? `${m / 60} ชม.` : `${m} นาที`}
                </button>
              ))}
              <input className="adm-input adm-input-sm" type="number" min="1" value={lockForm.minutes} onChange={(e) => setLockForm((f) => ({ ...f, minutes: e.target.value }))} aria-label="จำนวนนาที" />
            </div>
          )}
          {lockForm.mode === 'until' && (
            <input className="adm-input" type="datetime-local" value={lockForm.until} min={toLocalInput(new Date())} onChange={(e) => setLockForm((f) => ({ ...f, until: e.target.value }))} />
          )}

          <div className="adm-row adm-actions">
            <button className="adm-btn is-red" disabled={lockBusy} onClick={doLock}><Lock size={16} /> {lock.locked ? 'ปิดใหม่ด้วยค่านี้' : 'ปิดระบบ'}</button>
            {lock.locked && (
              <button className="adm-btn" disabled={lockBusy} onClick={() => postLock({ action: 'text', title: lockForm.title, message: lockForm.message }, 'อัปเดตข้อความแล้ว')}>
                บันทึกเฉพาะข้อความ
              </button>
            )}
          </div>
        </section>
        {preview}
      </div>
    </div>
  );

  const peopleView = <PeoplePanel session={session} showToast={showToast} ask={ask} />;

  const evalTimeChanged = evalTime && (evalTime.from !== evalTimeForm.from || evalTime.to !== evalTimeForm.to);
  const evalTimeValid = /^\d{2}:\d{2}$/.test(evalTimeForm.from) && /^\d{2}:\d{2}$/.test(evalTimeForm.to) && evalTimeForm.from < evalTimeForm.to;
  const timeView = (
    <section className="v2-card adm-card">
      <h3>เวลาเปิดให้ประเมิน (ทุกวัน)</h3>
      <p className="adm-sub">
        ตอนนี้: {evalTime ? `${evalTime.from} – ${evalTime.to} น.` : '…'} · นอกช่วงนี้ครูและสภานักเรียนดูคะแนนได้ แต่บันทึกไม่ได้ (ระบบตรวจที่ server ด้วย) · มีผลกับการบันทึกทันที หน้าประเมินที่เปิดค้างไว้จะอัปเดตภายใน 1 นาที
      </p>
      <div className="adm-row adm-time">
        <label>
          <span className="adm-label">เปิด</span>
          <input className="adm-input" type="time" value={evalTimeForm.from} onChange={(e) => setEvalTimeForm((f) => ({ ...f, from: e.target.value }))} />
        </label>
        <span className="adm-time-sep">ถึง</span>
        <label>
          <span className="adm-label">ปิด</span>
          <input className="adm-input" type="time" value={evalTimeForm.to} onChange={(e) => setEvalTimeForm((f) => ({ ...f, to: e.target.value }))} />
        </label>
      </div>
      {!evalTimeValid && <p className="adm-sub" style={{ color: 'var(--lv1)' }}>เวลาเปิดต้องมาก่อนเวลาปิด</p>}
      <div className="adm-row">
        <span className="adm-sub" style={{ margin: 0 }}>ตั้งเร็ว:</span>
        {[['07:00', '08:30'], ['06:30', '09:00'], ['07:00', '12:00'], ['00:00', '23:59']].map(([f, t]) => (
          <button key={f + t} className={`v2-chip${evalTimeForm.from === f && evalTimeForm.to === t ? ' is-on' : ''}`} onClick={() => setEvalTimeForm({ from: f, to: t })}>
            {f === '00:00' ? 'ทั้งวัน' : `${f}–${t}`}
          </button>
        ))}
      </div>
      <div className="adm-row adm-actions">
        <button className="adm-btn is-red" disabled={!evalTimeChanged || !evalTimeValid} onClick={() => ask(`ตั้งเวลาประเมินเป็น ${evalTimeForm.from} – ${evalTimeForm.to} น.?`, 'บันทึก', () => saveEvalTime(evalTimeForm.from, evalTimeForm.to))}>
          <Clock size={16} /> บันทึกเวลา
        </button>
        {evalTime && (evalTime.from !== '07:00' || evalTime.to !== '08:30') && (
          <button className="adm-btn" onClick={() => ask('คืนค่าเวลาประเมินเป็น 07:00 – 08:30 น.?', 'คืนค่า', () => saveEvalTime('07:00', '08:30'))}>คืนค่าเดิม 07:00–08:30</button>
        )}
      </div>
    </section>
  );

  const WEEKDAYS = [[1, 'จ'], [2, 'อ'], [3, 'พ'], [4, 'พฤ'], [5, 'ศ'], [6, 'ส'], [0, 'อา']];
  const daysChanged = days && daysForm && JSON.stringify(days) !== JSON.stringify(daysForm);
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // Same rule as evalDayStatus in lib/config.js, for the preview.
  const dayOpen = (iso) => {
    if (!daysForm) return true;
    if (daysForm.open.some((d) => d.date === iso)) return true;
    if (daysForm.closed.some((d) => d.date === iso)) return false;
    return daysForm.weekdays.includes(new Date(iso + 'T00:00:00Z').getUTCDay());
  };
  const next14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayIso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const upcoming = (list) => list.filter((d) => d.date >= todayIso);
  const dayList = (kind, title, empty) => (
    <div className="adm-daylist">
      <span className="adm-label">{title}</span>
      {upcoming(daysForm[kind]).length === 0 ? (
        <p className="adm-sub" style={{ marginTop: 0 }}>{empty}</p>
      ) : (
        <ul className="adm-list">
          {upcoming(daysForm[kind]).map((d) => (
            <li key={d.date}>
              <span className="adm-name">{thaiDay(d.date)}</span>
              <span className="adm-role">{d.note}</span>
              <button className="adm-icon-btn is-danger" style={{ marginLeft: 'auto' }} aria-label={`ลบ ${d.date}`} onClick={() => setDaysForm((f) => ({ ...f, [kind]: f[kind].filter((x) => x.date !== d.date) }))}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  const daysView = !daysForm ? null : (
    <section className="v2-card adm-card">
      <h3>วันที่เปิดให้ประเมิน</h3>
      <span className="adm-label">วันในสัปดาห์</span>
      <div className="adm-row adm-weekdays">
        {WEEKDAYS.map(([d, l]) => {
          const on = daysForm.weekdays.includes(d);
          return (
            <button key={d} className={`adm-wd${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => setDaysForm((f) => ({ ...f, weekdays: on ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort() }))}>
              {l}
            </button>
          );
        })}
        <button className="v2-chip" onClick={() => setDaysForm((f) => ({ ...f, weekdays: [1, 2, 3, 4, 5] }))}>จันทร์–ศุกร์</button>
        <button className="v2-chip" onClick={() => setDaysForm((f) => ({ ...f, weekdays: [0, 1, 2, 3, 4, 5, 6] }))}>ทุกวัน</button>
      </div>

      <span className="adm-label">เพิ่มวันหยุด / วันเปิดพิเศษ</span>
      <div className="v2-seg v2-seg-sm adm-seg">
        <button className={dayInput.kind === 'closed' ? 'is-on' : ''} onClick={() => setDayInput((i) => ({ ...i, kind: 'closed' }))}>ปิดประเมิน (วันหยุด)</button>
        <button className={dayInput.kind === 'open' ? 'is-on' : ''} onClick={() => setDayInput((i) => ({ ...i, kind: 'open' }))}>เปิดประเมินพิเศษ</button>
      </div>
      <div className="adm-row adm-dayadd">
        <label><span className="adm-sub">ตั้งแต่</span><input className="adm-input" type="date" min={todayIso} value={dayInput.from} onChange={(e) => setDayInput((i) => ({ ...i, from: e.target.value }))} /></label>
        <label><span className="adm-sub">ถึง (ถ้าหลายวัน)</span><input className="adm-input" type="date" min={dayInput.from || todayIso} value={dayInput.to} onChange={(e) => setDayInput((i) => ({ ...i, to: e.target.value }))} /></label>
        <label className="adm-grow"><span className="adm-sub">หมายเหตุ</span><input className="adm-input" maxLength={100} placeholder={dayInput.kind === 'closed' ? 'เช่น วันลอยกระทง, สอบกลางภาค' : 'เช่น เรียนชดเชย'} value={dayInput.note} onChange={(e) => setDayInput((i) => ({ ...i, note: e.target.value }))} /></label>
        <button className="adm-btn" onClick={addDays}><CalendarRange size={16} /> เพิ่ม</button>
      </div>

      <div className="adm-grid2" style={{ marginTop: 8 }}>
        {dayList('closed', 'วันหยุดที่ตั้งไว้', 'ยังไม่มี')}
        {dayList('open', 'วันเปิดพิเศษ', 'ยังไม่มี')}
      </div>

      <span className="adm-label">14 วันข้างหน้า</span>
      <div className="adm-cal">
        {next14.map((iso) => {
          const o = dayOpen(iso);
          const d = new Date(iso + 'T00:00:00Z');
          return (
            <div key={iso} className={`adm-cal-day${o ? ' is-open' : ''}${iso === todayIso ? ' is-today' : ''}`} title={iso}>
              <small>{['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][d.getUTCDay()]}</small>
              <b>{d.getUTCDate()}</b>
              <small>{o ? 'เปิด' : 'ปิด'}</small>
            </div>
          );
        })}
      </div>

      <div className="adm-row adm-actions">
        <button className="adm-btn is-red" disabled={!daysChanged} onClick={() => ask('บันทึกวันที่เปิดให้ประเมิน?', 'บันทึก', saveDays)}>
          <CalendarRange size={16} /> บันทึกวันประเมิน
        </button>
        {daysChanged && <button className="adm-btn" onClick={() => setDaysForm(days)}>ยกเลิกการแก้ไข</button>}
      </div>
    </section>
  );

  const termView = !term ? (
    <div className="v2-empty" style={{ height: 160 }}><span className="v2-spin" /></div>
  ) : (
    <TermsPanel term={term} reload={setTerm} showToast={showToast} ask={ask} />
  );

  return (
    <div className="v2 adm">
      <div className="adm-top">
        <div className="adm-top-inner">
          <div className="adm-title">
            <h1>จัดการระบบ</h1>
            {lockBadge}
          </div>
          <div className="adm-links">
            <Link href="/" className="adm-link"><LayoutDashboard size={16} /> หน้าสรุป</Link>
            <Link href="/admin/logs" className="adm-link"><FileText size={16} /> ประวัติการใช้งาน</Link>
            <Link href="/admin/evaluations" className="adm-link"><ClipboardCheck size={16} /> จัดการการประเมิน</Link>
            <button className="adm-link" onClick={() => window.dispatchEvent(new Event('show-tour'))}><HelpCircle size={16} /> สอนใช้งาน</button>
            <button className="adm-link" onClick={() => signOut({ callbackUrl: '/' })}><LogOut size={16} /> ออกจากระบบ</button>
          </div>
          <div className="v2-chips adm-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`v2-chip${tab === t.key ? ' is-on' : ''}`} onClick={() => setTab(t.key)}>
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="v2-page">
        {tab === 'today' && todayView}
        {tab === 'lock' && lockView}
        {tab === 'people' && peopleView}
        {tab === 'time' && (
          <div className="adm-stack">
            {daysView}
            {timeView}
          </div>
        )}
        {tab === 'term' && termView}
        <p className="v2-footer">
          <Link href="/">หน้าสรุป</Link> · <Link href="/evaluate">หน้าประเมิน</Link> · <Link href="/v1">หน้าสรุปแบบเดิม</Link> · <Link href="/v1/evaluate">หน้าประเมินแบบเดิม</Link>
        </p>
      </div>

      {confirmBox && (
        <div className="v2-sheet-overlay adm-confirm" onClick={(e) => e.target === e.currentTarget && setConfirmBox(null)}>
          <div className="adm-confirm-card" role="dialog" aria-modal="true">
            <p>{confirmBox.text}</p>
            <div className="adm-row adm-actions">
              <button className="adm-btn" onClick={() => setConfirmBox(null)}>ยกเลิก</button>
              <button
                className={`adm-btn ${confirmBox.danger ? 'is-red' : 'is-green'}`}
                autoFocus
                onClick={() => {
                  const fn = confirmBox.onYes;
                  setConfirmBox(null);
                  fn();
                }}
              >
                {confirmBox.ok}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.message} type={toast.type} isVisible={toast.visible} onClose={() => setToast((prev) => ({ ...prev, visible: false }))} />
    </div>
  );
}
