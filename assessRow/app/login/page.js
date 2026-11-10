'use client';

import { signIn } from 'next-auth/react';
import { LogIn, UserCog } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';

function safeCallback(raw) {
  if (!raw) return '/';
  try {
    // NextAuth passes the full URL (https://host/admin); keep only a same-origin path.
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return '/';
    if (u.pathname.startsWith('/login') || u.pathname.startsWith('/api/auth')) return '/';
    return u.pathname + u.search + u.hash;
  } catch {
    return '/';
  }
}

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  // Back to the page that sent the visitor here. Only a path on this site: an absolute or
  // protocol-relative URL (//evil.example) would make this an open redirect.
  const callbackUrl = safeCallback(searchParams.get('callbackUrl'));

  return (
    <div className="login-container">
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px', maxWidth: '400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ color: '#b91c1c', marginBottom: '8px' }}>เข้าสู่ระบบ</h2>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>ระบบประเมินกิจกรรมหน้าเสาธง</p>
        </div>

        {error === 'AccessDenied' && (
          <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
            อีเมลของคุณยังไม่ได้รับสิทธิ์ (Whitelist) ในการเข้าถึงระบบ กรุณาติดต่อผู้ดูแลระบบ
          </div>
        )}

        {error && error !== 'AccessDenied' && (
          <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
            เกิดข้อผิดพลาดในการเข้าสู่ระบบ ({error})
          </div>
        )}

        <button
          onClick={() => signIn('google', { callbackUrl })}
          className="btn btn-primary btn-lg"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}
        >
          <LogIn size={20} />
          เข้าสู่ระบบด้วย Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>กำลังโหลด...</div>}>
      <LoginContent />
    </Suspense>
  );
}
