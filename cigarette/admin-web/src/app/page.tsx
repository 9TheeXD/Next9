'use client';

import { useEffect, useState, useRef } from 'react';

// The Next Breath app (mobile-app project on Vercel).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app-ciga-next9.vercel.app").replace(/\/+$/, "");

interface Stats {
  users: number;
  cigarettesAvoided: number;
  moneySaved: number;
}

const AnimatedNumber = ({ value, duration = 2000 }: { value: number, duration?: number }) => {
  const [count, setCount] = useState(0);
  const [isInView, setIsInView] = useState(false);
  
  const countRef = useRef(0);
  const animatedToRef = useRef<number | null>(null);
  const nodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    
    if (nodeRef.current) observer.observe(nodeRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView) return;
    if (value === animatedToRef.current) return;
    
    const startValue = countRef.current;
    const distance = value - startValue;
    
    if (distance === 0) {
      animatedToRef.current = value;
      return;
    }
    
    let startTimestamp: number | null = null;
    let animationFrame: number;
    
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      const currentVal = Math.floor(startValue + (distance * progress));
      setCount(currentVal);
      countRef.current = currentVal;
      
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(step);
      } else {
        setCount(value);
        countRef.current = value;
        animatedToRef.current = value;
      }
    };
    animationFrame = window.requestAnimationFrame(step);
    
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [isInView, value, duration]);

  return <span ref={nodeRef}>{count.toLocaleString()}</span>;
};

const START = (path: 'try' | 'quit' | 'help') => `${APP_URL}/login?start=${path}&openExternalBrowser=1`;

const PATHS = [
  {
    id: 'try' as const,
    tag: 'ไม่ต้องสูบก็ใช้ได้',
    title: 'ลองใช้งานเลย',
    text: 'ไม่ต้องสมัคร ไม่ต้องตอบคำถาม เปิดมาเล่นเกมผ่อนคลายได้ทันที มีหมากรุก XO เกมสี่มุมที่เล่นกับเพื่อนหรือบอทได้',
    cta: 'ลองเลย',
    ring: 'border-teal-400/40 hover:border-teal-300',
    chip: 'bg-teal-500/15 text-teal-300',
  },
  {
    id: 'quit' as const,
    tag: 'สำหรับคนที่อยากเลิก',
    title: 'ฉันอยากเลิกสูบ',
    text: 'ตั้งแผนของตัวเอง นับวันที่ไม่สูบ ดูเงินที่ประหยัดได้ และมีปุ่มช่วยเมื่อใจอ่อน คำถามเริ่มต้นสั้นและข้ามได้ทุกข้อ',
    cta: 'เริ่มเลิกสูบ',
    ring: 'border-sky-400/40 hover:border-sky-300',
    chip: 'bg-sky-500/15 text-sky-300',
  },
  {
    id: 'help' as const,
    tag: 'สำหรับคนที่ห่วงใย',
    title: 'ฉันอยากช่วยคนใกล้ตัว',
    text: 'ส่งกำลังใจและดูความก้าวหน้าของคนที่คุณห่วง ถ้ามีรหัส 4 หลักของเขาก็ใส่ได้เลย ไม่มีก็ข้ามไปก่อน',
    cta: 'ช่วยเขา',
    ring: 'border-pink-400/40 hover:border-pink-300',
    chip: 'bg-pink-500/15 text-pink-300',
  },
];

const FEATURES = [
  {
    title: 'เกมกว่า 20 เกม',
    text: 'ไขปริศนา หมากรุก XO เรียงสี่ ฮอกกี้ และเกมสี่มุมที่นั่งเล่นรอบเครื่องเดียว เล่นกับบอทหรือเพื่อนก็ได้ เก็บเหรียญไปซื้อสกินและตัวช่วย',
    color: 'bg-amber-500/20 text-amber-400',
    d: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    title: 'นับวันที่ไม่สูบ',
    text: 'บันทึกสั้นๆ วันละครั้ง ดูจำนวนวัน บุหรี่ที่ลดได้ และเงินที่เก็บได้ สำหรับคนที่ตั้งใจเลิก',
    color: 'bg-blue-500/20 text-blue-400',
    d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    title: 'ช่วยเมื่อใจอ่อน',
    text: 'ปุ่ม SOS พาหายใจลึกๆ และชวนเล่นเกมสั้นๆ ให้ช่วงอยากสูบผ่านไป',
    color: 'bg-rose-500/20 text-rose-400',
    d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  },
  {
    title: 'ครอบครัวร่วมเชียร์',
    text: 'คนใกล้ตัวส่งกำลังใจและเห็นความก้าวหน้าได้ด้วยรหัส 4 หลัก โดยไม่ต้องแชร์ข้อมูลส่วนตัวอะไรเพิ่ม',
    color: 'bg-purple-500/20 text-purple-400',
    d: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  },
];

export default function LandingPage() {
  const [stats, setStats] = useState<Stats>({ users: 0, cigarettesAvoided: 0, moneySaved: 0 });

  useEffect(() => {
    fetch('/api/public/stats')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setStats({
            users: json.data.totalUsers || 0,
            cigarettesAvoided: json.data.totalCigarettesAvoided || 0,
            moneySaved: json.data.totalMoneySaved || 0,
          });
        }
      })
      .catch((err) => console.error('Error fetching stats', err));
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-sarabun overflow-x-hidden">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-black/60 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="font-kanit font-black text-2xl tracking-wide">Next Breath</div>
          <a
            href={`${APP_URL}/login?openExternalBrowser=1`}
            className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors font-prompt font-semibold text-sm border border-white/20"
          >
            เปิดแอป
          </a>
        </div>
      </nav>

      <section className="relative flex flex-col items-center justify-center text-center px-4 py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-600 via-sky-500 to-emerald-500 opacity-20 animate-bg-shift z-0"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-emerald-500/30 rounded-full blur-[100px] z-0"></div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <h1 className="font-kanit font-black text-5xl md:text-7xl leading-tight mb-2">หายใจครั้งต่อไป</h1>
          <h2 className="font-kanit font-black text-4xl md:text-6xl mb-6 text-gradient">ที่ไร้ควัน</h2>
          <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            แอปที่ช่วยคนอยากเลิกบุหรี่ ช่วยคนที่ห่วงใยคนสูบ และเปิดให้ทุกคนลองเล่นเกมผ่อนคลายได้ฟรี
            ไม่ต้องสูบบุหรี่ก็ใช้ได้
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={START('try')}
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-white text-black hover:bg-gray-100 transition-all font-kanit font-bold text-xl shadow-[0_0_40px_rgba(255,255,255,0.25)] hover:scale-105"
            >
              ลองใช้งานเลย
            </a>
            <a
              href={START('quit')}
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 transition-all font-kanit font-bold text-xl"
            >
              ฉันอยากเลิกสูบ
            </a>
          </div>
          <p className="mt-5 text-gray-400 font-prompt text-sm">
            ฟรี · ไม่ต้องใช้ชื่อจริง เบอร์โทร หรืออีเมล · ข้ามคำถามได้ทุกข้อ
          </p>
        </div>
      </section>

      <section className="py-16 bg-[#0a0a0a]" id="paths">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-kanit font-bold text-center mb-3">คุณอยากทำอะไร</h2>
          <p className="text-center text-gray-400 font-prompt mb-10">เลือกทางที่ตรงกับคุณ เปลี่ยนใจทีหลังได้</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PATHS.map((p) => (
              <a
                key={p.id}
                href={START(p.id)}
                className={`glass-card p-7 border ${p.ring} transition-all hover:-translate-y-1 flex flex-col`}
              >
                <span className={`self-start text-xs font-prompt font-semibold px-3 py-1 rounded-full mb-4 ${p.chip}`}>{p.tag}</span>
                <h3 className="text-2xl font-kanit font-bold mb-2">{p.title}</h3>
                <p className="text-gray-400 leading-relaxed mb-6 flex-1">{p.text}</p>
                <span className="font-kanit font-bold text-white">{p.cta} →</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-black">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="glass-card p-7 text-center">
              <div className="text-4xl font-kanit font-bold mb-1">
                <AnimatedNumber value={stats.users} /> <span className="text-xl">คน</span>
              </div>
              <div className="text-gray-400 font-prompt text-sm">กำลังเลิกบุหรี่กับเรา</div>
            </div>
            <div className="glass-card p-7 text-center">
              <div className="text-4xl font-kanit font-bold text-emerald-400 mb-1">
                <AnimatedNumber value={stats.cigarettesAvoided} /> <span className="text-xl">มวน</span>
              </div>
              <div className="text-gray-400 font-prompt text-sm">บุหรี่ที่ลดได้รวมกัน</div>
            </div>
            <div className="glass-card p-7 text-center">
              <div className="text-4xl font-kanit font-bold text-amber-400 mb-1">
                <AnimatedNumber value={stats.moneySaved} /> <span className="text-xl">บาท</span>
              </div>
              <div className="text-gray-400 font-prompt text-sm">เงินที่ประหยัดได้รวมกัน</div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#0a0a0a]" id="features">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-kanit font-bold text-center mb-10">มีอะไรในแอป</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-card p-7">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${f.color}`}>
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.d} />
                  </svg>
                </div>
                <h3 className="text-xl font-kanit font-bold mb-2">{f.title}</h3>
                <p className="text-gray-400 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-black">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-kanit font-bold text-center mb-10">เริ่มง่ายๆ ใน 3 ขั้น</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {[
              ['1', 'เลือกทางของคุณ', 'ลองใช้งาน อยากเลิกสูบ หรืออยากช่วยคนใกล้ตัว', 'border-teal-500 text-teal-400'],
              ['2', 'ตอบสั้นๆ หรือข้ามไปเลย', 'คำถามทุกข้อเป็นตัวเลือก ตอบเท่าที่สบายใจ แอปใช้ได้แม้ไม่ตอบ', 'border-sky-500 text-sky-400'],
              ['3', 'เริ่มใช้ได้ทันที', 'ได้รหัส 4 หลักที่สุ่มให้ ไม่ต้องจำรหัสผ่าน', 'border-emerald-500 text-emerald-400'],
            ].map(([n, t, d, c]) => (
              <div key={n}>
                <div className={`w-20 h-20 mx-auto bg-black border-2 rounded-full flex items-center justify-center text-3xl font-kanit font-bold mb-4 ${c}`}>{n}</div>
                <h3 className="text-xl font-kanit font-bold mb-2">{t}</h3>
                <p className="text-gray-400">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto px-4">
          <div className="glass-card p-8">
            <h2 className="text-2xl md:text-3xl font-kanit font-bold mb-4">เราขอข้อมูลเท่าที่จำเป็น</h2>
            <ul className="space-y-3 text-gray-300 leading-relaxed">
              <li>• ไม่ขอชื่อจริง เบอร์โทร อีเมล หรือที่อยู่</li>
              <li>• ใช้รหัส 4 หลักที่สุ่มให้ แทนบัญชีและรหัสผ่าน</li>
              <li>• ลองใช้งานได้ก่อนโดยไม่ต้องตอบคำถามใดๆ</li>
              <li>• คำถามอายุ เพศ และพฤติกรรมการสูบ ข้ามได้ทุกข้อ ใช้เพื่อปรับแอปและดูภาพรวมโดยไม่ระบุตัวตน</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/40 to-black z-0"></div>
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-kanit font-bold mb-4">พร้อมแล้วก็เริ่มได้เลย</h2>
          <p className="text-lg text-gray-300 mb-8 font-prompt">ฟรี ไม่มีค่าใช้จ่าย</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <a href={START('try')} className="w-full sm:w-auto px-8 py-4 rounded-full bg-white text-black hover:bg-gray-200 transition-all font-kanit font-bold text-lg">
              ลองใช้งานเลย
            </a>
            <a
              href="https://lin.ee/xwrSHNg"
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#00B900] text-white hover:bg-[#009900] transition-all font-kanit font-bold text-lg"
            >
              คุยกับเจ้าหน้าที่ทาง LINE
            </a>
          </div>
          <p className="text-gray-400 font-prompt">
            ถ้าต้องการคุยกับผู้เชี่ยวชาญ โทรสายด่วนเลิกบุหรี่ <a href="tel:1600" className="text-white font-semibold underline">1600</a> ฟรี
          </p>
        </div>
      </section>

      <footer className="py-8 border-t border-white/10 text-center font-prompt bg-black">
        <div className="text-xl font-kanit font-black mb-2">Next Breath</div>
        <div className="text-gray-600 text-xs mb-3">&copy; {new Date().getFullYear()} Next Breath</div>
        <a href="/login" className="text-gray-500 hover:text-gray-300 text-xs underline">สำหรับผู้ดูแลระบบ</a>
      </footer>
    </div>
  );
}
