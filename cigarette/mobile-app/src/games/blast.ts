// "Block Garden 8×8" — drag pieces onto an 8×8 board and fill rows or columns to clear them.
// No timer and no rush, so it suits every age; planning where pieces fit is a visuospatial task
// of the kind that takes the edge off cravings.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeSprite, roundRectPath, rgba, clamp, ease, TAU, FONT_DISPLAY, FONT_BODY, glow, rng } from "./engine/fx";
import { Button, drawCard, glassPanel, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { drawBlock } from "./blocks";

const N = 8;
const COLORS = ["#ff6b8b", "#ffb547", "#ffe15a", "#5ee08f", "#4fd1ff", "#6f8bff", "#b884ff", "#ff8fd6"];

type Cells = [number, number][];
const SHAPES: { cells: Cells; weight: number }[] = [
  { cells: [[0, 0]], weight: 2 },
  { cells: [[0, 0], [1, 0]], weight: 3 },
  { cells: [[0, 0], [0, 1]], weight: 3 },
  { cells: [[0, 0], [1, 0], [2, 0]], weight: 3 },
  { cells: [[0, 0], [0, 1], [0, 2]], weight: 3 },
  { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 2 },
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 2 },
  { cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], weight: 1 },
  { cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], weight: 1 },
  { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], weight: 3 },
  { cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], weight: 1 },
  { cells: [[0, 0], [1, 0], [0, 1]], weight: 2 },
  { cells: [[0, 0], [1, 0], [1, 1]], weight: 2 },
  { cells: [[1, 0], [0, 1], [1, 1]], weight: 2 },
  { cells: [[0, 0], [0, 1], [1, 1]], weight: 2 },
  { cells: [[0, 0], [0, 1], [0, 2], [1, 2]], weight: 2 },
  { cells: [[1, 0], [1, 1], [1, 2], [0, 2]], weight: 2 },
  { cells: [[0, 0], [1, 0], [2, 0], [0, 1]], weight: 2 },
  { cells: [[0, 0], [1, 0], [2, 0], [2, 1]], weight: 2 },
  { cells: [[0, 0], [1, 0], [2, 0], [1, 1]], weight: 2 },
  { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], weight: 2 },
  { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], weight: 1 },
  { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], weight: 1 },
  { cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]], weight: 1 },
  { cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], weight: 1 },
];
const TOTAL_WEIGHT = SHAPES.reduce((s, x) => s + x.weight, 0);

interface Piece {
  cells: Cells;
  color: number;
  w: number;
  h: number;
  used: boolean;
  appear: number;
}

export const blastGame: GameDefinition = {
  id: "blast",
  title: "สวนบล็อก 8×8",
  tagline: "ลากบล็อกลงกระดาน เติมแถวให้เต็ม",
  why: "ต้องคิดว่าจะวางบล็อกตรงไหน สมองจึงจดจ่อกับภาพบนกระดานแทนภาพบุหรี่ ไม่มีจับเวลา เล่นช้าๆ ได้",
  category: "puzzle",
  minutes: "ไม่จำกัด",
  palette: ["#123a4a", "#4fd1ff"],
  create: (env) => new BlastGame(env),
};

type State = "intro" | "play" | "over";

class BlastGame implements GameInstance {
  private w = 0;
  private h = 0;
  private cell = 40;
  private bx = 0;
  private by = 0;
  private trayY = 0;
  private trayCell = 22;
  private board: (number | null)[][] = [];
  private pieces: Piece[] = [];
  private sprites: HTMLCanvasElement[] = [];
  private bg: HTMLCanvasElement | null = null;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private score = 0;
  private shown = 0;
  private best = 0;
  private newBest = false;
  private streak = 0;
  private lines = 0;
  private drag: { i: number; x: number; y: number; id: number } | null = null;
  private clearing: { cells: [number, number, number][]; t: number } | null = null;
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มเลย", "#22b8cf");
  private againBtn = new Button("เล่นอีกครั้ง", "#22b8cf");
  private rand = rng(Date.now() % 99991);
  private motes: { x: number; y: number; r: number; s: number }[] = [];

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    const r = rng(17);
    for (let i = 0; i < 24; i++) this.motes.push({ x: r(), y: r(), r: 1 + r() * 2.5, s: 0.005 + r() * 0.015 });
    this.reset();
  }

  private reset() {
    this.board = Array.from({ length: N }, () => Array<number | null>(N).fill(null));
    this.score = 0;
    this.shown = 0;
    this.streak = 0;
    this.lines = 0;
    this.newBest = false;
    this.clearing = null;
    this.deal();
  }

  private randomShape(): Cells {
    let k = this.rand() * TOTAL_WEIGHT;
    for (const s of SHAPES) {
      k -= s.weight;
      if (k <= 0) return s.cells;
    }
    return SHAPES[0].cells;
  }

  private makePiece(cells: Cells): Piece {
    const w = Math.max(...cells.map((c) => c[0])) + 1;
    const h = Math.max(...cells.map((c) => c[1])) + 1;
    return { cells, color: Math.floor(this.rand() * COLORS.length), w, h, used: false, appear: 0 };
  }

  /** Three new pieces; tries to make sure at least one of them fits. */
  private deal() {
    let set: Piece[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      set = [0, 1, 2].map(() => this.makePiece(this.randomShape()));
      if (set.some((p) => this.fitsAnywhere(p))) break;
    }
    this.pieces = set;
  }

  private fits(p: Piece, gx: number, gy: number) {
    for (const [x, y] of p.cells) {
      const cx = gx + x;
      const cy = gy + y;
      if (cx < 0 || cy < 0 || cx >= N || cy >= N || this.board[cy][cx] !== null) return false;
    }
    return true;
  }

  private fitsAnywhere(p: Piece) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (this.fits(p, x, y)) return true;
    return false;
  }

  /** Rows and columns that would be full after placing p at (gx, gy). */
  private wouldClear(p: Piece, gx: number, gy: number) {
    const filled = (x: number, y: number) => this.board[y][x] !== null || p.cells.some(([px, py]) => gx + px === x && gy + py === y);
    const rows: number[] = [];
    const cols: number[] = [];
    for (let y = 0; y < N; y++) {
      let full = true;
      for (let x = 0; x < N; x++) if (!filled(x, y)) full = false;
      if (full) rows.push(y);
    }
    for (let x = 0; x < N; x++) {
      let full = true;
      for (let y = 0; y < N; y++) if (!filled(x, y)) full = false;
      if (full) cols.push(x);
    }
    return { rows, cols };
  }

  private dropTarget(): { gx: number; gy: number; ok: boolean } | null {
    if (!this.drag) return null;
    const p = this.pieces[this.drag.i];
    const { px, py } = this.dragPos();
    const gx = Math.round((px - this.bx) / this.cell);
    const gy = Math.round((py - this.by) / this.cell);
    if (gx < -2 || gy < -2 || gx > N + 1 || gy > N + 1) return null;
    return { gx, gy, ok: this.fits(p, gx, gy) };
  }

  /** Top-left of the dragged piece: held above the finger so the finger does not hide it. */
  private dragPos() {
    const d = this.drag!;
    const p = this.pieces[d.i];
    return { px: d.x - (p.w * this.cell) / 2, py: d.y - p.h * this.cell - this.cell * 1.1 };
  }

  private place(i: number, gx: number, gy: number) {
    const p = this.pieces[i];
    for (const [x, y] of p.cells) this.board[gy + y][gx + x] = p.color;
    p.used = true;
    this.score += p.cells.length;
    this.env.sfx.tone({ freq: 300 + p.cells.length * 25, dur: 0.09, vol: 0.08, type: "triangle" });
    for (const [x, y] of p.cells) {
      this.particles.burst(this.bx + (gx + x + 0.5) * this.cell, this.by + (gy + y + 0.5) * this.cell, COLORS[p.color], 2, { speed: 60, size: 2, gravity: 0, life: 0.4 });
    }
    const { rows, cols } = this.wouldClear({ ...p, cells: [] }, 0, 0);
    if (rows.length || cols.length) {
      const n = rows.length + cols.length;
      this.streak++;
      this.lines += n;
      const gained = n * 10 * n + (this.streak > 1 ? this.streak * 10 : 0);
      this.score += gained;
      const cells: [number, number, number][] = [];
      const seen = new Set<string>();
      for (const y of rows) for (let x = 0; x < N; x++) seen.add(`${x},${y}`);
      for (const x of cols) for (let y = 0; y < N; y++) seen.add(`${x},${y}`);
      for (const k of seen) {
        const [x, y] = k.split(",").map(Number);
        cells.push([x, y, this.board[y][x]!]);
      }
      this.clearing = { cells, t: 0 };
      const words = ["", "ดีมาก!", "เยี่ยม!", "สุดยอด!", "มหัศจรรย์!"];
      this.floaters.add(n >= 2 ? words[Math.min(4, n)] : `+${gained}`, this.bx + (N * this.cell) / 2, this.by + (N * this.cell) / 2, n >= 2 ? "#ffe58a" : "#ffffff", n >= 2 ? 30 : 22, 1.2);
      if (this.streak > 1) this.floaters.add(`ต่อเนื่อง x${this.streak}`, this.bx + (N * this.cell) / 2, this.by + (N * this.cell) / 2 + 34, "#9ef0ff", 17);
      for (let k = 0; k < n; k++) this.env.sfx.chime(pentatonic(5 + k * 2 + Math.min(this.streak, 5)), 0.11, k * 0.07);
      for (const [x, y, col] of cells) {
        const cx = this.bx + (x + 0.5) * this.cell;
        const cy = this.by + (y + 0.5) * this.cell;
        this.particles.burst(cx, cy, COLORS[col], 5, { speed: 220, size: this.cell * 0.14, kind: "shard", gravity: 380, life: 0.9 });
        this.particles.burst(cx, cy, "#ffffff", 1, { speed: 140, size: 2, kind: "spark", gravity: 0, life: 0.4 });
      }
    } else {
      this.streak = 0;
    }
    if (this.pieces.every((q) => q.used)) this.deal();
    this.env.emit({ type: "score", score: this.score });
    if (!this.clearing) this.checkOver();
  }

  private finishClear() {
    if (!this.clearing) return;
    for (const [x, y] of this.clearing.cells) this.board[y][x] = null;
    this.clearing = null;
    this.checkOver();
  }

  private checkOver() {
    const left = this.pieces.filter((p) => !p.used);
    if (left.length && !left.some((p) => this.fitsAnywhere(p))) {
      this.state = "over";
      this.stateT = 0;
      const r = bestScore(this.env.store, "best", this.score);
      this.best = r.best;
      this.newBest = r.isNew;
      this.env.sfx.tone({ freq: 330, dur: 0.6, vol: 0.09, glideTo: 180 });
      this.env.emit({ type: "end", score: this.score, best: this.best, summary: `ล้างไป ${this.lines} แถว`, stats: { lines: this.lines } });
    }
  }

  private start() {
    this.reset();
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 84;
    const trayH = Math.min(170, h * 0.24);
    this.cell = Math.floor(clamp(Math.min((w - 28) / N, (h - top - trayH - 20) / N), 26, 64));
    this.bx = Math.round((w - this.cell * N) / 2);
    this.by = Math.round(top + (h - top - trayH - this.cell * N) / 2);
    this.trayY = this.by + this.cell * N + 18;
    this.trayCell = Math.floor(Math.min(this.cell * 0.55, (w - 40) / 3 / 5.2, (h - this.trayY - 16) / 5.2));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.sprites = COLORS.map((col) => makeSprite(this.cell, this.cell, dpr, (c) => drawBlock(c, this.cell, col)));
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#0d2f3d");
      g.addColorStop(0.5, "#123a4a");
      g.addColorStop(1, "#2b2257");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      for (const [x, y, rad, col] of [[0.1, 0.1, 0.6, "#1fb5a8"], [0.95, 0.4, 0.5, "#6f5bff"], [0.3, 0.95, 0.5, "#ff6b8b"]] as [number, number, number, string][]) {
        const rg = c.createRadialGradient(x * w, y * h, 0, x * w, y * h, rad * Math.max(w, h));
        rg.addColorStop(0, rgba(col, 0.25));
        rg.addColorStop(1, rgba(col, 0));
        c.fillStyle = rg;
        c.fillRect(0, 0, w, h);
      }
    });
  }

  private traySlot(i: number) {
    const slotW = (this.w - 24) / 3;
    return { cx: 12 + slotW * (i + 0.5), cy: this.trayY + (this.h - this.trayY) / 2 - 4 };
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
    if (p.type === "down" && !this.drag) {
      if (p.y < this.trayY - 10) return;
      const slotW = (this.w - 24) / 3;
      const i = clamp(Math.floor((p.x - 12) / slotW), 0, 2);
      if (this.pieces[i] && !this.pieces[i].used) {
        this.drag = { i, x: p.x, y: p.y, id: p.id };
        this.env.sfx.tone({ freq: 520, dur: 0.05, vol: 0.05 });
      }
    } else if (p.type === "move" && this.drag && this.drag.id === p.id) {
      this.drag.x = p.x;
      this.drag.y = p.y;
    } else if ((p.type === "up" || p.type === "cancel") && this.drag && this.drag.id === p.id) {
      const t = this.dropTarget();
      const i = this.drag.i;
      this.drag = null;
      if (t && t.ok && p.type === "up" && !this.clearing) this.place(i, t.gx, t.gy);
      else this.env.sfx.tone({ freq: 200, dur: 0.08, vol: 0.04, type: "triangle" });
    }
  }

  key(code: string, down: boolean) {
    if (!down || (code !== "Enter" && code !== "Space")) return false;
    if (this.state !== "play" && this.stateT > 0.5) this.start();
    return true;
  }

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.startBtn.update(dt);
    this.againBtn.update(dt);
    for (const m of this.motes) {
      m.y -= m.s * dt;
      if (m.y < -0.05) m.y = 1.05;
    }
    for (const p of this.pieces) p.appear = Math.min(1, p.appear + dt * 4);
    this.shown += (this.score - this.shown) * Math.min(1, dt * 10);
    if (this.clearing) {
      this.clearing.t += dt;
      if (this.clearing.t > 0.32) this.finishClear();
    }
  }

  private drawPiece(p: Piece, x: number, y: number, size: number, alpha = 1) {
    const { ctx } = this.env;
    ctx.globalAlpha = alpha;
    for (const [cx, cy] of p.cells) ctx.drawImage(this.sprites[p.color], x + cx * size, y + cy * size, size, size);
    ctx.globalAlpha = 1;
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const m of this.motes) {
      ctx.fillStyle = `rgba(180,255,240,${0.25 + 0.2 * Math.sin(this.time + m.x * 10)})`;
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // HUD
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `500 12px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(`สถิติ ${this.best.toLocaleString()}`, w / 2, 12);
    ctx.font = `800 36px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(Math.round(this.shown).toLocaleString(), w / 2, 28);

    // Board
    const c = this.cell;
    glassPanel(ctx, this.bx - 8, this.by - 8, c * N + 16, c * N + 16, 16, 0.1);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        ctx.fillStyle = "rgba(4,16,30,0.55)";
        roundRectPath(ctx, this.bx + x * c + 2, this.by + y * c + 2, c - 4, c - 4, c * 0.16);
        ctx.fill();
      }

    // Preview of where the dragged piece lands, and the lines it would clear
    const t = this.dropTarget();
    let hlRows: number[] = [];
    let hlCols: number[] = [];
    if (t && t.ok && this.drag) {
      const p = this.pieces[this.drag.i];
      const r = this.wouldClear(p, t.gx, t.gy);
      hlRows = r.rows;
      hlCols = r.cols;
      for (const [x, y] of p.cells) {
        ctx.fillStyle = rgba(COLORS[p.color], 0.35);
        roundRectPath(ctx, this.bx + (t.gx + x) * c + 2, this.by + (t.gy + y) * c + 2, c - 4, c - 4, c * 0.16);
        ctx.fill();
      }
    }
    const clearSet = new Set(this.clearing?.cells.map(([x, y]) => `${x},${y}`));
    const ck = this.clearing ? ease.outCubic(clamp(this.clearing.t / 0.32, 0, 1)) : 0;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const col = this.board[y][x];
        if (col === null) continue;
        const px = this.bx + x * c;
        const py = this.by + y * c;
        if (clearSet.has(`${x},${y}`)) {
          const s = 1 - ck;
          ctx.globalAlpha = s;
          ctx.drawImage(this.sprites[col], px + (c * (1 - s)) / 2, py + (c * (1 - s)) / 2, c * s, c * s);
          ctx.globalAlpha = 1;
        } else {
          ctx.drawImage(this.sprites[col], px, py, c, c);
          if (hlRows.includes(y) || hlCols.includes(x)) {
            ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.15 * Math.sin(this.time * 10)})`;
            roundRectPath(ctx, px + 2, py + 2, c - 4, c - 4, c * 0.16);
            ctx.fill();
          }
        }
      }

    // Tray
    for (let i = 0; i < 3; i++) {
      const p = this.pieces[i];
      if (!p || p.used || (this.drag && this.drag.i === i)) continue;
      const { cx, cy } = this.traySlot(i);
      const s = this.trayCell * ease.outBack(p.appear);
      const fits = this.state !== "play" || this.fitsAnywhere(p);
      this.drawPiece(p, cx - (p.w * s) / 2, cy - (p.h * s) / 2, s, fits ? 1 : 0.35);
    }
    if (this.drag) {
      const p = this.pieces[this.drag.i];
      const { px, py } = this.dragPos();
      glow(ctx, px + (p.w * c) / 2, py + (p.h * c) / 2, Math.max(p.w, p.h) * c, COLORS[p.color], 0.25);
      this.drawPiece(p, px, py, c, 0.95);
    }

    this.particles.render(ctx);
    this.floaters.render(ctx);

    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "สวนบล็อก 8×8",
        subtitle: "ไม่มีจับเวลา เล่นช้าๆ ได้เต็มที่",
        body: "ลากบล็อกจากด้านล่างวางบนกระดาน เติมแถวหรือคอลัมน์ให้เต็มเพื่อล้าง เกมจบเมื่อไม่มีที่วางบล็อก",
        accent: "#22b8cf",
        buttons: [this.startBtn],
        appear: this.stateT * 3,
        chips: this.best ? [`สถิติ ${this.best.toLocaleString()}`] : undefined,
        icon: (cx) => {
          const s = 22;
          const cells: [number, number, number][] = [[-1, 0, 0], [0, 0, 0], [1, 0, 4], [-1, -1, 3], [1, -1, 4], [0, 1, 6]];
          for (const [x, y, col] of cells) if (this.sprites[col]) cx.drawImage(this.sprites[col], x * s - s / 2, y * s - s / 2, s, s);
        },
      });
    } else if (this.state === "over") {
      drawCard(ctx, w, h, {
        title: this.newBest ? "สถิติใหม่!" : "กระดานเต็มแล้ว",
        subtitle: "ความอยากตอนนี้เป็นยังไงบ้าง?",
        bigValue: this.score.toLocaleString(),
        bigLabel: "คะแนน",
        chips: [`${this.lines} แถว`, `สถิติ ${this.best.toLocaleString()}`],
        accent: this.newBest ? "#ffc634" : "#22b8cf",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5,
      });
    }
  }
}
