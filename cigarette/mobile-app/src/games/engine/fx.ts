// Maths, easing, colour and drawing helpers, and a particle system shared by the games.

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
};

/** Seeded random numbers (mulberry32), so backgrounds look the same on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Lighten (amt > 0) or darken (amt < 0) a colour; amt in -1..1. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** An offscreen canvas at device resolution. Draw once, then blit with drawImage. */
export function makeSprite(
  w: number,
  h: number,
  dpr: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  draw(ctx);
  return c;
}

/** Soft radial glow. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.35, rgba(color, alpha * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

export function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.55) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.8);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  hue: number;
}

export function makeStars(count: number, seed: number): Star[] {
  const rand = rng(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const big = rand() < 0.08;
    stars.push({
      x: rand(),
      y: rand(),
      r: big ? 1.1 + rand() * 1.1 : 0.35 + rand() * 0.75,
      phase: rand() * TAU,
      speed: 0.6 + rand() * 1.8,
      hue: rand() < 0.2 ? 210 : rand() < 0.3 ? 40 : 0,
    });
  }
  return stars;
}

export function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], w: number, h: number, time: number, maxY = 1) {
  for (const s of stars) {
    if (s.y > maxY) continue;
    const tw = 0.55 + 0.45 * Math.sin(time * s.speed + s.phase);
    const a = tw * (s.r > 1 ? 0.95 : 0.7);
    ctx.fillStyle = s.hue ? `hsla(${s.hue},80%,85%,${a})` : `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, TAU);
    ctx.fill();
    if (s.r > 1.2) {
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.35})`;
      ctx.lineWidth = 0.6;
      const L = s.r * 4 * tw;
      ctx.beginPath();
      ctx.moveTo(s.x * w - L, s.y * h);
      ctx.lineTo(s.x * w + L, s.y * h);
      ctx.moveTo(s.x * w, s.y * h - L);
      ctx.lineTo(s.x * w, s.y * h + L);
      ctx.stroke();
    }
  }
}

// ── Particles ───────────────────────────────────────────────────────────────

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  kind: "dot" | "spark" | "shard" | "ring";
  rot: number;
  vr: number;
}

export class Particles {
  list: Particle[] = [];
  limit = 600;

  burst(
    x: number,
    y: number,
    color: string,
    n: number,
    o: { speed?: number; size?: number; life?: number; gravity?: number; kind?: Particle["kind"]; spread?: number; angle?: number } = {}
  ) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.limit) this.list.shift();
      const spread = o.spread ?? TAU;
      const a = (o.angle ?? 0) + (Math.random() - 0.5) * spread;
      const sp = (o.speed ?? 160) * (0.35 + Math.random() * 0.85);
      const life = (o.life ?? 0.8) * (0.6 + Math.random() * 0.6);
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        max: life,
        size: (o.size ?? 3) * (0.5 + Math.random()),
        color,
        gravity: o.gravity ?? 220,
        drag: 0.9,
        kind: o.kind ?? "dot",
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 40, life = 0.5) {
    this.list.push({ x, y, vx: 0, vy: 0, life, max: life, size, color, gravity: 0, drag: 1, kind: "ring", rot: 0, vr: 0 });
  }

  update(dt: number) {
    const keep: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy = p.vy * d + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      keep.push(p);
    }
    this.list = keep;
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.list) {
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      if (p.kind === "ring") {
        const k = 1 - t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + k), 0, TAU);
        ctx.stroke();
      } else if (p.kind === "spark") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else if (p.kind === "shard") {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * (0.5 + t * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.7, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ── Floating text ("+300", "สุดยอด!") ────────────────────────────────────────

interface Floater {
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export class Floaters {
  list: Floater[] = [];
  add(text: string, x: number, y: number, color = "#ffffff", size = 22, life = 1.1) {
    this.list.push({ text, x, y, life, max: life, color, size });
  }
  update(dt: number) {
    for (const f of this.list) {
      f.life -= dt;
      f.y -= 38 * dt;
    }
    this.list = this.list.filter((f) => f.life > 0);
  }
  render(ctx: CanvasRenderingContext2D) {
    for (const f of this.list) {
      const t = f.life / f.max;
      const pop = t > 0.85 ? ease.outBack((1 - t) / 0.15) : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 2.2);
      ctx.translate(f.x, f.y);
      ctx.scale(pop, pop);
      ctx.font = `700 ${f.size}px ${FONT_DISPLAY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(10,12,40,0.55)";
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }
}

export const FONT_DISPLAY = `"Prompt","Kanit","Sarabun","Noto Sans Thai","Leelawadee UI",Tahoma,sans-serif`;
export const FONT_BODY = `"Sarabun","Prompt","Noto Sans Thai","Leelawadee UI",Tahoma,sans-serif`;
