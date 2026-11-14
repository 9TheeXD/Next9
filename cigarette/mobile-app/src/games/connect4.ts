// Connect four ("เรียงสี่"): drop discs, line up four. Bot searches with alpha-beta.

import type { GameDefinition, GameEnv } from "./engine/types";
import { TurnDuel, type Side } from "./engine/turnduel";
import { clamp, roundRectPath, TAU, glow } from "./engine/fx";
import { pentatonic } from "./engine/audio";

export const connect4Game: GameDefinition = {
  id: "connect4",
  title: "เรียงสี่",
  tagline: "หยอดเหรียญให้เรียง 4 สู้บอทหรือเพื่อน",
  why: "ต้องคิดล่วงหน้าว่าคู่แข่งจะหยอดตรงไหน สั้น สนุก และดึงความสนใจได้เต็มที่",
  category: "duel",
  minutes: "2–6 นาที",
  palette: ["#1e3a8a", "#facc15"],
  create: (env) => new Connect4(env),
};

const C = 7;
const R = 6;

class Connect4 extends TurnDuel<number[]> {
  private cells: number[] = new Array(C * R).fill(0);
  private drop: { col: number; row: number; side: Side; t: number } | null = null;
  private winLine: number[] | null = null;
  private cs = 40;

  constructor(env: GameEnv) {
    super(env, {
      title: "เรียงสี่",
      subtitle: "หยอดเหรียญให้เรียงสี่ก่อนชนะ",
      accent: "#2563eb",
      colors: ["#ef4444", "#facc15"],
      sideNames: ["แดง", "เหลือง"],
      icon: (c) => {
        for (let i = 0; i < 4; i++) {
          c.fillStyle = i % 2 ? "#facc15" : "#ef4444";
          c.beginPath();
          c.arc(-36 + i * 24, -4 + (i % 2) * 6, 10, 0, TAU);
          c.fill();
        }
      },
    });
  }

  setup() {
    this.cells = new Array(C * R).fill(0);
    this.drop = null;
    this.winLine = null;
  }
  snapshot() {
    return this.cells.slice();
  }
  restore(s: number[]) {
    this.cells = s.slice();
    this.winLine = null;
    this.drop = null;
  }

  layoutBoard(x: number, y: number, w: number, h: number) {
    this.cs = Math.floor(Math.min(w / C, (h - 20) / (R + 0.6)));
    const bw = this.cs * C;
    const bh = this.cs * R;
    this.board = { x: x + (w - bw) / 2, y: y + (h - bh) / 2 + this.cs * 0.3, w: bw, h: bh };
  }

  private rowFor(col: number, cells = this.cells) {
    for (let r = R - 1; r >= 0; r--) if (!cells[r * C + col]) return r;
    return -1;
  }

  private lineAt(cells: number[], idx: number): number[] | null {
    const who = cells[idx];
    const r0 = Math.floor(idx / C);
    const c0 = idx % C;
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]) {
      const line = [idx];
      for (const s of [1, -1]) {
        let r = r0 + dr * s;
        let c = c0 + dc * s;
        while (r >= 0 && r < R && c >= 0 && c < C && cells[r * C + c] === who) {
          line.push(r * C + c);
          r += dr * s;
          c += dc * s;
        }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  private play(col: number) {
    const row = this.rowFor(col);
    if (row < 0) return;
    this.beforeMove();
    const side = this.turn;
    const idx = row * C + col;
    this.cells[idx] = side;
    this.drop = { col, row, side, t: 0 };
    this.env.sfx.tone({ freq: 300 + row * 40, dur: 0.08, vol: 0.08, type: "triangle", delay: 0.12 + row * 0.02 });
    const line = this.lineAt(this.cells, idx);
    if (line) {
      this.winLine = line;
      [0, 2, 4, 7].forEach((s, k) => this.env.sfx.chime(pentatonic(s + 3), 0.1, 0.25 + k * 0.09));
      this.endMove(side, side);
    } else if (this.cells.every((v) => v)) this.endMove(side, 3, "กระดานเต็ม");
    else this.endMove(side === 1 ? 2 : 1);
  }

  tapBoard(x: number, y: number) {
    const b = this.board;
    if (x < b.x || x > b.x + b.w || y < b.y - this.cs || y > b.y + b.h) return;
    const col = clamp(Math.floor((x - b.x) / this.cs), 0, C - 1);
    if (this.rowFor(col) >= 0) this.play(col);
  }

  // ── Bot ──────────────────────────────────────────────────────────────────

  private evalBoard(cells: number[], me: number) {
    const opp = me === 1 ? 2 : 1;
    let s = 0;
    for (let r = 0; r < R; r++) if (cells[r * C + 3] === me) s += 3;
    const win = (a: number, b: number, c2: number, d: number) => {
      const w = [cells[a], cells[b], cells[c2], cells[d]];
      const m = w.filter((v) => v === me).length;
      const o = w.filter((v) => v === opp).length;
      const e = 4 - m - o;
      if (m === 3 && e === 1) s += 5;
      else if (m === 2 && e === 2) s += 2;
      if (o === 3 && e === 1) s -= 4;
    };
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        if (c + 3 < C) win(i, i + 1, i + 2, i + 3);
        if (r + 3 < R) win(i, i + C, i + 2 * C, i + 3 * C);
        if (r + 3 < R && c + 3 < C) win(i, i + C + 1, i + 2 * C + 2, i + 3 * C + 3);
        if (r + 3 < R && c - 3 >= 0) win(i, i + C - 1, i + 2 * C - 2, i + 3 * C - 3);
      }
    return s;
  }

  private nodes = 0;
  private negamax(cells: number[], side: number, depth: number, alpha: number, beta: number): number {
    this.nodes++;
    const opp = side === 1 ? 2 : 1;
    if (depth === 0) return this.evalBoard(cells, side);
    let any = false;
    for (const col of [3, 2, 4, 1, 5, 0, 6]) {
      const row = this.rowFor(col, cells);
      if (row < 0) continue;
      any = true;
      const idx = row * C + col;
      cells[idx] = side;
      let sc: number;
      if (this.lineAt(cells, idx)) sc = 10000 + depth;
      else sc = -this.negamax(cells, opp, depth - 1, -beta, -alpha);
      cells[idx] = 0;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta || this.nodes > 400000) break;
    }
    return any ? alpha : 0;
  }

  botPlay() {
    const me = this.turn;
    const cells = this.cells.slice();
    const cols = [3, 2, 4, 1, 5, 0, 6].filter((c) => this.rowFor(c, cells) >= 0);
    if (this.level === 0 && Math.random() < 0.6) {
      // Beginner: random, but still grabs a win now and then
      const win = cols.find((c) => {
        const r = this.rowFor(c, cells);
        cells[r * C + c] = me;
        const ok = !!this.lineAt(cells, r * C + c);
        cells[r * C + c] = 0;
        return ok;
      });
      this.play(win !== undefined && Math.random() < 0.5 ? win : cols[Math.floor(Math.random() * cols.length)]);
      return;
    }
    const depth = [2, 4, 6, 8][this.level] ?? 4;
    let best = cols[0];
    let bestSc = -Infinity;
    this.nodes = 0;
    for (const col of cols) {
      const row = this.rowFor(col, cells);
      const idx = row * C + col;
      cells[idx] = me;
      const sc = this.lineAt(cells, idx) ? 100000 : -this.negamax(cells, me === 1 ? 2 : 1, depth - 1, -Infinity, Infinity);
      cells[idx] = 0;
      const noisy = sc + (this.level === 1 ? Math.random() * 6 : Math.random() * 0.5);
      if (noisy > bestSc) {
        bestSc = noisy;
        best = col;
      }
    }
    this.play(best);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  tick(dt: number) {
    if (this.drop) {
      this.drop.t += dt;
      if (this.drop.t > 1) this.drop = null;
    }
  }

  swatch(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: Side) {
    this.disc(c, x, y, r, side);
  }

  private disc(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: number) {
    const base = side === 1 ? "#ef4444" : "#facc15";
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, side === 1 ? "#fca5a5" : "#fef08a");
    g.addColorStop(1, base);
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.strokeStyle = side === 1 ? "#b91c1c" : "#ca8a04";
    c.lineWidth = r * 0.12;
    c.beginPath();
    c.arc(x, y, r * 0.68, 0, TAU);
    c.stroke();
  }

  renderBoard(c: CanvasRenderingContext2D) {
    const b = this.board;
    const cs = this.cs;
    // Discs behind the frame
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (!v) continue;
      const r = Math.floor(i / C);
      const col = i % C;
      let y = b.y + (r + 0.5) * cs;
      if (this.drop && this.drop.row === r && this.drop.col === col) {
        // Fall with a little bounce
        const t = this.drop.t;
        const fallT = Math.sqrt((r + 1) * 0.02);
        const k = t < fallT ? (t / fallT) ** 2 : 1 - Math.abs(Math.sin((t - fallT) * 14)) * Math.exp(-(t - fallT) * 12) * 0.12;
        y = b.y - cs * 0.5 + (y - b.y + cs * 0.5) * k;
      }
      this.disc(c, b.x + (col + 0.5) * cs, y, cs * 0.4, v);
    }
    // Frame with holes (even-odd fill)
    c.save();
    c.beginPath();
    roundRectPath(c, b.x - 8, b.y - 8, b.w + 16, b.h + 16, 16);
    for (let r = 0; r < R; r++)
      for (let col = 0; col < C; col++) {
        const x = b.x + (col + 0.5) * cs;
        const y = b.y + (r + 0.5) * cs;
        c.moveTo(x + cs * 0.42, y);
        c.arc(x, y, cs * 0.42, 0, TAU);
      }
    const fg = c.createLinearGradient(0, b.y, 0, b.y + b.h);
    fg.addColorStop(0, "#2563eb");
    fg.addColorStop(1, "#1e3a8a");
    c.fillStyle = fg;
    c.fill("evenodd");
    c.restore();
    if (this.winLine && (!this.drop || this.drop.t > 0.4)) {
      for (const i of this.winLine) {
        const x = b.x + ((i % C) + 0.5) * cs;
        const y = b.y + (Math.floor(i / C) + 0.5) * cs;
        glow(c, x, y, cs * 0.8, "#ffffff", 0.5 + 0.3 * Math.sin(this.time * 8));
        c.strokeStyle = "#ffffff";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(x, y, cs * 0.44, 0, TAU);
        c.stroke();
      }
    }
  }

  barText(side: Side) {
    return `${this.score[side]}`;
  }
}

