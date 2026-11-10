'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useSession } from 'next-auth/react';

export default function LockOverlay() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [locked, setLocked] = useState(false);
  const [lockUntil, setLockUntil] = useState(null);
  const [text, setText] = useState({ title: '', message: '' });
  const lockStateRef = useRef({ hasFetched: false, locked: false });

  // Do not block admin page or login page, or if the user is an admin
  const isExempt = pathname?.startsWith('/admin') || pathname === '/login' || session?.user?.role === 'admin';

  useEffect(() => {
    if (isExempt) return;

    let timeoutId;
    
    const checkLockStatus = async () => {
      try {
        // The first answer comes from the request app/layout.js sent before the page loaded.
        const pre = lockStateRef.current.hasFetched ? null : window.__lockPre;
        let data = pre ? await pre : null;
        if (!data) {
          const res = await fetch('/api/settings/lock', { cache: 'no-store' });
          data = res.ok ? await res.json() : null;
        }
        if (data) {
          data.locked = data.locked && !data.exempt;
          if (lockStateRef.current.hasFetched && lockStateRef.current.locked !== data.locked) {
            window.location.reload();
            return;
          }
          setLocked(data.locked);
          setLockUntil(data.lockUntil);
          setText({ title: data.title || '', message: data.message || '' });
          lockStateRef.current.hasFetched = true;
          lockStateRef.current.locked = data.locked;
          setLockFlag(data.locked);
        }
      } catch (e) {
        console.error('Failed to fetch lock status', e);
      }
      
      // Check every 15 seconds to be more responsive
      timeoutId = setTimeout(checkLockStatus, 15000);
    };

    checkLockStatus();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isExempt]);

  // React's popup replaces the early one; with no lock (or for an admin) the early one goes away.
  const show = !isExempt && locked;
  useEffect(() => {
    if (isExempt) setLockFlag(false);
    if (show || isExempt) document.getElementById('lock-pre')?.remove();
  }, [show, isExempt]);

  if (!show) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.6)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      zIndex: 2147483000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      textAlign: 'center'
    }}>
      <LockCard lockUntil={lockUntil} title={text.title} message={text.message} />
    </div>
  );
}

// <html data-locked="1"> while the site is closed to this user; Tour.js stays shut then. A change is
// announced with a 'lock-change' event.
function setLockFlag(on) {
  const root = document.documentElement;
  if ((root.getAttribute('data-locked') === '1') === on) return;
  if (on) root.setAttribute('data-locked', '1');
  else root.removeAttribute('data-locked');
  window.dispatchEvent(new Event('lock-change'));
}

// The maintenance popup itself. Also used by the admin page to preview the wording.
export function LockCard({ lockUntil, title, message }) {
  let timeMessage = '';
  if (lockUntil) {
    const untilDate = new Date(lockUntil);
    const sameDay = untilDate.toDateString() === new Date().toDateString();
    const formatter = new Intl.DateTimeFormat('th-TH', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    timeMessage = `จนถึง${sameDay ? 'เวลา' : ''} ${formatter.format(untilDate)} น.`;
  }

  return (
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        maxWidth: '400px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        // On the card itself (not only on the overlay) so the admin preview lines up the same way.
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          padding: '16px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <AlertTriangle size={48} />
        </div>
        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937' }}>{title || 'ระบบปิดปรับปรุงชั่วคราว'}</h2>
        {message ? (
          <p style={{ margin: 0, color: '#4b5563', fontSize: '1.1rem', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{message}</p>
        ) : (
          <p style={{ margin: 0, color: '#4b5563', fontSize: '1.1rem' }}>
            ขออภัยในความไม่สะดวก<br/>
            ขณะนี้ระบบไม่สามารถใช้งานได้
          </p>
        )}
        {timeMessage && (
          <p style={{ margin: 0, color: '#dc2626', fontWeight: 'bold', fontSize: '1.2rem' }}>
            {timeMessage}
          </p>
        )}
      </div>
  );
}
