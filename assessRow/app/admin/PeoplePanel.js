'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, UserPlus, ChevronRight, ChevronDown, Trash2, X, Check, GraduationCap, Users, ShieldCheck, Settings2 } from 'lucide-react';
import EmailRulesPanel from './EmailRulesPanel';
import AdminAccountsPanel from './AdminAccountsPanel';

const ROLES = [
  { key: 'teacher', label: 'ครู', desc: 'ประเมินแถวได้ คะแนนนับเป็นของครู (60%)', icon: GraduationCap, tone: 'is-teacher' },
  { key: 'council', label: 'สภานักเรียน', desc: 'ประเมินแถวได้ คะแนนนับเป็นของสภา (40%)', icon: Users, tone: 'is-council' },
  { key: 'admin', label: 'แอดมิน', desc: 'จัดการระบบทั้งหมด เข้าด้วยปุ่ม Google ที่หน้า /admin', icon: ShieldCheck, tone: 'is-admin' },
];
const roleOf = (key) => ROLES.find((r) => r.key === key) || ROLES[0];

// Names typed or pasted into the add box: emails or the part before @, split on spaces, commas, new lines.
const parseNames = (text) => [...new Set(text.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];

function RolePicker({ value, onChange }) {
  return (
    <div className="pp-roles" role="radiogroup" aria-label="บทบาท">
      {ROLES.map((r) => (
        <button key={r.key} type="button" role="radio" aria-checked={value === r.key} className={`pp-role ${r.tone}${value === r.key ? ' is-on' : ''}`} onClick={() => onChange(r.key)}>
          <span className="pp-role-icon"><r.icon size={18} /></span>
          <span className="pp-role-text">
            <b>{r.label}</b>
            <small>{r.desc}</small>
          </span>
          <span className="pp-role-check">{value === r.key && <Check size={16} />}</span>
        </button>
      ))}
    </div>
  );
}

function Sheet({ title, sub, onClose, children }) {
  return (
    <div className="v2-sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="v2-sheet adm-sheet" role="dialog" aria-modal="true">
        <div className="v2-sheet-head">
          <div className="v2-sheet-title">
            <h3>{title}</h3>
            {sub && <small>{sub}</small>}
          </div>
          <button className="adm-icon-btn" onClick={onClose} aria-label="ปิด"><X size={18} /></button>
        </div>
        <div className="v2-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export default function PeoplePanel({ session, showToast, ask }) {
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(null); // { text, role }
  const [editing, setEditing] = useState(null); // whitelist row
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whitelist', { cache: 'no-store' });
      if (res.ok) setList((await res.json()).whitelist);
    } catch {
      showToast('โหลดรายชื่อไม่สำเร็จ', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/whitelist', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setList(d.whitelist))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c = { all: 0, teacher: 0, council: 0, admin: 0 };
    for (const w of list || []) {
      c.all++;
      if (c[w.role] !== undefined) c[w.role]++;
    }
    return c;
  }, [list]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list || [])
      .filter((w) => (filter === 'all' || w.role === filter) && (!q || w.prefix.includes(q)))
      .sort((a, b) => a.prefix.localeCompare(b.prefix, 'th', { numeric: true }));
  }, [list, query, filter]);

  const isMe = (prefix) => !!session?.user?.email && session.user.email.toLowerCase().split('@')[0] === prefix;

  async function addAll() {
    const names = parseNames(adding.text);
    if (!names.length) return;
    setBusy(true);
    let ok = 0;
    const failed = [];
    let reason = '';
    for (const prefix of names) {
      try {
        const res = await fetch('/api/admin/whitelist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, role: adding.role }) });
        if (res.ok) ok++;
        else {
          failed.push(prefix);
          const d = await res.json().catch(() => ({}));
          reason = d.error && !/exists/i.test(d.error) ? d.error : 'มีในรายชื่อแล้ว';
        }
      } catch {
        failed.push(prefix);
        reason = 'เชื่อมต่อไม่ได้';
      }
    }
    setBusy(false);
    load();
    if (failed.length) {
      setAdding((a) => ({ ...a, text: failed.join('\n') }));
      showToast(`เพิ่มแล้ว ${ok} คน · ไม่สำเร็จ ${failed.length} คน (${reason})`, ok ? 'info' : 'error');
    } else {
      setAdding(null);
      showToast(`เพิ่มแล้ว ${ok} คน`, 'success');
    }
  }

  async function saveRole(item, role) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/whitelist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: item.prefix, role }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setList((l) => l.map((x) => (x.prefix === item.prefix ? { ...x, role } : x)));
        setEditing(null);
        showToast(`${item.prefix} เป็น${roleOf(role).label}แล้ว`, 'success');
      } else showToast(d.error || 'เปลี่ยนไม่สำเร็จ', 'error');
    } catch {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Making someone admin, or taking it away, asks first.
  function pickRole(item, role) {
    if (role === item.role) return;
    if (role === 'admin') {
      ask(`ให้ ${item.prefix} เป็นแอดมิน?\nจะจัดการระบบได้ทั้งหมด (แก้คะแนน ลบข้อมูล เพิ่มแอดมิน)`, 'ให้เป็นแอดมิน', () => saveRole(item, role), true);
    } else if (item.role === 'admin') {
      ask(`ถอด ${item.prefix} จากแอดมินเป็น${roleOf(role).label}?${isMe(item.prefix) ? '\nนี่คือบัญชีที่คุณใช้อยู่ จะหมดสิทธิ์แอดมินทันที' : ''}`, 'เปลี่ยน', () => saveRole(item, role), true);
    } else saveRole(item, role);
  }

  function remove(item) {
    ask(
      `ลบ ${item.prefix} ออกจากรายชื่อ?\nคะแนนที่เคยประเมินไม่หาย${isMe(item.prefix) ? '\nนี่คือบัญชีที่คุณใช้อยู่ จะหมดสิทธิ์ทันที' : ''}`,
      'ลบ',
      async () => {
        try {
          const res = await fetch(`/api/admin/whitelist?prefix=${encodeURIComponent(item.prefix)}`, { method: 'DELETE' });
          if (res.ok) {
            setList((l) => l.filter((x) => x.prefix !== item.prefix));
            setEditing(null);
            showToast(`ลบ ${item.prefix} แล้ว`, 'success');
          } else showToast('ลบไม่สำเร็จ', 'error');
        } catch {
          showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
        }
      },
      true,
    );
  }

  const addCount = adding ? parseNames(adding.text).length : 0;

  return (
    <div className="adm-stack">
      <section className="v2-card pp-card">
        <div className="pp-head">
          <div>
            <h3>รายชื่อผู้มีสิทธิ์</h3>
            <p className="adm-sub" style={{ margin: 0 }}>คนที่ไม่อยู่ในรายชื่อ ระบบใช้ &quot;รูปแบบอีเมล&quot; ด้านล่างแทน</p>
          </div>
          <button className="adm-btn is-red" onClick={() => setAdding({ text: '', role: 'teacher' })}><UserPlus size={16} /> เพิ่ม</button>
        </div>

        <div className="pp-search">
          <Search size={17} />
          <input placeholder="ค้นหาชื่อหรือรหัส" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button aria-label="ล้าง" onClick={() => setQuery('')}><X size={16} /></button>}
        </div>

        <div className="pp-filters" role="tablist">
          {[{ key: 'all', label: 'ทั้งหมด' }, ...ROLES].map((r) => (
            <button key={r.key} role="tab" aria-selected={filter === r.key} className={`pp-filter${filter === r.key ? ' is-on' : ''}`} onClick={() => setFilter(r.key)}>
              {r.label} <span>{counts[r.key]}</span>
            </button>
          ))}
        </div>

        {!list ? (
          <div className="v2-empty" style={{ height: 120 }}><span className="v2-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="v2-empty" style={{ height: 100 }}>{list.length ? 'ไม่พบชื่อที่ค้นหา' : 'ยังไม่มีรายชื่อ กด "เพิ่ม" ด้านบน'}</div>
        ) : (
          <ul className="pp-list">
            {shown.map((item) => {
              const r = roleOf(item.role);
              return (
                <li key={item.prefix}>
                  <button className="pp-row" onClick={() => setEditing(item)}>
                    <span className={`pp-avatar ${r.tone}`}><r.icon size={17} /></span>
                    <span className="pp-name">
                      <b>{item.prefix}</b>
                      {isMe(item.prefix) && <small>คุณ</small>}
                    </span>
                    <span className={`pp-pill ${r.tone}`}>{r.label}</span>
                    <ChevronRight size={18} className="pp-chev" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="pp-more">
        <summary>
          <Settings2 size={18} />
          <span>
            <b>ตั้งค่าเพิ่มเติม</b>
            <small>รูปแบบอีเมลอัตโนมัติ · บัญชีแอดมินแบบรหัสผ่าน</small>
          </span>
          <ChevronDown size={18} className="pp-more-chev" />
        </summary>
        <div className="adm-stack" style={{ marginTop: 12 }}>
          <EmailRulesPanel showToast={showToast} ask={ask} />
          <AdminAccountsPanel showToast={showToast} ask={ask} />
        </div>
      </details>

      {adding && (
        <Sheet title="เพิ่มรายชื่อ" sub="ใส่ได้หลายคน คั่นด้วยการขึ้นบรรทัดใหม่ เว้นวรรค หรือจุลภาค" onClose={() => setAdding(null)}>
          <span className="adm-label" style={{ marginTop: 0 }}>ชื่อหน้า @ หรืออีเมล @sirin.ac.th</span>
          <textarea className="adm-input" rows={4} autoFocus autoCapitalize="none" value={adding.text} onChange={(e) => setAdding((a) => ({ ...a, text: e.target.value }))} placeholder={'เช่น\n39814\nsomchai.s@sirin.ac.th'} />
          <span className="adm-label">ให้เป็น</span>
          <RolePicker value={adding.role} onChange={(role) => setAdding((a) => ({ ...a, role }))} />
          <button className="adm-btn is-red pp-wide" disabled={busy || !addCount} onClick={addAll}>
            <UserPlus size={16} /> {addCount ? `เพิ่ม ${addCount} คนเป็น${roleOf(adding.role).label}` : 'พิมพ์ชื่อก่อน'}
          </button>
        </Sheet>
      )}

      {editing && (
        <Sheet title={editing.prefix} sub={`${editing.prefix}@sirin.ac.th`} onClose={() => setEditing(null)}>
          <span className="adm-label" style={{ marginTop: 0 }}>บทบาท</span>
          <RolePicker value={editing.role} onChange={(role) => !busy && pickRole(editing, role)} />
          <button className="pp-delete" disabled={busy} onClick={() => remove(editing)}>
            <Trash2 size={16} /> ลบออกจากรายชื่อ
          </button>
        </Sheet>
      )}
    </div>
  );
}
