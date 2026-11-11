'use client';

// Evaluation page. The original (now app/v1/evaluate/page.js) is a table of 5 criteria × up to 16
// rooms that scrolls sideways on a phone, and every cell opens a popup to pick a score — 80 popups
// for one grade. Here each room is a card with the five criteria and their score buttons in place;
// a tap saves straight away, and a room that is complete folds up and the next one opens.
//
// It sends exactly what the original sends (POST /api/evaluations with zone 'pool' and today's date),
// so scores entered on either page are the same records.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AlertCircle, ArrowLeft, Check, ChevronDown, Clock, Info, Loader2, RotateCcw } from 'lucide-react';
import { getScoreLevel } from '@/lib/scoreUtils';
import { CRITERIA, bangkokToday, thaiShortDate } from '@/lib/dashboardShared';
import { scrollBelowHeader } from '@/lib/smoothScroll';
import '../v2/v2.css';
import '../v2/evaluate/evaluate.css';

// Rooms per grade: /api/settings/rooms (admins set it on /admin); these are only the fallback.
const DEFAULT_ROOMS = { 1: 14, 2: 14, 3: 14, 4: 16, 5: 16, 6: 16 };
const SCORES = [
  { v: 5, label: 'ดีมาก', pct: '≥90%' },
  { v: 4, label: 'ดี', pct: '70–89%' },
  { v: 3, label: 'พอใช้', pct: '50–69%' },
  { v: 2, label: 'ปรับปรุง', pct: '20–49%' },
  { v: 1, label: 'ไม่ผ่าน', pct: '<20%' },
];
// Used until /api/settings/eval-time answers; admins can change the window on /admin.
const DEFAULT_WINDOW = { from: '07:00', to: '08:30' };
const hhmmToMinutes = (s) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3, 5), 10);

function bangkokMinutes() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  let h = parseInt(parts.find((p) => p.type === 'hour').value, 10);
  if (h === 24) h = 0;
  return h * 60 + parseInt(parts.find((p) => p.type === 'minute').value, 10);
}

// A unit is one thing that gets five scores: a room, or (for the whole-grade evaluation) a grade.
const unitsFor = (target, ROOMS = DEFAULT_ROOMS) =>
  target === 'overall'
    ? [1, 2, 3, 4, 5, 6].map((g) => ({ grade: g, room: 0, label: `ม.${g}` }))
    : Array.from({ length: ROOMS[target] || 0 }, (_, i) => ({ grade: target, room: i + 1, label: `${target}/${i + 1}` }));
const keyOf = (grade, room, criterion) => `${grade}-${room}-${criterion}`;

export default function EvaluateV2() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const today = useMemo(() => bangkokToday(), []);
  const [minutes, setMinutes] = useState(() => bangkokMinutes());
  const [win, setWin] = useState(DEFAULT_WINDOW);
  const [rooms, setRooms] = useState(DEFAULT_ROOMS);
  // Today closed by an admin (weekend, holiday): the reason to show, else ''.
  const [dayClosed, setDayClosed] = useState('');
  const inHours = minutes >= hhmmToMinutes(win.from) && minutes <= hhmmToMinutes(win.to);
  const open = inHours && !dayClosed;
  const windowText = `${win.from} – ${win.to} น.`;

  const [target, setTarget] = useState('overall');
  const [scores, setScores] = useState({});
  const [cell, setCell] = useState({}); // key -> 'saving' | 'saved' | 'error'
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [openUnit, setOpenUnit] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showRubric, setShowRubric] = useState(false);
  const csrf = useRef('');
  const chains = useRef({});
  const unitRefs = useRef({});
  // The unit to bring to the top of the screen once it has opened (set by a tap, auto-advance or a tab
  // change; not by the first load).
  const scrollTarget = useRef(null);
  const openAndShow = useCallback((label) => {
    scrollTarget.current = label;
    setOpenUnit(label);
  }, []);
  useLayoutEffect(() => {
    if (!openUnit || scrollTarget.current !== openUnit) return;
    scrollTarget.current = null;
    // After layout: the unit that just closed above this one has already shrunk.
    requestAnimationFrame(() => scrollBelowHeader(unitRefs.current[openUnit]));
  }, [openUnit]);

  useEffect(() => {
    const t = setInterval(() => setMinutes(bangkokMinutes()), 20000);
    const loadWindow = () =>
      fetch('/api/settings/eval-time', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (d.from && d.to) setWin({ from: d.from, to: d.to });
          setDayClosed(d.todayStatus && !d.todayStatus.open ? d.todayStatus.reason || 'วันนี้ปิดประเมิน' : '');
        })
        .catch(() => {});
    loadWindow();
    fetch('/api/settings/rooms', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d.rooms && setRooms(d.rooms))
      .catch(() => {});
    const w = setInterval(loadWindow, 60000);
    return () => {
      clearInterval(t);
      clearInterval(w);
    };
  }, []);

  useEffect(() => {
    if (status !== 'loading' && session?.user?.role === 'student') router.push('/?error=unauthorized_eval');
  }, [session, status, router]);

  const getCsrf = useCallback(async (fresh) => {
    if (csrf.current && !fresh) return csrf.current;
    const r = await fetch('/api/csrf', { cache: 'no-store' });
    const d = await r.json();
    csrf.current = d.csrfToken || '';
    return csrf.current;
  }, []);
  useEffect(() => {
    getCsrf().catch(() => {});
  }, [getCsrf]);

  // Everything this evaluator has entered today, for every grade at once, so each tab shows its progress.
  const load = useCallback(async () => {
    setLoadError('');
    try {
      const r = await fetch(`/api/evaluations?date=${today}&zone=pool&_t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const rows = await r.json();
      const next = {};
      rows.forEach((row) => {
        if (row.score > 0) next[keyOf(row.grade, row.room, row.criterion)] = row.score;
      });
      setScores((prev) => {
        // Keep what is being saved right now; the server copy may predate it.
        const merged = { ...next };
        Object.keys(chains.current).forEach((k) => {
          if (chains.current[k]?.pending && k in prev) merged[k] = prev[k];
        });
        return merged;
      });
      setLoaded(true);
    } catch {
      setLoadError('โหลดคะแนนที่บันทึกไว้ไม่สำเร็จ');
    }
  }, [today]);
  useEffect(() => {
    if (status === 'authenticated') load();
  }, [status, load]);

  const flash = useCallback((text, tone = 'error') => {
    setNotice({ text, tone, at: Date.now() });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // Saves one score. Saves of the same cell run one after another, so a quick change of mind cannot be
  // overtaken by the earlier request.
  const save = useCallback(
    (grade, room, criterion, score) => {
      const k = keyOf(grade, room, criterion);
      const before = scores[k];
      setScores((s) => {
        const n = { ...s };
        if (score > 0) n[k] = score;
        else delete n[k];
        return n;
      });
      setCell((c) => ({ ...c, [k]: 'saving' }));
      const chain = chains.current[k] || { tail: Promise.resolve(), pending: 0 };
      chains.current[k] = chain;
      chain.pending++;
      const send = async (retry) => {
        const res = await fetch('/api/evaluations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade, room, zone: 'pool', criterion, score, date: today, csrfToken: await getCsrf(retry) }),
        });
        const data = await res.json().catch(() => ({}));
        // An expired CSRF token: get a new one and send once more.
        if (!data.success && res.status === 403 && !retry && /ข้อมูลไม่ถูกต้อง/.test(data.message || '')) return send(true);
        if (!data.success) throw new Error(data.message || 'บันทึกไม่สำเร็จ');
      };
      chain.tail = chain.tail
        .then(() => send(false))
        .then(() => {
          chain.pending--;
          if (!chain.pending) {
            setCell((c) => ({ ...c, [k]: 'saved' }));
            setTimeout(() => setCell((c) => (c[k] === 'saved' ? { ...c, [k]: undefined } : c)), 1500);
          }
        })
        .catch((e) => {
          chain.pending--;
          setCell((c) => ({ ...c, [k]: 'error' }));
          setScores((s) => {
            const n = { ...s };
            if (before > 0) n[k] = before;
            else delete n[k];
            return n;
          });
          flash(e.message === 'Failed to fetch' ? 'เชื่อมต่อไม่ได้ กรุณาลองใหม่' : e.message);
        });
    },
    [scores, today, getCsrf, flash],
  );

  const units = useMemo(() => unitsFor(target, rooms), [target, rooms]);
  const doneCount = (u) => CRITERIA.filter((c) => scores[keyOf(u.grade, u.room, c.id)] > 0).length;
  const progress = (t) => {
    const us = unitsFor(t, rooms);
    return { done: us.filter((u) => doneCount(u) === 5).length, total: us.length };
  };

  // Open the first unit that still needs scores whenever the tab changes or the scores first arrive.
  const lastAuto = useRef('');
  const lastAutoFirst = useRef(false); // the first auto-open (page load) does not scroll
  useEffect(() => {
    if (!loaded && !loadError) return;
    const tag = `${target}`;
    if (lastAuto.current === tag) return;
    lastAuto.current = tag;
    const first = units.find((u) => doneCount(u) < 5) || units[0];
    if (first) (lastAutoFirst.current ? openAndShow : setOpenUnit)(first.label);
    else setOpenUnit(null);
    lastAutoFirst.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, loadError, target, units]);

  function pick(u, criterion, score) {
    if (!open) {
      flash(dayClosed || `เปิดให้ประเมินเฉพาะ ${windowText}`);
      return;
    }
    const k = keyOf(u.grade, u.room, criterion);
    const next = scores[k] === score ? 0 : score; // tapping the chosen score again clears it
    save(u.grade, u.room, criterion, next);
    // The last missing criterion of this unit: move on to the next unit that needs scores.
    const filled = CRITERIA.filter((c) => (c.id === criterion ? next > 0 : scores[keyOf(u.grade, u.room, c.id)] > 0)).length;
    if (filled === 5 && doneCount(u) === 4 && next > 0) {
      const idx = units.findIndex((x) => x.label === u.label);
      const nextUnit = units.slice(idx + 1).find((x) => doneCount(x) < 5);
      if (nextUnit) {
        setTimeout(() => {
          openAndShow(nextUnit.label);
        }, 250);
      }
    }
  }

  if (status === 'loading') return <div className="v2"><div className="v2-page"><div className="v2-empty" style={{ height: 200 }}><span className="v2-spin" /></div></div></div>;
  if (status !== 'authenticated') return null;

  const role = session?.user?.role;
  const roleText = role === 'council' ? 'สภานักเรียน' : role === 'admin' ? 'ผู้ดูแลระบบ' : `ครู${session?.user?.prefix ? ` (${session.user.prefix})` : ''}`;
  const left = hhmmToMinutes(win.to) - minutes;
  const tabs = ['overall', 1, 2, 3, 4, 5, 6];

  return (
    <div className="v2 ev">
      <div className="v2-toolbar">
        <div className="v2-toolbar-inner">
          <div className="ev-head">
            <Link href="/" className="ev-back" aria-label="กลับหน้าสรุป"><ArrowLeft size={20} /></Link>
            <div className="ev-title">
              <b>ประเมินแถว</b>
              <small>{thaiShortDate(today, true)} · {roleText}</small>
            </div>
            <span className={`ev-clock${open ? ' is-open' : ''}`}>
              <Clock size={14} />
              {open ? `เปิดอยู่ · เหลือ ${left} นาที` : dayClosed ? 'วันนี้ปิดประเมิน' : `ปิดอยู่ (${win.from}–${win.to})`}
            </span>
          </div>
          <div className="v2-chips ev-tabs" role="tablist" aria-label="เลือกสิ่งที่จะประเมิน">
            {tabs.map((t) => {
              const p = progress(t);
              const complete = loaded && p.done === p.total;
              return (
                <button key={t} role="tab" aria-selected={target === t} className={`v2-chip${target === t ? ' is-on' : ''}${complete ? ' is-done' : ''}`} onClick={() => setTarget(t)}>
                  {t === 'overall' ? 'ภาพรวมระดับชั้น' : `ม.${t}`}
                  {loaded && <span className="ev-count">{complete ? <Check size={13} /> : `${p.done}/${p.total}`}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="v2-page ev-page">
        {!open && (
          <div className="ev-banner">
            <AlertCircle size={18} />
            <span>{dayClosed ? `${dayClosed} ดูคะแนนที่บันทึกไว้ได้ แต่แก้ไขไม่ได้` : `ตอนนี้นอกเวลาประเมิน ดูคะแนนที่บันทึกไว้ได้ แต่แก้ไขไม่ได้ เปิดให้ประเมินเวลา ${windowText}`}</span>
          </div>
        )}
        {loadError && (
          <div className="v2-error ev-row-between">
            {loadError}
            <button className="ev-link" onClick={load}><RotateCcw size={14} /> ลองใหม่</button>
          </div>
        )}

        <p className="v2-hint">
          <Info size={14} />
          {target === 'overall' ? 'ประเมินแถวของแต่ละระดับชั้นทั้งระดับ' : `ประเมินทีละห้องของ ม.${target}`} · กดตัวเลขเพื่อบันทึกทันที กดซ้ำเพื่อลบ
          <button className="ev-link" onClick={() => setShowRubric((v) => !v)}>{showRubric ? 'ซ่อนเกณฑ์' : 'ดูเกณฑ์'}</button>
        </p>
        {showRubric && (
          <div className="v2-card ev-rubric">
            {SCORES.map((s) => (
              <div key={s.v}><b className={`v2-tx${s.v}`}>{s.v}</b> {s.label} · นักเรียนปฏิบัติ {s.pct}</div>
            ))}
          </div>
        )}

        <div className="ev-units">
          {units.map((u) => {
            const isOpen = openUnit === u.label;
            const done = doneCount(u);
            const vals = CRITERIA.map((c) => scores[keyOf(u.grade, u.room, c.id)] || 0);
            const avg = done ? vals.filter(Boolean).reduce((a, b) => a + b, 0) / done : 0;
            const anyError = CRITERIA.some((c) => cell[keyOf(u.grade, u.room, c.id)] === 'error');
            return (
              <section key={u.label} ref={(el) => (unitRefs.current[u.label] = el)} className={`v2-card ev-unit${isOpen ? ' is-open' : ''}${done === 5 ? ' is-done' : ''}`}>
                <button className="ev-unit-head" onClick={() => (isOpen ? setOpenUnit(null) : openAndShow(u.label))} aria-expanded={isOpen}>
                  <span className="ev-unit-name">{u.label}</span>
                  <span className="ev-dots" aria-label={`ประเมินแล้ว ${done} จาก 5 ข้อ`}>
                    {vals.map((v, i) => (
                      <span key={i} className={`ev-dot${v ? ` v2-bg${v}` : ''}`}>{v || ''}</span>
                    ))}
                  </span>
                  <span className="ev-unit-state">
                    {anyError ? <AlertCircle size={18} className="v2-tx1" /> : done === 5 ? <Check size={18} className="v2-tx4" /> : <small>{done}/5</small>}
                  </span>
                  {done > 0 && <b className={`ev-avg v2-tx${getScoreLevel(avg)}`}>{avg.toFixed(1)}</b>}
                  <ChevronDown size={18} className="v2-muted ev-caret" />
                </button>
                {isOpen && (
                  <div className="ev-unit-body">
                    {CRITERIA.map((c) => {
                      const k = keyOf(u.grade, u.room, c.id);
                      const cur = scores[k] || 0;
                      const st = cell[k];
                      return (
                        <div key={c.id} className="ev-crit">
                          <div className="ev-crit-text">
                            <span className="v2-crit-no">{c.id}</span>
                            <span>{c.text}</span>
                            <span className="ev-cell-state">
                              {st === 'saving' && <Loader2 size={15} className="ev-spin" />}
                              {st === 'saved' && <Check size={15} className="v2-tx4" />}
                              {st === 'error' && <AlertCircle size={15} className="v2-tx1" />}
                            </span>
                          </div>
                          <div className="ev-scores" role="radiogroup" aria-label={`ข้อ ${c.id}`}>
                            {SCORES.map((s) => (
                              <button
                                key={s.v}
                                role="radio"
                                aria-checked={cur === s.v}
                                className={`ev-score${cur === s.v ? ` is-on ev-on${s.v}` : ''}`}
                                disabled={!open}
                                onClick={() => pick(u, c.id, s.v)}
                              >
                                <b>{s.v}</b>
                                <small>{s.pct}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <p className="v2-footer">
          <Link href="/v1/evaluate">ใช้หน้าประเมินแบบเดิม</Link>
        </p>
      </div>

      {notice && (
        <div className={`ev-toast is-${notice.tone}`} role="status">
          <AlertCircle size={16} /> {notice.text}
        </div>
      )}
    </div>
  );
}
