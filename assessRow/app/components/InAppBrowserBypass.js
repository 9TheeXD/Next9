'use client';

import { useEffect, useState } from 'react';

export default function InAppBrowserBypass() {
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const isLine = /Line/i.test(ua);
    const isFB = /FBAN|FBAV/i.test(ua);
    const isIG = /Instagram/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;

    // Check if we are inside an in-app browser
    if (isLine || isFB || isIG) {
      const currentUrl = window.location.href;

      // LINE specific auto-redirect
      if (isLine && !currentUrl.includes('openExternalBrowser=1')) {
        const separator = currentUrl.includes('?') ? '&' : '?';
        window.location.href = currentUrl + separator + 'openExternalBrowser=1';
        // Give it a little time, if it doesn't navigate away, show the overlay
        setTimeout(() => setShowOverlay(true), 2000);
        return;
      }

      // Android specific intent
      if (isAndroid) {
        // Build the intent URL to force open Chrome
        const intentUrl = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end;`;
        window.location.href = intentUrl;
        
        // Show overlay in case intent fails or takes time
        setTimeout(() => setShowOverlay(true), 2000);
        return;
      }

      // iOS or if other auto-redirects fail
      setShowOverlay(true);
    }
  }, []);

  if (!showOverlay) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#b91c1c',
      color: 'white',
      zIndex: 999999,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px',
      textAlign: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '16px', fontWeight: 'bold' }}>ไม่รองรับเบราว์เซอร์นี้</h1>
      <p style={{ fontSize: '16px', marginBottom: '24px', lineHeight: '1.5' }}>
        ระบบไม่สามารถใช้งาน Google Login ผ่านแอปพลิเคชันนี้ได้ เนื่องจากนโยบายความปลอดภัยของ Google
      </p>
      
      <div style={{ 
        backgroundColor: 'rgba(255,255,255,0.15)', 
        padding: '20px', 
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.3)'
      }}>
        <p style={{ fontSize: '18px', margin: '0 0 12px 0', fontWeight: 'bold' }}>
          👇 วิธีแก้ไข 👇
        </p>
        <p style={{ fontSize: '16px', margin: 0, lineHeight: '1.6' }}>
          แตะที่ไอคอน <strong>จุด 3 จุด (เมนู)</strong> ที่มุมขวาบน หรือมุมขวาล่าง<br/><br/>
          แล้วเลือก <strong>"เปิดในเบราว์เซอร์"</strong><br/>
          (Open in Browser)
        </p>
      </div>
    </div>
  );
}
