'use client';

import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, Search } from 'lucide-react';

const KINDS = [
  { key: 'digits', label: 'ชื่อเป็นตัวเลขล้วน', example: '39814' },
  { key: 'letters', label: 'ชื่อไม่ใช่ตัวเลขล้วน', example: 'somchai.s' },
  { key: 'any', label: 'ทุกชื่อ', example: '' },
  { key: 'starts', label: 'ชื่อขึ้นต้นด้วย…', example: '' },
  { key: 'contains', label: 'ชื่อมีคำว่า…', example: '' },
];
const ROLES = [
  { key: 'teacher', label: 'ครู', tone: 't-amber' },
  { key: 'council', label: 'สภานักเรียน', tone: 't-purple' },
  { key: 'student', label: 'นักเรียน', tone: 't-green' },
  { key: 'deny', label: 'ห้ามเข้าใช้', tone: 't-red' },
];
const RESULT_LABEL = { admin: 'แอดมิน', teacher: 'ครู', council: 'สภานักเรียน', student: 'นักเรียน' };
const DOMAIN = 'sirin.ac.th'; // fixed: Google sign-in only accepts this Workspace

const PRESETS = [
  { label: 'ตัวเลขล้วน = นักเรียน', rule: { local_kind: 'digits', role: 'student' } },
  { label: 'ไม่ใช่ตัวเลขล้วน = ครู', rule: { local_kind: 'letters', role: 'teacher' } },
];

function describe(r) {
  const kind = KINDS.find((k) => k.key === r.local_kind)?.label.replace('…', '') || r.local_kind;
  const value = r.local_value ? ` "${r.local_value}"` : '';
  return `${kind}${value} @${DOMAIN}`;
}

export default function EmailRulesPanel({ showToast, ask }) {
  const [rules, setRules] = useState(null);
  const [form, setForm] = useState({ local_kind: 'letters', local_value: '', role: 'teacher' });
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/email-rules', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setRules(d.rules))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function call(method, body, okText, query = '') {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/email-rules${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setRules(d.rules);
        if (okText) showToast(okText, 'success');
        setTestResult(null);
        return true;
      }
      showToast(d.message || 'บันทึกไม่สำเร็จ', 'error');
    } catch {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    } finally {
      setBusy(false);
    }
    return false;
  }

  function move(i, dir) {
    const ids = rules.map((r) => r.id);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    call('PUT', { order: ids }, null);
  }

  async function test(e) {
    e.preventDefault();
    const email = testEmail.trim();
    if (!email.includes('@')) return showToast('ใส่อีเมลเต็ม เช่น 39814@sirin.ac.th', 'error');
    try {
      const res = await fetch(`/api/admin/email-rules?test=${encodeURIComponent(email)}`, { cache: 'no-store' });
      const d = await res.json();
      setTestResult({ email, result: d.test?.result || null });
    } catch {
      showToast('ทดสอบไม่สำเร็จ', 'error');
    }
  }

  const needsValue = form.local_kind === 'starts' || form.local_kind === 'contains';

  return (
    <section className="v2-card adm-card">
      <h3>รูปแบบอีเมล (คนที่ไม่อยู่ในรายชื่อ)</h3>
      <p className="adm-sub" style={{ marginTop: 0 }}>
        เข้าระบบได้เฉพาะอีเมล @{DOMAIN} ตอนเข้าสู่ระบบด้วย Google ระบบดูรายชื่อด้านบนก่อน ถ้าไม่มีชื่อ จะไล่ดูกฎนี้จากบนลงล่าง ใช้กฎแรกที่ตรง ถ้าไม่ตรงกฎไหนเลย เข้าระบบไม่ได้
      </p>

      {!rules ? (
        <div className="v2-empty" style={{ height: 80 }}><span className="v2-spin" /></div>
      ) : rules.length === 0 ? (
        <p className="adm-sub">ยังไม่มีกฎ ตอนนี้เข้าได้เฉพาะคนในรายชื่อ</p>
      ) : (
        <ol className="adm-rules">
          {rules.map((r, i) => {
            const role = ROLES.find((x) => x.key === r.role);
            return (
              <li key={r.id}>
                <span className="adm-rule-no">{i + 1}</span>
                <span className="adm-rule-text">{describe(r)}</span>
                <span className={`adm-tag ${role?.tone || 't-gray'}`}>{role?.label || r.role}</span>
                <span className="adm-rule-btns">
                  <button className="adm-icon-btn" disabled={busy || i === 0} aria-label="เลื่อนขึ้น" onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                  <button className="adm-icon-btn" disabled={busy || i === rules.length - 1} aria-label="เลื่อนลง" onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                  <button className="adm-icon-btn is-danger" disabled={busy} aria-label="ลบกฎ" onClick={() => ask(`ลบกฎ "${describe(r)} = ${role?.label}"?`, 'ลบ', () => call('DELETE', null, 'ลบกฎแล้ว', `?id=${r.id}`), true)}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <span className="adm-label">เพิ่มกฎ</span>
      <div className="adm-row">
        <span className="adm-sub" style={{ margin: 0 }}>ตั้งเร็ว:</span>
        {PRESETS.map((p) => (
          <button key={p.label} className="v2-chip" disabled={busy} onClick={() => call('POST', p.rule, 'เพิ่มกฎแล้ว')}>{p.label}</button>
        ))}
      </div>
      <div className="adm-rule-form">
        <label>
          <span className="adm-sub">ชื่อหน้า @</span>
          <select className="adm-input" value={form.local_kind} onChange={(e) => setForm((f) => ({ ...f, local_kind: e.target.value }))}>
            {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </label>
        {needsValue && (
          <label>
            <span className="adm-sub">ข้อความ</span>
            <input className="adm-input" value={form.local_value} placeholder="เช่น t." onChange={(e) => setForm((f) => ({ ...f, local_value: e.target.value }))} />
          </label>
        )}
        <label>
          <span className="adm-sub">ให้เป็น</span>
          <select className="adm-input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <button className="adm-btn is-red" disabled={busy || (needsValue && !form.local_value.trim())} onClick={() => call('POST', form, 'เพิ่มกฎแล้ว')}>
          <Plus size={16} /> เพิ่มกฎ
        </button>
      </div>

      <span className="adm-label">ทดสอบอีเมล</span>
      <form className="adm-row" onSubmit={test}>
        <div className="adm-search"><Search size={16} /><input placeholder={`เช่น 39814@${DOMAIN}`} value={testEmail} onChange={(e) => setTestEmail(e.target.value)} /></div>
        <button className="adm-btn" type="submit">ตรวจ</button>
      </form>
      {testResult && (
        <p className="adm-test">
          {testResult.email}:{' '}
          {testResult.result ? (
            <b>{RESULT_LABEL[testResult.result.role]} {testResult.result.source === 'whitelist' ? '(จากรายชื่อ)' : '(จากกฎ)'}</b>
          ) : (
            <b className="is-bad">เข้าระบบไม่ได้</b>
          )}
        </p>
      )}
    </section>
  );
}
