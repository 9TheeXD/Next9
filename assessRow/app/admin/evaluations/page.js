'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2, Search, FileText, X, RotateCcw } from 'lucide-react';
import Toast from '../../components/Toast';
import '../../v2/v2.css';
import '../admin.css';

const CRIT_IDS = [1, 2, 3, 4, 5];
const GRADES = [0, 1, 2, 3, 4, 5, 6];
const SCALE_LEGEND = '0 = ไม่ให้คะแนน · 1 ไม่ผ่าน · 2 ปรับปรุง · 3 พอใช้ · 4 ดี · 5 ดีมาก';
const AUDIT_LABEL = {
  edit: { text: 'แก้ไขคะแนน', tone: 't-blue' },
  'delete-record': { text: 'ลบรายการ', tone: 't-red' },
  'delete-evaluator': { text: 'ลบของคนนี้', tone: 't-red' },
  'delete-day': { text: 'ล้างทั้งวัน', tone: 't-red' },
  restore: { text: 'กู้คืน', tone: 't-emerald' },
};

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shiftIso = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const thaiDate = (iso) => new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T00:00:00'));
const unitLabel = (grade, room) => (room === 0 ? `ม.${grade} ภาพรวม` : `ม.${grade} ห้อง ${room}`);
// Same rule as the ranking: whitelist role first, then numeric ids count as council, everyone else is a teacher.
const roleLabel = (id, role) => {
  if (role === 'council') return 'สภานักเรียน';
  if (role === 'teacher') return 'ครู';
  return id === 'council' || /^\d+$/.test(id) ? 'สภานักเรียน' : 'ครู';
};
const roleTone = (label) => (label === 'สภานักเรียน' ? 't-purple' : 't-amber');

async function callApi(method, body) {
  try {
    const res = await fetch('/api/admin/evaluations', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, message: json.message };
  } catch {
    return { ok: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' };
  }
}

export default function AdminEvaluationsPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  // Opens on today (Bangkok). The page shows a spinner until the session is known, so the
  // server render never shows this value.
  const [date, setDate] = useState(() => todayIso());
  const [grade, setGrade] = useState(0);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [version, setVersion] = useState(0); // bump to reload the list
  // Each answer is stored with the request key it belongs to; "loading" means the key is not answered yet.
  const [result, setResult] = useState({ key: null, data: null });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { record, scores }
  const [confirmBox, setConfirmBox] = useState(null); // { text, ok, onYes }
  const [typeBox, setTypeBox] = useState(null); // { text, expected, onYes }
  const [typeInput, setTypeInput] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  const showToast = useCallback((message, type = 'info') => setToast({ visible: true, message, type }), []);
  const reload = () => setVersion((v) => v + 1);
  const requestKey = `${date}|${grade}|${q}|${version}`;
  const data = result.key === requestKey ? result.data : null;

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const params = new URLSearchParams({ date });
    if (grade) params.set('grade', String(grade));
    if (q) params.set('q', q);
    fetch(`/api/admin/evaluations?${params}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!cancelled) setResult({ key: requestKey, data: d });
      })
      .catch(() => {
        if (!cancelled) showToast('โหลดข้อมูลไม่สำเร็จ ลองกดรีเฟรช', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, date, grade, q, requestKey, showToast]);

  const records = useMemo(() => data?.records || [], [data]);
  const criteria = data?.criteria || [];
  const scoreLabels = data?.scoreLabels || {};

  // Records grouped by evaluator, the one with most units first.
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      if (!map.has(r.evaluator_id)) map.set(r.evaluator_id, { id: r.evaluator_id, role: r.role, records: [] });
      map.get(r.evaluator_id).records.push(r);
    }
    return [...map.values()].sort((a, b) => b.records.length - a.records.length || a.id.localeCompare(b.id));
  }, [records]);

  if (status === 'loading') {
    return (
      <div className="v2 adm">
        <div className="v2-empty" style={{ height: '50vh' }}><span className="v2-spin" /></div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="v2 adm">
        <div className="adm-top"><div className="adm-top-inner"><div className="adm-title"><h1>จัดการการประเมิน</h1></div></div></div>
        <div className="v2-page">
          <section className="v2-card adm-card">
            <p className="adm-sub" style={{ margin: 0 }}>หน้านี้สำหรับแอดมินเท่านั้น เข้าสู่ระบบแอดมินที่ <Link href="/admin">หน้าจัดการระบบ</Link></p>
          </section>
        </div>
      </div>
    );
  }

  const today = todayIso();
  const filtersOn = grade !== 0 || q !== '';

  function finish(res, okText) {
    if (res.ok) {
      showToast(okText, 'success');
      reload();
    } else {
      showToast(res.message || 'ทำรายการไม่สำเร็จ', 'error');
    }
  }

  function ask(text, ok, onYes) {
    setConfirmBox({ text, ok, onYes });
  }

  function openEdit(r) {
    const scores = {};
    for (const c of CRIT_IDS) scores[c] = r.scores[c] ?? 0;
    setEditing({ record: r, scores });
  }

  const editDirty = editing && CRIT_IDS.some((c) => editing.scores[c] !== (editing.record.scores[c] ?? 0));

  async function saveEdit() {
    const { record, scores } = editing;
    setBusy(true);
    const res = await callApi('PUT', { date, evaluator_id: record.evaluator_id, grade: record.grade, room: record.room, zone: record.zone, scores });
    setBusy(false);
    if (res.ok) setEditing(null);
    finish(res, 'บันทึกคะแนนแล้ว');
  }

  function deleteRecord(r) {
    ask(`ลบคะแนนของ ${r.evaluator_id} ${unitLabel(r.grade, r.room)} (ทั้ง 5 ข้อ) ใช่ไหม ลบแล้วต้องกู้คืนจากประวัติเท่านั้น`, 'ลบ', async () => {
      setBusy(true);
      const res = await callApi('DELETE', { scope: 'record', date, evaluator_id: r.evaluator_id, grade: r.grade, room: r.room, zone: r.zone });
      setBusy(false);
      finish(res, 'ลบแล้ว');
    });
  }

  function deleteEvaluator(g) {
    const scopeText = grade ? `ชั้น ม.${grade} ` : '';
    ask(`ลบคะแนนทั้งหมดของ ${g.id} ${scopeText}วันนี้ (${g.records.length} ห้อง/ชั้น) ใช่ไหม`, 'ลบ', async () => {
      setBusy(true);
      const body = { scope: 'evaluator', date, evaluator_id: g.id };
      if (grade) body.grade = grade;
      const res = await callApi('DELETE', body);
      setBusy(false);
      finish(res, 'ลบแล้ว');
    });
  }

  function restoreEntry(a) {
    const isEdit = a.action === 'edit';
    ask(`กู้คืน: ${a.target}?\n${isEdit ? 'คะแนนปัจจุบันของห้องนี้จะถูกแทนด้วยคะแนนเดิม' : 'เฉพาะข้อที่หายไปเท่านั้นที่จะถูกคืน ข้อที่มีอยู่แล้วไม่เปลี่ยน'}`, 'กู้คืน', async () => {
      setBusy(true);
      try {
        const res = await fetch('/api/admin/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) {
          showToast(json.message || 'กู้คืนแล้ว', 'success');
          reload();
        } else showToast(json.message || 'กู้คืนไม่สำเร็จ', 'error');
      } catch {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
      } finally {
        setBusy(false);
      }
    });
  }

  function clearDay() {
    setTypeInput('');
    setTypeBox({
      text: `ล้างคะแนนทั้งวัน ${thaiDate(date)} ของทุกคนและทุกชั้น (${records.length} ห้อง/ชั้น) พิมพ์วันที่ด้านล่างเพื่อยืนยัน`,
      expected: date,
      onYes: async () => {
        setBusy(true);
        const res = await callApi('DELETE', { scope: 'day', date, confirm: date });
        setBusy(false);
        finish(res, 'ล้างคะแนนทั้งวันแล้ว');
      },
    });
  }

  return (
    <div className="v2 adm">
      <div className="adm-top">
        <div className="adm-top-inner">
          <div className="adm-title">
            <Link href="/admin" className="adm-icon-btn" aria-label="กลับหน้าจัดการระบบ"><ArrowLeft size={18} /></Link>
            <h1>จัดการการประเมิน</h1>
          </div>
          <div className="adm-links">
            <Link href="/admin/logs" className="adm-link"><FileText size={16} /> ประวัติการใช้งาน</Link>
            <Link href="/admin" className="adm-link">หน้าจัดการระบบ</Link>
          </div>
        </div>
      </div>

      <div className="v2-page adm-stack">
        <section className="v2-card ev-filter">
          <div className="ev-date">
            <button className="ev-nav" aria-label="วันก่อนหน้า" onClick={() => setDate((d) => shiftIso(d, -1))}><ChevronLeft size={20} /></button>
            <label className="ev-date-main">
              <b>{thaiDate(date)}</b>
              <small>{date === today ? 'วันนี้ · แตะเพื่อเปลี่ยนวัน' : 'แตะเพื่อเปลี่ยนวัน'}</small>
              <input type="date" aria-label="เลือกวันที่" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
            <button className="ev-nav" aria-label="วันถัดไป" disabled={date >= today} onClick={() => setDate((d) => shiftIso(d, 1))}><ChevronRight size={20} /></button>
          </div>
          {date !== today && <button className="ev-today" onClick={() => setDate(today)}>กลับไปวันนี้</button>}
          <div className="ev-search-row">
            <select className="ev-select" aria-label="ชั้น" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {GRADES.map((g) => <option key={g} value={g}>{g === 0 ? 'ทุกชั้น' : `ม.${g}`}</option>)}
            </select>
            <span className="ev-search">
              <Search size={16} />
              <input placeholder="ค้นหาชื่อ รหัส หรือ ครู/สภา" value={qInput} onChange={(e) => setQInput(e.target.value)} />
            </span>
          </div>
        </section>

        <div className="ev-summary">
          <span>{data ? `${groups.length} คน · ${records.length} รายการ` : 'กำลังโหลด...'}</span>
          <button className="adm-link-btn" onClick={reload}><RotateCcw size={14} /> รีเฟรช</button>
        </div>

        {!data ? (
          <div className="v2-empty" style={{ height: 160 }}><span className="v2-spin" /></div>
        ) : groups.length === 0 ? (
          <section className="v2-card adm-card">
            <div className="v2-empty" style={{ height: 120 }}>
              {filtersOn ? 'ไม่พบคนที่ตรงกับตัวกรอง' : 'วันนี้ยังไม่มีการประเมิน'}
            </div>
          </section>
        ) : (
          <>
            <p className="ev-hint">แตะชื่อเพื่อเปิดดู · แตะแถวห้องเพื่อแก้ไขหรือลบ</p>
            {groups.map((g) => {
              const label = roleLabel(g.id, g.role);
              return (
                <details key={g.id} className={`v2-card ev-person${loading(result, requestKey) ? ' is-loading' : ''}`} open={groups.length <= 2 || undefined}>
                  <summary>
                    <span className="ev-person-name"><b>{g.id}</b> <span className={`adm-tag ${roleTone(label)}`}>{label}</span></span>
                    <span className="ev-person-count">{g.records.length} รายการ</span>
                    <ChevronDown size={18} className="ev-chev" />
                  </summary>
                  <ul className="ev-rows">
                    {g.records.map((r) => (
                      <li key={`${r.grade}-${r.room}-${r.zone}`}>
                        <button className="ev-row" disabled={busy} onClick={() => openEdit(r)} aria-label={`แก้ไขหรือลบ ${unitLabel(r.grade, r.room)}`}>
                          <span className="ev-unit">{unitLabel(r.grade, r.room)}</span>
                          <span className="ev-chips">
                            {CRIT_IDS.map((c) => {
                              const s = r.scores[c] ?? 0;
                              return <i key={c} className={`ev-chip adm-lv${s}`}>{s || '–'}</i>;
                            })}
                          </span>
                          <Pencil size={15} className="ev-pencil" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button className="ev-del-all" disabled={busy} onClick={() => deleteEvaluator(g)}>
                    <Trash2 size={14} /> {grade ? `ลบของ ${g.id} เฉพาะ ม.${grade}` : `ลบของ ${g.id} ทั้งวัน`}
                  </button>
                </details>
              );
            })}
          </>
        )}

        {/* 3. Danger zone */}
        {data && records.length > 0 && !filtersOn && (
          <section className="v2-card adm-card adm-danger-zone">
            <h3>ล้างทั้งวัน</h3>
            <p className="adm-sub">ลบคะแนนของทุกคนทุกชั้นในวันนี้ ต้องพิมพ์วันที่ยืนยัน</p>
            <div className="adm-row">
              <button className="adm-btn adm-btn-danger" disabled={busy} onClick={clearDay}><Trash2 size={16} /> ล้างคะแนนทั้งวัน</button>
            </div>
          </section>
        )}

        {/* 4. History of changes, restorable */}
        <section className="v2-card adm-card">
          <details className="adm-audit">
            <summary>ประวัติการแก้ไขและลบ (ล่าสุด {data?.audit?.length ?? 0} รายการ)</summary>
            {!data?.audit?.length ? (
              <p className="adm-sub">ยังไม่มีการแก้ไขหรือลบ</p>
            ) : (
              <ul className="adm-audit-list">
                {data.audit.map((a) => {
                  const meta = AUDIT_LABEL[a.action] || { text: a.action, tone: 't-gray' };
                  return (
                    <li key={a.id} className="adm-audit-row">
                      <div className="adm-audit-top">
                        <span className="adm-num">{a.created_at.slice(0, 10)} {a.created_at.slice(11, 16)} น.</span>
                        <span className={`adm-tag ${meta.tone}`}>{meta.text}</span>
                        {a.restored_at && <span className="adm-tag">กู้คืนแล้ว</span>}
                      </div>
                      <div className="adm-audit-target">{a.target}</div>
                      {a.restorable && (
                        <button className="adm-link-btn adm-audit-restore" disabled={busy} onClick={() => restoreEntry(a)}>
                          <RotateCcw size={14} /> กู้คืนรายการนี้
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </details>
        </section>

        <p className="v2-footer">
          <Link href="/">หน้าสรุป</Link> · <Link href="/evaluate">หน้าประเมิน</Link>
        </p>
      </div>

      {editing && (
        <div className="v2-sheet-overlay" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="v2-sheet adm-sheet" role="dialog" aria-modal="true" aria-labelledby="adm-edit-title">
            <div className="v2-sheet-head">
              <div className="v2-sheet-title">
                <h3 id="adm-edit-title">แก้ไขคะแนน</h3>
                <small>คน {editing.record.evaluator_id} · {unitLabel(editing.record.grade, editing.record.room)} · {thaiDate(date)}</small>
              </div>
              <button className="adm-icon-btn" onClick={() => setEditing(null)} aria-label="ปิด"><X size={18} /></button>
            </div>
            <div className="v2-sheet-body">
              <p className="adm-legend">{SCALE_LEGEND}</p>
              {CRIT_IDS.map((c) => {
                const val = editing.scores[c];
                const text = criteria.find((x) => x.id === c)?.text || '';
                return (
                  <div key={c} className="adm-crit">
                    <div className="adm-crit-text"><b>ข้อ {c}</b> {text}</div>
                    <div className="adm-scale" role="radiogroup" aria-label={`คะแนนข้อ ${c}`}>
                      {[0, 1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          role="radio"
                          aria-checked={val === s}
                          className={`adm-scale-btn adm-lv${s}${val === s ? ' is-on' : ''}`}
                          onClick={() => setEditing((e) => ({ ...e, scores: { ...e.scores, [c]: s } }))}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="adm-scale-label">ตอนนี้ {val} = {scoreLabels[val] || '-'}</div>
                  </div>
                );
              })}
              <div className="adm-row adm-actions">
                <button className="adm-btn is-red" disabled={busy || !editDirty} onClick={saveEdit}>บันทึกคะแนน</button>
                <button className="adm-btn" onClick={() => setEditing(null)}>ยกเลิก</button>
              </div>
              <button
                className="ev-del-all"
                disabled={busy}
                onClick={() => {
                  const r = editing.record;
                  setEditing(null);
                  deleteRecord(r);
                }}
              >
                <Trash2 size={14} /> ลบรายการนี้ทั้ง 5 ข้อ
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBox && (
        <div className="v2-sheet-overlay adm-confirm" onClick={(e) => e.target === e.currentTarget && setConfirmBox(null)}>
          <div className="adm-confirm-card" role="dialog" aria-modal="true">
            <p>{confirmBox.text}</p>
            <div className="adm-row adm-actions">
              <button className="adm-btn" onClick={() => setConfirmBox(null)}>ยกเลิก</button>
              <button
                className="adm-btn is-red"
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

      {typeBox && (
        <div className="v2-sheet-overlay adm-confirm" onClick={(e) => e.target === e.currentTarget && setTypeBox(null)}>
          <div className="adm-confirm-card" role="dialog" aria-modal="true">
            <p>{typeBox.text}</p>
            <label className="adm-label-top" style={{ marginTop: 14 }}>พิมพ์ {typeBox.expected} เพื่อยืนยัน</label>
            <input className="adm-input" placeholder={typeBox.expected} value={typeInput} onChange={(e) => setTypeInput(e.target.value.trim())} autoFocus />
            <div className="adm-row adm-actions">
              <button className="adm-btn" onClick={() => setTypeBox(null)}>ยกเลิก</button>
              <button
                className="adm-btn is-red"
                disabled={typeInput !== typeBox.expected || busy}
                onClick={() => {
                  const fn = typeBox.onYes;
                  setTypeBox(null);
                  fn();
                }}
              >
                ล้างคะแนนทั้งวัน
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.message} type={toast.type} isVisible={toast.visible} onClose={() => setToast((prev) => ({ ...prev, visible: false }))} />
    </div>
  );
}

// True while the list for the current filters has not arrived yet.
function loading(result, requestKey) {
  return result.key !== requestKey;
}
