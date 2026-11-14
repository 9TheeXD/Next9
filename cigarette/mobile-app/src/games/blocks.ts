// "Starfall Blocks" — a falling-block puzzle. Three minutes of a Tetris-style game cut the strength of
// cravings (Skorka-Brown et al., Appetite 2014; Addictive Behaviors 2015): building a vivid mental
// picture of smoking and placing blocks compete for the same visual working memory.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import {
  Particles, Floaters, makeStars, drawStars, vignette, roundRectPath, shade, rgba, makeSprite,
  clamp, ease, TAU, FONT_DISPLAY, FONT_BODY, glow, type Star,
} from "./engine/fx";
import { Button, drawCard, glassPanel, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { coinsFor, wallet } from "./engine/economy";
import { drawBlockSkin } from "./art/skins";

const COLS = 10;
const ROWS = 20;
const HIDDEN = 2; // rows above the visible board where pieces spawn

type Kind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
const KINDS: Kind[] = ["I", "O", "T", "S", "Z", "J", "L"];

const SHAPES: Record<Kind, { n: number; cells: [number, number][] }> = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

const COLORS: Record<Kind, string> = {
  I: "#34d8ff",
  O: "#ffcf3a",
  T: "#b26bff",
  S: "#36dd8c",
  Z: "#ff5b78",
  J: "#4f7dff",
  L: "#ff9a3c",
};

const KICKS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
const LINE_POINTS = [0, 100, 300, 500, 800];

interface Piece {
  kind: Kind;
  cells: [number, number][]; // relative to (x, y)
  n: number;
  x: number;
  y: number;
}

function rotateCells(cells: [number, number][], n: number, dir: 1 | -1): [number, number][] {
  return cells.map(([x, y]) => (dir === 1 ? [n - 1 - y, x] : [y, n - 1 - x]) as [number, number]);
}

export function drawBlock(ctx: CanvasRenderingContext2D, s: number, color: string) {
  const r = s * 0.2;
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  roundRectPath(ctx, 1, 1, s - 2, s - 2, r);
  ctx.fill();
  // Bevel
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.strokeStyle = rgba("#ffffff", 0.45);
  ctx.beginPath();
  ctx.moveTo(2 + r, 2.5);
  ctx.lineTo(s - 2 - r, 2.5);
  ctx.moveTo(2.5, 2 + r);
  ctx.lineTo(2.5, s - 2 - r);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.moveTo(2 + r, s - 2.5);
  ctx.lineTo(s - 2 - r, s - 2.5);
  ctx.moveTo(s - 2.5, 2 + r);
  ctx.lineTo(s - 2.5, s - 2 - r);
  ctx.stroke();
  // Inner face
  const inset = s * 0.22;
  const fg = ctx.createLinearGradient(inset, inset, s - inset, s - inset);
  fg.addColorStop(0, rgba("#ffffff", 0.28));
  fg.addColorStop(1, rgba("#ffffff", 0.02));
  ctx.fillStyle = fg;
  roundRectPath(ctx, inset, inset, s - inset * 2, s - inset * 2, r * 0.6);
  ctx.fill();
  // Gloss
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(s * 0.32, s * 0.24, s * 0.16, s * 0.07, -0.5, 0, TAU);
  ctx.fill();
}

export const blocksGame: GameDefinition = {
  id: "blocks",
  title: "ต่อบล็อกดวงดาว",
  tagline: "เรียงบล็อกให้เต็มแถว เพลินจนลืมความอยาก",
  why: "งานวิจัยพบว่าเล่นเกมต่อบล็อกแบบนี้ 3 นาทีช่วยให้ความอยากลดลง เพราะสมองต้องใช้จินตภาพไปกับการวางบล็อกแทนภาพของบุหรี่",
  category: "puzzle",
  minutes: "3 นาที",
  palette: ["#2b1a6b", "#34d8ff"],
  create: (env) => new BlocksGame(env),
};

type State = "intro" | "play" | "over";

class BlocksGame implements GameInstance {
  private earned = 0;
  private w = 0;
  private h = 0;
  private cell = 24;
  private bx = 0;
  private by = 0;
  private sideX = 0;
  private board: (Kind | null)[][] = [];
  private piece: Piece | null = null;
  private queue: Kind[] = [];
  private hold: Kind | null = null;
  private holdUsed = false;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private score = 0;
  private lines = 0;
  private level = 1;
  private combo = -1;
  private fallT = 0;
  private lockT = 0;
  private lockMoves = 0;
  private clearing: number[] = [];
  private clearT = 0;
  private shake = 0;
  private sprites: Partial<Record<Kind, HTMLCanvasElement>> = {};
  private miniSprites: Partial<Record<Kind, HTMLCanvasElement>> = {};
  private bg: HTMLCanvasElement | null = null;
  private stars: Star[] = makeStars(140, 11);
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มเลย", "#7c5cff");
  private againBtn = new Button("เล่นอีกครั้ง", "#7c5cff");
  private best = 0;
  private newBest = false;
  private elapsed = 0;
  private tutorial = 0; // seconds the gesture hint stays visible
  // touch
  private touch: { id: number; x0: number; y0: number; ax: number; ay: number; t0: number; moved: boolean; soft: boolean } | null = null;
  // keyboard auto-repeat
  private keys = new Map<string, number>();

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    this.reset();
  }

  private reset() {
    this.board = Array.from({ length: ROWS + HIDDEN }, () => Array<Kind | null>(COLS).fill(null));
    this.queue = [];
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.clearing = [];
    this.elapsed = 0;
    this.newBest = false;
    this.particles.list = [];
    this.fillQueue();
    this.piece = null;
  }

  private fillQueue() {
    while (this.queue.length < 7) {
      const bag = [...KINDS];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.queue.push(...bag);
    }
  }

  private spawn(kind?: Kind): boolean {
    this.fillQueue();
    const k = kind ?? this.queue.shift()!;
    const sh = SHAPES[k];
    const p: Piece = { kind: k, cells: sh.cells.map((c) => [c[0], c[1]] as [number, number]), n: sh.n, x: Math.floor((COLS - sh.n) / 2), y: k === "I" ? 0 : 1 };
    this.piece = p;
    this.fallT = 0;
    this.lockT = 0;
    this.lockMoves = 0;
    if (this.collides(p, p.x, p.y, p.cells)) {
      this.gameOver();
      return false;
    }
    return true;
  }

  private collides(p: Piece, x: number, y: number, cells: [number, number][]) {
    for (const [cx, cy] of cells) {
      const gx = x + cx;
      const gy = y + cy;
      if (gx < 0 || gx >= COLS || gy >= ROWS + HIDDEN) return true;
      if (gy >= 0 && this.board[gy][gx]) return true;
    }
    return false;
  }

  private onGround(p: Piece) {
    return this.collides(p, p.x, p.y + 1, p.cells);
  }

  private move(dx: number): boolean {
    const p = this.piece;
    if (!p || this.clearing.length) return false;
    if (this.collides(p, p.x + dx, p.y, p.cells)) return false;
    p.x += dx;
    this.touchLock();
    this.env.sfx.tone({ freq: 220, dur: 0.05, vol: 0.05, type: "triangle" });
    return true;
  }

  private rotate(dir: 1 | -1) {
    const p = this.piece;
    if (!p || this.clearing.length || p.kind === "O") return;
    const cells = rotateCells(p.cells, p.n, dir);
    for (const [kx, ky] of KICKS) {
      if (!this.collides(p, p.x + kx, p.y + ky, cells)) {
        p.x += kx;
        p.y += ky;
        p.cells = cells;
        this.touchLock();
        this.env.sfx.tone({ freq: 523, dur: 0.07, vol: 0.06, type: "sine", glideTo: 660 });
        return;
      }
    }
  }

  private touchLock() {
    if (this.piece && this.onGround(this.piece) && this.lockMoves < 15) {
      this.lockT = 0;
      this.lockMoves++;
    }
  }

  private softDrop(): boolean {
    const p = this.piece;
    if (!p || this.clearing.length) return false;
    if (this.collides(p, p.x, p.y + 1, p.cells)) return false;
    p.y++;
    this.score += 1;
    this.fallT = 0;
    return true;
  }

  private hardDrop() {
    const p = this.piece;
    if (!p || this.clearing.length) return;
    let d = 0;
    while (!this.collides(p, p.x, p.y + 1, p.cells)) {
      p.y++;
      d++;
    }
    this.score += d * 2;
    // Trail particles from each cell
    for (const [cx, cy] of p.cells) {
      const px = this.bx + (p.x + cx + 0.5) * this.cell;
      const py = this.by + (p.y + cy - HIDDEN + 0.5) * this.cell;
      this.particles.burst(px, py, COLORS[p.kind], 3, { speed: 60, gravity: -40, life: 0.5, size: 2.5, spread: 1, angle: -Math.PI / 2 });
    }
    this.shake = Math.min(6, 2 + d * 0.25);
    this.env.sfx.noise({ dur: 0.12, vol: 0.12, freq: 300, type: "lowpass" });
    this.lock();
  }

  private doHold() {
    const p = this.piece;
    if (!p || this.holdUsed || this.clearing.length) return;
    const k = p.kind;
    this.holdUsed = true;
    if (this.hold) {
      const h = this.hold;
      this.hold = k;
      this.spawn(h);
    } else {
      this.hold = k;
      this.spawn();
    }
    this.env.sfx.tone({ freq: 330, dur: 0.12, vol: 0.07, glideTo: 440 });
  }

  private lock() {
    const p = this.piece;
    if (!p) return;
    let above = 0;
    for (const [cx, cy] of p.cells) {
      const gy = p.y + cy;
      if (gy < HIDDEN) above++;
      if (gy >= 0) this.board[gy][p.x + cx] = p.kind;
    }
    this.piece = null;
    this.holdUsed = false;
    if (above === p.cells.length) {
      this.gameOver();
      return;
    }
    const full: number[] = [];
    for (let y = 0; y < ROWS + HIDDEN; y++) if (this.board[y].every((c) => c)) full.push(y);
    if (full.length) {
      this.clearing = full;
      this.clearT = 0;
      this.combo++;
      const pts = LINE_POINTS[full.length] * this.level + Math.max(0, this.combo) * 50 * this.level;
      this.score += pts;
      const midY = this.by + (full[0] - HIDDEN + full.length / 2) * this.cell;
      const label = full.length === 4 ? "สุดยอด! 4 แถว" : full.length > 1 ? `${full.length} แถว!` : "+" + pts;
      this.floaters.add(label, this.bx + (COLS * this.cell) / 2, midY, full.length >= 3 ? "#ffe58a" : "#ffffff", full.length >= 3 ? 28 : 22);
      if (this.combo > 0) this.floaters.add(`ต่อเนื่อง x${this.combo + 1}`, this.bx + (COLS * this.cell) / 2, midY + 30, "#9ef0ff", 16);
      for (let i = 0; i < full.length; i++) {
        this.env.sfx.chime(pentatonic(5 + i * 2 + Math.min(this.combo, 4)), 0.12, i * 0.07);
      }
      this.shake = 4 + full.length * 2;
      for (const row of full) {
        for (let x = 0; x < COLS; x++) {
          const k = this.board[row][x]!;
          const px = this.bx + (x + 0.5) * this.cell;
          const py = this.by + (row - HIDDEN + 0.5) * this.cell;
          this.particles.burst(px, py, COLORS[k], 4, { speed: 240, size: this.cell * 0.18, kind: "shard", life: 0.9, gravity: 380 });
          this.particles.burst(px, py, "#ffffff", 1, { speed: 120, size: 2, kind: "spark", life: 0.5, gravity: 0 });
        }
      }
    } else {
      this.combo = -1;
      this.env.sfx.tone({ freq: 160, dur: 0.08, vol: 0.08, type: "triangle" });
      this.spawn();
    }
  }

  private finishClear() {
    const rows = new Set(this.clearing);
    const kept = this.board.filter((_, y) => !rows.has(y));
    while (kept.length < ROWS + HIDDEN) kept.unshift(Array<Kind | null>(COLS).fill(null));
    this.board = kept;
    const before = this.level;
    this.lines += this.clearing.length;
    this.level = Math.min(15, 1 + Math.floor(this.lines / 10));
    if (this.level > before) {
      this.floaters.add(`เลเวล ${this.level}`, this.w / 2, this.by + this.cell * 6, "#c9b6ff", 30, 1.6);
      [0, 2, 4, 7].forEach((s, i) => this.env.sfx.chime(pentatonic(s + 5), 0.1, i * 0.09));
    }
    this.clearing = [];
    this.env.emit({ type: "score", score: this.score });
    this.spawn();
  }

  private gravityInterval() {
    return Math.max(0.09, 0.85 * Math.pow(0.84, this.level - 1));
  }

  private gameOver() {
    this.state = "over";
    this.stateT = 0;
    this.piece = null;
    const r = bestScore(this.env.store, "best", this.score);
    this.best = r.best;
    this.newBest = r.isNew;
    this.env.sfx.tone({ freq: 392, dur: 0.6, vol: 0.1, glideTo: 196 });
    this.env.emit({
      type: "end", coins: (this.earned = coinsFor(this.score, 60, 5, 120)),
      score: this.score,
      best: this.best,
      summary: `ล้างไป ${this.lines} แถว · เลเวล ${this.level}`,
      stats: { lines: this.lines, level: this.level, seconds: Math.round(this.elapsed) },
    });
  }

  private start() {
    this.reset();
    this.state = "play";
    this.stateT = 0;
    this.tutorial = 6;
    this.spawn();
    this.env.emit({ type: "start" });
    this.env.sfx.chime(pentatonic(7), 0.1);
  }

  // ── Layout & assets ──────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 74;
    const bottom = 18;
    const margin = 14;
    const sideCols = 3.4;
    const cell = Math.floor(Math.min((w - margin * 2 - 10) / (COLS + sideCols), (h - top - bottom) / ROWS));
    this.cell = clamp(cell, 12, 44);
    const boardW = this.cell * COLS;
    const totalW = boardW + 10 + this.cell * sideCols;
    this.bx = Math.round((w - totalW) / 2);
    this.by = Math.round(top + (h - top - bottom - this.cell * ROWS) / 2);
    this.sideX = this.bx + boardW + 10;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    // Block look bought in the shop (classic is the original jelly block)
    const skin = wallet.equipped("blockSkin");
    const paint = (c: CanvasRenderingContext2D, size: number, col: string) => (skin && skin !== "block_classic" ? drawBlockSkin(c, size, col, skin) : drawBlock(c, size, col));
    for (const k of KINDS) {
      this.sprites[k] = makeSprite(this.cell, this.cell, dpr, (c) => paint(c, this.cell, COLORS[k]));
      const m = Math.round(this.cell * 0.62);
      this.miniSprites[k] = makeSprite(m, m, dpr, (c) => paint(c, m, COLORS[k]));
    }
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#090c2a");
      g.addColorStop(0.55, "#191650");
      g.addColorStop(1, "#2c1458");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Nebula clouds
      const blobs: [number, number, number, string][] = [
        [0.15, 0.25, 0.5, "#4b2bd1"],
        [0.85, 0.15, 0.45, "#1c6fd8"],
        [0.7, 0.8, 0.55, "#b0287a"],
        [0.2, 0.85, 0.4, "#2a7bd6"],
      ];
      for (const [x, y, r, col] of blobs) {
        const rg = c.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h));
        rg.addColorStop(0, rgba(col, 0.32));
        rg.addColorStop(1, rgba(col, 0));
        c.fillStyle = rg;
        c.fillRect(0, 0, w, h);
      }
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────

  pointer(p: PointerInfo) {
    if (this.state === "intro" || this.state === "over") {
      const btn = this.state === "intro" ? this.startBtn : this.againBtn;
      if (p.type === "down" && btn.hit(p.x, p.y)) btn.pressed = true;
      if (p.type === "up") {
        if (btn.pressed && btn.hit(p.x, p.y) && this.stateT > 0.25) this.start();
        btn.pressed = false;
      }
      return;
    }
    const step = this.cell * 0.85;
    if (p.type === "down") {
      // Tap on the hold box
      if (p.x >= this.sideX && p.y >= this.by && p.y <= this.by + this.cell * 3.2) {
        this.doHold();
        return;
      }
      this.touch = { id: p.id, x0: p.x, y0: p.y, ax: p.x, ay: p.y, t0: p.t, moved: false, soft: false };
    } else if (p.type === "move" && this.touch && this.touch.id === p.id) {
      const t = this.touch;
      while (p.x - t.ax > step) {
        this.move(1);
        t.ax += step;
        t.moved = true;
      }
      while (t.ax - p.x > step) {
        this.move(-1);
        t.ax -= step;
        t.moved = true;
      }
      // Slow drag down = soft drop, one row per cell moved
      if (Math.abs(p.x - t.x0) < this.cell * 1.2) {
        while (p.y - t.ay > step) {
          if (p.t - t.t0 > 160) {
            this.softDrop();
            t.soft = true;
          }
          t.ay += step;
          t.moved = true;
        }
      }
    } else if ((p.type === "up" || p.type === "cancel") && this.touch && this.touch.id === p.id) {
      const t = this.touch;
      const dt = p.t - t.t0;
      const dx = p.x - t.x0;
      const dy = p.y - t.y0;
      this.touch = null;
      if (p.type === "cancel") return;
      if (dt < 260 && dy > this.cell * 2 && Math.abs(dy) > Math.abs(dx) * 1.4 && !t.soft) {
        this.hardDrop();
      } else if (dt < 300 && dy < -this.cell * 2 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        this.doHold();
      } else if (!t.moved && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        // Tap: left third rotates left, elsewhere rotates right
        this.rotate(p.x < this.bx + this.cell * COLS * 0.33 ? -1 : 1);
      }
    }
  }

  key(code: string, down: boolean): boolean {
    const used = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space", "KeyZ", "KeyX", "KeyC", "ShiftLeft", "ShiftRight", "Enter"];
    if (!used.includes(code)) return false;
    if (!down) {
      this.keys.delete(code);
      return true;
    }
    if (this.keys.has(code)) return true; // browser auto-repeat; we do our own
    if (this.state !== "play") {
      // Space only starts from the intro, so hard-drop presses do not skip the result card.
      if ((code === "Enter" || (code === "Space" && this.state === "intro")) && this.stateT > 0.6) this.start();
      return true;
    }
    this.keys.set(code, 0);
    if (code === "ArrowLeft") this.move(-1);
    else if (code === "ArrowRight") this.move(1);
    else if (code === "ArrowDown") this.softDrop();
    else if (code === "ArrowUp" || code === "KeyX") this.rotate(1);
    else if (code === "KeyZ") this.rotate(-1);
    else if (code === "Space") this.hardDrop();
    else if (code === "KeyC" || code.startsWith("Shift")) this.doHold();
    return true;
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.startBtn.update(dt);
    this.againBtn.update(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.state !== "play") return;
    this.elapsed += dt;
    this.tutorial = Math.max(0, this.tutorial - dt);

    // Keyboard auto-repeat
    for (const [code, held] of this.keys) {
      const t = held + dt;
      this.keys.set(code, t);
      const das = 0.17;
      const arr = code === "ArrowDown" ? 0.035 : 0.05;
      if (t > das) {
        const before = Math.floor((held - das) / arr);
        const after = Math.floor((t - das) / arr);
        for (let i = Math.max(0, before); i < after; i++) {
          if (code === "ArrowLeft") this.move(-1);
          else if (code === "ArrowRight") this.move(1);
          else if (code === "ArrowDown") this.softDrop();
        }
      }
    }

    if (this.clearing.length) {
      this.clearT += dt;
      if (this.clearT > 0.34) this.finishClear();
      return;
    }
    const p = this.piece;
    if (!p) return;
    if (this.onGround(p)) {
      this.lockT += dt;
      if (this.lockT > 0.5) this.lock();
    } else {
      this.fallT += dt;
      const iv = this.gravityInterval();
      while (this.fallT >= iv && this.piece && !this.onGround(this.piece)) {
        this.fallT -= iv;
        this.piece.y++;
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    // Aurora ribbons
    if (!this.env.reducedMotion) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const yBase = h * (0.18 + i * 0.12);
        ctx.beginPath();
        ctx.moveTo(0, yBase);
        for (let x = 0; x <= w; x += 12) {
          ctx.lineTo(x, yBase + Math.sin(x * 0.012 + this.time * (0.25 + i * 0.1) + i) * 26 + Math.sin(x * 0.03 + this.time * 0.4) * 8);
        }
        ctx.lineTo(w, yBase + 90);
        ctx.lineTo(0, yBase + 90);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, yBase - 30, 0, yBase + 90);
        const col = ["#3cf0c8", "#7a6cff", "#ff6fd8"][i];
        g.addColorStop(0, rgba(col, 0));
        g.addColorStop(0.3, rgba(col, 0.07));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();
    }
    drawStars(ctx, this.stars, w, h, this.time);

    ctx.save();
    if (this.shake > 0 && !this.env.reducedMotion) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.renderBoard();
    this.renderSide();
    this.particles.render(ctx);
    this.floaters.render(ctx);
    ctx.restore();
    this.renderHud();
    vignette(ctx, w, h, 0.35);

    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "ต่อบล็อกดวงดาว",
        subtitle: "เล่นสัก 3 นาที ให้ความอยากผ่านไป",
        body: "ลากซ้าย-ขวาเพื่อเลื่อน · แตะเพื่อหมุน\nปัดลงเร็วๆ เพื่อทิ้งบล็อก · ปัดขึ้นเพื่อเก็บไว้ใช้ทีหลัง",
        accent: "#7c5cff",
        buttons: [this.startBtn],
        appear: this.stateT * 3,
        icon: (c) => this.drawIcon(c),
        chips: this.best ? [`สถิติ ${this.best.toLocaleString()}`] : undefined,
      });
    } else if (this.state === "over") {
      drawCard(ctx, w, h, {
        title: this.newBest ? "สถิติใหม่!" : "เยี่ยมมาก",
        subtitle: this.elapsed >= 60 ? `เล่นไป ${Math.round(this.elapsed / 60)} นาที — ความอยากเบาลงไหม?` : "ความอยากตอนนี้เป็นยังไงบ้าง?",
        bigValue: this.score.toLocaleString(),
        bigLabel: "คะแนน",
        chips: [`${this.lines} แถว`, `เลเวล ${this.level}`, `สถิติ ${this.best.toLocaleString()}`],
        accent: this.newBest ? "#ffcf3a" : "#7c5cff",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5, coins: this.earned,
      });
    }
  }

  private drawIcon(c: CanvasRenderingContext2D) {
    const s = 22;
    const cells: [number, number, Kind][] = [[-1, 0, "T"], [0, 0, "T"], [1, 0, "T"], [0, -1, "T"], [-1, 1, "I"], [0, 1, "I"], [1, 1, "S"]];
    const t = this.time;
    c.rotate(Math.sin(t * 1.5) * 0.06);
    glow(c, 0, 0, 60, "#7c5cff", 0.5);
    for (const [x, y, k] of cells) {
      const spr = this.miniSprites[k];
      if (spr) c.drawImage(spr, x * s - s / 2, y * s - s / 2 - 4, s, s);
    }
  }

  private cellRect(x: number, y: number) {
    return { px: this.bx + x * this.cell, py: this.by + (y - HIDDEN) * this.cell };
  }

  private renderBoard() {
    const { ctx } = this.env;
    const c = this.cell;
    const bw = c * COLS;
    const bh = c * ROWS;
    glassPanel(ctx, this.bx - 6, this.by - 6, bw + 12, bh + 12, 14, 0.08);
    ctx.fillStyle = "rgba(4,6,24,0.55)";
    roundRectPath(ctx, this.bx, this.by, bw, bh, 8);
    ctx.fill();
    // Danger glow when the stack is high
    let height = 0;
    for (let y = HIDDEN; y < ROWS + HIDDEN; y++) {
      if (this.board[y].some((k) => k)) {
        height = ROWS + HIDDEN - y;
        break;
      }
    }
    if (height > 14 && this.state === "play") {
      const a = ((height - 14) / 6) * (0.5 + 0.5 * Math.sin(this.time * 5));
      const g = ctx.createLinearGradient(0, this.by, 0, this.by + c * 5);
      g.addColorStop(0, `rgba(255,80,110,${0.35 * a})`);
      g.addColorStop(1, "rgba(255,80,110,0)");
      ctx.fillStyle = g;
      ctx.fillRect(this.bx, this.by, bw, c * 5);
    }
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(this.bx + x * c + 0.5, this.by);
      ctx.lineTo(this.bx + x * c + 0.5, this.by + bh);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(this.bx, this.by + y * c + 0.5);
      ctx.lineTo(this.bx + bw, this.by + y * c + 0.5);
    }
    ctx.stroke();

    ctx.save();
    roundRectPath(ctx, this.bx, this.by, bw, bh, 8);
    ctx.clip();
    const clearK = this.clearing.length ? clamp(this.clearT / 0.34, 0, 1) : 0;
    const clearingSet = new Set(this.clearing);
    for (let y = HIDDEN; y < ROWS + HIDDEN; y++) {
      for (let x = 0; x < COLS; x++) {
        const k = this.board[y][x];
        if (!k) continue;
        const { px, py } = this.cellRect(x, y);
        const spr = this.sprites[k]!;
        if (clearingSet.has(y)) {
          const s = 1 - ease.outCubic(clearK);
          ctx.globalAlpha = s;
          ctx.drawImage(spr, px + (c * (1 - s)) / 2, py + (c * (1 - s)) / 2, c * s, c * s);
          ctx.globalAlpha = 1;
        } else {
          ctx.drawImage(spr, px, py, c, c);
        }
      }
      if (clearingSet.has(y)) {
        const { py } = this.cellRect(0, y);
        ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - clearK)})`;
        ctx.fillRect(this.bx, py + c * 0.1 * clearK, bw, c * (1 - 0.2 * clearK));
      }
    }
    const p = this.piece;
    if (p && this.state === "play") {
      // Ghost
      let gy = p.y;
      while (!this.collides(p, p.x, gy + 1, p.cells)) gy++;
      ctx.strokeStyle = rgba(COLORS[p.kind], 0.7);
      ctx.fillStyle = rgba(COLORS[p.kind], 0.12);
      ctx.lineWidth = 1.5;
      for (const [cx, cy] of p.cells) {
        if (gy + cy < HIDDEN) continue;
        const { px, py } = this.cellRect(p.x + cx, gy + cy);
        roundRectPath(ctx, px + 2, py + 2, c - 4, c - 4, c * 0.18);
        ctx.fill();
        ctx.stroke();
      }
      // Active piece with a soft glow; it flickers slightly while about to lock
      const lockFlash = this.onGround(p) ? 0.75 + 0.25 * Math.cos(this.lockT * 20) : 1;
      for (const [cx, cy] of p.cells) {
        if (p.y + cy < HIDDEN) continue;
        const { px, py } = this.cellRect(p.x + cx, p.y + cy);
        glow(ctx, px + c / 2, py + c / 2, c * 1.1, COLORS[p.kind], 0.18);
        ctx.globalAlpha = lockFlash;
        ctx.drawImage(this.sprites[p.kind]!, px, py, c, c);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    // Gesture hint at the start, near the top of the board where it does not cover the stack
    if (this.tutorial > 0 && this.state === "play") {
      const a = clamp(this.tutorial, 0, 1);
      const cx = this.bx + bw / 2;
      const y0 = this.by + c * 3;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(6,8,30,0.6)";
      roundRectPath(ctx, cx - Math.min(bw / 2 - 8, 120), y0 - 8, Math.min(bw - 16, 240), 58, 14);
      ctx.fill();
      ctx.font = `500 13px ${FONT_BODY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("↔ ลากเลื่อน   ⟳ แตะหมุน", cx, y0);
      ctx.fillText("⇣ ปัดลงทิ้ง   ⇡ ปัดขึ้นเก็บ", cx, y0 + 22);
      ctx.restore();
    }
  }

  private renderMini(kind: Kind, cx: number, cy: number, size: number, alpha = 1) {
    const { ctx } = this.env;
    const sh = SHAPES[kind];
    const xs = sh.cells.map((c) => c[0]);
    const ys = sh.cells.map((c) => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const ox = cx - ((maxX - minX + 1) * size) / 2;
    const oy = cy - ((maxY - minY + 1) * size) / 2;
    ctx.globalAlpha = alpha;
    for (const [x, y] of sh.cells) ctx.drawImage(this.miniSprites[kind]!, ox + (x - minX) * size, oy + (y - minY) * size, size, size);
    ctx.globalAlpha = 1;
  }

  private renderSide() {
    const { ctx } = this.env;
    const c = this.cell;
    const sw = c * 3.4;
    const x = this.sideX;
    const mini = Math.round(c * 0.62);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // Hold
    glassPanel(ctx, x, this.by, sw, c * 3.2, 12, 0.08);
    ctx.font = `600 11px ${FONT_DISPLAY}`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText("เก็บไว้", x + sw / 2, this.by + 6);
    if (this.hold) this.renderMini(this.hold, x + sw / 2, this.by + c * 1.85, mini, this.holdUsed ? 0.35 : 1);
    // Next
    const ny = this.by + c * 3.6;
    glassPanel(ctx, x, ny, sw, c * 8.2, 12, 0.08);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText("ถัดไป", x + sw / 2, ny + 6);
    for (let i = 0; i < 3 && i < this.queue.length; i++) {
      this.renderMini(this.queue[i], x + sw / 2, ny + c * 1.9 + i * c * 2.15, i === 0 ? mini : mini * 0.82, i === 0 ? 1 : 0.75);
    }
  }

  private renderHud() {
    const { ctx } = this.env;
    const x = this.bx;
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `500 11px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("คะแนน", x, 14);
    ctx.font = `800 28px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(this.score.toLocaleString(), x, 27);
    const rx = this.sideX + this.cell * 3.4;
    ctx.textAlign = "right";
    ctx.font = `500 11px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("เลเวล · แถว", rx, 14);
    ctx.font = `700 22px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${this.level} · ${this.lines}`, rx, 29);
    ctx.restore();
  }
}
