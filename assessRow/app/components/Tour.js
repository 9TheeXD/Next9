'use client';

// First-visit guide. Each page has its own short list of steps; the guide opens by itself the first
// time someone visits that page, and once they reach the end or press "ข้าม" it does not open there
// again (remembered in this browser). "สอนใช้งาน" in the menu opens it again: it dispatches
// `window.dispatchEvent(new Event('show-tour'))`.
//
// A step can point at an element (`target`, a CSS selector): the page scrolls to it and everything
// else is dimmed. Steps whose element is not on the page (for example a staff-only button for a
// student) are left out.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { smoothScrollTo, stickyBottom } from '@/lib/smoothScroll';
import { SCROLLERS } from './ScrollHints';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const TOURS = {
  '/': [
    { title: 'ยินดีต้อนรับ', text: 'หน้านี้สรุปผลการประเมินแถวหน้าเสาธงทั้งโรงเรียนไว้ในหน้าเดียว ใช้เวลาไม่ถึงนาทีในการดูวิธีใช้' },
    { target: '.v2:not(.is-student) .v2-toolbar .v2-chips', title: 'เลือกช่วงเวลา', text: 'เลือกช่วงเวลาตรงนี้ที่เดียว ตัวเลข กราฟ และอันดับทั้งหน้าจะเปลี่ยนตาม เลือก "กำหนดเอง" เพื่อใส่วันที่เองได้ · ปัดซ้าย-ขวาเพื่อดูตัวเลือกที่เหลือ', optional: true },
    { target: '.v2.is-student .v2-toolbar .v2-chips', title: 'ข้อมูลรายสัปดาห์', text: 'นักเรียนดูผลเป็นรายสัปดาห์ เช่น "1/ต.ค." คือสัปดาห์ที่ 1 ของเดือนตุลาคม ข้อมูลของสัปดาห์จะขึ้นทุกวันศุกร์ 9 โมง · เลือกช่วงเวลาตรงนี้ ตัวเลข กราฟ และอันดับทั้งหน้าจะเปลี่ยนตาม · ปัดซ้าย-ขวาเพื่อดูตัวเลือกที่เหลือ', optional: true },
    { target: '.v2-basis', title: 'วิธีคิดคะแนน', text: '"เฉลี่ยจากทุกห้อง" คือคะแนนที่ประเมินแยกทีละห้อง "ประเมินรวมทั้งระดับ" คือคะแนนที่ประเมินทั้งระดับชั้นพร้อมกัน' },
    { target: '.v2-hero', title: 'ภาพรวม', text: 'คะแนนเฉลี่ยทั้งโรงเรียน ระดับชั้นที่ดีที่สุด ห้องที่คะแนนสูงสุด และระดับชั้นที่ควรพัฒนา' },
    { target: '.v2-grade', title: 'การ์ดระดับชั้น', text: 'แต่ละการ์ดมีคะแนน แนวโน้ม และคะแนนรายข้อ ป้ายสีเขียว/แดงบอกว่าช่วงหลังดีขึ้นหรือแย่ลง กดการ์ดเพื่อดูคะแนนทีละห้อง' },
    { target: '.v2-criteria', title: 'รายข้อ', text: 'เรียงข้อที่คะแนนต่ำสุดไว้บนสุด เพื่อให้เห็นว่าควรเน้นเรื่องไหน' },
    { target: '.v2-rank', title: 'อันดับ', text: 'ดูอันดับห้องเรียนทั้งโรงเรียน หรือเลือกเฉพาะชั้น หรือดูอันดับระดับชั้น' },
    { target: '.v2-cta', title: 'ไปประเมิน', text: 'ครูและสภานักเรียนกดตรงนี้เพื่อไปหน้าประเมินแถว', optional: true },
    { title: 'ดูวิธีใช้อีกครั้งได้', text: 'กดเมนู (มุมขวาบน) แล้วเลือก "สอนใช้งาน" ได้ทุกเมื่อ' },
  ],
  '/evaluate': [
    { title: 'หน้าประเมินแถว', text: 'ประเมินทีละห้อง กดตัวเลขแล้วบันทึกทันที ไม่ต้องกดยืนยัน' },
    { target: '.ev-clock', title: 'เวลาประเมิน', text: 'เปิดให้บันทึกคะแนนเฉพาะช่วงเวลาที่แสดงตรงนี้ นอกเวลานี้ดูได้อย่างเดียว' },
    { target: '.ev-tabs', title: 'เลือกระดับชั้น', text: 'เลือก "ภาพรวมระดับชั้น" หรือ ม.1 – ม.6 ตัวเลขข้างชื่อบอกว่าประเมินครบกี่ห้องแล้ว · ปัดซ้าย-ขวาเพื่อดูชั้นที่เหลือ' },
    { target: '.ev-unit.is-open .ev-scores', title: 'ให้คะแนน', text: 'กดตัวเลข 1 – 5 ตามร้อยละของนักเรียนที่ปฏิบัติ (เขียนไว้ใต้ตัวเลข) กดตัวเลขเดิมซ้ำเพื่อลบ', optional: true },
    { target: '.ev-unit', title: 'ห้องถัดไป', text: 'ครบ 5 ข้อแล้วห้องนั้นจะพับเก็บ และเปิดห้องถัดไปให้เอง จุดสีบนหัวการ์ดคือคะแนนแต่ละข้อ' },
    { title: 'ดูวิธีใช้อีกครั้งได้', text: 'กดเมนู (มุมขวาบน) แล้วเลือก "สอนใช้งาน" ได้ทุกเมื่อ' },
  ],
  '/v1': [
    { title: 'หน้าสรุปผล', text: 'ดูอันดับ คะแนน และแนวโน้มการประเมินแถวหน้าเสาธง' },
    { target: '.btn-pulse', title: 'ไปประเมิน', text: 'ครูและสภานักเรียนกดตรงนี้เพื่อไปหน้าประเมินแถว', optional: true },
    { target: '.graph-grid', title: 'แนวโน้ม', text: 'กราฟคะแนนของแต่ละระดับชั้น เลือกช่วงเวลาได้ด้านบนของกราฟ' },
    { title: 'นี่คือหน้าแบบเดิม', text: 'หน้าสรุปหลักอยู่ที่หน้าแรกของเว็บ · กดเมนูแล้วเลือก "สอนใช้งาน" เพื่อดูวิธีใช้อีกครั้ง' },
  ],
  '/v1/evaluate': [
    { title: 'หน้าประเมิน', text: 'เลือกระดับชั้น แล้วกดช่องคะแนนในตารางเพื่อให้คะแนน' },
    { target: '.zone-grid', title: 'เลือกระดับชั้น', text: 'กด "ประเมินภาพรวมทุกระดับชั้น" หรือเลือก ม.1 – ม.6' },
    { title: 'นี่คือหน้าแบบเดิม', text: 'หน้าประเมินหลักอยู่ที่เมนู "หน้าประเมิน" · กดเมนูแล้วเลือก "สอนใช้งาน" เพื่อดูวิธีใช้อีกครั้ง' },
  ],
  '/admin': [
    { title: 'หน้าจัดการระบบ', text: 'ดูความคืบหน้า ปิดปรับปรุง และจัดการผู้มีสิทธิ์ประเมิน' },
    { target: '.adm-tabs', title: 'แท็บ', text: '"วันนี้" ดูว่าใครประเมินไปแล้วกี่ห้อง · "ปิดปรับปรุง" ตั้งข้อความและเวลาเปิดระบบ · "ผู้มีสิทธิ์ประเมิน" เพิ่ม/ลบ/เปลี่ยนบทบาท · "วัน/เวลาประเมิน" ตั้งวันหยุดและเวลาเปิด/ปิดการประเมิน · "เทอม" เพิ่ม/แก้ไขเทอม ตั้งเทอมปัจจุบัน และส่งออกข้อมูล' },
    { target: '.adm-title .adm-badge', title: 'สถานะระบบ', text: 'บอกว่าตอนนี้ระบบเปิดอยู่หรือปิดปรับปรุง' },
  ],
};

// Set inline: the CSS build keeps only the -webkit- form of backdrop-filter, which Chrome ignores.
const DIM = { backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' };

const storageKey = (path) => `tour_done:v2:${path}`;
const isDone = (path) => {
  try {
    return localStorage.getItem(storageKey(path)) === '1';
  } catch {
    return false;
  }
};
const markDone = (path) => {
  try {
    localStorage.setItem(storageKey(path), '1');
  } catch {}
};

// Set by the maintenance check (app/layout.js, components/LockOverlay.js) while the site is closed.
const isLocked = () => document.documentElement.getAttribute('data-locked') === '1';

export function hasTour(path) {
  return !!TOURS[path];
}

export default function Tour() {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const [steps, setSteps] = useState(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const tour = TOURS[pathname];
  const adminOnlyPage = pathname === '/admin';
  const ready = status === 'authenticated' && (!adminOnlyPage || session?.user?.role === 'admin');

  const start = useCallback(() => {
    if (!tour || isLocked()) return;
    const usable = tour.filter((s) => !s.optional || document.querySelector(s.target));
    setI(0);
    setSteps(usable);
  }, [tour]);

  // First visit: open by itself once the page has drawn its content and the maintenance check has
  // answered (never over the maintenance popup).
  useEffect(() => {
    if (!tour || !ready || isDone(pathname)) return;
    let t;
    let gone = false;
    Promise.resolve(window.__lockPre).then(() => {
      if (!gone) t = setTimeout(start, 1200);
    });
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [tour, ready, pathname, start]);

  // The site closing while the guide is open shuts the guide (not marked done).
  useEffect(() => {
    const onLock = () => isLocked() && setSteps(null);
    window.addEventListener('lock-change', onLock);
    return () => window.removeEventListener('lock-change', onLock);
  }, []);

  useEffect(() => {
    const onShow = () => start();
    window.addEventListener('show-tour', onShow);
    return () => window.removeEventListener('show-tour', onShow);
  }, [start]);

  // Leaving the page closes the guide without marking it done.
  useEffect(() => {
    setSteps(null);
  }, [pathname]);

  const step = steps ? steps[i] : null;

  // Bring the step's element into view (smoothly, below the stuck header, leaving room for the card),
  // then follow it every frame. The highlight eases toward where the element is, so it glides both
  // while the page scrolls and from one step to the next instead of jumping.
  const target = useRef(null);
  useLayoutEffect(() => {
    if (!step) return;
    const el = step.target ? document.querySelector(step.target) : null;
    target.current = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const head = stickyBottom();
    const stuck = getComputedStyle(el.closest('.v2-toolbar') || el).position === 'sticky' || !!el.closest('.nav');
    if (!stuck) {
      const room = window.innerHeight - head - 230; // the card needs about this much
      const h = Math.min(r.height, room);
      const y = window.scrollY + r.top - head - Math.max(12, (room - h) / 2);
      smoothScrollTo(y, 520);
    }
  }, [step]);

  // A step that shows a row which scrolls sideways demonstrates it: the row glides to its end and back,
  // over and over, while the tip is open, then returns to where it was.
  useEffect(() => {
    const el = step?.target ? document.querySelector(step.target) : null;
    if (!el) return;
    const rows = [...(el.matches(SCROLLERS) ? [el] : []), ...el.querySelectorAll(SCROLLERS)].filter((r) => r.scrollWidth - r.clientWidth > 4);
    if (!rows.length) return;
    const home = rows.map((r) => r.scrollLeft);
    let stopped = false;
    const timers = [];
    const glide = (r, to, ms) =>
      new Promise((resolve) => {
        const from = r.scrollLeft;
        const t0 = performance.now();
        const stepFn = (now) => {
          if (stopped) return resolve();
          const t = Math.min(1, (now - t0) / ms);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          r.scrollLeft = from + (to - from) * e;
          if (t < 1) requestAnimationFrame(stepFn);
          else resolve();
        };
        requestAnimationFrame(stepFn);
      });
    const wait = (ms) => new Promise((resolve) => timers.push(setTimeout(resolve, ms)));
    (async () => {
      await wait(700);
      while (!stopped) {
        await Promise.all(rows.map((r) => glide(r, r.scrollWidth - r.clientWidth, 1100)));
        await wait(700);
        if (stopped) break;
        await Promise.all(rows.map((r) => glide(r, 0, 1100)));
        await wait(1200);
      }
    })();
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      rows.forEach((r, i) => r.scrollTo({ left: home[i], behavior: 'smooth' }));
    };
  }, [step]);

  useEffect(() => {
    if (!step) return;
    let raf = 0;
    const tick = () => {
      const el = target.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const goal = { top: r.top, left: r.left, width: r.width, height: Math.min(r.height, window.innerHeight * 0.6) };
        setRect((cur) => {
          if (!cur) return goal;
          const k = 0.22;
          const next = {
            top: cur.top + (goal.top - cur.top) * k,
            left: cur.left + (goal.left - cur.left) * k,
            width: cur.width + (goal.width - cur.width) * k,
            height: cur.height + (goal.height - cur.height) * k,
          };
          const close = Math.abs(next.top - goal.top) + Math.abs(next.left - goal.left) + Math.abs(next.width - goal.width) + Math.abs(next.height - goal.height) < 0.5;
          return close ? (cur.top === goal.top && cur.left === goal.left && cur.width === goal.width && cur.height === goal.height ? cur : goal) : next;
        });
      } else setRect(null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  if (!step) return null;

  const finish = () => {
    markDone(pathname);
    setSteps(null);
  };
  const last = i === steps.length - 1;
  const pad = 6;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  // The card goes below the highlighted element when there is room, otherwise above it.
  const below = rect ? rect.top + rect.height + pad + 220 < vh : true;
  const cardStyle = rect
    ? below
      ? { top: Math.max(12, rect.top + rect.height + pad + 12) }
      : { bottom: Math.max(12, vh - rect.top + pad + 12) }
    : { top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={step.title}>
      {(() => {
        // One dimmed, blurred layer over the whole screen with a rounded hole cut out of it
        // (clip-path, even-odd), so the edge of the hole is a single clean rounded line.
        if (!rect) return <div className="tour-dim" style={{ ...DIM, inset: 0 }} />;
        const vw = window.innerWidth;
        const t = rect.top - pad, l = rect.left - pad, w = rect.width + pad * 2, h = rect.height + pad * 2;
        const r = Math.min(14, w / 2, h / 2);
        const hole = `M${l + r},${t} H${l + w - r} A${r},${r} 0 0 1 ${l + w},${t + r} V${t + h - r} A${r},${r} 0 0 1 ${l + w - r},${t + h} H${l + r} A${r},${r} 0 0 1 ${l},${t + h - r} V${t + r} A${r},${r} 0 0 1 ${l + r},${t} Z`;
        const clip = `path(evenodd, 'M0,0 H${vw} V${vh} H0 Z ${hole}')`;
        return (
          <>
            <div className="tour-dim" style={{ ...DIM, inset: 0, clipPath: clip, WebkitClipPath: clip }} />
            <div className="tour-hole" style={{ top: t, left: l, width: w, height: h, borderRadius: r }} />
          </>
        );
      })()}
      <div className="tour-card" style={cardStyle}>
        <div className="tour-step">{i + 1} / {steps.length}</div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-actions">
          {!last && <button className="tour-skip" onClick={finish}>ข้าม</button>}
          {i > 0 && <button className="tour-back" onClick={() => setI(i - 1)}>ย้อนกลับ</button>}
          <button className="tour-next" autoFocus onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'เริ่มใช้งาน' : 'ถัดไป'}</button>
        </div>
      </div>
    </div>
  );
}
