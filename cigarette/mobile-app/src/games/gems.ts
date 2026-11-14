// "Gem Garden" — a 3-minute match-3 round. Short, absorbing visual puzzles like this keep the eyes
// and the mind's eye busy, which is what takes the edge off a craving (elaborated intrusion
// theory: May, Andrade, Kavanagh). No losing: the round simply ends when the time is up.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, rgba, shade, makeSprite, roundRectPath, clamp, ease, TAU, FONT_DISPLAY, FONT_BODY, glow, rng } from "./engine/fx";
import { Button, drawCard, glassPanel, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { coinsFor } from "./engine/economy";

const COLS = 7;
const ROWS = 8;
const ROUND = 180; // seconds

type Special = "none" | "row" | "col" | "prism";
interface Gem {
  t: number; // type 0..5, -1 for prism
  sp: Special;
  id: number;
  oy: number; // visual offset in cells while falling (negative = above)
  vy: number;
  pop: number; // spawn/landing squash 0..1
}

const TYPES: { color: string; sides: number; rot: number; name: string }[] = [
  { color: "#ff4d6d", sides: 6, rot: 0, name: "ruby" },
  { color: "#3f7cff", sides: 0, rot: 0, name: "sapphire" },
  { color: "#22d88f", sides: 8, rot: Math.PI / 8, name: "emerald" },
  { color: "#ffc634", sides: 4, rot: 0, name: "topaz" },
  { color: "#b25cff", sides: 3, rot: -Math.PI / 2, name: "amethyst" },
  { color: "#33d6ff", sides: 5, rot: -Math.PI / 2, name: "aquamarine" },
];

function polygon(n: number, r: number, rot: number): [number, number][] {
  const pts: [number, number][] = [];
  const count = n === 0 ? 16 : n;
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * TAU;
    // Squash the diamond a little so it reads as a gem, not a square
    const sx = n === 4 ? 0.82 : 1;
    pts.push([Math.cos(a) * r * sx, Math.sin(a) * r]);
  }
  return pts;
}

/** Faceted gem: outer facets shaded by their angle to a top-left light, a bright table, a sparkle. */
function drawGem(c: CanvasRenderingContext2D, size: number, type: number) {
  const T = TYPES[type];
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const outer = polygon(T.sides, r, T.rot);
  const inner = polygon(T.sides, r * 0.52, T.rot);
  c.save();
  c.translate(cx, cy);
  // Shadow
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(0, r * 0.95, r * 0.75, r * 0.16, 0, 0, TAU);
  c.fill();
  // Facets
  const light = -Math.PI * 0.75;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % outer.length];
    const ia = inner[i];
    const ib = inner[(i + 1) % inner.length];
    const mid = Math.atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
    const k = Math.cos(mid - light); // -1..1
    c.fillStyle = shade(T.color, k * 0.38 - 0.04);
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.lineTo(ib[0], ib[1]);
    c.lineTo(ia[0], ia[1]);
    c.closePath();
    c.fill();
    c.strokeStyle = rgba("#ffffff", 0.12);
    c.lineWidth = 0.6;
    c.stroke();
  }
  // Table (top face)
  const tg = c.createLinearGradient(-r * 0.5, -r * 0.5, r * 0.5, r * 0.5);
  tg.addColorStop(0, shade(T.color, 0.55));
  tg.addColorStop(1, shade(T.color, 0.05));
  c.fillStyle = tg;
  c.beginPath();
  inner.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
  c.strokeStyle = rgba("#ffffff", 0.35);
  c.lineWidth = 0.8;
  c.stroke();
  // Outline
  c.beginPath();
  outer.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.strokeStyle = shade(T.color, -0.45);
  c.lineWidth = Math.max(1, size * 0.025);
  c.stroke();
  // Sparkle
  c.fillStyle = "rgba(255,255,255,0.9)";
  const sx = -r * 0.3;
  const sy = -r * 0.32;
  const s = r * 0.2;
  c.beginPath();
  c.moveTo(sx, sy - s);
  c.quadraticCurveTo(sx, sy, sx + s, sy);
  c.quadraticCurveTo(sx, sy, sx, sy + s);
  c.quadraticCurveTo(sx, sy, sx - s, sy);
  c.quadraticCurveTo(sx, sy, sx, sy - s);
  c.fill();
  c.restore();
}

function drawPrism(c: CanvasRenderingContext2D, size: number, time: number) {
  const r = size * 0.38;
  c.save();
  c.translate(size / 2, size / 2);
  glow(c, 0, 0, r * 1.8, "#ffffff", 0.35);
  for (let i = 0; i < 6; i++) {
    const a = time * 1.5 + (i / 6) * TAU;
    c.fillStyle = `hsla(${(i * 60 + time * 120) % 360},95%,62%,0.95)`;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, r, a, a + TAU / 6);
    c.closePath();
    c.fill();
  }
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.5, "rgba(255,255,255,0.2)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fill();
  c.restore();
}

export const gemsGame: GameDefinition = {
  id: "gems",
  title: "สวนอัญมณี",
  tagline: "สลับอัญมณีให้เรียงกัน 3 เม็ด",
  why: "เกมเรียงสีต้องใช้สายตาและความคิดตลอดเวลา ภาพของบุหรี่ในหัวจึงเบาลง และ 3 นาทีก็พอให้คลื่นความอยากผ่านไป",
  category: "puzzle",
  minutes: "3 นาที",
  palette: ["#3a1d6e", "#ff4d6d"],
  create: (env) => new GemsGame(env),
};

type Phase = "idle" | "swap" | "swapBack" | "clear" | "fall";
type State = "intro" | "play" | "over";

class GemsGame implements GameInstance {
  private earned = 0;
  private w = 0;
  private h = 0;
  private cell = 40;
  private bx = 0;
  private by = 0;
  private grid: (Gem | null)[][] = [];
  private nextId = 1;
  private sprites: HTMLCanvasElement[] = [];
  private bg: HTMLCanvasElement | null = null;
  private state: State = "intro";
  private stateT = 0;
  private phase: Phase = "idle";
  private phaseT = 0;
  private swapA: [number, number] | null = null;
  private swapB: [number, number] | null = null;
  private clearing = new Set<string>();
  private pendingSpecials: { r: number; c: number; gem: Gem }[] = [];
  private cascade = 0;
  private score = 0;
  private timeLeft = ROUND;
  private time = 0;
  private idleT = 0;
  private hint: [[number, number], [number, number]] | null = null;
  private sel: [number, number] | null = null;
  private drag: { r: number; c: number; x: number; y: number; id: number } | null = null;
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มรอบ 3 นาที", "#ff4d8d");
  private againBtn = new Button("เล่นอีกรอบ", "#ff4d8d");
  private best = 0;
  private newBest = false;
  private biggestCombo = 0;
  private bokeh: { x: number; y: number; r: number; s: number; hue: number }[] = [];

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    const rand = rng(5);
    for (let i = 0; i < 18; i++) this.bokeh.push({ x: rand(), y: rand(), r: 10 + rand() * 40, s: 0.01 + rand() * 0.02, hue: [330, 280, 200, 45][i % 4] });
    this.fill();
  }

  private newGem(t: number, sp: Special = "none"): Gem {
    return { t, sp, id: this.nextId++, oy: 0, vy: 0, pop: 1 };
  }

  private fill() {
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row: (Gem | null)[] = [];
      for (let c = 0; c < COLS; c++) {
        let t: number;
        do {
          t = Math.floor(Math.random() * TYPES.length);
        } while (
          (c >= 2 && row[c - 1]!.t === t && row[c - 2]!.t === t) ||
          (r >= 2 && this.grid[r - 1][c]!.t === t && this.grid[r - 2][c]!.t === t)
        );
        row.push(this.newGem(t));
      }
      this.grid.push(row);
    }
    if (!this.findMove()) this.fill();
  }

  private typeAt(r: number, c: number) {
    const g = this.grid[r]?.[c];
    return g && g.t >= 0 ? g.t : -99 - r * 10 - c; // unique non-matching value for empty / prism
  }

  private findRuns() {
    const runs: { cells: [number, number][]; horiz: boolean }[] = [];
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const t = this.typeAt(r, c);
        let e = c + 1;
        while (e < COLS && this.typeAt(r, e) === t) e++;
        if (e - c >= 3 && t >= 0) runs.push({ cells: Array.from({ length: e - c }, (_, i) => [r, c + i] as [number, number]), horiz: true });
        c = e;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const t = this.typeAt(r, c);
        let e = r + 1;
        while (e < ROWS && this.typeAt(e, c) === t) e++;
        if (e - r >= 3 && t >= 0) runs.push({ cells: Array.from({ length: e - r }, (_, i) => [r + i, c] as [number, number]), horiz: false });
        r = e;
      }
    }
    return runs;
  }

  private swapCells(a: [number, number], b: [number, number]) {
    const t = this.grid[a[0]][a[1]];
    this.grid[a[0]][a[1]] = this.grid[b[0]][b[1]];
    this.grid[b[0]][b[1]] = t;
  }

  private findMove(): [[number, number], [number, number]] | null {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c]?.sp === "prism") {
          const n: [number, number] = c + 1 < COLS ? [r, c + 1] : [r, c - 1];
          return [[r, c], n];
        }
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (r2 >= ROWS || c2 >= COLS) continue;
          this.swapCells([r, c], [r2, c2]);
          const ok = this.findRuns().length > 0;
          this.swapCells([r, c], [r2, c2]);
          if (ok) return [[r, c], [r2, c2]];
        }
      }
    }
    return null;
  }

  // ── Turn logic ───────────────────────────────────────────────────────────

  private trySwap(a: [number, number], b: [number, number]) {
    if (this.phase !== "idle" || this.state !== "play") return;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return;
    if (b[0] < 0 || b[0] >= ROWS || b[1] < 0 || b[1] >= COLS) return;
    this.sel = null;
    this.hint = null;
    this.idleT = 0;
    this.swapA = a;
    this.swapB = b;
    this.phase = "swap";
    this.phaseT = 0;
    this.cascade = 0;
    this.env.sfx.tone({ freq: 440, dur: 0.08, vol: 0.05, glideTo: 520 });
  }

  private afterSwap() {
    const a = this.swapA!;
    const b = this.swapB!;
    this.swapCells(a, b);
    const ga = this.grid[a[0]][a[1]]!;
    const gb = this.grid[b[0]][b[1]]!;
    // Prism: clears every gem of the colour it was swapped with
    if (ga.sp === "prism" || gb.sp === "prism") {
      const other = ga.sp === "prism" ? gb : ga;
      const set = new Set<string>([`${a[0]},${a[1]}`, `${b[0]},${b[1]}`]);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const g = this.grid[r][c];
          if (g && (other.sp === "prism" || g.t === other.t)) set.add(`${r},${c}`);
        }
      this.floaters.add("ปริซึม!", this.bx + (b[1] + 0.5) * this.cell, this.by + (b[0] + 0.5) * this.cell, "#ffffff", 26);
      this.env.sfx.noise({ dur: 0.5, vol: 0.1, freq: 2000, sweepTo: 300, q: 2 });
      this.startClear(this.expand(set), []);
      return;
    }
    if (!this.findRuns().length) {
      this.swapCells(a, b); // put them back; the animation runs from swapped to original
      this.phase = "swapBack";
      this.phaseT = 0;
      this.env.sfx.tone({ freq: 200, dur: 0.12, vol: 0.06, type: "triangle", glideTo: 160 });
      return;
    }
    this.resolve([a, b]);
  }

  /** Adds the rows / columns of any line gems in the set, repeatedly. */
  private expand(set: Set<string>) {
    const queue = Array.from(set);
    const seen = new Set<string>();
    while (queue.length) {
      const k = queue.pop()!;
      if (seen.has(k)) continue;
      seen.add(k);
      set.add(k);
      const [r, c] = k.split(",").map(Number);
      const g = this.grid[r][c];
      if (!g) continue;
      if (g.sp === "row") for (let x = 0; x < COLS; x++) queue.push(`${r},${x}`);
      if (g.sp === "col") for (let y = 0; y < ROWS; y++) queue.push(`${y},${c}`);
    }
    return set;
  }

  private resolve(swapped: [number, number][]) {
    const runs = this.findRuns();
    if (!runs.length) {
      this.cascade = 0;
      this.phase = "idle";
      this.env.emit({ type: "score", score: this.score });
      if (this.timeLeft <= 0) this.end();
      else if (!this.findMove()) this.shuffle();
      return;
    }
    const set = new Set<string>();
    const specials: { r: number; c: number; gem: Gem }[] = [];
    for (const run of runs) {
      for (const [r, c] of run.cells) set.add(`${r},${c}`);
      if (run.cells.length >= 4) {
        const at = run.cells.find(([r, c]) => swapped.some(([sr, sc]) => sr === r && sc === c)) ?? run.cells[Math.floor(run.cells.length / 2)];
        const t = this.grid[at[0]][at[1]]!.t;
        const gem = run.cells.length >= 5 ? this.newGem(-1, "prism") : this.newGem(t, run.horiz ? "row" : "col");
        if (!specials.some((s) => s.r === at[0] && s.c === at[1])) specials.push({ r: at[0], c: at[1], gem });
      }
    }
    this.startClear(this.expand(set), specials);
  }

  private startClear(set: Set<string>, specials: { r: number; c: number; gem: Gem }[]) {
    this.cascade++;
    this.biggestCombo = Math.max(this.biggestCombo, this.cascade);
    this.clearing = set;
    this.pendingSpecials = specials;
    this.phase = "clear";
    this.phaseT = 0;
    const gained = set.size * 10 * this.cascade + specials.length * 50;
    this.score += gained;
    let sx = 0;
    let sy = 0;
    for (const k of set) {
      const [r, c] = k.split(",").map(Number);
      const g = this.grid[r][c];
      const px = this.bx + (c + 0.5) * this.cell;
      const py = this.by + (r + 0.5) * this.cell;
      sx += px;
      sy += py;
      const col = g && g.t >= 0 ? TYPES[g.t].color : "#ffffff";
      this.particles.burst(px, py, col, 6, { speed: 200, size: this.cell * 0.09, kind: "shard", life: 0.7, gravity: 300 });
      this.particles.burst(px, py, "#ffffff", 2, { speed: 140, size: 2, kind: "spark", gravity: 0, life: 0.4 });
      if (g && (g.sp === "row" || g.sp === "col")) this.particles.ring(px, py, col, this.cell * 2, 0.5);
    }
    const n = set.size;
    this.floaters.add(`+${gained}`, sx / n, sy / n, "#ffffff", 20);
    if (this.cascade >= 2) {
      const words = ["", "", "ต่อเนื่อง!", "สวยงาม!", "ยอดเยี่ยม!", "มหัศจรรย์!"];
      this.floaters.list = this.floaters.list.filter((f) => !words.includes(f.text));
      this.floaters.add(words[Math.min(this.cascade, 5)] || "มหัศจรรย์!", this.w / 2, this.by - 6, "#ffe38a", 26, 1.3);
    }
    this.env.sfx.chime(pentatonic(4 + Math.min(this.cascade, 8) + (n > 4 ? 2 : 0)), 0.12);
    if (n >= 5) this.env.sfx.chime(pentatonic(9 + Math.min(this.cascade, 6)), 0.08, 0.06);
  }

  private afterClear() {
    for (const k of this.clearing) {
      const [r, c] = k.split(",").map(Number);
      this.grid[r][c] = null;
    }
    for (const s of this.pendingSpecials) {
      s.gem.pop = 0;
      this.grid[s.r][s.c] = s.gem;
    }
    this.clearing = new Set();
    this.pendingSpecials = [];
    // Gravity
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const g = this.grid[r][c];
        if (g) {
          if (write !== r) {
            g.oy -= write - r;
            this.grid[write][c] = g;
            this.grid[r][c] = null;
          }
          write--;
        }
      }
      let spawn = 0;
      for (let r = write; r >= 0; r--) {
        spawn++;
        const g = this.newGem(Math.floor(Math.random() * TYPES.length));
        g.oy = -(write + 1) - 0.4 * spawn;
        this.grid[r][c] = g;
      }
    }
    this.phase = "fall";
    this.phaseT = 0;
  }

  private shuffle() {
    const gems: Gem[] = [];
    for (const row of this.grid) for (const g of row) if (g) gems.push(g);
    let tries = 0;
    do {
      for (let i = gems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gems[i], gems[j]] = [gems[j], gems[i]];
      }
      let k = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) this.grid[r][c] = gems[k++];
      tries++;
    } while ((this.findRuns().length || !this.findMove()) && tries < 40);
    if (tries >= 40) this.fill();
    this.floaters.add("สลับใหม่", this.w / 2, this.by + (ROWS * this.cell) / 2, "#ffffff", 24);
  }

  private start() {
    this.score = 0;
    this.timeLeft = ROUND;
    this.cascade = 0;
    this.biggestCombo = 0;
    this.newBest = false;
    this.fill();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) this.grid[r][c]!.oy = -ROWS - (ROWS - r) * 0.3 - c * 0.15;
    this.phase = "fall";
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  private end() {
    this.state = "over";
    this.stateT = 0;
    const r = bestScore(this.env.store, "best", this.score);
    this.best = r.best;
    this.newBest = r.isNew;
    [0, 2, 4, 7, 9].forEach((s, i) => this.env.sfx.chime(pentatonic(s + 3), 0.09, i * 0.1));
    this.env.emit({
      type: "end", coins: (this.earned = coinsFor(this.score, 80, 5, 120)),
      score: this.score,
      best: this.best,
      summary: `3 นาทีผ่านไปแล้ว · ต่อเนื่องสูงสุด x${this.biggestCombo}`,
      stats: { combo: this.biggestCombo, seconds: ROUND },
    });
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 92;
    this.cell = Math.floor(clamp(Math.min((w - 28) / COLS, (h - top - 24) / ROWS), 30, 70));
    this.bx = Math.round((w - this.cell * COLS) / 2);
    this.by = Math.round(top + (h - top - 16 - this.cell * ROWS) / 2);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.sprites = TYPES.map((_, i) => makeSprite(this.cell, this.cell, dpr, (c) => drawGem(c, this.cell, i)));
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#151a52");
      g.addColorStop(0.5, "#3b2370");
      g.addColorStop(1, "#7a2f72");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Silhouette of leaves at the bottom corners
      const leaf = (x: number, y: number, s: number, rot: number, col: string) => {
        c.save();
        c.translate(x, y);
        c.rotate(rot);
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(s * 0.5, -s * 0.35, s, 0);
        c.quadraticCurveTo(s * 0.5, s * 0.35, 0, 0);
        c.fill();
        c.restore();
      };
      const rand = rng(3);
      for (let i = 0; i < 26; i++) {
        const left = i % 2 === 0;
        leaf(left ? -10 : w + 10, h - rand() * h * 0.35, 60 + rand() * 90, (left ? -0.9 : Math.PI + 0.9) + (rand() - 0.5) * 1.2, `rgba(${20 + rand() * 20},${10 + rand() * 30},${50 + rand() * 40},0.75)`);
      }
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private cellAt(x: number, y: number): [number, number] | null {
    const c = Math.floor((x - this.bx) / this.cell);
    const r = Math.floor((y - this.by) / this.cell);
    return r >= 0 && r < ROWS && c >= 0 && c < COLS ? [r, c] : null;
  }

  pointer(p: PointerInfo) {
    if (this.state !== "play") {
      const btn = this.state === "intro" ? this.startBtn : this.againBtn;
      if (p.type === "down" && btn.hit(p.x, p.y)) btn.pressed = true;
      if (p.type === "up") {
        if (btn.pressed && btn.hit(p.x, p.y) && this.stateT > 0.3) this.start();
        btn.pressed = false;
      }
      return;
    }
    if (p.type === "down") {
      const at = this.cellAt(p.x, p.y);
      if (!at) {
        this.sel = null;
        return;
      }
      if (this.sel && Math.abs(this.sel[0] - at[0]) + Math.abs(this.sel[1] - at[1]) === 1) {
        this.trySwap(this.sel, at);
        return;
      }
      this.sel = at;
      this.drag = { r: at[0], c: at[1], x: p.x, y: p.y, id: p.id };
      this.env.sfx.tone({ freq: 660, dur: 0.05, vol: 0.04 });
    } else if (p.type === "move" && this.drag && this.drag.id === p.id) {
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > this.cell * 0.38) {
        const a: [number, number] = [this.drag.r, this.drag.c];
        const b: [number, number] = Math.abs(dx) > Math.abs(dy) ? [a[0], a[1] + Math.sign(dx)] : [a[0] + Math.sign(dy), a[1]];
        this.drag = null;
        this.trySwap(a, b);
      }
    } else if (p.type === "up" || p.type === "cancel") {
      this.drag = null;
    }
  }

  key(code: string, down: boolean) {
    if (!down || (code !== "Enter" && code !== "Space")) return false;
    if (this.state !== "play" && this.stateT > 0.5) this.start();
    return true;
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.phaseT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.startBtn.update(dt);
    this.againBtn.update(dt);
    for (const b of this.bokeh) {
      b.y -= b.s * dt;
      if (b.y < -0.1) b.y = 1.1;
    }
    for (const row of this.grid)
      for (const g of row) {
        if (!g) continue;
        g.pop = Math.min(1, g.pop + dt * 4);
        if (g.oy < 0) {
          g.vy += 38 * dt;
          g.oy = Math.min(0, g.oy + g.vy * dt);
          if (g.oy === 0) {
            g.vy = 0;
            g.pop = 0.6;
          }
        }
      }
    if (this.state !== "play") return;

    if (this.phase === "idle") {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) {
        this.end();
        return;
      }
      this.idleT += dt;
      if (this.idleT > 6 && !this.hint) this.hint = this.findMove();
    } else {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
    }
    if (this.phase === "swap" && this.phaseT >= 0.18) this.afterSwap();
    else if (this.phase === "swapBack" && this.phaseT >= 0.18) {
      this.phase = "idle";
      this.swapA = this.swapB = null;
    } else if (this.phase === "clear" && this.phaseT >= 0.24) this.afterClear();
    else if (this.phase === "fall") {
      let moving = false;
      for (const row of this.grid) for (const g of row) if (g && g.oy < 0) moving = true;
      if (!moving && this.phaseT > 0.05) {
        const swapped = this.cascade === 0 && this.swapA && this.swapB ? [this.swapA, this.swapB] : [];
        this.swapA = this.swapB = null;
        this.resolve(swapped);
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bokeh) glow(ctx, b.x * w, b.y * h, b.r, `#${b.hue === 330 ? "ff6fa8" : b.hue === 280 ? "a77bff" : b.hue === 200 ? "5ec8ff" : "ffd36e"}`, 0.12);
    ctx.restore();

    const c = this.cell;
    const bw = c * COLS;
    const bh = c * ROWS;
    glassPanel(ctx, this.bx - 8, this.by - 8, bw + 16, bh + 16, 18, 0.1);
    for (let r = 0; r < ROWS; r++)
      for (let col = 0; col < COLS; col++) {
        ctx.fillStyle = (r + col) % 2 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.10)";
        roundRectPath(ctx, this.bx + col * c + 2, this.by + r * c + 2, c - 4, c - 4, c * 0.18);
        ctx.fill();
      }

    ctx.save();
    roundRectPath(ctx, this.bx - 2, this.by - 2, bw + 4, bh + 4, 14);
    ctx.clip();
    const swapP = this.phase === "swap" ? ease.inOutSine(clamp(this.phaseT / 0.18, 0, 1)) : this.phase === "swapBack" ? 1 - ease.inOutSine(clamp(this.phaseT / 0.18, 0, 1)) : 0;
    const clearK = this.phase === "clear" ? clamp(this.phaseT / 0.24, 0, 1) : 0;
    for (let r = 0; r < ROWS; r++)
      for (let col = 0; col < COLS; col++) {
        const g = this.grid[r][col];
        if (!g) continue;
        let x = this.bx + col * c;
        let y = this.by + (r + g.oy) * c;
        if (swapP && this.swapA && this.swapB) {
          const isA = this.swapA[0] === r && this.swapA[1] === col;
          const isB = this.swapB[0] === r && this.swapB[1] === col;
          if (isA || isB) {
            const other = isA ? this.swapB : this.swapA;
            x += (other[1] - col) * c * swapP;
            y += (other[0] - r) * c * swapP;
          }
        }
        let s = 0.85 + 0.15 * ease.outBack(g.pop);
        let alpha = 1;
        if (this.clearing.has(`${r},${col}`)) {
          s *= 1 + clearK * 0.35;
          alpha = 1 - clearK;
        }
        const isSel = this.sel && this.sel[0] === r && this.sel[1] === col && this.phase === "idle";
        const isHint = this.hint && ((this.hint[0][0] === r && this.hint[0][1] === col) || (this.hint[1][0] === r && this.hint[1][1] === col));
        if (isSel) s *= 1.08 + 0.04 * Math.sin(this.time * 10);
        if (isHint) s *= 1 + 0.08 * Math.max(0, Math.sin(this.time * 6));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + c / 2, y + c / 2);
        ctx.scale(s, s);
        if (isSel) glow(ctx, 0, 0, c * 0.8, "#ffffff", 0.35);
        if (g.sp === "prism") {
          ctx.translate(-c / 2, -c / 2);
          drawPrism(ctx, c, this.time);
        } else {
          ctx.drawImage(this.sprites[g.t], -c / 2, -c / 2, c, c);
          if (g.sp === "row" || g.sp === "col") {
            // Light beam through the gem shows which way it will clear
            ctx.globalCompositeOperation = "lighter";
            const k = 0.5 + 0.5 * Math.sin(this.time * 6);
            const grad = g.sp === "row" ? ctx.createLinearGradient(-c / 2, 0, c / 2, 0) : ctx.createLinearGradient(0, -c / 2, 0, c / 2);
            grad.addColorStop(0, "rgba(255,255,255,0)");
            grad.addColorStop(0.5, `rgba(255,255,255,${0.45 + 0.35 * k})`);
            grad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = grad;
            if (g.sp === "row") ctx.fillRect(-c / 2, -c * 0.09, c, c * 0.18);
            else ctx.fillRect(-c * 0.09, -c / 2, c * 0.18, c);
          }
        }
        ctx.restore();
      }
    ctx.restore();

    this.particles.render(ctx);
    this.floaters.render(ctx);
    this.renderHud();

    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "สวนอัญมณี",
        subtitle: "รอบละ 3 นาที ไม่มีแพ้",
        body: "ปัดอัญมณีสลับกับเม็ดข้างๆ ให้สีเดียวกันเรียง 3 เม็ด เรียง 4 ได้อัญมณีแสง เรียง 5 ได้ปริซึมที่เก็บสีเดียวกันทั้งกระดาน",
        accent: "#ff4d8d",
        buttons: [this.startBtn],
        appear: this.stateT * 3,
        icon: (cx) => {
          const s = 40;
          [0, 3, 1].forEach((t, i) => {
            cx.save();
            cx.translate((i - 1) * 34, Math.sin(this.time * 3 + i) * 3 - 4);
            if (this.sprites[t]) cx.drawImage(this.sprites[t], -s / 2, -s / 2, s, s);
            cx.restore();
          });
        },
        chips: this.best ? [`สถิติ ${this.best.toLocaleString()}`] : undefined,
      });
    } else if (this.state === "over") {
      drawCard(ctx, w, h, {
        title: this.newBest ? "สถิติใหม่!" : "ครบ 3 นาทีแล้ว",
        subtitle: "คลื่นความอยากมักผ่านไปในไม่กี่นาที",
        bigValue: this.score.toLocaleString(),
        bigLabel: "คะแนน",
        chips: [`ต่อเนื่อง x${this.biggestCombo}`, `สถิติ ${this.best.toLocaleString()}`],
        accent: this.newBest ? "#ffc634" : "#ff4d8d",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5, coins: this.earned,
      });
    }
  }

  private renderHud() {
    const { ctx } = this.env;
    const w = this.w;
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `500 11px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText("คะแนน", this.bx, 16);
    ctx.font = `800 30px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(this.score.toLocaleString(), this.bx, 30);
    // Timer ring
    const rx = this.bx + this.cell * COLS - 26;
    const ry = 44;
    const k = this.timeLeft / ROUND;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(rx, ry, 22, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = k < 0.15 ? "#ffb347" : "#7ef0d0";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(rx, ry, 22, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
    const s = Math.ceil(this.timeLeft);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 13px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, rx, ry + 1);
    ctx.restore();
    void w;
  }
}
