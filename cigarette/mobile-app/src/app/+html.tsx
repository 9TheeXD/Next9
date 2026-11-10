import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#38bdf8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        
        {/* DNS Preconnect for lightning-fast font loading without blocking */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Chonburi&family=Fahkwang:ital,wght@0,600;0,700;1,700&family=Kanit:ital,wght@0,600;0,700;0,900;1,900&family=Prompt:ital,wght@0,500;0,600;0,700;1,600&family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet" />
        
        <ScrollViewStyleReset />
        
        {/* Critical Inline CSS: Guarantees INSTANT visual render on 3G / H+ before JS or fonts load */}
        <style dangerouslySetInnerHTML={{ __html: `
          @font-face {
            font-family: 'DawnoraTH';
            src: local('DawnoraTH'), local('Dawnora'), local('Chonburi'), local('Fahkwang-Bold'), local('Kanit-Black');
            font-display: swap;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          html, body {
            background-color: #72a9d8;
            height: 100%;
            min-height: 100%;
            overflow-x: hidden;
            -webkit-tap-highlight-color: transparent;
            font-family: 'Prompt', 'Kanit', 'Sarabun', 'Leelawadee UI', 'Leelawadee', Tahoma, -apple-system, sans-serif;
          }
          #root, [data-expo-root] {
            min-height: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            flex: 1 1 auto;
          }
          
          /* Instant Static Shell - Renders in <50ms without waiting for JS */
          #static-app-shell {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: linear-gradient(180deg, #72a9d8 0%, #a8d1ee 50%, #79b0dc 100%);
            padding: 48px 28px;
            overflow-y: auto;
            text-align: center;
            transition: opacity 0.25s ease, visibility 0.25s ease;
          }
          #static-app-shell.fade-out {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
          }
          .shell-icon-wrapper {
            width: 120px;
            height: 120px;
            border-radius: 28px;
            background: rgba(255, 255, 255, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            box-shadow: 0 10px 20px rgba(14, 165, 233, 0.2);
          }
          .shell-icon-img {
            width: 92px;
            height: 92px;
            border-radius: 20px;
            object-fit: contain;
          }
          .shell-welcome-text {
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 10px;
            letter-spacing: -0.2px;
          }
          .shell-title-1 {
            font-family: 'DawnoraTH', 'Chonburi', 'Fahkwang', 'Kanit', sans-serif;
            font-size: 44px;
            font-weight: 900;
            color: #ffffff;
            line-height: 1.25;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
          }
          .shell-title-2 {
            font-family: 'DawnoraTH', 'Chonburi', 'Fahkwang', 'Kanit', sans-serif;
            font-size: 44px;
            font-weight: 900;
            color: #0284c7;
            line-height: 1.25;
            margin-bottom: 18px;
            text-shadow: 0 1px 3px rgba(255, 255, 255, 0.7);
          }
          .shell-description {
            font-size: 17px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.95);
            line-height: 1.65;
            margin-bottom: 36px;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
            max-width: 360px;
          }
          .shell-start-button {
            background-color: #ffffff;
            color: #0284c7;
            border: none;
            padding: 18px 64px;
            border-radius: 50px;
            font-size: 24px;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            max-width: 290px;
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
            font-family: inherit;
            transition: transform 0.15s ease, background-color 0.15s ease;
          }
          .shell-start-button:active {
            transform: scale(0.97);
            background-color: rgba(255, 255, 255, 0.92);
          }

          /* Global Crash Protection */
          #app-crash-fallback {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 100000;
            background: #f0fdfa;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
            text-align: center;
          }
        `}} />
      </head>
      <body>
        {/* Instant App Shell: Displays in <50ms even on slow 3G / H+ while JS downloads */}
        <div id="static-app-shell">
          <div className="shell-icon-wrapper">
            <img src="/icon.png" alt="Next Breath" className="shell-icon-img" />
          </div>
          <div className="shell-welcome-text">ยินดีต้อนรับสู่ Next Breath</div>
          <div className="shell-title-1">หายใจครั้งต่อไป</div>
          <div className="shell-title-2">ที่ไร้ควัน</div>
          <div className="shell-description">
            แอปพลิเคชันช่วยเลิกบุหรี่<br />
            ด้วยการติดตามพฤติกรรม<br />
            เกมเสริมกำลังใจ และแรงสนับสนุน<br />
            จากคนที่คุณรัก
          </div>
          <button
            id="static-start-btn"
            className="shell-start-button"
            onClick={() => {
              const btn = document.getElementById('static-start-btn');
              if (btn) btn.innerText = 'กำลังเปิด...';
            }}
          >
            เริ่มต้น
          </button>
        </div>

        {/* Global crash fallback screen to protect against white screen if bundle fails */}
        <div id="app-crash-fallback">
          <div style={{ maxWidth: '340px', background: '#fff', borderRadius: '24px', padding: '28px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#0f172a', fontSize: '20px' }}>กำลังเริ่มระบบใหม่</h3>
            <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px', lineHeight: '1.6', fontFamily: 'Sarabun, sans-serif' }}>
              ระบบกำลังเชื่อมต่อหรือโหลดข้อมูลใหม่ กรุณากดปุ่มด้านล่างเพื่อเข้าใช้งาน
            </p>
            <button
              onClick={() => {
                if (typeof caches !== 'undefined') {
                  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => {});
                }
                window.location.reload();
              }}
              style={{
                width: '100%',
                backgroundColor: '#38bdf8',
                color: '#fff',
                border: 'none',
                padding: '14px',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontFamily: 'Kanit, sans-serif'
              }}
            >
              โหลดใหม่อีกครั้ง
            </button>
          </div>
        </div>

        {/* Actual React root */}
        {children}

        {/* Seamless Hydration Hand-off: Hides static shell when React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var isDismissed = false;
            function dismissStaticShell() {
              if (isDismissed) return;
              isDismissed = true;
              var shell = document.getElementById('static-app-shell');
              if (shell) {
                shell.classList.add('fade-out');
                setTimeout(function() { if (shell.parentNode) shell.parentNode.removeChild(shell); }, 300);
              }
            }

            // Observe React mount
            var observer = new MutationObserver(function(mutations) {
              var root = document.getElementById('root') || document.querySelector('[data-expo-root]');
              if (root && root.children.length > 0) {
                dismissStaticShell();
                observer.disconnect();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // Watchdog fallback
            setTimeout(dismissStaticShell, 6000);

            // Catch uncaught fatal script error that would leave white screen
            window.addEventListener('error', function(e) {
              var root = document.getElementById('root') || document.querySelector('[data-expo-root]');
              if (!root || root.children.length === 0) {
                var crash = document.getElementById('app-crash-fallback');
                if (crash) {
                  dismissStaticShell();
                  crash.style.display = 'flex';
                }
              }
            });
          })();
        `}} />
      </body>
    </html>
  );
}
