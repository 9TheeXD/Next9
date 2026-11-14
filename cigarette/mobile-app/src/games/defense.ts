// "Breath Tree Defence" — smog clouds march down a winding trail towards the Tree of Breath. Build
// and upgrade four kinds of guardians on the stone pads beside the trail. Waves never end and get
// tougher every round; permanent upgrades bought with coins carry over between runs.
// Planning where to build plus fast reactions during a wave keeps the mind busy for the whole urge.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Floaters, Particles, makeSprite, clamp, TAU, FONT_DISPLAY, FONT_BODY, rng, glow, roundRectPath, shade, rgba } from "./engine/fx";
import { Button, drawCard, drawCoin, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { wallet } from "./engine/economy";

// ── Map (grid units: 9 wide, 15 tall) ─────────────────────────────────────

const GW = 9;
const GH = 15;
const PATH: [number, number][] = [
  [1, -1],
  [1, 3],
  [7, 3],
  [7, 6],
  [2, 6],
  [2, 9],
  [7, 9],
  [7, 12],
  [4.5, 12],
  [4.5, 13.4],
];
const TREE = { x: 4.5, y: 14 };
const PADS: [number, number][] = [
  [2.8, 1.5], [5.2, 1.5], [8.2, 1.6],
  [3.4, 4.5], [5.6, 4.5], [8.4, 4.6],
  [0.6, 7.5], [4, 7.5], [6.1, 7.5],
  [4, 10.5], [5.8, 10.5], [8.4, 10.5],
  [2.6, 12.9], [6.4, 13.5], [0.6, 10.8],
];

type TowerKind = "leaf" | "fan" | "lens" | "cloud";
interface TowerSpec {
  name: string;
  desc: string;
  cost: number;
  color: string;
  range: number;
  rate: number;
  dmg: number;
}
const TOWERS: Record<TowerKind, TowerSpec> = {
  leaf: { name: "ใบไม้พิทักษ์", desc: "ยิงเร็ว เป้าเดียว", cost: 50, color: "#4ade80", range: 2.4, rate: 0.45, dmg: 14 },
  fan: { name: "สายลม", desc: "พัดรอบตัว ทำให้ช้าลง", cost: 70, color: "#7dd3fc", range: 1.9, rate: 1.0, dmg: 6 },
  lens: { name: "แว่นแสงอาทิตย์", desc: "ลำแสงไกล แรงต่อเนื่อง", cost: 110, color: "#fbbf24", range: 3.3, rate: 0, dmg: 34 },
  cloud: { name: "เมฆฝน", desc: "ฝนตกเป็นวง โดนหลายตัว", cost: 120, color: "#a78bfa", range: 2.6, rate: 1.4, dmg: 26 },
};
const KINDS: TowerKind[] = ["leaf", "fan", "lens", "cloud"];
const MAX_LVL = 5;

interface Tower {
  kind: TowerKind;
  pad: number;
  lvl: number;
  spent: number;
  cd: number;
  aim: number;
  target: Enemy | null;
  flash: number;
}

type EnemyKind = "puff" | "runner" | "brute" | "splitter" | "mini" | "boss";
interface Enemy {
  kind: EnemyKind;
  d: number; // distance along the path in grid units
  hp: number;
  maxHp: number;
  speed: number;
  slowT: number;
  gold: number;
  harm: number;
  r: number;
  wob: number;
  hit: number;
  dead: boolean;
}

interface Shot {
  x: number;
  y: number;
  target: Enemy;
  dmg: number;
  speed: number;
  kind: TowerKind;
  splash: number;
}

export const defenseGame: GameDefinition = {
  id: "defense",
  title: "ปกป้องต้นไม้ลมหายใจ",
  tagline: "วางป้อมกันควันพิษ คลื่นไม่มีที่สิ้นสุด",
  why: "ต้องวางแผนว่าจะสร้างป้อมตรงไหน แล้วลุ้นทุกคลื่น ใจจดจ่อจนความอยากผ่านไป และได้เห็นควันถูกปัดเป่าออกจากต้นไม้",
  category: "action",
  minutes: "3–8 นาที",
  palette: ["#14321f", "#86efac"],
  create: (env) => new DefenseGame(env),
};

type State = "intro" | "play" | "over";

class DefenseGame implements GameInstance {
  private w = 0;
  private h = 0;
  private cell = 40;
  private ox = 0;
  private oy = 0;
  private bg: HTMLCanvasElement | null = null;
  private segLen: number[] = [];
  private pathLen = 0;

  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private towers: (Tower | null)[] = PADS.map(() => null);
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private rings: { x: number; y: number; r: number; t: number; color: string }[] = [];
  private gold = 0;
  private lives = 0;
  private maxLives = 0;
  private wave = 0;
  private toSpawn: EnemyKind[] = [];
  private spawnT = 0;
  private breakT = 0;
  private waveActive = false;
  private kills = 0;
  private speed = 1;
  private selected: number | null = null;
  private best = 0;
  private newBest = false;
  private earned = 0;
  private treeHurt = 0;

  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มปกป้อง", "#16a34a");
  private againBtn = new Button("เล่นอีกครั้ง", "#16a34a");
  private upgradeBtns: { id: string; btn: Button }[] = [
    { id: "td_gold", btn: new Button("", "#334155") },
    { id: "td_power", btn: new Button("", "#334155") },
    { id: "td_lives", btn: new Button("", "#334155") },
  ];
  private rand = rng(Date.now() % 77003);
  /** Hit boxes for the bottom bar, rebuilt every frame. */
  private bar: { x: number; y: number; w: number; h: number; act: () => void; enabled: boolean }[] = [];
  private barTop = 0;

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    for (let i = 1; i < PATH.length; i++) {
      const l = Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]);
      this.segLen.push(l);
      this.pathLen += l;
    }
  }

  // ── Geometry ─────────────────────────────────────────────────────────────

  private px(gx: number, gy: number) {
    return { x: this.ox + gx * this.cell, y: this.oy + gy * this.cell };
  }

  private along(d: number) {
    let rest = d;
    for (let i = 0; i < this.segLen.length; i++) {
      if (rest <= this.segLen[i]) {
        const k = rest / this.segLen[i];
        const a = PATH[i];
        const b = PATH[i + 1];
        return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
      }
      rest -= this.segLen[i];
    }
    const last = PATH[PATH.length - 1];
    return { x: last[0], y: last[1] };
  }

  private enemyPx(e: Enemy) {
    const g = this.along(e.d);
    const p = this.px(g.x, g.y);
    return { x: p.x + Math.sin(e.wob + this.time * 2) * this.cell * 0.06, y: p.y };
  }

  private power() {
    return 1 + 0.1 * wallet.level("td_power");
  }

  private stat(t: Tower) {
    const s = TOWERS[t.kind];
    const k = t.lvl - 1;
    return {
      range: s.range + k * 0.18,
      rate: s.rate * Math.pow(0.9, k),
      dmg: s.dmg * Math.pow(1.5, k) * this.power(),
      slow: t.kind === "fan" ? 0.45 + k * 0.05 : 0,
      splash: t.kind === "cloud" ? 1.0 + k * 0.12 : 0,
    };
  }

  private upgradeCost(t: Tower) {
    return Math.round(TOWERS[t.kind].cost * 0.75 * t.lvl);
  }

  // ── Layout and art ───────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 54;
    const bottom = 92;
    this.cell = Math.min(w / GW, (h - top - bottom) / GH);
    this.ox = (w - this.cell * GW) / 2;
    this.oy = top + (h - top - bottom - this.cell * GH) / 2;
    this.barTop = h - bottom + 8;
    this.buildBackground();
  }

  private buildBackground() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const { w, h, cell } = this;
    const r = rng(4242);
    this.bg = makeSprite(w, h, dpr, (c) => {
      // Meadow
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1d3b2a");
      g.addColorStop(0.5, "#24492f");
      g.addColorStop(1, "#2c5a35");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Smog creeping in from the top
      const smog = c.createLinearGradient(0, 0, 0, h * 0.25);
      smog.addColorStop(0, "rgba(90,85,100,0.75)");
      smog.addColorStop(1, "rgba(90,85,100,0)");
      c.fillStyle = smog;
      c.fillRect(0, 0, w, h * 0.25);
      // Grass tufts and tiny flowers
      for (let i = 0; i < (w * h) / 260; i++) {
        const x = r() * w;
        const y = r() * h;
        const s = 2 + r() * 4;
        c.strokeStyle = `rgba(${120 + r() * 60},${190 + r() * 50},${110 + r() * 40},${0.18 + r() * 0.2})`;
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - s * 0.4, y - s);
        c.moveTo(x, y);
        c.lineTo(x + s * 0.3, y - s * 1.1);
        c.stroke();
      }
      for (let i = 0; i < (w * h) / 5000; i++) {
        const x = r() * w;
        const y = h * 0.2 + r() * h * 0.8;
        c.fillStyle = ["#fde68a", "#fbcfe8", "#ffffff", "#c4b5fd"][Math.floor(r() * 4)];
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
      // Trail: dark edge, sandy fill, pebbles
      const trace = () => {
        c.beginPath();
        PATH.forEach(([gx, gy], i) => {
          const p = this.px(gx, gy);
          if (i) c.lineTo(p.x, p.y);
          else c.moveTo(p.x, p.y);
        });
      };
      c.lineJoin = "round";
      c.lineCap = "round";
      trace();
      c.strokeStyle = "#3b2f22";
      c.lineWidth = cell * 0.98;
      c.stroke();
      trace();
      c.strokeStyle = "#a88a62";
      c.lineWidth = cell * 0.82;
      c.stroke();
      trace();
      c.strokeStyle = "#c2a57a";
      c.lineWidth = cell * 0.5;
      c.stroke();
      for (let i = 0; i < 260; i++) {
        const g2 = this.along(r() * this.pathLen);
        const p = this.px(g2.x + (r() - 0.5) * 0.7, g2.y + (r() - 0.5) * 0.7);
        c.fillStyle = `rgba(${90 + r() * 40},${70 + r() * 30},${50 + r() * 20},0.55)`;
        c.beginPath();
        c.ellipse(p.x, p.y, 1 + r() * 2.5, 1 + r() * 1.8, r() * 3, 0, TAU);
        c.fill();
      }
      // Stone pads
      for (const [gx, gy] of PADS) {
        const p = this.px(gx, gy);
        const pr = cell * 0.46;
        c.fillStyle = "rgba(0,0,0,0.3)";
        c.beginPath();
        c.ellipse(p.x, p.y + pr * 0.25, pr * 1.05, pr * 0.8, 0, 0, TAU);
        c.fill();
        const sg = c.createLinearGradient(0, p.y - pr, 0, p.y + pr);
        sg.addColorStop(0, "#9ca3af");
        sg.addColorStop(1, "#4b5563");
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
        c.strokeStyle = "rgba(255,255,255,0.18)";
        c.lineWidth = 1.5;
        c.stroke();
      }
    });
  }

  private drawTree(c: CanvasRenderingContext2D) {
    const p = this.px(TREE.x, TREE.y);
    const s = this.cell;
    const hurt = this.treeHurt;
    const health = this.maxLives ? this.lives / this.maxLives : 1;
    c.save();
    c.translate(p.x + (hurt > 0 ? Math.sin(this.time * 60) * hurt * 3 : 0), p.y);
    glow(c, 0, -s * 0.6, s * 1.8, "#86efac", 0.25 + 0.1 * Math.sin(this.time * 2));
    // Trunk
    c.fillStyle = "#6b4423";
    c.beginPath();
    c.moveTo(-s * 0.18, s * 0.45);
    c.quadraticCurveTo(-s * 0.1, -s * 0.2, -s * 0.12, -s * 0.5);
    c.lineTo(s * 0.12, -s * 0.5);
    c.quadraticCurveTo(s * 0.1, -s * 0.2, s * 0.2, s * 0.45);
    c.closePath();
    c.fill();
    // Canopy colour fades towards grey as the tree is hurt
    const leaf = health > 0.6 ? "#22c55e" : health > 0.3 ? "#84cc16" : "#a3a380";
    const blobs: [number, number, number][] = [
      [0, -1.0, 0.62], [-0.5, -0.75, 0.45], [0.5, -0.75, 0.45], [-0.3, -1.3, 0.42], [0.32, -1.28, 0.4], [0, -0.55, 0.4],
    ];
    const sway = Math.sin(this.time * 1.4) * 0.04;
    for (const [bx, by, br] of blobs) {
      const x = (bx + sway * by) * s;
      const y = by * s;
      const g = c.createRadialGradient(x - br * s * 0.3, y - br * s * 0.3, 0, x, y, br * s);
      g.addColorStop(0, shade(leaf, 0.35));
      g.addColorStop(1, shade(leaf, -0.25));
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, br * s, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  private drawTower(c: CanvasRenderingContext2D, t: Tower, i: number) {
    const p = this.px(PADS[i][0], PADS[i][1]);
    const s = this.cell * 0.56;
    const col = TOWERS[t.kind].color;
    c.save();
    c.translate(p.x, p.y - s * 0.25);
    if (t.flash > 0) glow(c, 0, 0, s * 1.8, col, t.flash * 0.6);
    switch (t.kind) {
      case "leaf": {
        // Wooden post with a rotating leaf launcher
        c.fillStyle = "#7c5a3a";
        roundRectPath(c, -s * 0.35, -s * 0.2, s * 0.7, s * 0.85, s * 0.15);
        c.fill();
        c.rotate(t.aim);
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
        c.rotate(this.time * (4 + t.lvl));
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
        c.rotate(t.aim);
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
        const bob = Math.sin(this.time * 2 + i) * s * 0.1;
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
    }
    c.restore();
    // Level pips
    for (let k = 0; k < t.lvl; k++) {
      c.fillStyle = "#ffd76a";
      c.beginPath();
      c.arc(p.x - (t.lvl - 1) * 4 + k * 8, p.y + s * 0.95, 2.6, 0, TAU);
      c.fill();
    }
  }

  private drawEnemy(c: CanvasRenderingContext2D, e: Enemy) {
    const p = this.enemyPx(e);
    const r = e.r * this.cell;
    const tint: Record<EnemyKind, [string, string]> = {
      puff: ["#9ca3af", "#4b5563"],
      mini: ["#a8a29e", "#57534e"],
      runner: ["#fca5a5", "#7f1d1d"],
      brute: ["#78716c", "#1c1917"],
      splitter: ["#c4b5fd", "#4c1d95"],
      boss: ["#6b7280", "#111827"],
    };
    const [hi, lo] = tint[e.kind];
    c.save();
    c.translate(p.x, p.y);
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(0, r * 0.8, r * 0.9, r * 0.3, 0, 0, TAU);
    c.fill();
    const n = e.kind === "boss" ? 7 : 5;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + this.time * 0.8 + e.wob;
      const bx = Math.cos(a) * r * 0.45;
      const by = Math.sin(a) * r * 0.35;
      const br = r * (0.55 + 0.08 * Math.sin(this.time * 3 + k));
      const g = c.createRadialGradient(bx - br * 0.3, by - br * 0.4, 0, bx, by, br);
      g.addColorStop(0, e.hit > 0 ? "#ffffff" : hi);
      g.addColorStop(1, rgba(lo, 0.9));
      c.fillStyle = g;
      c.beginPath();
      c.arc(bx, by, br, 0, TAU);
      c.fill();
    }
    // Grumpy eyes
    const ey = -r * 0.05;
    for (const sx of [-1, 1]) {
      c.fillStyle = e.kind === "runner" || e.kind === "boss" ? "#fecaca" : "#fef9c3";
      c.beginPath();
      c.ellipse(sx * r * 0.25, ey, r * 0.13, r * 0.1, 0, 0, TAU);
      c.fill();
      c.strokeStyle = "#111827";
      c.lineWidth = Math.max(1.5, r * 0.08);
      c.beginPath();
      c.moveTo(sx * r * 0.42, ey - r * 0.22);
      c.lineTo(sx * r * 0.1, ey - r * 0.12);
      c.stroke();
    }
    if (e.slowT > 0) {
      c.strokeStyle = "rgba(125,211,252,0.8)";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, r * 1.05, 0, TAU);
      c.stroke();
    }
    c.restore();
    if (e.hp < e.maxHp) {
      const bw = r * 1.6;
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.fillRect(p.x - bw / 2, p.y - r - 8, bw, 4);
      c.fillStyle = e.kind === "boss" ? "#f87171" : "#86efac";
      c.fillRect(p.x - bw / 2, p.y - r - 8, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  // ── Game flow ────────────────────────────────────────────────────────────

  private start() {
    this.towers = PADS.map(() => null);
    this.enemies = [];
    this.shots = [];
    this.rings = [];
    this.gold = 160 + 40 * wallet.level("td_gold");
    this.maxLives = 20 + 3 * wallet.level("td_lives");
    this.lives = this.maxLives;
    this.wave = 0;
    this.kills = 0;
    this.toSpawn = [];
    this.waveActive = false;
    this.breakT = -1; // waits for the first tap
    this.selected = null;
    this.speed = 1;
    this.newBest = false;
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  private nextWave() {
    if (this.waveActive) return;
    // Calling early pays a small bonus
    if (this.breakT > 0) {
      const bonus = Math.round(this.breakT * 3);
      if (bonus > 0) {
        this.gold += bonus;
        this.floaters.add(`เรียกเร็ว +${bonus} ทอง`, this.w / 2, this.barTop - 20, "#ffd76a", 18);
      }
    }
    this.wave++;
    this.waveActive = true;
    const w = this.wave;
    const list: EnemyKind[] = [];
    const count = Math.round(6 + w * 1.6);
    for (let i = 0; i < count; i++) {
      const roll = this.rand();
      if (w >= 7 && roll < 0.15) list.push("splitter");
      else if (w >= 5 && roll < 0.3) list.push("brute");
      else if (w >= 3 && roll < 0.55) list.push("runner");
      else list.push("puff");
    }
    if (w % 10 === 0) list.push("boss");
    else if (w % 5 === 0) list.push("brute", "brute");
    this.toSpawn = list;
    this.spawnT = 0;
    this.floaters.add(w % 10 === 0 ? `คลื่น ${w} — ราชาควันมาแล้ว!` : `คลื่นที่ ${w}`, this.w / 2, this.h * 0.4, w % 10 === 0 ? "#fca5a5" : "#ffffff", 28, 1.6);
    this.env.sfx.tone({ freq: 220, dur: 0.5, vol: 0.06, type: "sawtooth", glideTo: 330 });
  }

  private spawn(kind: EnemyKind, d = 0) {
    const w = this.wave;
    const scale = Math.pow(1.13, w - 1) * (1 + w * 0.02);
    const base: Record<EnemyKind, { hp: number; speed: number; gold: number; harm: number; r: number }> = {
      puff: { hp: 40, speed: 1.0, gold: 6, harm: 1, r: 0.3 },
      mini: { hp: 22, speed: 1.3, gold: 3, harm: 1, r: 0.2 },
      runner: { hp: 26, speed: 1.85, gold: 6, harm: 1, r: 0.25 },
      brute: { hp: 170, speed: 0.6, gold: 14, harm: 3, r: 0.4 },
      splitter: { hp: 75, speed: 0.9, gold: 8, harm: 2, r: 0.34 },
      boss: { hp: 1500, speed: 0.42, gold: 120, harm: 10, r: 0.62 },
    };
    const b = base[kind];
    const hp = b.hp * scale;
    this.enemies.push({ kind, d, hp, maxHp: hp, speed: b.speed * (1 + Math.min(0.4, w * 0.008)), slowT: 0, gold: b.gold + Math.floor(w / 4), harm: b.harm, r: b.r, wob: this.rand() * TAU, hit: 0, dead: false });
  }

  private damage(e: Enemy, dmg: number) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hit = 0.08;
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      this.gold += e.gold;
      const p = this.enemyPx(e);
      this.particles.burst(p.x, p.y, "#cbd5e1", e.kind === "boss" ? 60 : 14, { speed: 120, size: 4, gravity: -30, life: 0.9 });
      this.particles.burst(p.x, p.y, "#bbf7d0", 6, { speed: 60, size: 2.5, gravity: -40, life: 1 });
      this.floaters.add(`+${e.gold}`, p.x, p.y - 10, "#ffd76a", 14, 0.8);
      if (e.kind === "splitter") {
        this.spawn("mini", e.d + 0.15);
        this.spawn("mini", Math.max(0, e.d - 0.15));
      }
      if (e.kind === "boss") this.env.sfx.chime(pentatonic(10), 0.16);
      else if (this.time % 0.05 < 0.025) this.env.sfx.noise({ dur: 0.18, vol: 0.05, freq: 1200, sweepTo: 300, type: "bandpass" });
    }
  }

  private end() {
    this.state = "over";
    this.stateT = 0;
    this.selected = null;
    const survived = Math.max(0, this.wave - 1);
    const r = bestScore(this.env.store, "best", survived);
    this.best = r.best;
    this.newBest = r.isNew;
    this.earned = 10 + survived * 6 + Math.floor(this.kills / 4);
    this.env.sfx.tone({ freq: 300, dur: 0.9, vol: 0.08, type: "triangle", glideTo: 110 });
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: survived,
      best: this.best,
      summary: `ผ่าน ${survived} คลื่น · ปัดเป่าควัน ${this.kills} ก้อน`,
      stats: { waves: survived, kills: this.kills },
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────

  pointer(p: PointerInfo) {
    if (this.state !== "play") {
      const btns = [this.state === "intro" ? this.startBtn : this.againBtn, ...this.upgradeBtns.map((u) => u.btn)];
      for (const b of btns) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.4) {
            const up = this.upgradeBtns.find((u) => u.btn === b);
            if (up) {
              if (wallet.upgrade(up.id)) this.env.sfx.chime(pentatonic(6), 0.1);
              else this.env.sfx.tone({ freq: 200, dur: 0.1, vol: 0.05, type: "triangle" });
            } else this.start();
          }
          b.pressed = false;
        }
      }
      return;
    }
    if (p.type !== "down") return;
    // Bottom bar first
    for (const b of this.bar) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        if (b.enabled) b.act();
        else this.env.sfx.tone({ freq: 180, dur: 0.08, vol: 0.05, type: "triangle" });
        return;
      }
    }
    // Pads
    let hit: number | null = null;
    PADS.forEach(([gx, gy], i) => {
      const q = this.px(gx, gy);
      if (Math.hypot(q.x - p.x, q.y - p.y) < this.cell * 0.6) hit = i;
    });
    this.selected = hit === this.selected ? null : hit;
    if (hit !== null) this.env.sfx.tone({ freq: 520, dur: 0.05, vol: 0.04 });
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if ((code === "Enter" || code === "Space") && this.state !== "play" && this.stateT > 0.5) {
      this.start();
      return true;
    }
    if (code === "Space" && this.state === "play") {
      this.nextWave();
      return true;
    }
    return false;
  }

  // ── Simulation ───────────────────────────────────────────────────────────

  update(dtRaw: number) {
    this.time += dtRaw;
    this.stateT += dtRaw;
    this.particles.update(dtRaw);
    this.floaters.update(dtRaw);
    this.treeHurt = Math.max(0, this.treeHurt - dtRaw * 2);
    for (const b of [this.startBtn, this.againBtn, ...this.upgradeBtns.map((u) => u.btn)]) b.update(dtRaw);
    if (this.state !== "play") return;
    const steps = this.speed;
    for (let s = 0; s < steps; s++) this.step(dtRaw);
  }

  private step(dt: number) {
    // Waves
    if (this.waveActive) {
      this.spawnT -= dt;
      if (this.toSpawn.length && this.spawnT <= 0) {
        const k = this.toSpawn.shift()!;
        this.spawn(k);
        this.spawnT = k === "boss" ? 2 : Math.max(0.28, 0.95 - this.wave * 0.02);
      }
      if (!this.toSpawn.length && !this.enemies.length) {
        this.waveActive = false;
        const bonus = 20 + this.wave * 3;
        this.gold += bonus;
        this.breakT = 8;
        this.floaters.add(`ผ่านคลื่น ${this.wave}! +${bonus} ทอง`, this.w / 2, this.h * 0.4, "#86efac", 22, 1.5);
        this.env.sfx.chime(pentatonic(5), 0.12);
        this.env.sfx.chime(pentatonic(7), 0.1, 0.12);
      }
    } else if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) {
        this.breakT = 0;
        this.nextWave();
      }
    }

    // Enemies walk
    for (const e of this.enemies) {
      e.hit = Math.max(0, e.hit - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      e.d += e.speed * (e.slowT > 0 ? 0.5 : 1) * dt;
      if (e.d >= this.pathLen) {
        e.dead = true;
        this.lives -= e.harm;
        this.treeHurt = 1;
        const tp = this.px(TREE.x, TREE.y - 0.8);
        this.particles.burst(tp.x, tp.y, "#6b7280", 18, { speed: 90, size: 4, gravity: -20 });
        this.floaters.add(`-${e.harm}`, tp.x, tp.y - 20, "#fca5a5", 20);
        this.env.sfx.noise({ dur: 0.3, vol: 0.1, freq: 300, type: "lowpass" });
      }
    }

    // Towers
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      if (!t) continue;
      t.flash = Math.max(0, t.flash - dt * 4);
      const st = this.stat(t);
      const tp = this.px(PADS[i][0], PADS[i][1]);
      const range = st.range * this.cell;
      const inRange = this.enemies.filter((e) => {
        if (e.dead) return false;
        const p = this.enemyPx(e);
        return Math.hypot(p.x - tp.x, p.y - tp.y) <= range;
      });
      if (t.kind === "lens") {
        // Beam on the toughest enemy in range, continuous damage
        const target = inRange.sort((a, b) => b.hp - a.hp)[0] || null;
        t.target = target;
        if (target) {
          const p = this.enemyPx(target);
          t.aim = Math.atan2(p.y - tp.y, p.x - tp.x) + Math.PI / 2;
          this.damage(target, st.dmg * dt);
        }
        continue;
      }
      t.cd -= dt;
      // Leaf and cloud aim at the enemy furthest along the trail
      const lead = inRange.sort((a, b) => b.d - a.d)[0];
      if (lead && t.kind !== "fan") {
        const p = this.enemyPx(lead);
        t.aim = Math.atan2(p.y - tp.y, p.x - tp.x);
      }
      if (t.cd > 0 || !inRange.length) continue;
      t.cd = st.rate;
      t.flash = 1;
      if (t.kind === "fan") {
        for (const e of inRange) {
          e.slowT = 1.2 + t.lvl * 0.1;
          this.damage(e, st.dmg);
        }
        this.rings.push({ x: tp.x, y: tp.y, r: range, t: 0, color: TOWERS.fan.color });
        this.env.sfx.noise({ dur: 0.25, vol: 0.025, freq: 1800, type: "highpass" });
      } else if (lead) {
        this.shots.push({ x: tp.x, y: tp.y - this.cell * 0.15, target: lead, dmg: st.dmg, speed: t.kind === "leaf" ? 9 : 5, kind: t.kind, splash: st.splash });
        if (t.kind === "leaf") this.env.sfx.tone({ freq: 880 + this.rand() * 200, dur: 0.04, vol: 0.015, type: "triangle" });
      }
    }

    // Projectiles home in on their target
    for (const s of this.shots) {
      const p = s.target.dead ? null : this.enemyPx(s.target);
      if (!p) {
        s.speed = -1;
        continue;
      }
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const d = Math.hypot(dx, dy);
      const step = s.speed * this.cell * dt;
      if (d <= step + 4) {
        if (s.kind === "cloud") {
          const rr = s.splash * this.cell;
          for (const e of this.enemies) {
            const q = this.enemyPx(e);
            if (Math.hypot(q.x - p.x, q.y - p.y) <= rr) this.damage(e, s.dmg);
          }
          this.rings.push({ x: p.x, y: p.y, r: rr, t: 0, color: TOWERS.cloud.color });
          this.particles.burst(p.x, p.y, "#c4b5fd", 14, { speed: 80, size: 2, gravity: 200, life: 0.5 });
        } else {
          this.damage(s.target, s.dmg);
          this.particles.burst(p.x, p.y, "#86efac", 4, { speed: 70, size: 2, life: 0.35 });
        }
        s.speed = -1;
      } else {
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
      }
    }
    this.shots = this.shots.filter((s) => s.speed > 0);
    this.enemies = this.enemies.filter((e) => !e.dead);
    for (const r of this.rings) r.t += dt * 2.5;
    this.rings = this.rings.filter((r) => r.t < 1);

    if (this.lives <= 0) {
      this.lives = 0;
      this.end();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    const { ctx } = this.env;
    const { w, h } = this;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    else {
      ctx.fillStyle = "#24492f";
      ctx.fillRect(0, 0, w, h);
    }
    this.drawTree(ctx);

    // Selection range
    if (this.selected !== null && this.state === "play") {
      const t = this.towers[this.selected];
      const p = this.px(PADS[this.selected][0], PADS[this.selected][1]);
      const range = (t ? this.stat(t).range : 2.2) * this.cell;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, range, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.cell * 0.55, 0, TAU);
      ctx.stroke();
    }
    // Empty pads pulse gently so new players see where to build
    if (this.state === "play") {
      PADS.forEach(([gx, gy], i) => {
        if (this.towers[i]) return;
        const p = this.px(gx, gy);
        ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.12 * Math.sin(this.time * 3 + i)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.cell * 0.3, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 5, p.y);
        ctx.lineTo(p.x + 5, p.y);
        ctx.moveTo(p.x, p.y - 5);
        ctx.lineTo(p.x, p.y + 5);
        ctx.stroke();
      });
    }

    for (const e of [...this.enemies].sort((a, b) => this.enemyPx(a).y - this.enemyPx(b).y)) this.drawEnemy(ctx, e);
    this.towers.forEach((t, i) => t && this.drawTower(ctx, t, i));

    // Beams
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.towers.forEach((t, i) => {
      if (!t || t.kind !== "lens" || !t.target || t.target.dead) return;
      const a = this.px(PADS[i][0], PADS[i][1] - 0.1);
      const b = this.enemyPx(t.target);
      ctx.strokeStyle = "rgba(251,191,36,0.35)";
      ctx.lineWidth = 7 + t.lvl;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "#fff7d6";
      ctx.lineWidth = 2;
      ctx.stroke();
      glow(ctx, b.x, b.y, 14, "#fbbf24", 0.6);
    });
    for (const s of this.shots) {
      if (s.kind === "leaf") {
        ctx.fillStyle = "#86efac";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 5, 2.5, Math.atan2(s.target ? 1 : 0, 1) + this.time * 12, 0, TAU);
        ctx.fill();
      } else {
        glow(ctx, s.x, s.y, 12, "#a78bfa", 0.8);
        ctx.fillStyle = "#ede9fe";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, TAU);
        ctx.fill();
      }
    }
    for (const r of this.rings) {
      ctx.strokeStyle = rgba(r.color, 0.6 * (1 - r.t));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.3 + r.t * 0.7), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    this.particles.render(ctx);
    this.floaters.render(ctx);

    if (this.state === "play") {
      this.renderHud(ctx);
      this.renderBar(ctx);
    } else this.renderCard(ctx);
  }

  private renderHud(c: CanvasRenderingContext2D) {
    const { w } = this;
    c.fillStyle = "rgba(10,20,14,0.6)";
    c.fillRect(0, 0, w, 46);
    c.textBaseline = "middle";
    // Lives: little heart-leaf
    c.fillStyle = "#4ade80";
    c.beginPath();
    c.ellipse(22, 23, 8, 11, 0.6, 0, TAU);
    c.fill();
    c.strokeStyle = "#14532d";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(16, 31);
    c.lineTo(27, 16);
    c.stroke();
    c.font = `800 18px ${FONT_DISPLAY}`;
    c.textAlign = "left";
    c.fillStyle = this.lives <= 5 ? "#fca5a5" : "#ffffff";
    c.fillText(`${this.lives}`, 36, 24);
    // Gold
    drawCoin(c, 96, 23, 10);
    c.fillStyle = "#ffd76a";
    c.fillText(`${this.gold}`, 111, 24);
    // Wave
    c.textAlign = "right";
    c.fillStyle = "#ffffff";
    c.font = `700 16px ${FONT_DISPLAY}`;
    c.fillText(`คลื่น ${Math.max(1, this.wave)}`, w - 14, 18);
    c.font = `500 11px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.65)";
    c.fillText(`สถิติ ${this.best} คลื่น`, w - 14, 35);
  }

  private renderBar(c: CanvasRenderingContext2D) {
    const { w } = this;
    const y = this.barTop;
    const bh = this.h - y - 10;
    this.bar = [];
    c.fillStyle = "rgba(10,20,14,0.82)";
    roundRectPath(c, 8, y, w - 16, bh, 18);
    c.fill();
    const sel = this.selected;
    const tile = (x: number, tw: number, enabled: boolean, draw: (cx: number, cy: number) => void, act: () => void) => {
      c.globalAlpha = enabled ? 1 : 0.45;
      c.fillStyle = "rgba(255,255,255,0.08)";
      roundRectPath(c, x, y + 8, tw, bh - 16, 12);
      c.fill();
      draw(x + tw / 2, y + bh / 2);
      c.globalAlpha = 1;
      this.bar.push({ x, y: y + 8, w: tw, h: bh - 16, act, enabled });
    };

    if (sel !== null && !this.towers[sel]) {
      // Build menu
      const tw = (w - 16 - 10 * 5) / 4;
      KINDS.forEach((k, i) => {
        const spec = TOWERS[k];
        const x = 18 + i * (tw + 10);
        tile(
          x,
          tw,
          this.gold >= spec.cost,
          () => undefined,
          () => this.build(sel, k)
        );
      });
      KINDS.forEach((k, i) => {
        const x = 18 + i * (tw + 10) + tw / 2;
        this.drawTowerIcon(c, k, x, y + bh / 2 - 8, this.gold >= TOWERS[k].cost);
        c.font = `600 11px ${FONT_BODY}`;
        c.textAlign = "center";
        c.textBaseline = "alphabetic";
        c.fillStyle = this.gold >= TOWERS[k].cost ? "#ffd76a" : "rgba(255,215,106,0.45)";
        c.fillText(`${TOWERS[k].cost}`, x + 6, y + bh - 14);
        drawCoin(c, x - 12, y + bh - 18, 5);
      });
      c.font = `600 12px ${FONT_BODY}`;
      c.textAlign = "center";
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.fillText("เลือกป้อมที่จะสร้าง", w / 2, y - 8);
      return;
    }

    if (sel !== null) {
      const t = this.towers[sel]!;
      const spec = TOWERS[t.kind];
      const cost = this.upgradeCost(t);
      const canUp = t.lvl < MAX_LVL && this.gold >= cost;
      const sell = Math.round(t.spent * 0.7);
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.font = `700 15px ${FONT_DISPLAY}`;
      c.fillStyle = spec.color;
      c.fillText(`${spec.name} ขั้น ${t.lvl}`, 22, y + 28);
      c.font = `500 12px ${FONT_BODY}`;
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.fillText(spec.desc, 22, y + 48);
      const bw = 92;
      tile(
        w - 18 - bw * 2 - 8,
        bw,
        canUp,
        (cx, cy) => {
          c.textAlign = "center";
          c.font = `700 13px ${FONT_DISPLAY}`;
          c.fillStyle = "#ffffff";
          c.fillText(t.lvl >= MAX_LVL ? "สูงสุด" : "อัปเกรด", cx, cy - 4);
          if (t.lvl < MAX_LVL) {
            c.font = `600 11px ${FONT_BODY}`;
            c.fillStyle = "#ffd76a";
            c.fillText(`${cost} ทอง`, cx, cy + 14);
          }
        },
        () => {
          this.gold -= cost;
          t.spent += cost;
          t.lvl++;
          t.flash = 1;
          const p = this.px(PADS[sel][0], PADS[sel][1]);
          this.particles.burst(p.x, p.y, "#ffd76a", 20, { speed: 120, size: 3, gravity: 0 });
          this.env.sfx.chime(pentatonic(4 + t.lvl), 0.1);
        }
      );
      tile(
        w - 18 - bw,
        bw,
        true,
        (cx, cy) => {
          c.textAlign = "center";
          c.font = `700 13px ${FONT_DISPLAY}`;
          c.fillStyle = "#fecaca";
          c.fillText("ขาย", cx, cy - 4);
          c.font = `600 11px ${FONT_BODY}`;
          c.fillStyle = "#ffd76a";
          c.fillText(`+${sell} ทอง`, cx, cy + 14);
        },
        () => {
          this.gold += sell;
          this.towers[sel] = null;
          this.selected = null;
          this.env.sfx.tone({ freq: 400, dur: 0.12, vol: 0.05, glideTo: 250 });
        }
      );
      return;
    }

    // Default: wave button + speed
    const waveLabel = this.waveActive ? `คลื่น ${this.wave} กำลังมา` : this.wave === 0 ? "ปล่อยคลื่นแรก" : `คลื่นถัดไป (${Math.ceil(this.breakT)})`;
    tile(
      18,
      w - 36 - 92 - 10,
      !this.waveActive,
      (cx, cy) => {
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = `700 16px ${FONT_DISPLAY}`;
        c.fillStyle = this.waveActive ? "rgba(255,255,255,0.7)" : "#bbf7d0";
        c.fillText(waveLabel, cx, cy - (this.waveActive ? 0 : 7));
        if (!this.waveActive) {
          c.font = `500 11px ${FONT_BODY}`;
          c.fillStyle = "rgba(255,255,255,0.65)";
          c.fillText(this.wave === 0 ? "แตะแท่นหินเพื่อสร้างป้อมก่อน" : "เรียกเร็วได้ทองโบนัส", cx, cy + 12);
        }
      },
      () => this.nextWave()
    );
    tile(
      w - 18 - 92,
      92,
      true,
      (cx, cy) => {
        c.fillStyle = this.speed > 1 ? "#fde68a" : "#ffffff";
        for (let k = 0; k < this.speed; k++) {
          const x = cx - (this.speed - 1) * 7 + k * 14 - 6;
          c.beginPath();
          c.moveTo(x, cy - 9);
          c.lineTo(x + 12, cy);
          c.lineTo(x, cy + 9);
          c.closePath();
          c.fill();
        }
      },
      () => {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
      }
    );
  }

  private drawTowerIcon(c: CanvasRenderingContext2D, k: TowerKind, x: number, y: number, enabled: boolean) {
    // Reuse the in-game tower drawing by temporarily pointing a fake pad at this spot
    const saved = PADS[0];
    const gx = (x - this.ox) / this.cell;
    const gy = (y - this.oy) / this.cell;
    PADS[0] = [gx, gy];
    c.globalAlpha = enabled ? 1 : 0.45;
    this.drawTower(c, { kind: k, pad: 0, lvl: 1, spent: 0, cd: 0, aim: -Math.PI / 2, target: null, flash: 0 }, 0);
    c.globalAlpha = 1;
    PADS[0] = saved;
  }

  private build(pad: number, kind: TowerKind) {
    const spec = TOWERS[kind];
    if (this.gold < spec.cost) return;
    this.gold -= spec.cost;
    this.towers[pad] = { kind, pad, lvl: 1, spent: spec.cost, cd: 0, aim: -Math.PI / 2, target: null, flash: 1 };
    this.selected = null;
    const p = this.px(PADS[pad][0], PADS[pad][1]);
    this.particles.burst(p.x, p.y, spec.color, 22, { speed: 140, size: 3, gravity: 0 });
    this.env.sfx.chime(pentatonic(3), 0.1);
  }

  private renderCard(c: CanvasRenderingContext2D) {
    const { w, h } = this;
    const labels: Record<string, string> = { td_gold: "ทองตั้งต้น", td_power: "ป้อมแรง", td_lives: "ต้นไม้ทน" };
    c.fillStyle = `rgba(6,8,28,${0.62 * clamp(this.stateT * 3, 0, 1)})`;
    c.fillRect(0, h * 0.8, w, h * 0.2 + 1);
    const survived = Math.max(0, this.wave - 1);
    const card = drawCard(c, w, h * 0.8, {
      title: this.state === "intro" ? "ปกป้องต้นไม้ลมหายใจ" : this.newBest ? "สถิติใหม่!" : "ต้นไม้ล้มแล้ว",
      subtitle: this.state === "intro" ? "ควันพิษกำลังมา" : `ผ่าน ${survived} คลื่น · ปัดเป่าควัน ${this.kills} ก้อน`,
      body:
        this.state === "intro"
          ? "แตะแท่นหินข้างทางเพื่อสร้างป้อม แตะป้อมเพื่ออัปเกรด ฆ่าควันได้ทอง คลื่นจะยากขึ้นเรื่อยๆ ไม่มีที่สิ้นสุด"
          : undefined,
      chips: [`สถิติ ${this.best} คลื่น`],
      coins: this.state === "over" ? this.earned : undefined,
      accent: "#16a34a",
      buttons: [this.state === "intro" ? this.startBtn : this.againBtn],
      appear: this.stateT * 3,
    });
    const y = card.y + card.h + 12;
    const bw = (Math.min(card.w, w - 20) - 16) / 3;
    const x0 = w / 2 - (bw * 3 + 16) / 2;
    c.globalAlpha = clamp(this.stateT * 3, 0, 1);
    this.upgradeBtns.forEach((u, i) => {
      const cost = wallet.upgradeCost(u.id);
      u.btn.label = `${labels[u.id]} ${wallet.level(u.id)}`;
      u.btn.color = wallet.coins() >= cost ? "#15803d" : "#334155";
      u.btn.place(x0 + i * (bw + 8) + bw / 2, y, bw, 40);
      u.btn.render(c);
      c.font = `600 11px ${FONT_BODY}`;
      c.textAlign = "center";
      c.textBaseline = "top";
      c.fillStyle = "#ffd76a";
      c.fillText(`อัป ${cost.toLocaleString()} เหรียญ`, x0 + i * (bw + 8) + bw / 2, y + 44);
    });
    c.globalAlpha = 1;
    c.font = `600 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText(`มีอยู่ ${wallet.coins().toLocaleString()} เหรียญ`, w / 2, y + 66);
  }
}
