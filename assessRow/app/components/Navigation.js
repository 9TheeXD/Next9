'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LayoutDashboard, ClipboardCheck, Menu, X, LogOut, Eye, HelpCircle } from 'lucide-react';
import { hasTour } from './Tour';
import { useStudentView, StudentViewBanner } from './StudentView';

export default function Navigation() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const { isStudentView, toggleStudentView } = useStudentView(session);

  if (pathname.startsWith('/admin') || pathname === '/login') {
    return null;
  }

  return (
    <>
      <StudentViewBanner isStudentView={isStudentView} toggleStudentView={toggleStudentView} session={session} />
      <nav className="nav">
      <div className="nav-inner">
        <span className="nav-title">ระบบประเมินกิจกรรมหน้าเสาธง</span>
        <button
          className="nav-hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="เมนู"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          {isStudentView && session?.user?.role !== 'student' ? (
            <span
              className={`nav-link ${pathname === '/' ? 'active' : ''}`}
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
            >
              <LayoutDashboard size={18} />
              หน้าสรุป
            </span>
          ) : (
            <Link
              href="/"
              className={`nav-link ${pathname === '/' ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <LayoutDashboard size={18} />
              หน้าสรุป
            </Link>
          )}
          {status === 'authenticated' && !isStudentView && (
            <Link
              href="/evaluate"
              className={`nav-link ${pathname === '/evaluate' ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <ClipboardCheck size={18} />
              หน้าประเมิน
            </Link>
          )}
          {status === 'authenticated' && session?.user?.role !== 'student' && !isStudentView && (
            <button
              className="nav-link"
              onClick={() => {
                setMenuOpen(false);
                toggleStudentView();
              }}
              style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'rgba(255,255,255,0.8)' }}
              onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-white)'}
              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
            >
              <Eye size={18} />
              มุมมองนักเรียน
            </button>
          )}
          {hasTour(pathname) && (
            <button
              className="nav-link"
              onClick={() => {
                setMenuOpen(false);
                window.dispatchEvent(new Event('show-tour'));
              }}
              style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'rgba(255,255,255,0.8)' }}
              onMouseOver={(e) => e.currentTarget.style.color = 'var(--color-white)'}
              onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
            >
              <HelpCircle size={18} />
              สอนใช้งาน
            </button>
          )}
          {session && (
            <button
              className="nav-link"
              onClick={() => {
                if (isStudentView && session?.user?.role !== 'student') return;
                setMenuOpen(false);
                signOut({ callbackUrl: '/' });
              }}
              disabled={isStudentView && session?.user?.role !== 'student'}
              style={{ background: 'none', border: 'none', textAlign: 'left', cursor: isStudentView && session?.user?.role !== 'student' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', color: 'rgba(255,255,255,0.8)', opacity: isStudentView && session?.user?.role !== 'student' ? 0.5 : 1 }}
              onMouseOver={(e) => { if (!(isStudentView && session?.user?.role !== 'student')) e.currentTarget.style.color = 'var(--color-white)' }}
              onMouseOut={(e) => { if (!(isStudentView && session?.user?.role !== 'student')) e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
            >
              <LogOut size={18} />
              ออกจากระบบ
            </button>
          )}
        </div>
      </div>
    </nav>
    </>
  );
}
