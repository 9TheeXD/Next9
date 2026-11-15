// "Star Path" — watch stars light up in order, then tap them back. Holding a sequence in visual
// working memory leaves little room for the vivid images a craving is built on (elaborated
// intrusion theory; Kavanagh, Andrade & May 2005).
//
// The game is a map of numbered levels. Each level has its own board (more stars as you climb, at
// positions fixed per level so a level is a place you can come back to), a few rounds of growing
// sequences, and from level 4 on a twist: decoy flashes, drifting stars, reverse order, or two
// interleaved paths. The sequence itself is new on every attempt, so a retry is still a memory test.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeStars, drawStars, rgba, makeSprite, clamp, ease, TAU, FONT_DISPLAY, FONT_BODY, glow, rng, roundRectPath, type Star } from "./engine/fx";
import { Button, drawCard } from "./engine/ui";
import { pentatonic } from "./engine/audio";

const STAR_COLORS = ["#ffd66b", "#7ad8ff", "#ff8fd0", "#a6ff9e", "#c7a2ff", "#ffb27a", "#8ff5ff", "#f4f1ff"];
const GOLD = "#ffd34d";
const CYAN = "#4fe3ff";
const DECOY = "#ff3b5c";
const REVERSE = "#ff9f43";
/** Board aspect: height = width × this. */
const ASPECT = 1.2;

// ── Levels ─────────────────────────────────────────────────────────────────

export type Twist = "decoy" | "drift" | "reverse" | "dual";

export interface LevelDef {
  level: number;
  /** Stars on the board. */
  n: number;
  /** Sequence length of each round; clearing the last one clears the level. */
  rounds: number[];
  /** Seconds each star stays lit while the sequence is shown. */
  step: number;
  decoys: number;
  drift: boolean;
  reverse: boolean;
  dual: boolean;
  /** The twist this level introduces for the first time, if any. */
  fresh: Twist | null;
  theme: number;
}

interface Theme {
  name: string;
  bg: [string, string, string];
  blobs: [string, number][];
  accent: string;
  line: string;
}

const THEMES: Theme[] = [
  { name: "ฟ้ายามค่ำ", bg: ["#050822", "#0d1240", "#1a0d38"], blobs: [["#5b3cff", 0.5], ["#ff4fb0", 0.3], ["#1fb5ff", 0.4]], accent: "#8b6cff", line: "#b9a8ff" },
  { name: "เนบิวลาชมพู", bg: ["#16051f", "#2c0b3c", "#3c0c2c"], blobs: [["#ff4fb0", 0.55], ["#ff8a4f", 0.3], ["#9b5cff", 0.4]], accent: "#ff5fae", line: "#ffb3d9" },
  { name: "ม่านแสงออโรร่า", bg: ["#02161a", "#062c30", "#0b1a3a"], blobs: [["#22e3a5", 0.5], ["#1fb5ff", 0.4], ["#7b2cff", 0.3]], accent: "#1fcf9c", line: "#9ff5d8" },
  { name: "ทางช้างเผือกสีทอง", bg: ["#1a0e05", "#2e1a0a", "#1d0e2e"], blobs: [["#ffb347", 0.5], ["#ff6a3d", 0.3], ["#ffe08a", 0.25]], accent: "#f59e0b", line: "#ffe0a3" },
  { name: "ใจกลางกาแล็กซี", bg: ["#07020f", "#1a0636", "#04122e"], blobs: [["#c77dff", 0.55], ["#4f8bff", 0.45], ["#ffffff", 0.12]], accent: "#a855f7", line: "#e2c6ff" },
];
export const themeOf = (level: number) => Math.floor((level - 1) / 5) % THEMES.length;

const TWIST_TABLE: Record<number, Partial<LevelDef>> = {
  4: { decoys: 1, fresh: "decoy" },
  5: { decoys: 1 },
  7: { drift: true, fresh: "drift" },
  8: { drift: true, decoys: 1 },
  10: { decoys: 1 },
  11: { drift: true },
  12: { reverse: true, fresh: "reverse" },
  13: { decoys: 2 },
  14: { reverse: true, drift: true },
  15: { decoys: 2, drift: true },
  16: { dual: true, fresh: "dual" },
};

export function levelDef(L: number): LevelDef {
  const n = L <= 10 ? L + 2 : Math.min(16, 12 + Math.floor((L - 10) / 3));
  const d: LevelDef = { level: L, n, rounds: [], step: 0, decoys: 0, drift: false, reverse: false, dual: false, fresh: null, theme: themeOf(L) };
  if (L <= 16) Object.assign(d, TWIST_TABLE[L] || {});
  else {
    // After every twist is known they come back in mixes, one pattern per level in turn.
    const mix: Partial<LevelDef>[] = [
      { reverse: true, decoys: 1 },
      { drift: true, decoys: 2 },
      { dual: true },
      { reverse: true, drift: true },
      { decoys: 3 },
      { dual: true, drift: true },
    ];
    Object.assign(d, mix[(L - 17) % mix.length]);
  }
  // Level 1 remembers 3, level 10 remembers 6; after that the length grows slowly up to 8.
  let final = L <= 10 ? 3 + Math.floor((L - 1) / 3) : Math.min(8, 6 + Math.floor((L - 10) / 5));
  if (d.reverse || d.dual) final -= 1; // these twists are harder, so the sequence is one shorter
  d.rounds = L <= 3 ? [final - 1, final] : [final - 2, final - 1, final];
  d.step = clamp(0.8 - (L - 1) * 0.018, 0.46, 0.8) + (d.drift || d.dual ? 0.06 : 0);
  return d;
}

/**
 * Star positions for a level, in board units (width 1, height ASPECT). Seeded by the level number,
 * so a level is always the same "map"; only the sequence changes between attempts.
 */
export function layoutFor(L: number, n: number): { pts: { x: number; y: number }[]; sep: number } {
  const r = rng(L * 7919 + 13);
  const m = 0.085;
  const usable = (1 - 2 * m) * (ASPECT - 2 * m);
  let sep = Math.min(0.45, Math.sqrt(usable / (0.866 * n)) * 0.82);
  for (let attempt = 0; attempt < 40; attempt++) {
    const pts: { x: number; y: number }[] = [];
    let guard = 0;
    while (pts.length < n && guard++ < 4000) {
      const x = m + r() * (1 - 2 * m);
      const y = m + r() * (ASPECT - 2 * m);
      if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= sep)) pts.push({ x, y });
    }
    if (pts.length === n) return { pts, sep };
    sep *= 0.95;
  }
  // Fallback (never reached in practice): a plain grid.
  const cols = Math.ceil(Math.sqrt(n));
  const pts = Array.from({ length: n }, (_, i) => ({ x: m + ((i % cols) + 0.5) * ((1 - 2 * m) / cols), y: m + (Math.floor(i / cols) + 0.5) * ((ASPECT - 2 * m) / cols) }));
  return { pts, sep: (1 - 2 * m) / cols };
}

const TWIST_INFO: Record<Twist, { badge: string; text: string; color: string }> = {
  decoy: { badge: "ระวังดาวหลอก", text: "ดาวหลอกจะกะพริบเป็นสีแดงพร้อมกากบาท ไม่ต้องจำดวงนั้น", color: DECOY },
  drift: { badge: "ดาวลอย", text: "ดาวจะค่อยๆ ลอยไปมา จำว่าเป็นดวงไหน ไม่ใช่จำตำแหน่ง", color: "#7ad8ff" },
  reverse: { badge: "ย้อนกลับ", text: "ดูตามปกติ แต่ตอนแตะให้เริ่มจากดวงสุดท้ายย้อนไปดวงแรก", color: REVERSE },
  dual: { badge: "ทองก่อน แล้วฟ้า", text: "ดาวสว่างสีทองและสีฟ้าสลับกัน แตะสายสีทองให้ครบก่อน แล้วต่อด้วยสายสีฟ้า", color: GOLD },
};

function twistsOf(d: LevelDef): Twist[] {
  const t: Twist[] = [];
  if (d.reverse) t.push("reverse");
  if (d.dual) t.push("dual");
  if (d.decoys) t.push("decoy");
  if (d.drift) t.push("drift");
  return t;
}

function drawTwistIcon(c: CanvasRenderingContext2D, t: Twist, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y);
  c.lineCap = "round";
  c.lineJoin = "round";
  c.lineWidth = Math.max(1.6, s * 0.16);
  const col = TWIST_INFO[t].color;
  c.strokeStyle = col;
  c.fillStyle = col;
  if (t === "decoy") {
    c.beginPath();
    c.arc(0, 0, s * 0.42, 0, TAU);
    c.stroke();
    c.beginPath();
    c.moveTo(-s * 0.2, -s * 0.2);
    c.lineTo(s * 0.2, s * 0.2);
    c.moveTo(s * 0.2, -s * 0.2);
    c.lineTo(-s * 0.2, s * 0.2);
    c.stroke();
  } else if (t === "drift") {
    c.beginPath();
    for (let k = 0; k <= 12; k++) {
      const xx = -s * 0.45 + (k / 12) * s * 0.9;
      const yy = Math.sin((k / 12) * TAU) * s * 0.18;
      if (k) c.lineTo(xx, yy);
      else c.moveTo(xx, yy);
    }
    c.stroke();
  } else if (t === "reverse") {
    c.beginPath();
    c.arc(0, s * 0.05, s * 0.32, -Math.PI * 0.95, Math.PI * 0.35);
    c.stroke();
    const ax = Math.cos(-Math.PI * 0.95) * s * 0.32;
    const ay = s * 0.05 + Math.sin(-Math.PI * 0.95) * s * 0.32;
    c.beginPath();
    c.moveTo(ax - s * 0.06, ay - s * 0.24);
    c.lineTo(ax, ay);
    c.lineTo(ax + s * 0.22, ay - s * 0.06);
    c.stroke();
  } else {
    c.strokeStyle = "rgba(255,255,255,0.6)";
    c.beginPath();
    c.moveTo(-s * 0.25, 0);
    c.lineTo(s * 0.25, 0);
    c.stroke();
    c.fillStyle = GOLD;
    c.beginPath();
    c.arc(-s * 0.25, 0, s * 0.2, 0, TAU);
    c.fill();
    c.fillStyle = CYAN;
    c.beginPath();
    c.arc(s * 0.25, 0, s * 0.2, 0, TAU);
    c.fill();
  }
  c.restore();
}

/** Five-pointed star path centred on (x, y). */
function starPath(c: CanvasRenderingContext2D, x: number, y: number, r: number, inner = 0.45) {
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU - Math.PI / 2;
    const rr = k % 2 ? r * inner : r;
    if (k) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

// ── Game ───────────────────────────────────────────────────────────────────

interface Node {
  bx: number; // base position in board units
  by: number;
  x: number; // current position (drifts on some levels)
  y: number;
  color: string;
  note: number;
  lit: number; // 0..1 brightness boost
  litColor: string;
  decoy: number; // 0..1 decoy flash
  twinkle: number;
  ph: number;
  sp: number;
}

interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface ShowStep {
  node: number;
  decoy: boolean;
  col: number; // dual levels: 0 gold, 1 cyan; otherwise -1
}

export const starsGame: GameDefinition = {
  id: "stars",
  title: "เส้นทางดวงดาว",
  tagline: "จำลำดับดาวที่สว่าง ผ่านด่านไปทีละแผนที่",
  why: "การจำลำดับภาพต้องใช้ความจำส่วนเดียวกับที่ความอยากใช้สร้างภาพบุหรี่ในหัว พอสมองไม่ว่าง ความอยากก็จางลง",
  category: "brain",
  minutes: "2–5 นาที",
  palette: ["#0e1440", "#c7a2ff"],
  countdown: true,
  create: (env) => new StarsGame(env),
};

type State = "select" | "brief" | "ready" | "show" | "input" | "pause" | "clear" | "fail";

class StarsGame implements GameInstance {
  private w = 0;
  private h = 0;
  private area = { x: 0, y: 0, w: 0, h: 0 };
  private bgCache = new Map<number, HTMLCanvasElement>();
  private stars: Star[] = makeStars(220, 21);
  private unlocked = 1;
  private level = 1;
  private def: LevelDef = levelDef(1);
  private nodes: Node[] = [];
  private sep = 0.3;
  private seq: number[] = [];
  private seqCol: number[] = [];
  private roundIdx = 0;
  private show: ShowStep[] = [];
  private showIdx = -1;
  private showT = 0;
  private lastShown: number[] = [-1, -1, -1];
  private expect: number[] = [];
  private expectCol: number[] = [];
  private inputIdx = 0;
  private lives = 3;
  private state: State = "select";
  private stateT = 0;
  private time = 0;
  private after: "ready" | "clear" = "ready";
  private message = "";
  private lines: [number, number, string][] = [];
  private shake = 0;
  private particles = new Particles();
  private floaters = new Floaters();
  private shooting: Shooting[] = [];
  private celebrate = 0;
  private earned = 0;
  private firstClear = false;
  private live = false;
  private rand = Math.random;
  // Level map
  private scroll = 0;
  private scrollMax = 0;
  private drag: { y: number; s: number; moved: boolean; id: number } | null = null;
  private playBtn = new Button("เล่นด่าน 1", "#8b6cff");
  // Cards
  private goBtn = new Button("เริ่มเลย", "#8b6cff");
  private backBtn = new Button("กลับแผนที่", "#8b6cff", "ghost");
  private nextBtn = new Button("ด่านต่อไป", "#8b6cff");
  private retryBtn = new Button("ลองด่านนี้อีกครั้ง", "#8b6cff");
  private mapBtn = new Button("แผนที่ดวงดาว", "#8b6cff", "ghost");
  private cardBtns: [Button, () => void][] = [];
  private hudMap = { x: 0, y: 0, r: 22 };

  constructor(private env: GameEnv) {
    this.unlocked = parseInt(env.store.get("unlocked") || "0", 10) || 0;
    if (!this.unlocked) {
      // Players of the old endless version start where their longest sequence fits.
      const best = parseInt(env.store.get("best") || "0", 10) || 0;
      this.unlocked = best > 3 ? clamp(3 * (best - 3) + 1, 1, 7) : 1;
      if (this.unlocked > 1) env.store.set("unlocked", String(this.unlocked));
    }
    this.level = this.unlocked;
    this.loadLevel(this.level);
  }

  private rating(L: number) {
    return parseInt(this.env.store.get(`lv${L}_best`) || "0", 10) || 0;
  }

  private get theme() {
    return THEMES[this.def.theme];
  }

  /** Sets up the board of a level (positions, colours) without starting it. */
  private loadLevel(L: number) {
    this.level = L;
    this.def = levelDef(L);
    const { pts, sep } = layoutFor(L, this.def.n);
    this.sep = sep;
    const r = rng(L * 31 + 7);
    this.nodes = pts.map((p, i) => ({
      bx: p.x,
      by: p.y,
      x: p.x,
      y: p.y,
      color: this.def.dual ? "#e8ecff" : STAR_COLORS[i % STAR_COLORS.length],
      note: i,
      lit: 0,
      litColor: "#ffffff",
      decoy: 0,
      twinkle: r() * TAU,
      ph: r() * TAU,
      sp: 0.35 + r() * 0.3,
    }));
    this.lines = [];
    this.playBtn.label = `เล่นด่าน ${L}`;
    for (const b of [this.playBtn, this.goBtn, this.nextBtn, this.retryBtn]) b.color = this.theme.accent;
    for (const b of [this.backBtn, this.mapBtn]) b.color = this.theme.accent;
  }

  private pos(i: number) {
    const n = this.nodes[i];
    const s = this.area.w;
    return { x: this.area.x + n.x * s, y: this.area.y + n.y * s };
  }

  private nodeRadius() {
    return clamp(this.sep * this.area.w * 0.27, 12, 26);
  }

  private tapRadius() {
    return Math.max(22, Math.min(Math.max(this.nodeRadius() * 1.9, 28), this.sep * this.area.w * 0.5));
  }

  // ── Flow ────────────────────────────────────────────────────────────────

  private openBrief(L: number) {
    this.loadLevel(L);
    this.setState("brief");
  }

  private startLevel() {
    const d = this.def;
    this.lives = 3;
    this.roundIdx = 0;
    this.earned = 0;
    // One sequence for the whole level: each round shows a longer prefix of it.
    const len = d.rounds[d.rounds.length - 1];
    this.seq = [];
    this.seqCol = [];
    for (let k = 0; k < len; k++) {
      let next: number;
      do next = Math.floor(this.rand() * d.n);
      while (k > 0 && next === this.seq[k - 1]);
      this.seq.push(next);
      let col = -1;
      if (d.dual) {
        // Both paths stay about the same length in every round
        const gold = this.seqCol.filter((c) => c === 0).length;
        const cyan = k - gold;
        col = k < 2 ? k : gold > cyan ? 1 : cyan > gold ? 0 : this.rand() < 0.5 ? 0 : 1;
      }
      this.seqCol.push(col);
    }
    for (const n of this.nodes) {
      n.lit = 0;
      n.decoy = 0;
    }
    this.live = true;
    this.env.emit({ type: "start" }); // the runtime shows 3-2-1 before the first "look closely"
    this.toReady();
  }

  private toReady() {
    this.lines = [];
    this.setState("ready");
    this.message = "ดูให้ดี";
  }

  private beginShow() {
    const d = this.def;
    const len = d.rounds[this.roundIdx];
    const steps: ShowStep[] = [];
    for (let k = 0; k < len; k++) steps.push({ node: this.seq[k], decoy: false, col: this.seqCol[k] });
    for (let k = 0; k < d.decoys; k++) {
      const at = 1 + Math.floor(this.rand() * steps.length); // never before the first real star
      const near = [steps[at - 1]?.node, steps[at]?.node];
      let node: number;
      let guard = 0;
      do node = Math.floor(this.rand() * d.n);
      while (near.includes(node) && guard++ < 30);
      steps.splice(at, 0, { node, decoy: true, col: -1 });
    }
    this.show = steps;
    this.showIdx = -1;
    this.showT = -0.25;
    this.lastShown = [-1, -1, -1];
    this.lines = [];
    this.setState("show");
    this.message = "ดูให้ดี";
  }

  private beginInput() {
    const len = this.def.rounds[this.roundIdx];
    const idx = Array.from({ length: len }, (_, k) => k);
    let order = idx;
    if (this.def.reverse) order = idx.slice().reverse();
    else if (this.def.dual) order = [...idx.filter((k) => this.seqCol[k] === 0), ...idx.filter((k) => this.seqCol[k] === 1)];
    this.expect = order.map((k) => this.seq[k]);
    this.expectCol = order.map((k) => this.seqCol[k]);
    this.inputIdx = 0;
    this.lines = [];
    this.setState("input");
    this.updateInputMessage();
  }

  private updateInputMessage() {
    const total = this.expect.length;
    if (this.def.dual) {
      const col = this.expectCol[this.inputIdx] ?? 1;
      const ofCol = this.expectCol.filter((c) => c === col).length;
      const done = this.expectCol.slice(0, this.inputIdx).filter((c) => c === col).length;
      this.message = `${col === 0 ? "แตะสายสีทอง" : "ต่อด้วยสายสีฟ้า"} ${done}/${ofCol}`;
    } else if (this.def.reverse) this.message = `แตะย้อนกลับ ${this.inputIdx}/${total}`;
    else this.message = `แตะตามลำดับ ${this.inputIdx}/${total}`;
  }

  private setState(s: State) {
    this.state = s;
    this.stateT = 0;
    this.cardBtns = [];
  }

  private light(i: number, col: number) {
    const n = this.nodes[i];
    n.lit = 1;
    n.litColor = col === 0 ? GOLD : col === 1 ? CYAN : n.color;
    const p = this.pos(i);
    this.env.sfx.chime(pentatonic((n.note % 10) + 2 + (col === 1 ? 1 : 0), 330), 0.13);
    this.particles.burst(p.x, p.y, n.litColor, 10, { speed: 90, size: 2.2, gravity: 0, life: 0.7 });
    this.particles.ring(p.x, p.y, n.litColor, this.nodeRadius() * 2.4, 0.6);
  }

  private decoyFlash(i: number) {
    const n = this.nodes[i];
    n.decoy = 1;
    const p = this.pos(i);
    this.env.sfx.tone({ freq: 185, dur: 0.22, vol: 0.07, type: "triangle", glideTo: 140 });
    this.particles.burst(p.x, p.y, DECOY, 8, { speed: 70, size: 2, gravity: 0, life: 0.5, kind: "shard" });
  }

  private tap(i: number) {
    const expected = this.expect[this.inputIdx];
    if (i === expected) {
      const col = this.expectCol[this.inputIdx];
      this.light(i, col);
      if (this.inputIdx > 0 && this.expectCol[this.inputIdx - 1] === col) this.lines.push([this.expect[this.inputIdx - 1], i, this.lineColor(col)]);
      this.inputIdx++;
      if (this.inputIdx >= this.expect.length) this.roundDone();
      else this.updateInputMessage();
      return;
    }
    this.lives--;
    this.shake = 10;
    const p = this.pos(i);
    this.particles.burst(p.x, p.y, "#ff7b7b", 8, { speed: 80, size: 2, gravity: 0, life: 0.5 });
    // Show where the right star was, so a miss teaches something
    const q = this.pos(expected);
    this.particles.ring(q.x, q.y, "#ffffff", this.nodeRadius() * 2.2, 0.8);
    this.env.sfx.tone({ freq: 220, dur: 0.35, vol: 0.08, type: "triangle", glideTo: 150 });
    if (this.lives <= 0) {
      this.fail();
    } else {
      this.message = "ผิดดวง ดูอีกรอบนะ";
      this.after = "ready";
      this.setState("pause");
    }
  }

  private lineColor(col: number) {
    return col === 0 ? GOLD : col === 1 ? CYAN : this.theme.line;
  }

  private roundDone() {
    this.celebrate = 1;
    this.roundIdx++;
    this.env.emit({ type: "score", score: this.roundIdx });
    const words = ["เยี่ยม!", "ความจำดีมาก", "สวยงาม!", "แม่นยำ!"];
    this.floaters.add(words[(this.roundIdx + this.level) % words.length], this.w / 2, this.area.y + this.area.h / 2, "#ffffff", 26);
    for (const idx of new Set(this.expect)) {
      const p = this.pos(idx);
      this.particles.burst(p.x, p.y, this.nodes[idx].lit > 0 ? this.nodes[idx].litColor : this.nodes[idx].color, 8, { speed: 140, size: 2.5, gravity: 30, life: 1 });
    }
    [0, 2, 4].forEach((s, k) => this.env.sfx.chime(pentatonic(s + 7, 330), 0.08, 0.15 + k * 0.08));
    const last = this.roundIdx >= this.def.rounds.length;
    this.message = last ? "ครบทุกรอบ!" : `ผ่านรอบ ${this.roundIdx}/${this.def.rounds.length}`;
    this.after = last ? "clear" : "ready";
    this.setState("pause");
  }

  private clearLevel() {
    const L = this.level;
    this.firstClear = L >= this.unlocked;
    if (this.lives > this.rating(L)) this.env.store.set(`lv${L}_best`, String(this.lives));
    if (L + 1 > this.unlocked) {
      this.unlocked = L + 1;
      this.env.store.set("unlocked", String(this.unlocked));
    }
    // 10-40 for a first clear, growing with the level; replays of cleared levels pay half.
    const full = clamp(4 + L + this.lives * 2, 10, 40);
    this.earned = this.firstClear ? full : Math.max(5, Math.round(full / 2));
    this.live = false;
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: L,
      best: this.unlocked - 1,
      summary: `ผ่านด่าน ${L} (${this.lives} ดาว)`,
      stats: { level: L, lives: this.lives, stars: this.def.n },
    });
    for (let k = 0; k < 40; k++) {
      const i = k % this.nodes.length;
      const p = this.pos(i);
      this.particles.burst(p.x, p.y, this.nodes[i].color, 2, { speed: 220, size: 3, gravity: 60, life: 1.4, kind: "spark" });
    }
    [0, 2, 4, 7, 9].forEach((s, k) => this.env.sfx.chime(pentatonic(s + 5, 330), 0.09, k * 0.09));
    this.setState("clear");
  }

  private fail() {
    this.earned = clamp(3 + this.roundIdx * 2, 3, 9);
    this.live = false;
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: this.level - 1,
      best: this.unlocked - 1,
      summary: `ด่าน ${this.level} ผ่าน ${this.roundIdx}/${this.def.rounds.length} รอบ`,
      stats: { level: this.level, rounds: this.roundIdx },
    });
    this.setState("fail");
  }

  private toMap() {
    if (this.live) {
      this.live = false;
      this.env.emit({ type: "end", coins: 0, score: 0, best: this.unlocked - 1, summary: `ออกจากด่าน ${this.level}` });
    }
    this.level = Math.min(this.level, this.unlocked);
    this.loadLevel(this.level);
    this.setState("select");
    this.centerMap();
  }

  /** After a clear: levels with a reverse/dual rule or a brand-new twist get their card first. */
  private goNext() {
    const L = this.level + 1;
    const d = levelDef(L);
    if (d.fresh || d.reverse || d.dual) this.openBrief(L);
    else {
      this.loadLevel(L);
      this.startLevel();
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 120;
    const bottom = 74;
    const availW = w - 28;
    const availH = h - top - bottom;
    const s = Math.max(120, Math.min(availW, availH / ASPECT, 560));
    this.area = { x: (w - s) / 2, y: top + Math.max(0, (availH - s * ASPECT) / 2), w: s, h: s * ASPECT };
    this.bgCache.clear();
    this.centerMap();
  }

  private bgFor(t: number): HTMLCanvasElement {
    const hit = this.bgCache.get(t);
    if (hit) return hit;
    const { w, h } = this;
    const th = THEMES[t];
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const spr = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, th.bg[0]);
      g.addColorStop(0.5, th.bg[1]);
      g.addColorStop(1, th.bg[2]);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const r = rng(77 + t * 101);
      for (const [col, a] of th.blobs) {
        for (let k = 0; k < 5; k++) {
          const x = w * (0.2 + r() * 0.6) + (r() - 0.5) * w * 0.3;
          const y = h * (0.15 + r() * 0.7);
          const rad = Math.max(w, h) * (0.12 + r() * 0.22);
          const rg = c.createRadialGradient(x, y, 0, x, y, rad);
          rg.addColorStop(0, rgba(col, a * 0.22));
          rg.addColorStop(1, rgba(col, 0));
          c.fillStyle = rg;
          c.fillRect(0, 0, w, h);
        }
      }
      if (t === 2) {
        // Aurora curtains
        for (let k = 0; k < 3; k++) {
          const y0 = h * (0.12 + k * 0.1);
          const ag = c.createLinearGradient(0, y0 - 60, 0, y0 + 120);
          ag.addColorStop(0, "rgba(34,227,165,0)");
          ag.addColorStop(0.4, `rgba(34,227,165,${0.1 - k * 0.025})`);
          ag.addColorStop(1, "rgba(31,181,255,0)");
          c.fillStyle = ag;
          c.beginPath();
          c.moveTo(0, y0);
          for (let x = 0; x <= w; x += 20) c.lineTo(x, y0 + Math.sin(x * 0.012 + k * 2) * 30);
          c.lineTo(w, y0 + 140);
          c.lineTo(0, y0 + 140);
          c.fill();
        }
      }
      if (t === 3 || t === 4) {
        // A faint galactic band across the sky
        c.save();
        c.translate(w / 2, h / 2);
        c.rotate(t === 3 ? -0.5 : 0.6);
        const bg = c.createLinearGradient(0, -h * 0.18, 0, h * 0.18);
        bg.addColorStop(0, "rgba(255,255,255,0)");
        bg.addColorStop(0.5, rgba(th.blobs[0][0], 0.12));
        bg.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = bg;
        c.fillRect(-w * 1.5, -h * 0.18, w * 3, h * 0.36);
        c.restore();
      }
      // Faint background constellations, different per theme
      c.strokeStyle = rgba(th.line, 0.12);
      c.fillStyle = rgba(th.line, 0.35);
      c.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        let x = w * (0.1 + r() * 0.8);
        let y = h * (0.08 + r() * 0.84);
        c.beginPath();
        c.moveTo(x, y);
        const pts: [number, number][] = [[x, y]];
        for (let s = 0; s < 4 + Math.floor(r() * 3); s++) {
          x = clamp(x + (r() - 0.5) * 90, 8, w - 8);
          y = clamp(y + (r() - 0.5) * 90, 8, h - 8);
          c.lineTo(x, y);
          pts.push([x, y]);
        }
        c.stroke();
        for (const [px, py] of pts) {
          c.beginPath();
          c.arc(px, py, 1.6, 0, TAU);
          c.fill();
        }
      }
      for (let i = 0; i < 1400; i++) {
        c.fillStyle = `rgba(255,255,255,${r() * 0.12})`;
        c.fillRect(r() * w, r() * h, 1, 1);
      }
    });
    this.bgCache.set(t, spr);
    return spr;
  }

  // ── Level map ───────────────────────────────────────────────────────────

  private readonly gap = 96;

  private mapMax() {
    return Math.max(10, Math.ceil((this.unlocked + 3) / 5) * 5);
  }

  private mapBase() {
    return this.h - 262;
  }

  private mapY(L: number) {
    return this.mapBase() - (L - 1) * this.gap + this.scroll;
  }

  private mapX(L: number) {
    const amp = Math.min(this.w * 0.27, 150);
    return this.w / 2 + Math.sin(L * 1.25 + 0.4) * amp;
  }

  private centerMap() {
    if (!this.h) return;
    this.scrollMax = Math.max(0, (this.mapMax() - 1) * this.gap - (this.mapBase() - 150));
    this.scroll = clamp((this.level - 1) * this.gap - (this.mapBase() - this.h * 0.45), 0, this.scrollMax);
  }

  private selectLevel(L: number) {
    if (L < 1 || L > this.unlocked || L === this.level) return;
    this.loadLevel(L);
    this.env.sfx.chime(pentatonic(L % 10, 330), 0.07);
  }

  private renderMap() {
    const { ctx } = this.env;
    const { w, h } = this;
    // Background follows the theme at the middle of the screen, crossfading between groups.
    const Lc = (this.mapBase() + this.scroll - h * 0.45) / this.gap + 1;
    const g = Math.max(0, (Lc - 1) / 5);
    const i0 = Math.floor(g);
    const fr = clamp((g - i0 - 0.7) / 0.3, 0, 1);
    ctx.drawImage(this.bgFor(i0 % THEMES.length), 0, 0, w, h);
    if (fr > 0) {
      ctx.globalAlpha = ease.inOutSine(fr);
      ctx.drawImage(this.bgFor((i0 + 1) % THEMES.length), 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    drawStars(ctx, this.stars, w, h, this.time * 0.7);
    this.renderShooting();

    const max = this.mapMax();
    // Path
    ctx.save();
    ctx.lineCap = "round";
    for (let L = 1; L < max; L++) {
      const y0 = this.mapY(L);
      const y1 = this.mapY(L + 1);
      if (y0 < -60 || y1 > h + 60) continue;
      const done = L < this.unlocked;
      const th = THEMES[themeOf(L)];
      ctx.strokeStyle = done ? rgba(th.line, 0.75) : "rgba(255,255,255,0.18)";
      ctx.lineWidth = done ? 3 : 2;
      ctx.setLineDash(done ? [] : [4, 8]);
      ctx.beginPath();
      ctx.moveTo(this.mapX(L), y0);
      ctx.lineTo(this.mapX(L + 1), y1);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Group labels
    for (let k = 1; k * 5 + 1 <= max; k++) {
      const L = k * 5 + 1;
      const y = this.mapY(L) + this.gap * 0.5;
      if (y < 96 || y > h - 180) continue;
      const th = THEMES[themeOf(L)];
      const label = `${th.name} · ด่าน ${L}–${L + 4}`;
      ctx.font = `700 12px ${FONT_DISPLAY}`;
      const tw = ctx.measureText(label).width + 26;
      const x = this.mapX(L) < w / 2 ? w - 14 - tw : 14;
      ctx.fillStyle = "rgba(8,10,30,0.6)";
      roundRectPath(ctx, x, y - 13, tw, 26, 13);
      ctx.fill();
      ctx.strokeStyle = rgba(th.accent, 0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = th.line;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + tw / 2, y + 1);
    }

    // Nodes
    for (let L = 1; L <= max; L++) {
      const x = this.mapX(L);
      const y = this.mapY(L);
      if (y < -40 || y > h + 40) continue;
      const th = THEMES[themeOf(L)];
      const open = L <= this.unlocked;
      const cleared = L < this.unlocked;
      const sel = L === this.level;
      const cur = L === this.unlocked;
      const r = sel ? 27 : 23;
      if (open) glow(ctx, x, y, r * (sel ? 3.2 : 2.4), th.accent, sel ? 0.55 : 0.3);
      if (sel) {
        ctx.strokeStyle = rgba("#ffffff", 0.5 + 0.3 * Math.sin(this.time * 4));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 7 + Math.sin(this.time * 4) * 2, 0, TAU);
        ctx.stroke();
      }
      const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      if (open) {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.35, th.line);
        grad.addColorStop(1, th.accent);
      } else {
        grad.addColorStop(0, "rgba(255,255,255,0.18)");
        grad.addColorStop(1, "rgba(255,255,255,0.05)");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = open ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (open) {
        ctx.font = `800 ${sel ? 19 : 17}px ${FONT_DISPLAY}`;
        ctx.fillStyle = "#1a1040";
        ctx.fillText(String(L), x, y + 1);
      } else {
        // Padlock
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        roundRectPath(ctx, x - 7, y - 2, 14, 11, 3);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - 3, 4.5, Math.PI, 0);
        ctx.stroke();
      }
      // Rating stars under cleared levels
      if (cleared) {
        const got = this.rating(L);
        for (let k = 0; k < 3; k++) {
          starPath(ctx, x + (k - 1) * 13, y + r + 9, 5.5);
          ctx.fillStyle = k < got ? "#ffd66b" : "rgba(255,255,255,0.2)";
          ctx.fill();
        }
      } else if (cur) {
        ctx.font = `700 11px ${FONT_DISPLAY}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText("ด่านใหม่", x, y + r + 12);
      }
      // Twist badge
      const tw = twistsOf(levelDef(L));
      if (tw.length) {
        const bx = x + r * 0.78;
        const by = y - r * 0.78;
        ctx.fillStyle = "rgba(10,10,30,0.85)";
        ctx.beginPath();
        ctx.arc(bx, by, 10, 0, TAU);
        ctx.fill();
        drawTwistIcon(ctx, tw[0], bx, by, 13);
      }
    }

    // Header
    const hg = ctx.createLinearGradient(0, 0, 0, 120);
    hg.addColorStop(0, "rgba(4,6,20,0.92)");
    hg.addColorStop(1, "rgba(4,6,20,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, w, 120);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("เส้นทางดวงดาว", w / 2, 34);
    let total = 0;
    for (let L = 1; L < this.unlocked; L++) total += this.rating(L);
    ctx.font = `500 13px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(this.unlocked > 1 ? `ผ่านแล้ว ${this.unlocked - 1} ด่าน · ดาวสะสม ${total}/${(this.unlocked - 1) * 3}` : "ดาวสว่างทีละดวง จำไว้ แล้วแตะตาม", w / 2, 62);

    // Bottom panel with the selected level
    const fade = ctx.createLinearGradient(0, h - 230, 0, h);
    fade.addColorStop(0, "rgba(4,6,20,0)");
    fade.addColorStop(0.45, "rgba(4,6,20,0.85)");
    fade.addColorStop(1, "rgba(4,6,20,0.95)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, h - 230, w, 230);
    const pw = Math.min(380, w - 24);
    const px = (w - pw) / 2;
    const ph = 176;
    const py = h - ph - 12;
    ctx.fillStyle = "rgba(14,14,44,0.92)";
    roundRectPath(ctx, px, py, pw, ph, 22);
    ctx.fill();
    ctx.strokeStyle = rgba(this.theme.accent, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const d = this.def;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `800 19px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`ด่าน ${d.level}`, px + 18, py + 24);
    const lw = ctx.measureText(`ด่าน ${d.level}`).width;
    ctx.font = `600 13px ${FONT_BODY}`;
    ctx.fillStyle = this.theme.line;
    ctx.fillText(this.theme.name, px + 28 + lw, py + 25);
    const got = this.rating(d.level);
    if (d.level < this.unlocked) {
      for (let k = 0; k < 3; k++) {
        starPath(ctx, px + pw - 58 + k * 20, py + 24, 7.5);
        ctx.fillStyle = k < got ? "#ffd66b" : "rgba(255,255,255,0.2)";
        ctx.fill();
      }
    }
    ctx.font = `500 13px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`ดาวบนฟ้า ${d.n} ดวง · ${d.rounds.length} รอบ · จำยาวสุด ${d.rounds[d.rounds.length - 1]} ดวง`, px + 18, py + 50);
    const tws = twistsOf(d);
    if (tws.length) {
      let xx = px + 18;
      for (const t of tws) xx = this.badge(ctx, t, xx, py + 80) + 6;
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(d.level === 1 ? "เริ่มจากดาว 3 ดวง ค่อยๆ ยากขึ้นทีละด่าน" : "ด่านปกติ ไม่มีกติกาพิเศษ", px + 18, py + 80);
    }
    this.playBtn.place(w / 2, py + 106, pw - 36, 54);
    this.playBtn.render(ctx);
  }

  /** Small pill with a twist icon and its name; returns the right edge. */
  private badge(c: CanvasRenderingContext2D, t: Twist, x: number, y: number, pulse = 0) {
    const info = TWIST_INFO[t];
    c.save();
    c.font = `700 12px ${FONT_DISPLAY}`;
    const tw = c.measureText(info.badge).width + 40;
    c.fillStyle = rgba(info.color, 0.16 + pulse * 0.2);
    roundRectPath(c, x, y - 13, tw, 26, 13);
    c.fill();
    c.strokeStyle = rgba(info.color, 0.7);
    c.lineWidth = 1;
    c.stroke();
    drawTwistIcon(c, t, x + 15, y, 14);
    c.fillStyle = "#ffffff";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(info.badge, x + 28, y + 1);
    c.restore();
    return x + tw;
  }

  // ── Input ───────────────────────────────────────────────────────────────

  pointer(p: PointerInfo) {
    if (this.state === "select") return this.mapPointer(p);
    if (this.state === "brief" || this.state === "clear" || this.state === "fail") {
      for (const [b, act] of this.cardBtns) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up" || p.type === "cancel") {
          const go = p.type === "up" && b.pressed && b.hit(p.x, p.y) && this.stateT > 0.35;
          b.pressed = false;
          if (go) {
            act();
            return;
          }
        }
      }
      return;
    }
    if (p.type !== "down") return;
    if (Math.hypot(p.x - this.hudMap.x, p.y - this.hudMap.y) <= this.hudMap.r + 6) {
      this.toMap();
      return;
    }
    if (this.state !== "input") return;
    const rad = this.tapRadius();
    let bestI = -1;
    let bestD = Infinity;
    this.nodes.forEach((_, i) => {
      const q = this.pos(i);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < rad && d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    if (bestI >= 0) this.tap(bestI);
  }

  private mapPointer(p: PointerInfo) {
    if (p.type === "down") {
      if (this.playBtn.hit(p.x, p.y)) {
        this.playBtn.pressed = true;
        return;
      }
      this.drag = { y: p.y, s: this.scroll, moved: false, id: p.id };
      return;
    }
    if (p.type === "move" && this.drag && this.drag.id === p.id) {
      const dy = p.y - this.drag.y;
      if (Math.abs(dy) > 8) this.drag.moved = true;
      if (this.drag.moved) this.scroll = clamp(this.drag.s + dy, 0, this.scrollMax);
      return;
    }
    if (p.type === "up" || p.type === "cancel") {
      if (this.playBtn.pressed) {
        this.playBtn.pressed = false;
        if (p.type === "up" && this.playBtn.hit(p.x, p.y) && this.stateT > 0.3) this.openBrief(this.level);
        return;
      }
      const d = this.drag;
      this.drag = null;
      if (p.type !== "up" || !d || d.moved || p.y > this.h - 190) return;
      for (let L = 1; L <= this.mapMax(); L++) {
        if (Math.hypot(p.x - this.mapX(L), p.y - this.mapY(L)) < 34) {
          if (L === this.level) this.openBrief(L);
          else if (L <= this.unlocked) this.selectLevel(L);
          else this.env.sfx.tone({ freq: 200, dur: 0.08, vol: 0.04, type: "triangle" });
          return;
        }
      }
    }
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.state === "select") {
      if (code === "ArrowUp" || code === "ArrowRight") this.selectLevel(this.level + 1);
      else if (code === "ArrowDown" || code === "ArrowLeft") this.selectLevel(this.level - 1);
      else if ((code === "Enter" || code === "Space") && this.stateT > 0.3) this.openBrief(this.level);
      else return false;
      this.scroll = clamp((this.level - 1) * this.gap - (this.mapBase() - this.h * 0.45), 0, this.scrollMax);
      return true;
    }
    if ((code === "Enter" || code === "Space") && this.cardBtns.length) {
      if (this.stateT > 0.4) this.cardBtns[0][1]();
      return true;
    }
    if (code === "Escape" && this.state !== "brief") {
      this.toMap();
      return true;
    }
    const m = /^Digit([1-9])$/.exec(code);
    if (m && this.state === "input") {
      const i = parseInt(m[1], 10) - 1;
      if (i < this.nodes.length) this.tap(i);
      return true;
    }
    return false;
  }

  // ── Update ──────────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    for (const b of [this.playBtn, this.goBtn, this.backBtn, this.nextBtn, this.retryBtn, this.mapBtn]) b.update(dt);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.celebrate = Math.max(0, this.celebrate - dt * 0.8);
    for (const n of this.nodes) {
      n.lit = Math.max(0, n.lit - dt * 2.2);
      n.decoy = Math.max(0, n.decoy - dt * 2.4);
    }
    const playing = this.state === "ready" || this.state === "show" || this.state === "input" || this.state === "pause";
    if (this.def.drift && playing) {
      const amp = this.sep * 0.15;
      for (const n of this.nodes) {
        n.x = n.bx + Math.sin(this.time * n.sp + n.ph) * amp;
        n.y = n.by + Math.cos(this.time * n.sp * 0.83 + n.ph * 1.7) * amp;
      }
    }

    if (!this.env.reducedMotion && Math.random() < dt * 0.12) {
      const fromLeft = Math.random() < 0.5;
      this.shooting.push({ x: fromLeft ? -20 : this.w + 20, y: Math.random() * this.h * 0.5, vx: (fromLeft ? 1 : -1) * (380 + Math.random() * 200), vy: 120 + Math.random() * 80, life: 1.4 });
    }
    for (const s of this.shooting) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.shooting = this.shooting.filter((s) => s.life > 0);

    if (this.state === "ready") {
      if (this.stateT >= (this.def.reverse || this.def.dual ? 1.6 : 1.1)) this.beginShow();
    } else if (this.state === "show") {
      this.showT += dt;
      const step = this.def.step;
      const gap = 0.16;
      const idx = Math.floor(this.showT / (step + gap));
      if (this.showT >= 0 && idx !== this.showIdx && idx < this.show.length) {
        this.showIdx = idx;
        const s = this.show[idx];
        if (s.decoy) this.decoyFlash(s.node);
        else {
          this.light(s.node, s.col);
          const prev = this.lastShown[s.col + 1];
          if (prev >= 0) this.lines.push([prev, s.node, this.lineColor(s.col)]);
          this.lastShown[s.col + 1] = s.node;
        }
      }
      if (this.showT >= this.show.length * (step + gap) + 0.25) this.beginInput();
    } else if (this.state === "pause" && this.stateT > 1.25) {
      if (this.after === "clear") this.clearLevel();
      else this.toReady();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  private renderShooting() {
    const { ctx } = this.env;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.shooting) {
      const a = clamp(s.life, 0, 1);
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.18, s.y - s.vy * 0.18);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.18, s.y - s.vy * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  }

  render() {
    if (this.state === "select") {
      this.renderMap();
      this.particles.render(this.env.ctx);
      return;
    }
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    ctx.drawImage(this.bgFor(this.def.theme), 0, 0, w, h);
    drawStars(ctx, this.stars, w, h, this.time * 0.7);
    this.renderShooting();

    ctx.save();
    if (this.shake > 0 && !this.env.reducedMotion) ctx.translate(Math.sin(this.time * 60) * this.shake * 0.6, 0);

    // Board halo
    const a = this.area;
    const bg = ctx.createRadialGradient(a.x + a.w / 2, a.y + a.h / 2, 10, a.x + a.w / 2, a.y + a.h / 2, a.h * 0.7);
    bg.addColorStop(0, rgba(this.theme.accent, 0.1));
    bg.addColorStop(1, rgba(this.theme.accent, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(a.x - 40, a.y - 40, a.w + 80, a.h + 80);

    // Reverse levels: an orange frame whose dashes run backwards while you tap
    if (this.def.reverse && (this.state === "input" || this.state === "ready")) {
      ctx.save();
      ctx.strokeStyle = rgba(REVERSE, 0.55);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = this.env.reducedMotion ? 0 : this.time * 30;
      roundRectPath(ctx, a.x - 10, a.y - 8, a.w + 20, a.h + 16, 26);
      ctx.stroke();
      ctx.restore();
    }

    // Constellation lines
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const [i, j, col] of this.lines) {
      const p = this.pos(i);
      const q = this.pos(j);
      ctx.strokeStyle = rgba(col, 0.75);
      ctx.lineWidth = 2.5 + this.celebrate * 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.restore();

    // Stars
    const R = this.nodeRadius();
    const watching = this.state === "ready";
    const dim = watching ? 0.55 + 0.45 * clamp(1 - this.stateT * 2, 0, 1) : 1;
    this.nodes.forEach((n, i) => {
      const p = this.pos(i);
      const tw = 0.85 + 0.15 * Math.sin(this.time * 2 + n.twinkle);
      const lit = ease.outCubic(n.lit);
      const col = lit > 0.02 ? n.litColor : n.color;
      ctx.save();
      ctx.globalAlpha = dim;
      glow(ctx, p.x, p.y, R * (3 + lit * 3), col, 0.22 + lit * 0.55);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(this.time * 0.2 + n.twinkle);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba(col, 0.35 + lit * 0.5);
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.25);
        ctx.lineTo(R * (1.6 + lit * 1.2) * tw, 0);
        ctx.lineTo(0, R * 0.25);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      const core = ctx.createRadialGradient(p.x - R * 0.2, p.y - R * 0.2, 0, p.x, p.y, R * 0.8);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.5, col);
      core.addColorStop(1, rgba(col, 0.2));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * (0.55 + lit * 0.25) * tw, 0, TAU);
      ctx.fill();
      if (this.state === "input") {
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 1.25, 0, TAU);
        ctx.stroke();
      }
      // Decoy flash: red, jagged ring and a cross, so it never looks like a real step
      if (n.decoy > 0) {
        const k = ease.outCubic(n.decoy);
        glow(ctx, p.x, p.y, R * 3.2, DECOY, 0.6 * k);
        ctx.strokeStyle = rgba(DECOY, k);
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let s = 0; s <= 16; s++) {
          const ang = (s / 16) * TAU;
          const rr = R * (1.35 + (s % 2 ? 0.25 : 0)) * (1.2 - 0.2 * k);
          if (s) ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
          else ctx.moveTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
        }
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p.x - R * 0.6, p.y - R * 0.6);
        ctx.lineTo(p.x + R * 0.6, p.y + R * 0.6);
        ctx.moveTo(p.x + R * 0.6, p.y - R * 0.6);
        ctx.lineTo(p.x - R * 0.6, p.y + R * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    });
    ctx.restore();

    this.particles.render(ctx);
    this.floaters.render(ctx);
    this.renderHud();

    if (this.state === "brief") this.renderBrief();
    else if (this.state === "clear") this.renderClear();
    else if (this.state === "fail") this.renderFail();
  }

  private renderHud() {
    const { ctx } = this.env;
    const { w, h } = this;
    const d = this.def;
    // Map button (top-left)
    this.hudMap = { x: 32, y: 32, r: 20 };
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(32, 32, 20, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(22, 26);
    ctx.lineTo(28, 23);
    ctx.lineTo(36, 27);
    ctx.lineTo(42, 24);
    ctx.lineTo(42, 38);
    ctx.lineTo(36, 41);
    ctx.lineTo(28, 37);
    ctx.lineTo(22, 40);
    ctx.closePath();
    ctx.moveTo(28, 23);
    ctx.lineTo(28, 37);
    ctx.moveTo(36, 27);
    ctx.lineTo(36, 41);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 16px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`ด่าน ${d.level}`, w / 2, 24);
    ctx.font = `500 11px ${FONT_BODY}`;
    ctx.fillStyle = this.theme.line;
    ctx.fillText(this.theme.name, w / 2, 42);
    // Round progress dots (top-right)
    for (let k = 0; k < d.rounds.length; k++) {
      const x = w - 24 - (d.rounds.length - 1 - k) * 18;
      const done = k < this.roundIdx;
      const now = k === this.roundIdx && this.state !== "clear";
      starPath(ctx, x, 30, now ? 8 : 6.5);
      ctx.fillStyle = done ? "#ffd66b" : now ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.2)";
      ctx.fill();
    }
    ctx.font = `500 10px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("รอบ", w - 24 - (d.rounds.length - 1) * 9, 48);

    if (this.state === "brief") return;
    // Message
    let msg = this.message;
    let col = "#ffffff";
    if (this.env.counting()) msg = `ด่าน ${d.level}`;
    if (this.state === "ready" || (this.state === "show" && this.showT < 0.3)) {
      col = this.theme.line;
      if (d.reverse) msg = "ดูให้ดี แล้วแตะย้อนกลับ";
      else if (d.dual) msg = "ดูให้ดี สองสาย";
    }
    if (this.state === "input" && d.reverse) col = REVERSE;
    if (this.state === "input" && d.dual) col = this.expectCol[this.inputIdx] === 1 ? CYAN : GOLD;
    const watch = this.state === "ready" || this.state === "show";
    ctx.font = `700 ${watch ? 24 : 22}px ${FONT_DISPLAY}`;
    const mw = ctx.measureText(msg).width;
    if (watch && !this.env.counting()) {
      // Eye icon beside "look closely"
      const ex = w / 2 - mw / 2 - 26;
      const ey = 72;
      const open = this.state === "ready" ? 0.6 + 0.4 * Math.abs(Math.sin(this.stateT * 5)) : 1;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex - 13, ey);
      ctx.quadraticCurveTo(ex, ey - 11 * open, ex + 13, ey);
      ctx.quadraticCurveTo(ex, ey + 11 * open, ex - 13, ey);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey, 4 * open, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (this.state === "ready") {
        // Ring tightening around the board: the show is about to begin
        const k = clamp(this.stateT / 1.1, 0, 1);
        const a = this.area;
        ctx.strokeStyle = rgba(this.theme.line, 0.35 * (1 - k));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, a.w * (0.9 - 0.3 * k), a.h * (0.75 - 0.25 * k), 0, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.textAlign = "center";
    ctx.fillStyle = col;
    ctx.fillText(msg, w / 2, 73);
    // Twist badges
    const tws = twistsOf(d);
    if (tws.length) {
      ctx.font = `700 12px ${FONT_DISPLAY}`;
      const widths = tws.map((t) => ctx.measureText(TWIST_INFO[t].badge).width + 40);
      const total = widths.reduce((s, v) => s + v, 0) + 6 * (tws.length - 1);
      let x = w / 2 - total / 2;
      tws.forEach((t, k) => {
        const pulse = (t === "reverse" || t === "dual") && this.state === "input" ? 0.5 + 0.5 * Math.sin(this.time * 5) : 0;
        this.badge(ctx, t, x, 104, pulse);
        x += widths[k] + 6;
      });
    }
    // Lives as moons
    for (let i = 0; i < 3; i++) {
      const x = w / 2 + (i - 1) * 26;
      const y = h - 34;
      ctx.fillStyle = i < this.lives ? "#ffe9a8" : "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, TAU);
      ctx.fill();
      if (i < this.lives) {
        ctx.fillStyle = this.theme.bg[1];
        ctx.beginPath();
        ctx.arc(x + 4, y - 3, 7, 0, TAU);
        ctx.fill();
      }
    }
  }

  private twistIcon(t: Twist | null) {
    return (c: CanvasRenderingContext2D) => {
      if (t) {
        glow(c, 0, 0, 44, TWIST_INFO[t].color, 0.35 + 0.15 * Math.sin(this.time * 3));
        drawTwistIcon(c, t, 0, 0, 52);
        return;
      }
      const pts: [number, number, string][] = [[-36, 8, "#ffd66b"], [-10, -14, "#7ad8ff"], [18, 2, "#ff8fd0"], [38, -18, "#c7a2ff"]];
      c.strokeStyle = "rgba(255,255,255,0.5)";
      c.lineWidth = 1.5;
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
      pts.forEach(([x, y, col], i) => {
        glow(c, x, y, 18, col, 0.5 + 0.3 * Math.sin(this.time * 3 + i));
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.arc(x, y, 4, 0, TAU);
        c.fill();
      });
    };
  }

  private renderBrief() {
    const d = this.def;
    const tws = twistsOf(d);
    const main: Twist | null = d.fresh ?? (d.reverse ? "reverse" : d.dual ? "dual" : null);
    let body: string;
    if (d.level === 1) body = "ดาวจะสว่างทีละดวง จำลำดับไว้ แล้วแตะตามให้ถูก ผ่านครบทุกรอบเพื่อปลดล็อกด่านต่อไป ผิดได้ 3 ครั้ง";
    else if (main) body = TWIST_INFO[main].text + (tws.length > 1 ? ` และ${tws.filter((t) => t !== main).map((t) => TWIST_INFO[t].badge).join(" ")}` : "");
    else if (tws.length) body = tws.map((t) => TWIST_INFO[t].text).join(" ");
    else body = "จำลำดับดาวที่สว่าง แล้วแตะตามให้ถูก ผ่านครบทุกรอบเพื่อไปด่านต่อไป";
    this.goBtn.label = "เริ่มเลย";
    this.cardBtns = [
      [this.goBtn, () => this.startLevel()],
      [this.backBtn, () => this.toMap()],
    ];
    drawCard(this.env.ctx, this.w, this.h, {
      title: d.fresh ? `ด่าน ${d.level} · ของใหม่!` : `ด่าน ${d.level}`,
      subtitle: main ? TWIST_INFO[main].badge : this.theme.name,
      body,
      chips: [`ดาว ${d.n} ดวง`, `${d.rounds.length} รอบ`, `จำสุด ${d.rounds[d.rounds.length - 1]} ดวง`],
      accent: main ? TWIST_INFO[main].color : this.theme.accent,
      buttons: [this.goBtn, this.backBtn],
      appear: this.stateT * 3,
      icon: this.twistIcon(main),
    });
  }

  private renderClear() {
    const got = this.lives;
    const next = levelDef(this.level + 1);
    this.cardBtns = [
      [this.nextBtn, () => this.goNext()],
      [this.mapBtn, () => this.toMap()],
    ];
    const chips = [this.firstClear ? `ปลดล็อกด่าน ${this.level + 1}` : "เล่นซ้ำ เหรียญครึ่งหนึ่ง"];
    if (next.fresh) chips.push(`ด่านหน้า: ${TWIST_INFO[next.fresh].badge}`);
    else if (next.theme !== this.def.theme) chips.push(`ฟ้าใหม่: ${THEMES[next.theme].name}`);
    drawCard(this.env.ctx, this.w, this.h, {
      title: `ผ่านด่าน ${this.level}!`,
      subtitle: got === 3 ? "ไม่พลาดเลยสักดวง" : got === 2 ? "พลาดไป 1 ครั้ง" : "รอดมาได้ เก่งมาก",
      chips,
      accent: this.theme.accent,
      buttons: [this.nextBtn, this.mapBtn],
      appear: this.stateT * 2.5,
      coins: this.earned,
      icon: (c) => {
        for (let k = 0; k < 3; k++) {
          const pop = ease.outBack(clamp(this.stateT * 3 - 0.5 - k * 0.35, 0, 1));
          const x = (k - 1) * 46;
          const y = k === 1 ? -8 : 6;
          if (k < got) glow(c, x, y, 34 * pop, "#ffd66b", 0.5);
          starPath(c, x, y, (k === 1 ? 24 : 20) * (k < got ? pop : 1));
          c.fillStyle = k < got ? "#ffd66b" : "rgba(255,255,255,0.15)";
          c.fill();
        }
      },
    });
  }

  private renderFail() {
    this.cardBtns = [
      [this.retryBtn, () => this.startLevel()],
      [this.mapBtn, () => this.toMap()],
    ];
    drawCard(this.env.ctx, this.w, this.h, {
      title: "ดาวหลุดลำดับ",
      subtitle: "สมองได้พักจากความอยากแล้ว ลองอีกทีนะ",
      body: `ด่าน ${this.level} ผ่านไป ${this.roundIdx} จาก ${this.def.rounds.length} รอบ ตำแหน่งดาวเหมือนเดิม แต่ลำดับจะสุ่มใหม่`,
      accent: this.theme.accent,
      buttons: [this.retryBtn, this.mapBtn],
      appear: this.stateT * 2.5,
      coins: this.earned,
      icon: this.twistIcon(null),
    });
  }
}
