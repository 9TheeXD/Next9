import './globals.css';
import Navigation from './components/Navigation';
import AuthProvider from './components/AuthProvider';
import InAppBrowserBypass from './components/InAppBrowserBypass';
import LockOverlay from './components/LockOverlay';
import ViewLogger from './components/ViewLogger';
import Tour from './components/Tour';
import ScrollHints from './components/ScrollHints';
import { FALLBACK_TERMS } from '@/lib/dashboardShared';

// The summary page (/) asks for its first numbers as soon as the HTML arrives, instead of after its
// JavaScript has downloaded and started (about two seconds on a phone). It builds the same URLs the
// page does for its default period ("1 เดือน" of the current term) and leaves the requests on
// window.__dashPre, where the page's getJson picks them up. A student's range differs; then the page
// simply asks again.
const termStart = (FALLBACK_TERMS.find((t) => t.id === '2') || FALLBACK_TERMS[0]).startDate;
const PREFETCH = `(function(){if(location.pathname!=='/')return;try{
var p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
var g=function(t){return p.find(function(x){return x.type===t}).value};
var today=g('year')+'-'+g('month')+'-'+g('day');
var d=new Date(+g('year'),+g('month')-1,+g('day'));d.setMonth(d.getMonth()-1);
var pad=function(n){return String(n).padStart(2,'0')};
var back=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
var ts='${termStart}';try{var saved=localStorage.getItem('dash_term_start');if(/^\\d{4}-\\d{2}-\\d{2}$/.test(saved||''))ts=saved}catch(e){}
var start=back<ts?ts:back;
var q='startDate='+start+'&endDate='+today+'&terms=1';
var m=window.__dashPre={};
['/api/evaluations/summary?'+q,'/api/evaluations/trend?'+q,'/api/evaluations/ranking?'+q+'&type=all_rooms'].forEach(function(u){m[u]=fetch(u)});
}catch(e){}})();`;

// Maintenance check, before anything else: the first request the page makes is for the lock status,
// sent as soon as the HTML head arrives (well before the page's JavaScript). When the site is closed
// the popup is drawn right away from plain DOM; components/LockOverlay.js takes over from it once React
// is running, reusing this same request (window.__lockPre). /admin, /login and admins are never blocked.
const LOCK_CHECK = `(function(){try{
var path=location.pathname;if(path.indexOf('/admin')===0||path==='/login')return;
var pre=window.__lockPre=fetch('/api/settings/lock',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null});
pre.then(function(d){if(!d||!d.locked||d.exempt)return;
document.documentElement.setAttribute('data-locked','1');
var show=function(){if(document.getElementById('lock-pre'))return;
var t='';if(d.lockUntil){var u=new Date(d.lockUntil),same=u.toDateString()===new Date().toDateString();
t='จนถึง'+(same?'เวลา':'')+' '+new Intl.DateTimeFormat('th-TH',same?{hour:'2-digit',minute:'2-digit'}:{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(u)+' น.';}
var o=document.createElement('div');o.id='lock-pre';
o.style.cssText='position:fixed;inset:0;background:rgba(255,255,255,.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center';
o.innerHTML='<div style="background:#fff;padding:40px;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 10px 10px -5px rgba(0,0,0,.04);max-width:400px;width:100%;display:flex;flex-direction:column;align-items:center;gap:16px"><div style="background:#fee2e2;color:#dc2626;padding:16px;border-radius:50%;display:flex"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div><h2 style="margin:0;font-size:1.5rem;color:#1f2937"></h2><p style="margin:0;color:#4b5563;font-size:1.1rem;white-space:pre-line;overflow-wrap:anywhere"></p><p style="margin:0;color:#dc2626;font-weight:bold;font-size:1.2rem"></p></div>';
var e=o.getElementsByTagName('h2')[0],ps=o.getElementsByTagName('p');
e.textContent=d.title||'ระบบปิดปรับปรุงชั่วคราว';
ps[0].textContent=d.message||'ขออภัยในความไม่สะดวก\\nขณะนี้ระบบไม่สามารถใช้งานได้';
if(t)ps[1].textContent=t;else ps[1].remove();
document.body.appendChild(o);};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show);else show();
});}catch(e){}})();`;

export const metadata = {
  title: 'ระบบประเมินกิจกรรมหน้าเสาธง',
  description: 'ระบบติดตามและประเมินผลกิจกรรมหน้าเสาธงสำหรับโรงเรียน',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: LOCK_CHECK }} />
        <script dangerouslySetInnerHTML={{ __html: PREFETCH }} />
      </head>
      <body>
        <AuthProvider>
          <ViewLogger />
          <LockOverlay />
          <InAppBrowserBypass />
          <Navigation />
          <Tour />
          <ScrollHints />
          <main className="page-content">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
