'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

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

export default function LandingPage() {
  const [stats, setStats] = useState<Stats>({
    users: 0,
    cigarettesAvoided: 0,
    moneySaved: 0
  });

  const [visibleSections, setVisibleSections] = useState<Record<string, boolean>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Fetch stats
    fetch('/api/public/stats')
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          setStats({
            users: json.data.totalUsers || 0,
            cigarettesAvoided: json.data.totalCigarettesAvoided || 0,
            moneySaved: json.data.totalMoneySaved || 0
          });
        }
      })
      .catch(err => console.error('Error fetching stats', err));

    // Setup intersection observer for animations
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisibleSections(prev => ({ ...prev, [entry.target.id]: true }));
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = document.querySelectorAll('.animate-on-scroll');
    elements.forEach(el => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-sarabun overflow-x-hidden">
      {/* 1. Navigation Bar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-black/60 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="font-kanit font-black text-2xl tracking-wide">
            Next Breath
          </div>
          <div>
            <a 
              href="https://app-ciga-next9.yumistack.net/login?openExternalBrowser=1" 
              className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors font-prompt font-semibold text-sm border border-white/20"
            >
              เข้าสู่ระบบ
            </a>
          </div>
        </div>
      </nav>

      {/* 2. Hero Section */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-600 via-sky-500 to-emerald-500 opacity-20 animate-bg-shift z-0"></div>
        
        {/* Decorative circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/30 rounded-full blur-[100px] z-0"></div>

        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="font-kanit font-black text-6xl md:text-8xl leading-tight mb-2">
            <span className="inline-block">หายใจ</span><span className="inline-block">ครั้งต่อไป</span>
          </h1>
          <h2 className="font-kanit font-black text-5xl md:text-7xl mb-8 text-gradient">
            <span className="inline-block">ที่ไร้ควัน</span>
          </h2>
          <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-2xl mx-auto leading-relaxed">
            <span className="inline-block">แอปพลิเคชัน</span><span className="inline-block">ช่วยเลิกบุหรี่</span> <span className="inline-block">ด้วยการติดตามพฤติกรรม</span> <span className="inline-block">เกมเสริมกำลังใจ</span> <span className="inline-block">และแรงสนับสนุน</span><span className="inline-block">จากคนที่คุณรัก</span>
          </p>
          <div className="flex flex-col items-center gap-4">
            <a 
              href="https://app-ciga-next9.yumistack.net/login?openExternalBrowser=1"
              className="px-8 py-4 rounded-full bg-white text-black hover:bg-gray-100 transition-all font-kanit font-bold text-xl shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-105"
            >
              <span className="inline-block">เริ่มต้นเลย</span>
            </a>
            <span className="text-gray-400 font-prompt"><span className="inline-block">ฟรี</span> <span className="inline-block">ไม่มีค่าใช้จ่าย</span></span>
          </div>
        </div>
      </section>

      {/* 3. Stats Section */}
      <section className="py-20 relative z-10 bg-black">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-8 text-center">
              <div className="text-4xl md:text-5xl font-kanit font-bold text-white mb-2">
                <AnimatedNumber value={stats.users} /> <span className="text-2xl">คน</span>
              </div>
              <div className="text-gray-400 font-prompt"><span className="inline-block">กำลังเลิกบุหรี่</span><span className="inline-block">กับเรา</span></div>
            </div>
            <div className="glass-card p-8 text-center">
              <div className="text-4xl md:text-5xl font-kanit font-bold text-emerald-400 mb-2">
                <AnimatedNumber value={stats.cigarettesAvoided} /> <span className="text-2xl">มวน</span>
              </div>
              <div className="text-gray-400 font-prompt"><span className="inline-block">บุหรี่</span><span className="inline-block">ที่ลดได้</span></div>
            </div>
            <div className="glass-card p-8 text-center">
              <div className="text-4xl md:text-5xl font-kanit font-bold text-amber-400 mb-2">
                <AnimatedNumber value={stats.moneySaved} /> <span className="text-2xl">บาท</span>
              </div>
              <div className="text-gray-400 font-prompt"><span className="inline-block">เงินที่</span><span className="inline-block">ประหยัดได้</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Features Section */}
      <section className="py-24 bg-[#0a0a0a]" id="features">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-5xl md:text-7xl font-kanit font-bold text-center mb-16 text-outline animate-on-scroll opacity-0" id="feat-title" style={visibleSections['feat-title'] ? { animation: 'fade-in-up 0.8s forwards' } : {}}>
            <span className="inline-block">ทำไมต้อง</span> <span className="inline-block">Next Breath</span>
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass-card p-8 animate-on-scroll opacity-0" id="feat-1" style={visibleSections['feat-1'] ? { animation: 'fade-in-up 0.8s 0.1s forwards' } : {}}>
              <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-kanit font-bold mb-3"><span className="inline-block">ติดตาม</span><span className="inline-block">พฤติกรรม</span></h3>
              <p className="text-gray-400 leading-relaxed text-lg"><span className="inline-block">บันทึกจำนวนบุหรี่</span><span className="inline-block">ที่สูบในแต่ละวัน</span> <span className="inline-block">ดูสถิติและแนวโน้ม</span><span className="inline-block">การลดลงของคุณ</span></p>
            </div>
            
            <div className="glass-card p-8 animate-on-scroll opacity-0" id="feat-2" style={visibleSections['feat-2'] ? { animation: 'fade-in-up 0.8s 0.2s forwards' } : {}}>
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-kanit font-bold mb-3"><span className="inline-block">ช่วยเหลือ</span><span className="inline-block">เมื่อใจอ่อน</span></h3>
              <p className="text-gray-400 leading-relaxed text-lg"><span className="inline-block">ปุ่ม SOS</span> <span className="inline-block">เมื่อรู้สึกอยากสูบ</span> <span className="inline-block">พร้อมเทคนิคการหายใจ</span><span className="inline-block">และกิจกรรม</span><span className="inline-block">เบี่ยงเบนความสนใจ</span></p>
            </div>
            
            <div className="glass-card p-8 animate-on-scroll opacity-0" id="feat-3" style={visibleSections['feat-3'] ? { animation: 'fade-in-up 0.8s 0.3s forwards' } : {}}>
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-kanit font-bold mb-3"><span className="inline-block">เกมเสริม</span><span className="inline-block">กำลังใจ</span></h3>
              <p className="text-gray-400 leading-relaxed text-lg"><span className="inline-block">เล่นมินิเกมสนุก</span><span className="inline-block">เพื่อเบี่ยงเบนความสนใจ</span> <span className="inline-block">สะสม XP</span> <span className="inline-block">และปลดล็อครางวัล</span></p>
            </div>
            
            <div className="glass-card p-8 animate-on-scroll opacity-0" id="feat-4" style={visibleSections['feat-4'] ? { animation: 'fade-in-up 0.8s 0.4s forwards' } : {}}>
              <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-kanit font-bold mb-3"><span className="inline-block">ครอบครัว</span><span className="inline-block">ร่วมเชียร์</span></h3>
              <p className="text-gray-400 leading-relaxed text-lg"><span className="inline-block">ให้คนที่คุณรัก</span><span className="inline-block">ติดตามความก้าวหน้า</span> <span className="inline-block">ส่งกำลังใจ</span> <span className="inline-block">และร่วมเฉลิมฉลอง</span><span className="inline-block">ความสำเร็จ</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. How It Works Section */}
      <section className="py-24 bg-black overflow-hidden">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-prompt font-semibold text-center mb-20">
            <span className="inline-block">ใช้งานง่าย</span><span className="inline-block">ใน 3 ขั้นตอน</span>
          </h2>
          
          <div className="flex flex-col md:flex-row gap-8 justify-between relative">
            <div className="hidden md:block absolute top-12 left-0 right-0 h-1 bg-gradient-to-r from-teal-500/20 via-sky-500/20 to-emerald-500/20 -z-10"></div>
            
            <div className="flex-1 text-center animate-on-scroll opacity-0" id="step-1" style={visibleSections['step-1'] ? { animation: 'slide-in-left 0.8s 0.1s forwards' } : {}}>
              <div className="w-24 h-24 mx-auto bg-black border-2 border-teal-500 rounded-full flex items-center justify-center text-4xl font-kanit font-bold text-teal-400 mb-6 shadow-[0_0_30px_rgba(20,184,166,0.2)]">
                1
              </div>
              <h3 className="text-2xl font-kanit font-bold mb-3"><span className="inline-block">ทำแบบประเมิน</span></h3>
              <p className="text-gray-400 text-lg"><span className="inline-block">ตอบคำถามเพื่อให้ระบบ</span><span className="inline-block">วิเคราะห์ระดับ</span><span className="inline-block">การติดนิโคตินของคุณ</span></p>
            </div>
            
            <div className="flex-1 text-center animate-on-scroll opacity-0" id="step-2" style={visibleSections['step-2'] ? { animation: 'slide-in-left 0.8s 0.3s forwards' } : {}}>
              <div className="w-24 h-24 mx-auto bg-black border-2 border-sky-500 rounded-full flex items-center justify-center text-4xl font-kanit font-bold text-sky-400 mb-6 shadow-[0_0_30px_rgba(14,165,233,0.2)]">
                2
              </div>
              <h3 className="text-2xl font-kanit font-bold mb-3"><span className="inline-block">บันทึกทุกวัน</span></h3>
              <p className="text-gray-400 text-lg"><span className="inline-block">บันทึกจำนวนบุหรี่</span><span className="inline-block">ที่สูบ</span> <span className="inline-block">ดูสตรีคและเงิน</span><span className="inline-block">ที่ประหยัดได้</span></p>
            </div>
            
            <div className="flex-1 text-center animate-on-scroll opacity-0" id="step-3" style={visibleSections['step-3'] ? { animation: 'slide-in-left 0.8s 0.5s forwards' } : {}}>
              <div className="w-24 h-24 mx-auto bg-black border-2 border-emerald-500 rounded-full flex items-center justify-center text-4xl font-kanit font-bold text-emerald-400 mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                3
              </div>
              <h3 className="text-2xl font-kanit font-bold mb-3"><span className="inline-block">รับกำลังใจ</span></h3>
              <p className="text-gray-400 text-lg"><span className="inline-block">เล่นเกม สะสม XP</span> <span className="inline-block">ได้รับเหรียญตรา</span> <span className="inline-block">และกำลังใจจากครอบครัว</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/40 to-black z-0"></div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-5xl md:text-6xl font-kanit font-bold text-white mb-6 text-glow">
            <span className="inline-block">พร้อมเริ่มต้น</span><span className="inline-block">หรือยัง</span>
          </h2>
          <p className="text-xl text-gray-300 mb-10 font-prompt">
            <span className="inline-block">เริ่มต้นเลิกบุหรี่วันนี้</span> <span className="inline-block">ฟรี ไม่มีค่าใช้จ่าย</span>
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <a 
              href="https://app-ciga-next9.yumistack.net/login?openExternalBrowser=1"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-white text-black hover:bg-gray-200 transition-all font-kanit font-bold text-lg text-center"
            >
              <span className="inline-block">เริ่มต้นเลย</span>
            </a>
            <a 
              href="https://lin.ee/xwrSHNg"
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#00B900] text-white hover:bg-[#009900] transition-all font-kanit font-bold text-lg text-center flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.057.592.122.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.572-4.172 2.572-6.002v.01zm-15.011 2.378h-3.327c-.439 0-.796-.356-.796-.796v-3.327c0-.439.357-.796.796-.796s.796.357.796.796v2.531h2.531c.439 0 .796.356.796.796s-.357.796-.796.796zm3.327 0h-1.591c-.439 0-.796-.356-.796-.796v-3.327c0-.439.357-.796.796-.796s.796.357.796.796v3.327c0 .439-.357.796-.796.796zm7.251-1.591h-2.531v-.94h2.531c.439 0 .796-.356.796-.796s-.357-.796-.796-.796h-2.531v-.94h2.531c.439 0 .796-.356.796-.796s-.357-.796-.796-.796h-3.327c-.439 0-.796.356-.796.796v3.327c0 .439.357.796.796.796h3.327c.439 0 .796-.356.796-.796s-.357-.796-.796-.796z"/>
              </svg>
              <span className="inline-block">คุยกับเจ้าหน้าที่</span>
            </a>
          </div>
          <p className="text-gray-500 font-prompt">
            <span className="inline-block">หรือโทร</span> <span className="inline-block">สายด่วนเลิกบุหรี่ 1600</span>
          </p>
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="py-8 border-t border-white/10 text-center font-prompt bg-black">
        <div className="text-xl font-kanit font-black mb-2">Next Breath</div>
        <div className="text-gray-500 text-sm mb-4"><span className="inline-block">สายด่วนเลิกบุหรี่</span> <span className="inline-block">1600</span></div>
        <div className="text-gray-600 text-xs">
          &copy; {new Date().getFullYear()} Next Breath. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
