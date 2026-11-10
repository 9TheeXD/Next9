'use client';

import { useState, useEffect } from 'react';
import { KeyRound, Trash2, UserPlus, Pencil, X, Check } from 'lucide-react';

const thaiDateTime = (s) => (s ? new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(s.replace(' ', 'T'))) : 'ยังไม่เคยเข้า');

export default function AdminAccountsPanel({ showToast, ask }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });
  const [edit, setEdit] = useState(null); // { username, displayName, password }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/accounts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function call(method, body, okText, query = '') {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/accounts${query}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        setData(d);
        showToast(okText, 'success');
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

  async function add(e) {
    e.preventDefault();
    if (await call('POST', form, `เพิ่มบัญชี ${form.username.trim().toLowerCase()} แล้ว`)) setForm({ username: '', displayName: '', password: '' });
  }

  async function saveEdit() {
    const body = { username: edit.username, displayName: edit.displayName };
    if (edit.password) body.password = edit.password;
    if (await call('PUT', body, edit.password ? 'บันทึกชื่อและรหัสผ่านใหม่แล้ว' : 'บันทึกชื่อแล้ว')) setEdit(null);
  }

  return (
    <section className="v2-card adm-card">
      <h3>บัญชีแอดมินแบบชื่อผู้ใช้ + รหัสผ่าน</h3>
      <p className="adm-sub" style={{ marginTop: 0 }}>ใช้ที่ฟอร์มหน้า /admin ชื่อผู้ใช้จะแสดงในประวัติการใช้งานแทน &quot;unknown&quot;</p>

      {!data ? (
        <div className="v2-empty" style={{ height: 80 }}><span className="v2-spin" /></div>
      ) : (
        <ul className="adm-rules">
          {data.envUsername && (
            <li>
              <KeyRound size={16} />
              <span className="adm-rule-text"><b>{data.envUsername}</b> <span className="adm-sub">บัญชีหลัก (ตั้งในไฟล์ .env แก้ในหน้านี้ไม่ได้)</span></span>
              {data.me === data.envUsername && <span className="adm-tag t-emerald">คุณ</span>}
            </li>
          )}
          {data.accounts.map((a) =>
            edit && edit.username === a.username ? (
              <li key={a.username} className="adm-acc-edit">
                <b>{a.username}</b>
                <input className="adm-input" placeholder="ชื่อที่แสดง" value={edit.displayName} onChange={(e) => setEdit((x) => ({ ...x, displayName: e.target.value }))} />
                <input className="adm-input" type="password" autoComplete="new-password" placeholder="รหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)" value={edit.password} onChange={(e) => setEdit((x) => ({ ...x, password: e.target.value }))} />
                <span className="adm-rule-btns">
                  <button className="adm-btn adm-btn-sm is-red" disabled={busy} onClick={saveEdit}><Check size={14} /> บันทึก</button>
                  <button className="adm-icon-btn" aria-label="ยกเลิก" onClick={() => setEdit(null)}><X size={15} /></button>
                </span>
              </li>
            ) : (
              <li key={a.username}>
                <KeyRound size={16} />
                <span className="adm-rule-text">
                  <b>{a.username}</b>{a.display_name ? ` · ${a.display_name}` : ''}
                  <span className="adm-sub" style={{ display: 'block', margin: 0 }}>เข้าล่าสุด: {thaiDateTime(a.last_login)}</span>
                </span>
                {data.me === a.username && <span className="adm-tag t-emerald">คุณ</span>}
                <span className="adm-rule-btns">
                  <button className="adm-icon-btn" aria-label={`แก้ไข ${a.username}`} onClick={() => setEdit({ username: a.username, displayName: a.display_name, password: '' })}><Pencil size={15} /></button>
                  <button
                    className="adm-icon-btn is-danger"
                    disabled={busy}
                    aria-label={`ลบ ${a.username}`}
                    onClick={() => ask(`ลบบัญชีแอดมิน ${a.username}?${data.me === a.username ? '\nนี่คือบัญชีที่คุณใช้อยู่ ลบแล้วจะหมดสิทธิ์แอดมินทันที' : ''}`, 'ลบ', () => call('DELETE', null, 'ลบบัญชีแล้ว', `?username=${encodeURIComponent(a.username)}`), true)}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      <span className="adm-label">เพิ่มบัญชี</span>
      <form className="adm-rule-form" onSubmit={add}>
        <label>
          <span className="adm-sub">ชื่อผู้ใช้ (a-z 0-9 . _ -)</span>
          <input className="adm-input" autoCapitalize="none" autoComplete="off" placeholder="เช่น kru.somchai" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
        </label>
        <label>
          <span className="adm-sub">ชื่อที่แสดง</span>
          <input className="adm-input" placeholder="เช่น ครูสมชาย" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
        </label>
        <label>
          <span className="adm-sub">รหัสผ่าน (อย่างน้อย 8 ตัว)</span>
          <input className="adm-input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </label>
        <button className="adm-btn is-red" type="submit" disabled={busy || !form.username.trim() || form.password.length < 8}>
          <UserPlus size={16} /> เพิ่มบัญชี
        </button>
      </form>
    </section>
  );
}
