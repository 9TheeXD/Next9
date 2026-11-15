// Procedural art for "ปกป้องต้นไม้": seasonal meadows, the growing tree, towers, smog monsters,
// fences and weather. Everything is drawn with paths and gradients, no images.

import { TAU, clamp, glow, rgba, shade, roundRectPath, rng, lerp } from "../engine/fx";
import { TOWERS, type EnemyKind, type Season, type TowerKind, type Pt } from "./data";

// ── Seasons ───────────────────────────────────────────────────────────────

export interface SeasonLook {
  bg: [string, string, string];
  grass: [number, number, number];
  dots: string[];
  edge: string;
  path: string;
  pathHi: string;
  pebble: [number, number, number];
  padHi: string;
  padLo: string;
  canopy: string[];
  hud: string;
}

export const LOOK: Record<Season, SeasonLook> = {
  spring: {
    bg: ["#1d3b2a", "#24492f", "#2c5a35"], grass: [130, 205, 120], dots: ["#fde68a", "#fbcfe8", "#ffffff", "#c4b5fd"],
    edge: "#3b2f22", path: "#a88a62", pathHi: "#c2a57a", pebble: [90, 70, 50], padHi: "#9ca3af", padLo: "#4b5563",
    canopy: ["#22c55e", "#4ade80", "#16a34a"], hud: "rgba(10,20,14,0.62)",
  },
  rainy: {
    bg: ["#10272a", "#153331", "#1a3e38"], grass: [90, 175, 150], dots: ["#7dd3fc", "#a5f3fc", "#e0f2fe"],
    edge: "#231d16", path: "#76634a", pathHi: "#8c785a", pebble: [60, 52, 42], padHi: "#94a3b8", padLo: "#334155",
    canopy: ["#15803d", "#16a34a", "#166534"], hud: "rgba(8,18,24,0.66)",
  },
  autumn: {
    bg: ["#33220f", "#432d14", "#523818"], grass: [215, 160, 80], dots: ["#f97316", "#dc2626", "#facc15", "#b45309"],
    edge: "#2a1c10", path: "#b08a57", pathHi: "#cfa86f", pebble: [110, 80, 45], padHi: "#a8a29e", padLo: "#57534e",
    canopy: ["#f97316", "#ea580c", "#facc15", "#dc2626"], hud: "rgba(30,16,6,0.62)",
  },
  winter: {
    bg: ["#9fb3c8", "#bccbdb", "#d6e1ec"], grass: [255, 255, 255], dots: ["#ffffff", "#e0f2fe"],
    edge: "#5b6b7d", path: "#93a3b4", pathHi: "#b4c1ce", pebble: [90, 105, 125], padHi: "#e5e7eb", padLo: "#64748b",
    canopy: ["#2f6b4f", "#3f7f5f", "#285c44"], hud: "rgba(16,26,44,0.66)",
  },
};

export interface Geo {
  ox: number;
  oy: number;
  cell: number;
}
const P = (g: Geo, x: number, y: number) => ({ x: g.ox + x * g.cell, y: g.oy + y * g.cell });

/** Meadow, trail and stone pads for one map in one season. */
export function drawGround(c: CanvasRenderingContext2D, w: number, h: number, g: Geo, routes: Pt[][], pads: Pt[], season: Season, seed: number) {
  const L = LOOK[season];
  const r = rng(seed);
  const cell = g.cell;
  const bg = c.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, L.bg[0]);
  bg.addColorStop(0.5, L.bg[1]);
  bg.addColorStop(1, L.bg[2]);
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);

  // Ground texture per season
  const [gr, gg, gb] = L.grass;
  if (season === "winter") {
    for (let i = 0; i < (w * h) / 2600; i++) {
      const x = r() * w;
      const y = r() * h;
      const rr = 8 + r() * 26;
      const sg = c.createRadialGradient(x, y - rr * 0.3, 0, x, y, rr);
      sg.addColorStop(0, "rgba(255,255,255,0.55)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = sg;
      c.beginPath();
      c.ellipse(x, y, rr * 1.4, rr * 0.6, 0, 0, TAU);
      c.fill();
    }
    for (let i = 0; i < (w * h) / 3800; i++) {
      const x = r() * w;
      const y = r() * h;
      c.strokeStyle = `rgba(70,60,55,${0.35 + r() * 0.3})`;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 6, y - 5 - r() * 5);
      c.moveTo(x + 1, y - 4);
      c.lineTo(x + 4, y - 7);
      c.stroke();
    }
  } else {
    for (let i = 0; i < (w * h) / 260; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 2 + r() * 4;
      c.strokeStyle = `rgba(${gr - 10 + r() * 50},${gg - 10 + r() * 50},${gb - 10 + r() * 40},${0.16 + r() * 0.2})`;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - s * 0.4, y - s);
      c.moveTo(x, y);
      c.lineTo(x + s * 0.3, y - s * 1.1);
      c.stroke();
    }
  }
  if (season === "rainy") {
    for (let i = 0; i < (w * h) / 9000; i++) {
      const x = r() * w;
      const y = h * 0.15 + r() * h * 0.85;
      const rw = 10 + r() * 22;
      c.fillStyle = "rgba(20,50,70,0.55)";
      c.beginPath();
      c.ellipse(x, y, rw, rw * 0.38, 0, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(165,243,252,0.25)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(x - rw * 0.15, y - rw * 0.08, rw * 0.6, rw * 0.18, 0, Math.PI * 1.1, Math.PI * 1.8);
      c.stroke();
    }
  }
  if (season === "spring" || season === "rainy") {
    for (let i = 0; i < (w * h) / 5200; i++) {
      const x = r() * w;
      const y = h * 0.15 + r() * h * 0.85;
      c.fillStyle = L.dots[Math.floor(r() * L.dots.length)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        c.beginPath();
        c.arc(x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.6, 0, TAU);
        c.fill();
      }
      c.fillStyle = "#f59e0b";
      c.beginPath();
      c.arc(x, y, 1.3, 0, TAU);
      c.fill();
    }
  }
  if (season === "autumn") {
    for (let i = 0; i < (w * h) / 1500; i++) {
      const x = r() * w;
      const y = r() * h;
      fallenLeaf(c, x, y, 3 + r() * 3, r() * TAU, L.dots[Math.floor(r() * L.dots.length)], 0.55 + r() * 0.35);
    }
  }

  // Trail: dark edge, fill, centre, pebbles
  const trace = (pts: Pt[]) => {
    c.beginPath();
    pts.forEach(([x, y], i) => {
      const p = P(g, x, y);
      if (i) c.lineTo(p.x, p.y);
      else c.moveTo(p.x, p.y);
    });
  };
  c.lineJoin = "round";
  c.lineCap = "round";
  for (const [col, wd] of [[L.edge, 0.98], [L.path, 0.82], [L.pathHi, 0.5]] as [string, number][]) {
    for (const rt of routes) {
      trace(rt);
      c.strokeStyle = col;
      c.lineWidth = cell * wd;
      c.stroke();
    }
  }
  for (const rt of routes) {
    for (let i = 1; i < rt.length; i++) {
      const a = P(g, rt[i - 1][0], rt[i - 1][1]);
      const b = P(g, rt[i][0], rt[i][1]);
      const n = Math.hypot(b.x - a.x, b.y - a.y) / 6;
      for (let k = 0; k < n; k++) {
        const t = r();
        const [pr, pg, pb] = L.pebble;
        c.fillStyle = season === "winter" ? `rgba(255,255,255,${0.35 + r() * 0.4})` : `rgba(${pr + r() * 40},${pg + r() * 30},${pb + r() * 20},0.55)`;
        c.beginPath();
        c.ellipse(lerp(a.x, b.x, t) + (r() - 0.5) * cell * 0.65, lerp(a.y, b.y, t) + (r() - 0.5) * cell * 0.65, 1 + r() * 2.5, 1 + r() * 1.8, r() * 3, 0, TAU);
        c.fill();
      }
    }
  }
  // Smog pouring in at each entrance
  for (const rt of routes) {
    const e = P(g, clamp(rt[0][0], -0.2, 9.2), clamp(rt[0][1], -0.4, 15));
    const sg = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, cell * 2.4);
    sg.addColorStop(0, "rgba(70,66,82,0.85)");
    sg.addColorStop(0.5, "rgba(80,76,92,0.4)");
    sg.addColorStop(1, "rgba(80,76,92,0)");
    c.fillStyle = sg;
    c.beginPath();
    c.arc(e.x, e.y, cell * 2.4, 0, TAU);
    c.fill();
  }
  // Stone pads
  for (const [gx, gy] of pads) {
    const p = P(g, gx, gy);
    const pr = cell * 0.46;
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.ellipse(p.x, p.y + pr * 0.25, pr * 1.05, pr * 0.8, 0, 0, TAU);
    c.fill();
    const sg = c.createLinearGradient(0, p.y - pr, 0, p.y + pr);
    sg.addColorStop(0, L.padHi);
    sg.addColorStop(1, L.padLo);
    c.fillStyle = sg;
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.2;
      const rr = pr * (0.92 + ((k * 37) % 7) / 60);
      const x = p.x + Math.cos(a) * rr;
      const y = p.y + Math.sin(a) * rr * 0.8;
      if (k) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.2)";
    c.lineWidth = 1.5;
    c.stroke();
    if (season === "winter") {
      c.fillStyle = "rgba(255,255,255,0.85)";
      c.beginPath();
      c.ellipse(p.x - pr * 0.1, p.y - pr * 0.5, pr * 0.6, pr * 0.2, -0.1, 0, TAU);
      c.fill();
    }
  }
}

function fallenLeaf(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, col: string, a = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.globalAlpha *= a;
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(-s, 0);
  c.quadraticCurveTo(0, -s * 0.75, s, 0);
  c.quadraticCurveTo(0, s * 0.75, -s, 0);
  c.fill();
  c.strokeStyle = "rgba(60,30,10,0.45)";
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(-s, 0);
  c.lineTo(s, 0);
  c.stroke();
  c.restore();
}

// ── Weather ───────────────────────────────────────────────────────────────

interface Flake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  s: number;
  ph: number;
  col: string;
  life: number;
}

export class Weather {
  list: Flake[] = [];
  splashes: { x: number; y: number; t: number }[] = [];
  constructor(public season: Season) {}

  update(dt: number, w: number, h: number, reduced: boolean) {
    const want = reduced ? 0 : { spring: 22, rainy: 70, autumn: 18, winter: 55 }[this.season];
    while (this.list.length < want) this.list.push(this.make(w, h, true));
    if (this.list.length > want) this.list.length = want;
    for (const f of this.list) {
      f.ph += dt;
      f.x += (f.vx + (this.season === "rainy" ? 0 : Math.sin(f.ph * 1.6) * 18)) * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      f.life -= dt;
      if (f.y > h + 20 || f.x > w + 30 || f.x < -30 || f.life <= 0) {
        if (this.season === "rainy" && f.y > 0 && f.life <= 0) this.splashes.push({ x: f.x, y: f.y, t: 0 });
        Object.assign(f, this.make(w, h, false));
      }
    }
    for (const s of this.splashes) s.t += dt * 3;
    this.splashes = this.splashes.filter((s) => s.t < 1);
  }

  private make(w: number, h: number, anywhere: boolean): Flake {
    const s = this.season;
    const r = Math.random;
    const base: Flake = { x: r() * w, y: anywhere ? r() * h : -20, vx: 0, vy: 0, rot: r() * TAU, vr: 0, s: 1, ph: r() * 10, col: "#fff", life: 99 };
    if (s === "spring") return { ...base, vx: 14 + r() * 14, vy: 22 + r() * 20, vr: (r() - 0.5) * 3, s: 2.5 + r() * 2, col: ["#fbcfe8", "#f9a8d4", "#fff1f2"][Math.floor(r() * 3)] };
    if (s === "rainy") return { ...base, x: r() * (w + 100) - 60, vx: 90, vy: 520 + r() * 160, s: 9 + r() * 8, life: anywhere ? r() * 1.4 : 0.4 + r() * 1.4 };
    if (s === "autumn") return { ...base, vx: 10 + r() * 16, vy: 30 + r() * 26, vr: (r() - 0.5) * 4, s: 3.5 + r() * 2.5, col: LOOK.autumn.dots[Math.floor(r() * 4)] };
    return { ...base, vx: 6, vy: 18 + r() * 26, s: 1.2 + r() * 2.2 };
  }

  render(c: CanvasRenderingContext2D) {
    c.save();
    for (const f of this.list) {
      if (this.season === "rainy") {
        c.strokeStyle = "rgba(191,219,254,0.42)";
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(f.x, f.y);
        c.lineTo(f.x - f.vx * 0.025, f.y - f.s * 1.6);
        c.stroke();
      } else if (this.season === "winter") {
        c.fillStyle = "rgba(255,255,255,0.9)";
        c.beginPath();
        c.arc(f.x, f.y, f.s, 0, TAU);
        c.fill();
      } else if (this.season === "spring") {
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.rot);
        c.scale(1, 0.55 + 0.45 * Math.sin(f.ph * 3));
        c.fillStyle = f.col;
        c.globalAlpha = 0.85;
        c.beginPath();
        c.ellipse(0, 0, f.s, f.s * 0.6, 0, 0, TAU);
        c.fill();
        c.restore();
      } else fallenLeaf(c, f.x, f.y, f.s, f.rot, f.col, 0.9);
    }
    for (const s of this.splashes) {
      c.strokeStyle = `rgba(191,219,254,${0.4 * (1 - s.t)})`;
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(s.x, s.y, 2 + s.t * 7, 1 + s.t * 2.5, 0, 0, TAU);
      c.stroke();
    }
    c.restore();
  }
}

// ── Tree ──────────────────────────────────────────────────────────────────

const BLOBS: [number, number, number][] = [
  [0, -1.0, 0.62], [-0.5, -0.75, 0.45], [0.5, -0.75, 0.45], [-0.3, -1.3, 0.42], [0.32, -1.28, 0.4], [0, -0.55, 0.4],
];
const BIG_BLOBS: [number, number, number][] = [
  ...BLOBS, [-0.82, -1.05, 0.38], [0.84, -1.02, 0.38], [0, -1.62, 0.44], [-0.62, -1.48, 0.34], [0.62, -1.5, 0.34],
];

function mix(a: string, b: string, t: number) {
  const pa = shade(a, 0).match(/\d+/g)!.map(Number);
  const pb = shade(b, 0).match(/\d+/g)!.map(Number);
  return "#" + pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, "0")).join("");
}

/** The Tree of Breath at grid base (x, y), size s = one cell. tier 0..4 grows from seedling to giant. */
export function drawTree(c: CanvasRenderingContext2D, x: number, y: number, s: number, tier: number, season: Season, health: number, time: number) {
  const L = LOOK[season];
  const sick = clamp(1 - health, 0, 1) * 0.75;
  const leafCol = (i: number) => mix(L.canopy[i % L.canopy.length], "#9a9a82", sick);
  c.save();
  c.translate(x, y);
  glow(c, 0, -s * (0.4 + tier * 0.25), s * (1.1 + tier * 0.45), season === "autumn" ? "#fdba74" : "#86efac", 0.22 + 0.08 * Math.sin(time * 2));
  // Soil mound
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(0, s * 0.42, s * (0.55 + tier * 0.18), s * 0.18, 0, 0, TAU);
  c.fill();
  const soil = c.createRadialGradient(0, s * 0.3, 0, 0, s * 0.35, s * 0.6);
  soil.addColorStop(0, season === "winter" ? "#f1f5f9" : "#7c5a3a");
  soil.addColorStop(1, season === "winter" ? "#cbd5e1" : "#4a3420");
  c.fillStyle = soil;
  c.beginPath();
  c.ellipse(0, s * 0.36, s * (0.45 + tier * 0.12), s * 0.15, 0, 0, TAU);
  c.fill();
  const sway = Math.sin(time * 1.4) * 0.04;

  if (tier === 0) {
    // Seedling: a short curved stem with two broad seed leaves and a new pair opening at the tip
    c.scale(1.35, 1.35);
    c.strokeStyle = mix("#4d7c0f", "#78716c", sick);
    c.lineWidth = s * 0.09;
    c.lineCap = "round";
    const tip = { x: sway * s * 3, y: -s * 0.55 };
    c.beginPath();
    c.moveTo(0, s * 0.3);
    c.quadraticCurveTo(-s * 0.12, -s * 0.1, tip.x, tip.y);
    c.stroke();
    const leaf = (x: number, y: number, ang: number, len: number, wid: number, col: string) => {
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      const lg = c.createLinearGradient(0, 0, len, 0);
      lg.addColorStop(0, shade(col, -0.25));
      lg.addColorStop(1, shade(col, 0.3));
      c.fillStyle = lg;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(len * 0.45, -wid, len, 0);
      c.quadraticCurveTo(len * 0.45, wid, 0, 0);
      c.fill();
      c.strokeStyle = "rgba(20,83,45,0.5)";
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(len * 0.85, 0);
      c.stroke();
      c.restore();
    };
    const wig = Math.sin(time * 2) * 0.06;
    leaf(-s * 0.03, -s * 0.12, Math.PI + 0.45 + wig, s * 0.42, s * 0.2, leafCol(0));
    leaf(s * 0.0, -s * 0.12, -0.45 - wig, s * 0.42, s * 0.2, leafCol(0));
    leaf(tip.x, tip.y, Math.PI + 0.9 - wig, s * 0.26, s * 0.12, leafCol(1));
    leaf(tip.x, tip.y, -0.9 + wig, s * 0.26, s * 0.12, leafCol(1));
    if (season === "winter") {
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.beginPath();
      c.ellipse(-s * 0.25, -s * 0.28, s * 0.12, s * 0.05, 0.4, 0, TAU);
      c.ellipse(s * 0.25, -s * 0.28, s * 0.12, s * 0.05, -0.4, 0, TAU);
      c.fill();
    }
    c.restore();
    return;
  }

  const k = [0, 0.62, 1, 1.22, 1.45][tier];
  // Roots for the big trees
  if (tier >= 3) {
    c.strokeStyle = "#5b3a1e";
    c.lineCap = "round";
    for (const sx of [-1, 1]) {
      c.lineWidth = s * 0.1 * k;
      c.beginPath();
      c.moveTo(sx * s * 0.08, s * 0.25);
      c.quadraticCurveTo(sx * s * 0.35 * k, s * 0.28, sx * s * 0.55 * k, s * 0.42);
      c.stroke();
    }
  }
  // Trunk
  const tw = s * (0.12 + 0.05 * tier) * (tier === 1 ? 0.6 : 1);
  const th = s * (0.45 + 0.5 * k);
  const tg = c.createLinearGradient(-tw, 0, tw, 0);
  tg.addColorStop(0, "#4a2f17");
  tg.addColorStop(0.5, "#7a4f2a");
  tg.addColorStop(1, "#4a2f17");
  c.fillStyle = tg;
  c.beginPath();
  c.moveTo(-tw * 1.4, s * 0.4);
  c.quadraticCurveTo(-tw * 0.7, -th * 0.3, -tw * 0.8, -th);
  c.lineTo(tw * 0.8, -th);
  c.quadraticCurveTo(tw * 0.7, -th * 0.3, tw * 1.5, s * 0.4);
  c.closePath();
  c.fill();
  // Canopy
  const blobs = tier >= 3 ? BIG_BLOBS : BLOBS;
  const ys = tier === 1 ? 0.75 : 1;
  blobs.forEach(([bx, by, br], i) => {
    const px = (bx + sway * by) * s * k;
    const py = by * s * k * ys - s * 0.05;
    const rr = br * s * k;
    const g = c.createRadialGradient(px - rr * 0.3, py - rr * 0.35, 0, px, py, rr);
    const col = season === "autumn" ? leafCol(i) : leafCol(0);
    g.addColorStop(0, shade(col, 0.35));
    g.addColorStop(1, shade(col, -0.25));
    c.fillStyle = g;
    c.beginPath();
    c.arc(px, py, rr, 0, TAU);
    c.fill();
    if (season === "winter") {
      c.fillStyle = "rgba(255,255,255,0.88)";
      c.beginPath();
      c.ellipse(px, py - rr * 0.55, rr * 0.75, rr * 0.38, 0, Math.PI, TAU);
      c.fill();
    }
  });
  // Blossoms, fruit and raindrops
  const r = rng(77 + tier);
  const nDots = tier * 4;
  for (let i = 0; i < nDots; i++) {
    const b = blobs[Math.floor(r() * blobs.length)];
    const a = r() * TAU;
    const d = r() * b[2] * 0.8;
    const px = (b[0] + Math.cos(a) * d + sway * b[1]) * s * k;
    const py = (b[1] + Math.sin(a) * d) * s * k * ys - s * 0.05;
    if (season === "spring") {
      c.fillStyle = i % 2 ? "#fbcfe8" : "#fff1f2";
      for (let q = 0; q < 5; q++) {
        const qa = (q / 5) * TAU;
        c.beginPath();
        c.arc(px + Math.cos(qa) * s * 0.035, py + Math.sin(qa) * s * 0.035, s * 0.03, 0, TAU);
        c.fill();
      }
    } else if (season === "rainy") {
      c.fillStyle = "rgba(186,230,253,0.85)";
      c.beginPath();
      c.ellipse(px, py, s * 0.025, s * 0.04, 0, 0, TAU);
      c.fill();
    } else if (season === "autumn" && tier >= 3) {
      c.fillStyle = "#b91c1c";
      c.beginPath();
      c.arc(px, py, s * 0.05, 0, TAU);
      c.fill();
    }
  }
  if (tier >= 4) {
    for (let i = 0; i < 6; i++) {
      const a = time * 0.6 + (i / 6) * TAU;
      glow(c, Math.cos(a) * s * 1.2, -s * 1.3 + Math.sin(a * 1.3) * s * 0.4, s * 0.18, "#fef9c3", 0.6);
    }
  }
  c.restore();
}

// ── Towers ────────────────────────────────────────────────────────────────

/** Tower art centred on its pad at (x, y); s is about half a cell. */
export function drawTower(c: CanvasRenderingContext2D, kind: TowerKind, lvl: number, x: number, y: number, s: number, aim: number, time: number, flash: number, seed = 0) {
  const col = TOWERS[kind].color;
  c.save();
  c.translate(x, y - s * 0.25);
  if (flash > 0) glow(c, 0, 0, s * 1.8, col, flash * 0.6);
  switch (kind) {
    case "leaf": {
      c.fillStyle = "#7c5a3a";
      roundRectPath(c, -s * 0.35, -s * 0.2, s * 0.7, s * 0.85, s * 0.15);
      c.fill();
      c.rotate(aim);
      c.fillStyle = shade(col, -0.2);
      c.beginPath();
      c.ellipse(s * 0.25, 0, s * 0.75, s * 0.32, 0, 0, TAU);
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(s * 0.25, -s * 0.06, s * 0.65, s * 0.22, 0, 0, TAU);
      c.fill();
      c.strokeStyle = shade(col, -0.45);
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-s * 0.4, 0);
      c.lineTo(s * 0.9, 0);
      c.stroke();
      break;
    }
    case "fan": {
      c.fillStyle = "#e2e8f0";
      roundRectPath(c, -s * 0.12, -s * 0.1, s * 0.24, s * 0.8, s * 0.1);
      c.fill();
      c.rotate(time * (4 + lvl));
      for (let k = 0; k < 4; k++) {
        c.rotate(TAU / 4);
        const g = c.createLinearGradient(0, 0, s * 0.85, 0);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(1, col);
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(s * 0.5, -s * 0.45, s * 0.9, -s * 0.1);
        c.quadraticCurveTo(s * 0.5, s * 0.1, 0, 0);
        c.fill();
      }
      c.fillStyle = "#475569";
      c.beginPath();
      c.arc(0, 0, s * 0.16, 0, TAU);
      c.fill();
      break;
    }
    case "lens": {
      c.fillStyle = "#92400e";
      c.beginPath();
      c.moveTo(-s * 0.45, s * 0.65);
      c.lineTo(0, -s * 0.1);
      c.lineTo(s * 0.45, s * 0.65);
      c.closePath();
      c.fill();
      c.rotate(aim);
      const g = c.createRadialGradient(-s * 0.15, -s * 0.15, 0, 0, 0, s * 0.6);
      g.addColorStop(0, "#fffbeb");
      g.addColorStop(0.5, col);
      g.addColorStop(1, "#b45309");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, 0, s * 0.3, s * 0.6, 0, 0, TAU);
      c.fill();
      c.strokeStyle = "#78350f";
      c.lineWidth = 2.5;
      c.stroke();
      break;
    }
    case "cloud": {
      const bob = Math.sin(time * 2 + seed) * s * 0.1;
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.beginPath();
      c.ellipse(0, s * 0.55, s * 0.6, s * 0.18, 0, 0, TAU);
      c.fill();
      const puffs: [number, number, number][] = [[-0.4, 0, 0.36], [0.4, 0, 0.36], [0, -0.2, 0.48], [0, 0.1, 0.4]];
      for (const [bx, by, br] of puffs) {
        const g = c.createRadialGradient(bx * s - br * s * 0.3, by * s + bob - br * s * 0.4, 0, bx * s, by * s + bob, br * s);
        g.addColorStop(0, "#f5f3ff");
        g.addColorStop(1, col);
        c.fillStyle = g;
        c.beginPath();
        c.arc(bx * s, by * s + bob, br * s, 0, TAU);
        c.fill();
      }
      break;
    }
    case "frost": {
      // Hexagonal plinth and a floating ice crystal
      c.fillStyle = "#475569";
      c.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const px = Math.cos(a) * s * 0.5;
        const py = s * 0.5 + Math.sin(a) * s * 0.2;
        if (k) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
      c.fill();
      const fy = -s * 0.15 + Math.sin(time * 2 + seed) * s * 0.08;
      glow(c, 0, fy, s * 1.1, "#bfdbfe", 0.45);
      c.save();
      c.translate(0, fy);
      const cg = c.createLinearGradient(-s * 0.3, -s * 0.6, s * 0.3, s * 0.4);
      cg.addColorStop(0, "#ffffff");
      cg.addColorStop(0.5, col);
      cg.addColorStop(1, "#3b82f6");
      c.fillStyle = cg;
      c.beginPath();
      c.moveTo(0, -s * 0.7);
      c.lineTo(s * 0.28, -s * 0.1);
      c.lineTo(0, s * 0.4);
      c.lineTo(-s * 0.28, -s * 0.1);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.8)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(0, -s * 0.7);
      c.lineTo(0, s * 0.4);
      c.stroke();
      // Orbiting flakes
      for (let k = 0; k < 3; k++) {
        const a = time * 1.5 + (k / 3) * TAU;
        const fx = Math.cos(a) * s * 0.6;
        const fy2 = Math.sin(a) * s * 0.22;
        c.strokeStyle = "rgba(255,255,255,0.9)";
        c.lineWidth = 1;
        for (let q = 0; q < 3; q++) {
          const qa = (q / 3) * Math.PI + time;
          c.beginPath();
          c.moveTo(fx - Math.cos(qa) * s * 0.09, fy2 - Math.sin(qa) * s * 0.09);
          c.lineTo(fx + Math.cos(qa) * s * 0.09, fy2 + Math.sin(qa) * s * 0.09);
          c.stroke();
        }
      }
      c.restore();
      break;
    }
    case "poison": {
      // Toadstool: pale stem, lime cap with spots; squashes when it fires
      const sq = 1 + flash * 0.18;
      c.fillStyle = "#e7e5d8";
      c.beginPath();
      c.moveTo(-s * 0.18, s * 0.62);
      c.quadraticCurveTo(-s * 0.12, s * 0.1, -s * 0.12, -s * 0.05);
      c.lineTo(s * 0.12, -s * 0.05);
      c.quadraticCurveTo(s * 0.12, s * 0.1, s * 0.2, s * 0.62);
      c.closePath();
      c.fill();
      c.save();
      c.scale(sq, 1 / sq);
      const mg = c.createRadialGradient(-s * 0.2, -s * 0.45, 0, 0, -s * 0.15, s * 0.75);
      mg.addColorStop(0, "#ecfccb");
      mg.addColorStop(0.45, col);
      mg.addColorStop(1, "#3f6212");
      c.fillStyle = mg;
      c.beginPath();
      c.moveTo(-s * 0.7, -s * 0.02);
      c.quadraticCurveTo(-s * 0.68, -s * 0.72, 0, -s * 0.74);
      c.quadraticCurveTo(s * 0.68, -s * 0.72, s * 0.7, -s * 0.02);
      c.quadraticCurveTo(0, s * 0.12, -s * 0.7, -s * 0.02);
      c.fill();
      c.fillStyle = "rgba(76,29,149,0.75)";
      for (const [sx, sy, sr] of [[-0.35, -0.3, 0.1], [0.12, -0.5, 0.12], [0.4, -0.22, 0.08], [-0.05, -0.2, 0.07]] as [number, number, number][]) {
        c.beginPath();
        c.arc(sx * s, sy * s, sr * s, 0, TAU);
        c.fill();
      }
      c.restore();
      // Spores
      for (let k = 0; k < 3; k++) {
        const t = (time * 0.6 + k / 3 + seed * 0.1) % 1;
        c.fillStyle = `rgba(190,242,100,${0.7 * (1 - t)})`;
        c.beginPath();
        c.arc(Math.sin(t * 6 + k) * s * 0.4, -s * 0.7 - t * s * 0.9, s * 0.06, 0, TAU);
        c.fill();
      }
      break;
    }
    case "mortar": {
      // Log base and an iron pot that tilts towards the target
      c.fillStyle = "#6b4423";
      roundRectPath(c, -s * 0.6, s * 0.15, s * 1.2, s * 0.45, s * 0.18);
      c.fill();
      c.strokeStyle = "#3f2a14";
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(-s * 0.6 + s * 0.12, s * 0.37, s * 0.1, s * 0.2, 0, 0, TAU);
      c.stroke();
      c.save();
      c.rotate(clamp(Math.cos(aim) * 0.5, -0.5, 0.5));
      const pg = c.createLinearGradient(-s * 0.45, 0, s * 0.45, 0);
      pg.addColorStop(0, "#1f2937");
      pg.addColorStop(0.45, "#6b7280");
      pg.addColorStop(1, "#111827");
      c.fillStyle = pg;
      c.beginPath();
      c.moveTo(-s * 0.42, s * 0.2);
      c.lineTo(-s * 0.32, -s * 0.5);
      c.lineTo(s * 0.32, -s * 0.5);
      c.lineTo(s * 0.42, s * 0.2);
      c.closePath();
      c.fill();
      c.fillStyle = "#374151";
      c.beginPath();
      c.ellipse(0, -s * 0.5, s * 0.36, s * 0.12, 0, 0, TAU);
      c.fill();
      c.fillStyle = "#0b0f19";
      c.beginPath();
      c.ellipse(0, -s * 0.5, s * 0.24, s * 0.07, 0, 0, TAU);
      c.fill();
      c.fillStyle = col;
      c.fillRect(-s * 0.4, -s * 0.12, s * 0.8, s * 0.08);
      c.restore();
      drawPinecone(c, s * 0.55, s * 0.3, s * 0.16);
      break;
    }
    case "sniper": {
      // Tall thorn spire with a crossbow head
      const sg = c.createLinearGradient(-s * 0.2, 0, s * 0.2, 0);
      sg.addColorStop(0, "#4c0519");
      sg.addColorStop(0.5, "#9f1239");
      sg.addColorStop(1, "#4c0519");
      c.fillStyle = sg;
      c.beginPath();
      c.moveTo(-s * 0.32, s * 0.65);
      c.lineTo(-s * 0.1, -s * 0.55);
      c.lineTo(s * 0.1, -s * 0.55);
      c.lineTo(s * 0.32, s * 0.65);
      c.closePath();
      c.fill();
      c.fillStyle = "#fda4af";
      for (const [tx, ty, d] of [[-0.18, 0.25, -1], [0.17, -0.05, 1], [-0.12, -0.3, -1]] as [number, number, number][]) {
        c.beginPath();
        c.moveTo(tx * s, ty * s - s * 0.06);
        c.lineTo(tx * s + d * s * 0.22, ty * s - s * 0.12);
        c.lineTo(tx * s, ty * s + s * 0.04);
        c.closePath();
        c.fill();
      }
      c.translate(0, -s * 0.6);
      c.rotate(aim);
      c.strokeStyle = "#fecdd3";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(s * 0.05, -s * 0.45);
      c.quadraticCurveTo(-s * 0.2, 0, s * 0.05, s * 0.45);
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.7)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(s * 0.05, -s * 0.45);
      c.lineTo(-s * 0.08 - flash * s * 0.1, 0);
      c.lineTo(s * 0.05, s * 0.45);
      c.stroke();
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(s * 0.75, 0);
      c.lineTo(-s * 0.15, -s * 0.07);
      c.lineTo(-s * 0.15, s * 0.07);
      c.closePath();
      c.fill();
      break;
    }
    case "buff": {
      // Flower: leaves, petals that breathe, golden heart
      c.fillStyle = "#15803d";
      c.beginPath();
      c.ellipse(-s * 0.3, s * 0.45, s * 0.3, s * 0.1, -0.5, 0, TAU);
      c.ellipse(s * 0.3, s * 0.45, s * 0.3, s * 0.1, 0.5, 0, TAU);
      c.fill();
      c.strokeStyle = "#166534";
      c.lineWidth = s * 0.1;
      c.beginPath();
      c.moveTo(0, s * 0.62);
      c.lineTo(0, -s * 0.1);
      c.stroke();
      const breathe = 1 + Math.sin(time * 2.5 + seed) * 0.06;
      c.translate(0, -s * 0.2);
      c.rotate(time * 0.3);
      for (let k = 0; k < 6; k++) {
        c.rotate(TAU / 6);
        const pg = c.createLinearGradient(0, 0, s * 0.62 * breathe, 0);
        pg.addColorStop(0, "#fff1f2");
        pg.addColorStop(1, col);
        c.fillStyle = pg;
        c.beginPath();
        c.ellipse(s * 0.34 * breathe, 0, s * 0.3 * breathe, s * 0.17, 0, 0, TAU);
        c.fill();
      }
      const hg = c.createRadialGradient(-s * 0.05, -s * 0.05, 0, 0, 0, s * 0.2);
      hg.addColorStop(0, "#fef9c3");
      hg.addColorStop(1, "#f59e0b");
      c.fillStyle = hg;
      c.beginPath();
      c.arc(0, 0, s * 0.2, 0, TAU);
      c.fill();
      break;
    }
    case "bank": {
      // Golden beehive with bees
      c.fillStyle = "#6b4423";
      roundRectPath(c, -s * 0.5, s * 0.45, s, s * 0.2, s * 0.08);
      c.fill();
      const rings = 4;
      for (let k = 0; k < rings; k++) {
        const ry = s * 0.45 - (k + 0.5) * s * 0.26;
        const rw = s * (0.55 - k * 0.09);
        const g = c.createLinearGradient(0, ry - s * 0.13, 0, ry + s * 0.13);
        g.addColorStop(0, "#fde68a");
        g.addColorStop(1, "#b45309");
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(0, ry, rw, s * 0.15, 0, 0, TAU);
        c.fill();
      }
      c.fillStyle = "#3f2a14";
      c.beginPath();
      c.ellipse(0, s * 0.22, s * 0.1, s * 0.07, 0, 0, TAU);
      c.fill();
      for (let k = 0; k < 2; k++) {
        const a = time * (2.2 + k) + k * 2 + seed;
        const bx = Math.cos(a) * s * 0.75;
        const by = -s * 0.2 + Math.sin(a * 1.7) * s * 0.35;
        c.fillStyle = "rgba(255,255,255,0.6)";
        c.beginPath();
        c.ellipse(bx - 1, by - 3, 2.5, 1.5, -0.4, 0, TAU);
        c.ellipse(bx + 1.5, by - 3, 2.5, 1.5, 0.4, 0, TAU);
        c.fill();
        c.fillStyle = "#facc15";
        c.beginPath();
        c.ellipse(bx, by, 3.2, 2.3, 0, 0, TAU);
        c.fill();
        c.fillStyle = "#1c1917";
        c.fillRect(bx - 0.6, by - 2.2, 1.4, 4.4);
      }
      break;
    }
    case "barrier": {
      drawFenceShape(c, s * 1.5, 1, time);
      break;
    }
  }
  c.restore();
}

function drawPinecone(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.save();
  c.translate(x, y);
  c.fillStyle = "#78350f";
  c.beginPath();
  c.ellipse(0, 0, r * 0.75, r, 0, 0, TAU);
  c.fill();
  c.strokeStyle = "#d97706";
  c.lineWidth = 0.8;
  for (let k = -1; k <= 1; k++) {
    c.beginPath();
    c.moveTo(-r * 0.7, k * r * 0.45);
    c.lineTo(0, k * r * 0.45 + r * 0.25);
    c.lineTo(r * 0.7, k * r * 0.45);
    c.stroke();
  }
  c.restore();
}

/** Projectile art for a shot of the given tower kind; z is height for lobbed shots. */
export function drawShot(c: CanvasRenderingContext2D, kind: TowerKind, x: number, y: number, z: number, time: number, cell: number) {
  if (kind === "leaf") {
    c.fillStyle = "#86efac";
    c.beginPath();
    c.ellipse(x, y, 5, 2.5, time * 12, 0, TAU);
    c.fill();
  } else if (kind === "cloud") {
    glow(c, x, y, 12, "#a78bfa", 0.8);
    c.fillStyle = "#ede9fe";
    c.beginPath();
    c.arc(x, y, 4, 0, TAU);
    c.fill();
  } else if (kind === "poison") {
    glow(c, x, y, 11, "#a3e635", 0.7);
    c.fillStyle = "#d9f99d";
    c.beginPath();
    c.arc(x, y, 3.5, 0, TAU);
    c.fill();
  } else if (kind === "mortar") {
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(x, y, cell * 0.14, cell * 0.06, 0, 0, TAU);
    c.fill();
    drawPinecone(c, x, y - z, cell * 0.13);
  }
}

// ── Fence ─────────────────────────────────────────────────────────────────

function drawFenceShape(c: CanvasRenderingContext2D, span: number, health: number, time: number) {
  const n = 5;
  const h = span * 0.42;
  c.strokeStyle = "#5b3a1e";
  c.lineWidth = Math.max(2, span * 0.06);
  c.beginPath();
  c.moveTo(-span / 2, -h * 0.15);
  c.lineTo(span / 2, -h * 0.25);
  c.moveTo(-span / 2, h * 0.25);
  c.lineTo(span / 2, h * 0.15);
  c.stroke();
  for (let i = 0; i < n; i++) {
    const x = -span / 2 + (i + 0.5) * (span / n);
    const lean = (i % 2 ? 1 : -1) * 0.08 + (1 - health) * Math.sin(i * 3.1) * 0.25;
    c.save();
    c.translate(x, h * 0.45);
    c.rotate(lean);
    const sw = span / n * 0.62;
    const g = c.createLinearGradient(-sw / 2, 0, sw / 2, 0);
    g.addColorStop(0, "#8b5a2b");
    g.addColorStop(0.5, "#d6a35c");
    g.addColorStop(1, "#7a4a20");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-sw / 2, 0);
    c.lineTo(-sw / 2, -h);
    c.lineTo(0, -h - sw * 0.9);
    c.lineTo(sw / 2, -h);
    c.lineTo(sw / 2, 0);
    c.closePath();
    c.fill();
    if (health < 0.6) {
      c.strokeStyle = "rgba(40,20,5,0.7)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-sw * 0.3, -h * 0.7);
      c.lineTo(sw * 0.1, -h * 0.45);
      c.lineTo(-sw * 0.1, -h * 0.2);
      c.stroke();
    }
    c.restore();
  }
  // Thorny wire
  c.strokeStyle = "rgba(190,242,100,0.7)";
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= 12; i++) {
    const x = -span / 2 + (i / 12) * span;
    const y = -h * 0.05 + Math.sin(i * 1.7 + time * 0.5) * h * 0.1;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.stroke();
}

/** A fence standing across the trail at (x, y), perpendicular to the trail direction. */
export function drawFence(c: CanvasRenderingContext2D, x: number, y: number, cell: number, angle: number, health: number, lvl: number, flash: number, time: number) {
  c.save();
  c.translate(x, y);
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  c.ellipse(0, cell * 0.12, cell * 0.55, cell * 0.2, 0, 0, TAU);
  c.fill();
  // Vertical trails: fence seen face-on; horizontal trails: seen end-on (narrow and tall)
  const horiz = Math.abs(Math.cos(angle)) > 0.7;
  if (flash > 0) glow(c, 0, 0, cell * 0.9, "#fca5a5", flash * 0.5);
  if (horiz) {
    c.scale(0.45, 1);
    drawFenceShape(c, cell * 1.6, health, time);
  } else drawFenceShape(c, cell * 1.0, health, time);
  c.restore();
  // Health bar and level pips
  const bw = cell * 0.8;
  c.fillStyle = "rgba(0,0,0,0.55)";
  c.fillRect(x - bw / 2, y + cell * 0.32, bw, 4);
  c.fillStyle = health > 0.5 ? "#a3e635" : health > 0.25 ? "#facc15" : "#f87171";
  c.fillRect(x - bw / 2, y + cell * 0.32, bw * clamp(health, 0, 1), 4);
  for (let k = 0; k < lvl; k++) {
    c.fillStyle = "#ffd76a";
    c.beginPath();
    c.arc(x - (lvl - 1) * 3.5 + k * 7, y + cell * 0.46, 2.2, 0, TAU);
    c.fill();
  }
}

// ── Enemies ───────────────────────────────────────────────────────────────

export interface EnemyLook {
  kind: EnemyKind;
  wob: number;
  hit: number;
  slowT: number;
  frost: number;
  poisonT: number;
  shield: number;
  shieldMax: number;
  jumpT: number;
  jumpDur: number;
  fly: boolean;
  blocked: boolean;
  hp: number;
  maxHp: number;
  armor: number;
}

export const ENEMY_TINT: Record<EnemyKind, [string, string]> = {
  puff: ["#9ca3af", "#4b5563"],
  mini: ["#a8a29e", "#57534e"],
  runner: ["#fca5a5", "#7f1d1d"],
  brute: ["#78716c", "#1c1917"],
  splitter: ["#c4b5fd", "#4c1d95"],
  jumper: ["#a7c4a0", "#2f4a33"],
  healer: ["#99f6e4", "#0f5d55"],
  shell: ["#a8a29e", "#3f3a36"],
  flyer: ["#6b7280", "#111827"],
  shield: ["#a5b4fc", "#312e81"],
  boss: ["#6b7280", "#111827"],
};

export function iconEnemy(kind: EnemyKind): EnemyLook {
  return { kind, wob: 1, hit: 0, slowT: 0, frost: 0, poisonT: 0, shield: kind === "shield" ? 1 : 0, shieldMax: 1, jumpT: 0, jumpDur: 1, fly: kind === "flyer", blocked: false, hp: 1, maxHp: 1, armor: kind === "shell" ? 0.6 : 0 };
}

/** A smog monster with its ground point at (x, y) and radius R in pixels. */
export function drawEnemy(c: CanvasRenderingContext2D, e: EnemyLook, x: number, y: number, R: number, cell: number, time: number, bars = true) {
  const [hi, lo] = ENEMY_TINT[e.kind];
  let z = 0;
  let squash = 1;
  if (e.jumpT > 0 && e.jumpDur > 0) {
    const t = 1 - e.jumpT / e.jumpDur;
    z = Math.sin(t * Math.PI) * cell * 0.7;
    squash = 0.85 + Math.sin(t * Math.PI) * 0.3;
  } else if (e.kind === "jumper") squash = 1 - 0.08 * Math.abs(Math.sin(time * 6 + e.wob));
  if (e.fly) z = cell * 0.45 + Math.sin(time * 4 + e.wob) * cell * 0.06;
  c.save();
  c.translate(x, y);
  // Ground shadow
  c.fillStyle = `rgba(0,0,0,${z > 0 ? 0.18 : 0.25})`;
  c.beginPath();
  c.ellipse(0, R * 0.8, R * 0.9 * (1 - z / (cell * 2)), R * 0.3, 0, 0, TAU);
  c.fill();
  // Healer aura
  if (e.kind === "healer") {
    const p = (time * 0.8 + e.wob) % 1;
    c.strokeStyle = `rgba(94,234,212,${0.55 * (1 - p)})`;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, -z, R * (1.2 + p * 2.2), 0, TAU);
    c.stroke();
    glow(c, 0, -z, R * 2.2, "#5eead4", 0.22);
  }
  c.translate(0, -z);
  c.scale(1 / Math.sqrt(squash), squash);
  // Flyer wings behind the body
  if (e.kind === "flyer") {
    const flap = Math.sin(time * 14 + e.wob) * 0.5;
    c.fillStyle = "#1f2937";
    for (const sx of [-1, 1]) {
      c.save();
      c.scale(sx, 1);
      c.rotate(-flap * 0.6);
      c.beginPath();
      c.moveTo(R * 0.3, -R * 0.1);
      c.quadraticCurveTo(R * 1.2, -R * 1.1, R * 1.9, -R * 0.3);
      c.quadraticCurveTo(R * 1.55, -R * 0.15, R * 1.5, R * 0.15);
      c.quadraticCurveTo(R * 1.2, -R * 0.05, R * 1.05, R * 0.3);
      c.quadraticCurveTo(R * 0.8, R * 0.05, R * 0.3, R * 0.25);
      c.closePath();
      c.fill();
      c.restore();
    }
  }
  // Runner speed streaks
  if (e.kind === "runner") {
    c.strokeStyle = "rgba(254,202,202,0.45)";
    c.lineWidth = 2;
    for (let k = -1; k <= 1; k++) {
      c.beginPath();
      c.moveTo(-R * 1.1, k * R * 0.35);
      c.lineTo(-R * (1.6 + 0.3 * Math.sin(time * 10 + k)), k * R * 0.35);
      c.stroke();
    }
  }
  // Jumper legs
  if (e.kind === "jumper") {
    c.fillStyle = shade(lo, 0.1);
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.ellipse(sx * R * 0.55, R * 0.55, R * 0.32, R * 0.16, sx * 0.4, 0, TAU);
      c.fill();
    }
  }
  // Body puffs
  const n = e.kind === "boss" ? 7 : e.kind === "brute" ? 6 : 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + time * 0.8 + e.wob;
    const bx = Math.cos(a) * R * 0.45;
    const by = Math.sin(a) * R * 0.35;
    const br = R * (0.55 + 0.08 * Math.sin(time * 3 + k));
    const g = c.createRadialGradient(bx - br * 0.3, by - br * 0.4, 0, bx, by, br);
    g.addColorStop(0, e.hit > 0 ? "#ffffff" : e.poisonT > 0 ? mix(hi, "#bef264", 0.45) : hi);
    g.addColorStop(1, rgba(lo, 0.92));
    c.fillStyle = g;
    c.beginPath();
    c.arc(bx, by, br, 0, TAU);
    c.fill();
  }
  // Kind marks
  if (e.kind === "splitter") {
    c.strokeStyle = "#ede9fe";
    c.lineWidth = Math.max(1.5, R * 0.08);
    c.beginPath();
    c.moveTo(0, -R * 0.75);
    c.lineTo(R * 0.1, -R * 0.4);
    c.lineTo(-R * 0.08, -R * 0.15);
    c.lineTo(R * 0.06, R * 0.2);
    c.stroke();
  }
  if (e.kind === "shell") {
    // Armour plates
    c.fillStyle = "#57534e";
    c.strokeStyle = "#d6d3d1";
    c.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      const px = (k - 1) * R * 0.48;
      c.beginPath();
      for (let q = 0; q < 6; q++) {
        const a = (q / 6) * TAU + Math.PI / 6;
        const hx = px + Math.cos(a) * R * 0.3;
        const hy = -R * 0.45 + Math.sin(a) * R * 0.24 + Math.abs(k - 1) * R * 0.12;
        if (q) c.lineTo(hx, hy);
        else c.moveTo(hx, hy);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
  if (e.kind === "healer") {
    c.fillStyle = "#f0fdfa";
    const cs = R * 0.16;
    c.fillRect(-cs * 0.4, -R * 0.75 - cs, cs * 0.8, cs * 2);
    c.fillRect(-cs, -R * 0.75 - cs * 0.4, cs * 2, cs * 0.8);
  }
  if (e.kind === "shield") {
    // Kite shield held in front
    c.save();
    c.translate(R * 0.55, R * 0.1);
    const sg = c.createLinearGradient(-R * 0.3, -R * 0.5, R * 0.3, R * 0.5);
    sg.addColorStop(0, "#e0e7ff");
    sg.addColorStop(1, "#4f46e5");
    c.fillStyle = sg;
    c.beginPath();
    c.moveTo(0, -R * 0.55);
    c.lineTo(R * 0.36, -R * 0.38);
    c.quadraticCurveTo(R * 0.32, R * 0.3, 0, R * 0.6);
    c.quadraticCurveTo(-R * 0.32, R * 0.3, -R * 0.36, -R * 0.38);
    c.closePath();
    c.fill();
    c.strokeStyle = "#c7d2fe";
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
  }
  if (e.kind === "boss") {
    // Crown of smoke spikes
    c.fillStyle = "#1f2937";
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.38;
      c.beginPath();
      c.moveTo(Math.cos(a - 0.12) * R * 0.75, Math.sin(a - 0.12) * R * 0.75);
      c.lineTo(Math.cos(a) * R * (1.25 + 0.06 * Math.sin(time * 4 + k)), Math.sin(a) * R * (1.25 + 0.06 * Math.sin(time * 4 + k)));
      c.lineTo(Math.cos(a + 0.12) * R * 0.75, Math.sin(a + 0.12) * R * 0.75);
      c.closePath();
      c.fill();
    }
    if (e.armor > 0) {
      c.strokeStyle = "rgba(214,211,209,0.75)";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, R * 0.95, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
    }
  }
  // Grumpy eyes
  const ey = e.kind === "shell" ? R * 0.05 : -R * 0.05;
  const red = e.kind === "runner" || e.kind === "boss" || e.kind === "flyer";
  for (const sx of [-1, 1]) {
    c.fillStyle = red ? "#fecaca" : e.kind === "healer" ? "#ccfbf1" : "#fef9c3";
    c.beginPath();
    c.ellipse(sx * R * 0.25, ey, R * 0.13, R * 0.1, 0, 0, TAU);
    c.fill();
    c.strokeStyle = "#111827";
    c.lineWidth = Math.max(1.5, R * 0.08);
    c.beginPath();
    c.moveTo(sx * R * 0.42, ey - R * 0.22);
    c.lineTo(sx * R * 0.1, ey - R * 0.12);
    c.stroke();
  }
  c.restore();

  // Status effects (unsquashed)
  c.save();
  c.translate(x, y - z);
  if (e.slowT > 0 || e.frost > 0) {
    c.strokeStyle = e.frost > 0 ? "rgba(191,219,254,0.9)" : "rgba(125,211,252,0.8)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, R * 1.05, 0, TAU);
    c.stroke();
    if (e.frost > 0) {
      c.fillStyle = "rgba(224,242,254,0.9)";
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + e.wob;
        c.beginPath();
        c.moveTo(Math.cos(a) * R, Math.sin(a) * R - 3);
        c.lineTo(Math.cos(a) * R + 2.5, Math.sin(a) * R);
        c.lineTo(Math.cos(a) * R, Math.sin(a) * R + 3);
        c.lineTo(Math.cos(a) * R - 2.5, Math.sin(a) * R);
        c.closePath();
        c.fill();
      }
    }
  }
  if (e.poisonT > 0) {
    for (let k = 0; k < 3; k++) {
      const t = (time * 1.2 + k / 3 + e.wob) % 1;
      c.fillStyle = `rgba(190,242,100,${0.8 * (1 - t)})`;
      c.beginPath();
      c.arc(Math.sin(k * 2.1 + e.wob) * R * 0.6, -R * 0.4 - t * R * 1.2, 2 + R * 0.06, 0, TAU);
      c.fill();
    }
  }
  if (e.shield > 0) {
    const a = clamp(e.shield / Math.max(1, e.shieldMax), 0.25, 1);
    const sg = c.createRadialGradient(-R * 0.4, -R * 0.5, R * 0.2, 0, 0, R * 1.35);
    sg.addColorStop(0, `rgba(207,250,254,${0.1 * a})`);
    sg.addColorStop(0.8, `rgba(103,232,249,${0.22 * a})`);
    sg.addColorStop(1, `rgba(103,232,249,${0.55 * a})`);
    c.fillStyle = sg;
    c.beginPath();
    c.arc(0, 0, R * 1.35, 0, TAU);
    c.fill();
    c.strokeStyle = `rgba(165,243,252,${0.75 * a})`;
    c.lineWidth = 1.5;
    c.stroke();
    // Hex sheen
    c.strokeStyle = `rgba(255,255,255,${0.35 * a})`;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, 0, R * 1.1, -2.4 + Math.sin(time) * 0.2, -1.4 + Math.sin(time) * 0.2);
    c.stroke();
  }
  c.restore();
  if (bars && e.hp < e.maxHp) {
    const bw = Math.max(R * 1.6, 16);
    const by = y - z - R * (e.kind === "boss" ? 1.45 : 1.15) - 8;
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.fillRect(x - bw / 2, by, bw, 4);
    c.fillStyle = e.kind === "boss" ? "#f87171" : "#86efac";
    c.fillRect(x - bw / 2, by, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
}

// ── Small UI art ──────────────────────────────────────────────────────────

export function drawLock(c: CanvasRenderingContext2D, x: number, y: number, s: number, color = "rgba(255,255,255,0.85)") {
  c.save();
  c.translate(x, y);
  c.strokeStyle = color;
  c.lineWidth = s * 0.16;
  c.beginPath();
  c.arc(0, -s * 0.15, s * 0.3, Math.PI, TAU);
  c.lineTo(s * 0.3, s * 0.05);
  c.moveTo(-s * 0.3, s * 0.05);
  c.lineTo(-s * 0.3, -s * 0.15);
  c.stroke();
  c.fillStyle = color;
  roundRectPath(c, -s * 0.45, 0, s * 0.9, s * 0.62, s * 0.12);
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath();
  c.arc(0, s * 0.26, s * 0.09, 0, TAU);
  c.fill();
  c.restore();
}

export function drawStar(c: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean) {
  c.save();
  c.translate(x, y);
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  if (filled) {
    const g = c.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, "#fff3b0");
    g.addColorStop(1, "#f59e0b");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "#b45309";
  } else {
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.35)";
  }
  c.lineWidth = Math.max(1, r * 0.12);
  c.stroke();
  c.restore();
}
