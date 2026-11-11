"use client";

import { useEffect, useState } from "react";

// The home banner: slides every 4 seconds, pauses while the pointer is on it, swipeable on phones.
// The pictures come from settings (admin → หน้าแรก).
export function HeroSlider({ slides: SLIDES }: { slides: { src: string; alt: string }[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    if (paused || SLIDES.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % SLIDES.length), 4000);
    return () => clearInterval(t);
  }, [paused, SLIDES.length]);

  const go = (d: number) => setI((n) => (n + d + SLIDES.length) % SLIDES.length);

  return (
    <div
      className="s-slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        setTouchX(null);
      }}
    >
      <div className="s-slider-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {SLIDES.map((s, n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s.src} src={s.src} alt={s.alt} loading={n === 0 ? "eager" : "lazy"} />
        ))}
      </div>
      <button type="button" className="s-slider-arrow is-prev" onClick={() => go(-1)} aria-label="ภาพก่อนหน้า">
        <i className="fas fa-chevron-left" aria-hidden />
      </button>
      <button type="button" className="s-slider-arrow is-next" onClick={() => go(1)} aria-label="ภาพถัดไป">
        <i className="fas fa-chevron-right" aria-hidden />
      </button>
      <div className="s-slider-dots">
        {SLIDES.map((s, n) => (
          <button key={s.src} type="button" className={n === i ? "is-on" : undefined} onClick={() => setI(n)} aria-label={`ภาพที่ ${n + 1}`} />
        ))}
      </div>
    </div>
  );
}
