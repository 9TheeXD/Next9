'use client';

// imports
import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';

export function useStudentView(session) {
  // ?view=student is read after mount: reading the URL while rendering made the server HTML and the
  // first client render disagree (React error #418).
  const [urlStudent, setUrlStudent] = useState(false);
  useEffect(() => {
    setUrlStudent(window.location.search.includes('view=student'));
  }, []);
  const isStudentView = session?.user?.role === 'student' || urlStudent;

  const toggleStudentView = () => {
    if (window.location.search.includes('view=student')) {
      window.location.href = '/';
    } else {
      window.location.href = '/?view=student';
    }
  };

  return { isStudentView, toggleStudentView };
}

export function StudentViewBanner({ isStudentView, toggleStudentView, session }) {
  if (!isStudentView || session?.user?.role === 'student') return null;

  return (
    <>
      <style>{`
        :root { --sv-banner-h: 50px; }
        body { padding-bottom: 50px !important; }
        .modal-overlay { bottom: 50px !important; }
      `}</style>
      <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: '#f59e0b',
      color: 'white',
      padding: '0 16px',
      height: '50px',
      boxSizing: 'border-box',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 999999, // above everything
      fontSize: '0.9rem',
      fontWeight: 'bold',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Eye size={18} /> คุณกำลังดูในมุมมองของ "นักเรียนทั่วไป"
      </span>
      <button 
        onClick={toggleStudentView}
        style={{
          backgroundColor: 'white',
          color: '#d97706',
          border: 'none',
          padding: '4px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '0.85rem'
        }}
      >
        กลับสู่มุมมองปกติ
      </button>
    </div>
    </>
  );
}
