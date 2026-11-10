'use client';

import { useState } from 'react';
import { CalendarPlus, Pencil, Trash2, FileDown, Sheet, Check, Pin, X, AlertTriangle } from 'lucide-react';

const thaiDay = (iso) => new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(iso + 'T00:00:00'));

// A sensible next term after the newest one, for the "add" form. The admin fixes the dates.
function suggestNext(terms) {
  const last = terms[0]; // newest first
  if (!last) return { semester: 1, year: new Date().getFullYear() + 543, startDate: '', endDate: '' };
  if (last.semester === 1) {
    const ce = last.year - 543;
    return { semester: 2, year: last.year, startDate: `${ce}-11-01`, endDate: `${ce + 1}-03-31` };
  }
  const ce = last.year + 1 - 543;
  return { semester: 1, year: last.year + 1, startDate: `${ce}-05-16`, endDate: `${ce}-10-10` };
}

function status(t, today) {
  if (today < t.startDate) return { text: 'ยังไม่เริ่ม', tone: 't-blue' };
  if (today > t.endDate) return { text: 'จบแล้ว', tone: 't-gray' };
  return { text: 'กำลังเรียน', tone: 't-emerald' };
}

export default function TermsPanel({ term, reload, showToast, ask }) {
  const { terms, currentTerm, currentMode, today } = term;
  const [form, setForm] = useState(null); // { id?, semester, year, startDate, endDate, showOnHome }
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState('');

  async function post(body, okText) {
    setBusy(true);
    try {
      const res = await fetch('/api/settings/term', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.success) {
        showToast(okText, 'success');
        reload(d);
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

  async function save() {
    const body = { ...form, action: form.id ? 'update' : 'create', semester: Number(form.semester), year: Number(form.year) };
    if (await post(body, form.id ? 'แก้ไขเทอมแล้ว' : 'เพิ่มเทอมแล้ว')) setForm(null);
  }

  function remove(t) {
    ask(`ลบ${t.name}?\nคะแนนที่บันทึกไว้ไม่หาย แต่วันในช่วงนี้จะไม่แสดงในหน้าสรุป จนกว่าจะเพิ่มเทอมที่ครอบคลุมวันเหล่านั้นอีกครั้ง`, 'ลบ', () => post({ action: 'delete', id: t.id }, 'ลบเทอมแล้ว'), true);
  }

  const endFor = (t) => (t.endDate < today ? t.endDate : today);

  async function exportWord(t) {
    setExporting(`w${t.id}`);
    try {
      const end = endFor(t);
      const res = await fetch(`/api/evaluations/summary?startDate=${t.startDate}&endDate=${end}&terms=1`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const { generateWordDocumentBlob } = await import('@/lib/exportWord');
      const blob = await generateWordDocumentBlob(t.startDate, end, data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `รายงานระเบียบแถว_${t.name.replace(/[/ ]/g, '-')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast('สร้างไฟล์ Word ไม่สำเร็จ', 'error');
    } finally {
      setExporting('');
    }
  }

  const exportCsvUrl = (t) => `/api/admin/export?start=${t.startDate}&end=${endFor(t)}&name=${encodeURIComponent(t.name)}`;

  const inTerm = terms.some((t) => t.startDate <= today && today <= t.endDate);
  const hasFuture = terms.some((t) => t.startDate > today);
  const current = terms.find((t) => t.id === currentTerm);
  const shownCount = terms.filter((t) => t.showOnHome).length;

  const formView = form && (
    <section className="v2-card adm-card adm-term-form">
      <div className="adm-card-head">
        <h3>{form.id ? 'แก้ไขเทอม' : 'เพิ่มเทอม'}</h3>
        <button className="adm-icon-btn" aria-label="ปิด" onClick={() => setForm(null)}><X size={18} /></button>
      </div>
      <div className="adm-term-grid">
        <label>
          <span className="adm-label">เทอมที่</span>
          <select className="adm-input" value={form.semester} onChange={(e) => setForm((f) => ({ ...f, semester: Number(e.target.value) }))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3 (ฤดูร้อน)</option>
          </select>
        </label>
        <label>
          <span className="adm-label">ปีการศึกษา (พ.ศ.)</span>
          <input className="adm-input" type="number" inputMode="numeric" min={2500} max={2700} value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
        </label>
        <label>
          <span className="adm-label">วันเปิดเทอม</span>
          <input className="adm-input" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </label>
        <label>
          <span className="adm-label">วันปิดเทอม</span>
          <input className="adm-input" type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </label>
      </div>
      <label className="adm-check">
        <input type="checkbox" checked={form.showOnHome} onChange={(e) => setForm((f) => ({ ...f, showOnHome: e.target.checked }))} />
        แสดงเป็นปุ่มในหน้าสรุป
      </label>
      <p className="adm-sub">วันที่อยู่นอกทุกเทอม (ช่วงปิดเทอม) จะไม่นับในหน้าสรุป</p>
      <div className="adm-row adm-actions">
        <button className="adm-btn is-red" disabled={busy || !form.startDate || !form.endDate || !form.year} onClick={save}>
          <Check size={16} /> {form.id ? 'บันทึก' : 'เพิ่มเทอม'}
        </button>
        <button className="adm-btn" onClick={() => setForm(null)}>ยกเลิก</button>
      </div>
    </section>
  );

  return (
    <div className="adm-stack">
      {(!inTerm || !hasFuture) && (
        <div className="adm-warn">
          <AlertTriangle size={18} />
          <span>
            {!inTerm ? 'วันนี้ไม่อยู่ในเทอมใดเลย คะแนนที่ประเมินวันนี้จะไม่แสดงในหน้าสรุป ' : ''}
            {!hasFuture ? 'ยังไม่ได้เพิ่มเทอมถัดไป เพิ่มไว้ล่วงหน้าได้เลย' : ''}
          </span>
        </div>
      )}

      <section className="v2-card adm-card">
        <div className="adm-card-head">
          <h3>เทอมปัจจุบัน</h3>
        </div>
        <p className="adm-sub" style={{ marginTop: 0 }}>
          <b>{current ? current.name : '—'}</b> · {currentMode === 'auto' ? 'เลือกเองตามวันที่ (เปลี่ยนเป็นเทอมใหม่อัตโนมัติเมื่อถึงวันเปิดเทอม)' : 'ตั้งค่าเองไว้ (ไม่เปลี่ยนตามวันที่)'}
        </p>
        <p className="adm-sub">ใช้กำหนดช่วง &quot;1 เดือน&quot; และ &quot;ปีการศึกษา&quot; ของหน้าสรุป</p>
        {currentMode !== 'auto' && (
          <div className="adm-row adm-actions">
            <button className="adm-btn" disabled={busy} onClick={() => post({ term: 'auto' }, 'ตั้งเป็นอัตโนมัติแล้ว')}>ให้เลือกตามวันที่อัตโนมัติ</button>
          </div>
        )}
      </section>

      <section className="v2-card adm-card">
        <div className="adm-card-head">
          <h3>เทอมทั้งหมด ({terms.length})</h3>
          <button className="adm-btn adm-btn-sm is-red" onClick={() => setForm({ ...suggestNext(terms), showOnHome: true })}>
            <CalendarPlus size={15} /> เพิ่มเทอม
          </button>
        </div>
        <p className="adm-sub" style={{ marginTop: 0 }}>ติ๊ก &quot;แสดงในหน้าสรุป&quot; เพื่อเลือกว่าเทอมไหนมีปุ่มในหน้าหลัก (ตอนนี้แสดง {shownCount} เทอม)</p>

        {form && !form.id && formView}

        <ul className="adm-termlist">
          {terms.map((t) => {
            const st = status(t, today);
            const isCur = t.id === currentTerm;
            if (form && form.id === t.id) return <li key={t.id}>{formView}</li>;
            return (
              <li key={t.id} className={`adm-termrow${isCur ? ' is-on' : ''}`}>
                <div className="adm-termrow-head">
                  <b>{t.name}</b>
                  <span className={`adm-tag ${st.tone}`}>{st.text}</span>
                  {isCur && <span className="adm-chip is-ok"><Check size={12} /> ปัจจุบัน</span>}
                </div>
                <div className="adm-sub" style={{ marginTop: 2 }}>{thaiDay(t.startDate)} – {thaiDay(t.endDate)}</div>
                <label className="adm-check">
                  <input type="checkbox" checked={t.showOnHome} disabled={busy} onChange={(e) => post({ action: 'show', id: t.id, showOnHome: e.target.checked }, e.target.checked ? 'แสดงในหน้าสรุปแล้ว' : 'ซ่อนจากหน้าสรุปแล้ว')} />
                  แสดงในหน้าสรุป
                </label>
                <div className="adm-termrow-btns">
                  <button className="adm-btn adm-btn-sm" onClick={() => setForm({ id: t.id, semester: t.semester, year: t.year, startDate: t.startDate, endDate: t.endDate, showOnHome: t.showOnHome })}>
                    <Pencil size={14} /> แก้ไขวันที่
                  </button>
                  {t.startDate <= today && (
                    <>
                      <button className="adm-btn adm-btn-sm" disabled={!!exporting} onClick={() => exportWord(t)}>
                        <FileDown size={14} /> {exporting === `w${t.id}` ? 'กำลังสร้าง...' : 'Word'}
                      </button>
                      <a className="adm-btn adm-btn-sm" href={exportCsvUrl(t)} download>
                        <Sheet size={14} /> Excel (CSV)
                      </a>
                    </>
                  )}
                  {!isCur && (
                    <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => ask(`ตั้ง${t.name}เป็นเทอมปัจจุบัน?\nจะไม่เปลี่ยนตามวันที่อัตโนมัติจนกว่าจะกด "ให้เลือกตามวันที่อัตโนมัติ"`, 'ยืนยัน', () => post({ term: t.id }, 'เปลี่ยนเทอมปัจจุบันแล้ว'))}>
                      <Pin size={14} /> ตั้งเป็นปัจจุบัน
                    </button>
                  )}
                  <button className="adm-btn adm-btn-sm adm-btn-danger" disabled={busy || terms.length <= 1} onClick={() => remove(t)}>
                    <Trash2 size={14} /> ลบ
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="v2-card adm-card">
        <h3>ส่งออกช่วงวันที่เอง</h3>
        <ExportRange today={today} />
      </section>
    </div>
  );
}

function ExportRange({ today }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState(today);
  const ok = start && end && start <= end;
  return (
    <>
      <p className="adm-sub" style={{ marginTop: 0 }}>ไฟล์ CSV เปิดด้วย Excel หรือ Google Sheets ได้ มีคะแนนทุกข้อของทุกคนทุกห้อง เก็บไว้เป็นข้อมูลสำรองได้</p>
      <div className="adm-row adm-dayadd">
        <label><span className="adm-sub">ตั้งแต่</span><input className="adm-input" type="date" max={end || today} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label><span className="adm-sub">ถึง</span><input className="adm-input" type="date" min={start} max={today} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        {ok ? (
          <a className="adm-btn" href={`/api/admin/export?start=${start}&end=${end}`} download><Sheet size={16} /> ดาวน์โหลด CSV</a>
        ) : (
          <button className="adm-btn" disabled><Sheet size={16} /> ดาวน์โหลด CSV</button>
        )}
      </div>
    </>
  );
}
