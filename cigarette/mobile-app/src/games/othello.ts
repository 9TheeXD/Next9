// Othello / reversi ("โอเทลโล"): sandwich the opponent's discs to flip them.

import type { GameDefinition, GameEnv } from "./engine/types";
import { TurnDuel, type Side } from "./engine/turnduel";
import { clamp, roundRectPath, TAU, FONT_DISPLAY } from "./engine/fx";
import { pentatonic } from "./engine/audio";

export const othelloGame: GameDefinition = {
  id: "othello",
  title: "โอเทลโล",
  tagline: "หนีบหมากคู่แข่งให้พลิกเป็นสีเรา",
  why: "ทุกตาต้องนับว่าจะพลิกได้กี่ตัวและเปิดมุมให้ใครบ้าง สมองยุ่งจนลืมความอยาก",
  category: "duel",
  minutes: "5–10 นาที",
  palette: ["#065f46", "#f8fafc"],
  create: (env) => new Othello(env),
};

const N = 8;
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];
const W = [
  100, -20, 10, 5, 5, 10, -20, 100, -20, -50, -2, -2, -2, -2, -50, -20, 10, -2, -1, -1, -1, -1, -2, 10, 5, -2, -1, -1, -1, -1, -2, 5, 5, -2, -1, -1, -1, -1, -2, 5, 10, -2, -1, -1, -1, -1, -2, 10, -20, -50, -2, -2, -2, -2, -50, -20, 100, -20, 10, 5, 5, 10, -20, 100,
];

function step(i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= 64) return -1;
  if (Math.abs((j % 8) - (i % 8)) > 1) return -1;
  return j;
}

function flips(cells: number[], i: number, side: number): number[] {
  if (cells[i]) return [];
  const opp = side === 1 ? 2 : 1;
  const out: number[] = [];
  for (const d of DIRS) {
    const line: number[] = [];
    let j = step(i, d);
    while (j >= 0 && cells[j] === opp) {
      line.push(j);
      j = step(j, d);
    }
    if (j >= 0 && cells[j] === side && line.length) out.push(...line);
  }
  return out;
}

function movesFor(cells: number[], side: number) {
  const out: number[] = [];
  for (let i = 0; i < 64; i++) if (!cells[i] && flips(cells, i, side).length) out.push(i);
  return out;
}

class Othello extends TurnDuel<number[]> {
  private cells: number[] = [];
  private flipT: number[] = new Array(64).fill(9);
  private last = -1;
  private note = "";
  private noteT = 0;
  private cs = 40;

  constructor(env: GameEnv) {
    super(env, {
      title: "โอเทลโล",
      subtitle: "หนีบให้พลิก มีหมากมากกว่าชนะ",
      accent: "#059669",
      colors: ["#111827", "#f8fafc"],
      sideNames: ["ดำ", "ขาว"],
      pickSide: true,
      icon: (c) => {
        c.fillStyle = "#111827";
        c.beginPath();
        c.arc(-16, -4, 16, 0, TAU);
        c.fill();
        c.fillStyle = "#f8fafc";
        c.beginPath();
        c.arc(16, -4, 16, 0, TAU);
        c.fill();
      },
    });
  }

  setup() {
    this.cells = new Array(64).fill(0);
    this.cells[27] = 2;
    this.cells[36] = 2;
    this.cells[28] = 1;
    this.cells[35] = 1;
    this.flipT = new Array(64).fill(9);
    this.last = -1;
    this.note = "";
  }
  snapshot() {
    return this.cells.slice();
  }
  restore(s: number[]) {
    this.cells = s.slice();
    this.flipT.fill(9);
    this.last = -1;
  }
  layoutBoard(x: number, y: number, w: number, h: number) {
    this.cs = Math.floor(Math.min(w, h - 10) / N);
    const s = this.cs * N;
    this.board = { x: x + (w - s) / 2, y: y + (h - s) / 2, w: s, h: s };
  }

  private count(side: number) {
    return this.cells.filter((v) => v === side).length;
  }

  private play(i: number) {
    const side = this.turn;
    const f = flips(this.cells, i, side);
    if (!f.length) return;
    this.beforeMove();
    this.cells[i] = side;
    this.last = i;
    this.flipT[i] = 0;
    f.forEach((j, k) => {
      this.cells[j] = side;
      this.flipT[j] = -k * 0.05;
    });
    this.env.sfx.tone({ freq: 260, dur: 0.06, vol: 0.09, type: "triangle" });
    f.forEach((_, k) => this.env.sfx.tone({ freq: pentatonic(k + 3), dur: 0.05, vol: 0.03, delay: 0.05 + k * 0.05 }));
    const opp: Side = side === 1 ? 2 : 1;
    if (movesFor(this.cells, opp).length) return this.endMove(opp);
    if (movesFor(this.cells, side).length) {
      this.note = `${this.name(opp)}ไม่มีที่ลง ข้ามตา`;
      this.noteT = 2;
      return this.endMove(side);
    }
    const a = this.count(1);
    const b = this.count(2);
    this.endMove(side, a === b ? 3 : a > b ? 1 : 2, `ดำ ${a} – ${b} ขาว`);
  }

  tapBoard(x: number, y: number) {
    const b = this.board;
    const c = Math.floor((x - b.x) / this.cs);
    const r = Math.floor((y - b.y) / this.cs);
    if (c < 0 || r < 0 || c >= N || r >= N) return;
    this.play(r * N + c);
  }

  // ── Bot ──────────────────────────────────────────────────────────────────

  private evaluate(cells: number[], me: number) {
    const opp = me === 1 ? 2 : 1;
    let s = 0;
    let empty = 0;
    for (let i = 0; i < 64; i++) {
      if (cells[i] === me) s += W[i];
      else if (cells[i] === opp) s -= W[i];
      else empty++;
    }
    s += (movesFor(cells, me).length - movesFor(cells, opp).length) * 6;
    if (empty < 12) {
      for (const v of cells) s += v === me ? 4 : v === opp ? -4 : 0;
    }
    return s;
  }

  private search(cells: number[], side: number, depth: number, alpha: number, beta: number, passed: boolean): number {
    const opp = side === 1 ? 2 : 1;
    if (depth === 0) return this.evaluate(cells, side);
    const ms = movesFor(cells, side);
    if (!ms.length) {
      if (passed) {
        const d = cells.filter((v) => v === side).length - cells.filter((v) => v === opp).length;
        return d * 1000;
      }
      return -this.search(cells, opp, depth - 1, -beta, -alpha, true);
    }
    ms.sort((a, b) => W[b] - W[a]);
    for (const m of ms) {
      const f = flips(cells, m, side);
      cells[m] = side;
      for (const j of f) cells[j] = side;
      const sc = -this.search(cells, opp, depth - 1, -beta, -alpha, false);
      cells[m] = 0;
      for (const j of f) cells[j] = opp;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return alpha;
  }

  botPlay() {
    const me = this.turn;
    const ms = movesFor(this.cells, me);
    if (!ms.length) return;
    if (this.level === 0) {
      // Beginner: likes flipping lots, ignores corners
      ms.sort((a, b) => flips(this.cells, b, me).length - flips(this.cells, a, me).length + (Math.random() - 0.5) * 6);
      return this.play(ms[0]);
    }
    const depth = [1, 1, 3, 5][this.level];
    let best = ms[0];
    let bestSc = -Infinity;
    const cells = this.cells.slice();
    const opp = me === 1 ? 2 : 1;
    for (const m of ms) {
      const f = flips(cells, m, me);
      cells[m] = me;
      for (const j of f) cells[j] = me;
      const sc = (this.level === 1 ? this.evaluate(cells, me) : -this.search(cells, opp, depth - 1, -Infinity, Infinity, false)) + Math.random() * (this.level === 1 ? 20 : 2);
      cells[m] = 0;
      for (const j of f) cells[j] = opp;
      if (sc > bestSc) {
        bestSc = sc;
        best = m;
      }
    }
    this.play(best);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  tick(dt: number) {
    for (let i = 0; i < 64; i++) if (this.flipT[i] < 9) this.flipT[i] += dt;
    this.noteT = Math.max(0, this.noteT - dt);
  }

  swatch(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: Side) {
    this.disc(c, x, y, r, side, 1);
  }

  private disc(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: number, sx: number) {
    c.save();
    c.translate(x, y);
    c.scale(Math.max(0.05, Math.abs(sx)), 1);
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.arc(0, r * 0.12, r, 0, TAU);
    c.fill();
    const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    if (side === 1) {
      g.addColorStop(0, "#4b5563");
      g.addColorStop(1, "#0b0f19");
    } else {
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#cbd5e1");
    }
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.fill();
    c.restore();
  }

  renderBoard(c: CanvasRenderingContext2D) {
    const b = this.board;
    const cs = this.cs;
    c.fillStyle = "#3f2a1a";
    roundRectPath(c, b.x - 10, b.y - 10, b.w + 20, b.h + 20, 14);
    c.fill();
    const g = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    g.addColorStop(0, "#15803d");
    g.addColorStop(1, "#065f46");
    c.fillStyle = g;
    c.fillRect(b.x, b.y, b.w, b.h);
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.lineWidth = 1.5;
    for (let i = 0; i <= N; i++) {
      c.beginPath();
      c.moveTo(b.x + i * cs, b.y);
      c.lineTo(b.x + i * cs, b.y + b.h);
      c.moveTo(b.x, b.y + i * cs);
      c.lineTo(b.x + b.w, b.y + i * cs);
      c.stroke();
    }
    c.fillStyle = "rgba(0,0,0,0.45)";
    for (const [px, py] of [
      [2, 2],
      [6, 2],
      [2, 6],
      [6, 6],
    ]) {
      c.beginPath();
      c.arc(b.x + px * cs, b.y + py * cs, 3.5, 0, TAU);
      c.fill();
    }
    for (let i = 0; i < 64; i++) {
      const v = this.cells[i];
      const x = b.x + ((i % N) + 0.5) * cs;
      const y = b.y + (Math.floor(i / N) + 0.5) * cs;
      if (v) {
        const t = this.flipT[i];
        // Flip animation: squash to the edge, show the old colour first
        let sx = 1;
        let side = v;
        if (t < 0.3 && i !== this.last) {
          const k = clamp(t / 0.3, 0, 1);
          sx = Math.cos(k * Math.PI);
          if (sx > 0) side = v === 1 ? 2 : 1;
        }
        this.disc(c, x, y, cs * 0.4, side, sx);
      }
    }
    if (this.last >= 0) {
      c.fillStyle = "#f43f5e";
      c.beginPath();
      c.arc(b.x + ((this.last % N) + 0.5) * cs, b.y + (Math.floor(this.last / N) + 0.5) * cs, 3.5, 0, TAU);
      c.fill();
    }
    // Legal move hints for the person
    if (this.state === "play" && !this.winner && !this.isBotTurn()) {
      for (const m of movesFor(this.cells, this.turn)) {
        c.fillStyle = this.turn === 1 ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.35)";
        c.beginPath();
        c.arc(b.x + ((m % N) + 0.5) * cs, b.y + (Math.floor(m / N) + 0.5) * cs, cs * 0.13, 0, TAU);
        c.fill();
      }
    }
    if (this.noteT > 0) {
      c.font = `700 16px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.globalAlpha = clamp(this.noteT, 0, 1);
      c.fillStyle = "rgba(0,0,0,0.65)";
      roundRectPath(c, b.x + b.w / 2 - 120, b.y + b.h / 2 - 20, 240, 40, 20);
      c.fill();
      c.fillStyle = "#ffffff";
      c.fillText(this.note, b.x + b.w / 2, b.y + b.h / 2);
      c.globalAlpha = 1;
    }
  }

  barText(side: Side) {
    return `${this.count(side)}`;
  }
}
