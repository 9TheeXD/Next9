// "Ocean Bubbles" — aim, bounce off the walls, and pop groups of three or more of the same bubble.
// A classic every age knows. Each colour also carries a symbol, so it works for colour-blind and
// older eyes too.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeSprite, clamp, TAU, FONT_DISPLAY, FONT_BODY, rng, shade } from "./engine/fx";
import { Button, drawCard, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";

const COLS = 10;
const ROWS_MAX = 13;
const COLORS = ["#ff5a7a", "#ffc93c", "#3ddc84", "#3d9bff", "#b06cff", "#ff8a3d"];

interface Flyer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
}

interface Falling {
  x: number;
  y: number;
  vy: number;
  vx: number;
  color: number;
}

function symbol(c: CanvasRenderingContext2D, k: number, s: number) {
  c.fillStyle = "rgba(255,255,255,0.9)";
  c.beginPath();
  switch (k) {
    case 0: // heart
      c.moveTo(0, s * 0.35);
      c.bezierCurveTo(-s * 0.7, -s * 0.15, -s * 0.35, -s * 0.65, 0, -s * 0.25);
      c.bezierCurveTo(s * 0.35, -s * 0.65, s * 0.7, -s * 0.15, 0, s * 0.35);
      break;
    case 1: // star
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.22 : s * 0.48;
        if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      break;
    case 2: // leaf / drop
      c.moveTo(0, -s * 0.45);
      c.quadraticCurveTo(s * 0.45, 0, 0, s * 0.4);
      c.quadraticCurveTo(-s * 0.45, 0, 0, -s * 0.45);
      break;
    case 3: // diamond
      c.moveTo(0, -s * 0.45);
      c.lineTo(s * 0.35, 0);
      c.lineTo(0, s * 0.45);
      c.lineTo(-s * 0.35, 0);
      break;
    case 4: // moon
      c.arc(0, 0, s * 0.38, 0.6, TAU - 0.6);
      c.arc(s * 0.18, 0, s * 0.3, TAU - 0.9, 0.9, true);
      break;
    default: // sun / circle
      c.arc(0, 0, s * 0.28, 0, TAU);
  }
  c.closePath();
  c.fill();
}

function drawBubble(c: CanvasRenderingContext2D, r: number, k: number) {
  const col = COLORS[k];
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(col, 0.55));
  g.addColorStop(0.6, col);
  g.addColorStop(1, shade(col, -0.35));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r * 0.96, 0, TAU);
  c.fill();
  c.strokeStyle = shade(col, -0.45);
  c.lineWidth = Math.max(1, r * 0.06);
  c.stroke();
  symbol(c, k, r);
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.beginPath();
  c.ellipse(-r * 0.4, -r * 0.45, r * 0.22, r * 0.12, -0.7, 0, TAU);
  c.fill();
}

export const bubblesGame: GameDefinition = {
  id: "bubbles",
  title: "บับเบิลใต้ทะเล",
  tagline: "เล็ง ยิง ให้สีเดียวกันเรียง 3 ลูกขึ้นไปแตก",
  why: "ต้องเล็งมุมสะท้อนผนังและคิดว่าจะยิงตรงไหน ใจจดจ่อกับเกม ทุกวัยเล่นได้ บรรยากาศใต้ทะเลช่วยให้ใจสงบ",
  category: "action",
  minutes: "3–5 นาที",
  palette: ["#06335a", "#3d9bff"],
  create: (env) => new BubblesGame(env),
};

type State = "intro" | "play" | "win" | "over";

class BubblesGame implements GameInstance {
  private w = 0;
  private h = 0;
  private R = 18;
  private left = 0;
  private top = 0;
  private parity = 0; // flips when a new row is pushed in from the top
  private grid: number[][] = [];
  private colors = 4;
  private level = 1;
  private current = 0;
  private next = 0;
  private aim = -Math.PI / 2;
  private aiming = false;
  private flyer: Flyer | null = null;
  private falling: Falling[] = [];
  private pops: { x: number; y: number; t: number; color: number }[] = [];
  private shots = 0;
  private score = 0;
  private best = 0;
  private newBest = false;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private sprites: HTMLCanvasElement[] = [];
  private bg: HTMLCanvasElement | null = null;
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มเลย", "#2f8cff");
  private nextBtn = new Button("ด่านต่อไป", "#2f8cff");
  private againBtn = new Button("เล่นอีกครั้ง", "#2f8cff");
  private rand = rng(Date.now() % 24680);
  private ambient: { x: number; y: number; r: number; v: number }[] = [];

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    const r = rng(9);
    for (let i = 0; i < 26; i++) this.ambient.push({ x: r(), y: r(), r: 1 + r() * 4, v: 0.02 + r() * 0.05 });
    this.setup(1);
  }

  private rowLen(r: number) {
    return (r + this.parity) % 2 ? COLS - 1 : COLS;
  }

  private cellXY(r: number, c: number) {
    const off = (r + this.parity) % 2 ? this.R : 0;
    return { x: this.left + this.R + c * this.R * 2 + off, y: this.top + this.R + r * this.R * Math.sqrt(3) };
  }

  private setup(level: number) {
    this.level = level;
    this.colors = Math.min(COLORS.length, 3 + level);
    this.parity = 0;
    this.grid = [];
    const rows = Math.min(9, 4 + level);
    for (let r = 0; r < ROWS_MAX; r++) {
      const row: number[] = [];
      for (let c = 0; c < this.rowLen(r); c++) {
        // Small clusters of the same colour make good first shots
        let k = Math.floor(this.rand() * this.colors);
        if (c > 0 && this.rand() < 0.45) k = row[c - 1];
        row.push(r < rows ? k : -1);
      }
      this.grid.push(row);
    }
    this.shots = 0;
    this.current = this.pickColor();
    this.next = this.pickColor();
    this.flyer = null;
    this.falling = [];
  }

  /** Next bubble: only colours still on the board, so no shot is wasted. */
  private pickColor() {
    const present = new Set<number>();
    for (const row of this.grid) for (const k of row) if (k >= 0) present.add(k);
    const list = present.size ? Array.from(present) : [0, 1, 2];
    return list[Math.floor(this.rand() * list.length)];
  }

  private neighbors(r: number, c: number): [number, number][] {
    const odd = (r + this.parity) % 2 === 1;
    const out: [number, number][] = [[r, c - 1], [r, c + 1]];
    const d = odd ? [c, c + 1] : [c - 1, c];
    for (const rr of [r - 1, r + 1]) for (const cc of d) out.push([rr, cc]);
    return out.filter(([rr, cc]) => rr >= 0 && rr < ROWS_MAX && cc >= 0 && cc < this.rowLen(rr));
  }

  private shooter() {
    return { x: this.w / 2, y: this.h - 70 };
  }

  private fire() {
    if (this.flyer || this.state !== "play") return;
    const a = clamp(this.aim, -Math.PI + 0.18, -0.18);
    const s = this.shooter();
    const speed = Math.max(900, this.h * 1.6);
    this.flyer = { x: s.x, y: s.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, color: this.current };
    this.current = this.next;
    this.next = this.pickColor();
    this.env.sfx.tone({ freq: 600, dur: 0.1, vol: 0.06, glideTo: 900 });
  }

  private snap(x: number, y: number, color: number) {
    // Nearest empty cell to where the bubble stopped
    let best: [number, number] | null = null;
    let bd = Infinity;
    const rGuess = Math.round((y - this.top - this.R) / (this.R * Math.sqrt(3)));
    for (let r = Math.max(0, rGuess - 1); r <= Math.min(ROWS_MAX - 1, rGuess + 1); r++) {
      for (let c = 0; c < this.rowLen(r); c++) {
        if (this.grid[r][c] >= 0) continue;
        const p = this.cellXY(r, c);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd && (r === 0 || this.neighbors(r, c).some(([a, b]) => this.grid[a][b] >= 0))) {
          bd = d;
          best = [r, c];
        }
      }
    }
    if (!best) return;
    const [r, c] = best;
    this.grid[r][c] = color;
    this.shots++;
    // Match
    const group: [number, number][] = [];
    const seen = new Set<string>();
    const stack: [number, number][] = [[r, c]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      const k = `${a},${b}`;
      if (seen.has(k) || this.grid[a][b] !== color) continue;
      seen.add(k);
      group.push([a, b]);
      stack.push(...this.neighbors(a, b));
    }
    if (group.length >= 3) {
      for (const [a, b] of group) {
        const p = this.cellXY(a, b);
        this.pops.push({ x: p.x, y: p.y, t: 0, color: this.grid[a][b] });
        this.particles.burst(p.x, p.y, COLORS[color], 6, { speed: 160, size: 3, gravity: 200, life: 0.6 });
        this.grid[a][b] = -1;
      }
      const dropped = this.dropFloating();
      const gained = group.length * 10 + dropped * 20;
      this.score += gained;
      const p = this.cellXY(r, c);
      this.floaters.add(`+${gained}`, p.x, p.y, "#ffffff", 20);
      if (dropped >= 3) this.floaters.add(`หล่น ${dropped} ลูก!`, this.w / 2, this.h * 0.45, "#fff3b0", 26, 1.2);
      group.forEach((_, i) => i < 6 && this.env.sfx.chime(pentatonic(4 + i), 0.08, i * 0.04));
      this.env.emit({ type: "score", score: this.score });
    } else {
      this.env.sfx.tone({ freq: 260, dur: 0.08, vol: 0.06, type: "triangle" });
    }
    // Every 7 shots a new row slides in from the top
    if (this.shots % 7 === 0) this.pushRow();
    this.checkEnd();
  }

  private dropFloating() {
    const connected = new Set<string>();
    const stack: [number, number][] = [];
    for (let c = 0; c < this.rowLen(0); c++) if (this.grid[0][c] >= 0) stack.push([0, c]);
    while (stack.length) {
      const [a, b] = stack.pop()!;
      const k = `${a},${b}`;
      if (connected.has(k) || this.grid[a][b] < 0) continue;
      connected.add(k);
      stack.push(...this.neighbors(a, b));
    }
    let n = 0;
    for (let r = 0; r < ROWS_MAX; r++)
      for (let c = 0; c < this.rowLen(r); c++) {
        if (this.grid[r][c] >= 0 && !connected.has(`${r},${c}`)) {
          const p = this.cellXY(r, c);
          this.falling.push({ x: p.x, y: p.y, vy: -100 - this.rand() * 150, vx: (this.rand() - 0.5) * 120, color: this.grid[r][c] });
          this.grid[r][c] = -1;
          n++;
        }
      }
    return n;
  }

  private pushRow() {
    this.parity = 1 - this.parity;
    const newRow: number[] = [];
    // After the flip, row 0's length is rowLen(0)
    for (let c = 0; c < this.rowLen(0); c++) newRow.push(Math.floor(this.rand() * this.colors));
    this.grid.unshift(newRow);
    this.grid.pop();
    // Rows below keep their own lengths only if parity is consistent: rebuild lengths
    for (let r = 1; r < ROWS_MAX; r++) {
      const len = this.rowLen(r);
      const row = this.grid[r];
      while (row.length < len) row.push(-1);
      if (row.length > len) row.length = len;
    }
    this.env.sfx.noise({ dur: 0.3, vol: 0.06, freq: 400 });
  }

  private checkEnd() {
    const remaining = this.grid.some((row) => row.some((k) => k >= 0));
    if (!remaining) {
      this.state = "win";
      this.stateT = 0;
      this.score += 200;
      [0, 2, 4, 7, 9].forEach((s, i) => this.env.sfx.chime(pentatonic(s + 5), 0.1, i * 0.08));
      const r = bestScore(this.env.store, "best", this.score);
      this.best = r.best;
      this.env.emit({ type: "end", score: this.score, best: this.best, summary: `ผ่านด่าน ${this.level}`, stats: { level: this.level } });
      return;
    }
    const s = this.shooter();
    for (let r = 0; r < ROWS_MAX; r++)
      for (let c = 0; c < this.rowLen(r); c++) {
        if (this.grid[r][c] >= 0 && this.cellXY(r, c).y + this.R > s.y - this.R * 2.2) {
          this.over();
          return;
        }
      }
  }

  private over() {
    this.state = "over";
    this.stateT = 0;
    const r = bestScore(this.env.store, "best", this.score);
    this.best = r.best;
    this.newBest = r.isNew;
    this.env.sfx.tone({ freq: 330, dur: 0.6, vol: 0.09, glideTo: 180 });
    this.env.emit({ type: "end", score: this.score, best: this.best, summary: `ถึงด่าน ${this.level}`, stats: { level: this.level } });
  }

  private start(level: number) {
    if (level === 1) {
      this.score = 0;
      this.newBest = false;
    }
    this.setup(level);
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const playW = Math.min(w - 16, 520);
    this.R = Math.floor(playW / (COLS * 2));
    this.left = (w - this.R * COLS * 2) / 2;
    this.top = 64;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.sprites = COLORS.map((_, k) => makeSprite(this.R * 2, this.R * 2, dpr, (c) => {
      c.translate(this.R, this.R);
      drawBubble(c, this.R, k);
    }));
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0a5c8a");
      g.addColorStop(0.5, "#06335a");
      g.addColorStop(1, "#031a33");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Light rays from the surface
      c.save();
      c.globalCompositeOperation = "lighter";
      const r = rng(5);
      for (let i = 0; i < 7; i++) {
        const x = r() * w;
        const rg = c.createLinearGradient(x, 0, x + 60, h * 0.8);
        rg.addColorStop(0, "rgba(160,220,255,0.12)");
        rg.addColorStop(1, "rgba(160,220,255,0)");
        c.fillStyle = rg;
        c.beginPath();
        c.moveTo(x - 20, 0);
        c.lineTo(x + 30 + r() * 30, 0);
        c.lineTo(x + 120 + r() * 80, h * 0.85);
        c.lineTo(x + 40, h * 0.85);
        c.fill();
      }
      c.restore();
      // Sea floor with weeds
      c.fillStyle = "#0b2a3d";
      c.beginPath();
      c.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) c.lineTo(x, h - 26 - Math.sin(x * 0.03) * 8);
      c.lineTo(w, h);
      c.fill();
      for (let i = 0; i < 9; i++) {
        const x = r() * w;
        c.strokeStyle = `rgba(40,${140 + r() * 60},${100 + r() * 40},0.6)`;
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(x, h - 20);
        for (let k = 1; k < 6; k++) c.lineTo(x + Math.sin(k + i) * 8, h - 20 - k * 14);
        c.stroke();
      }
    });
  }

  pointer(p: PointerInfo) {
    if (this.state !== "play") {
      const btn = this.state === "intro" ? this.startBtn : this.state === "win" ? this.nextBtn : this.againBtn;
      if (p.type === "down" && btn.hit(p.x, p.y)) btn.pressed = true;
      if (p.type === "up") {
        if (btn.pressed && btn.hit(p.x, p.y) && this.stateT > 0.3) this.start(this.state === "win" ? this.level + 1 : 1);
        btn.pressed = false;
      }
      return;
    }
    const s = this.shooter();
    // Tap the waiting bubble to swap it with the next one
    if (p.type === "down" && Math.hypot(p.x - (s.x + this.R * 3), p.y - s.y) < this.R * 1.4) {
      [this.current, this.next] = [this.next, this.current];
      this.env.sfx.tone({ freq: 700, dur: 0.06, vol: 0.05 });
      return;
    }
    const a = Math.atan2(p.y - s.y, p.x - s.x);
    if (p.type === "down") {
      this.aiming = true;
      this.aim = a;
    } else if (p.type === "move" && this.aiming) {
      this.aim = a;
    } else if (p.type === "up" && this.aiming) {
      this.aiming = false;
      this.aim = a;
      if (p.y < s.y - this.R) this.fire();
    } else if (p.type === "cancel") this.aiming = false;
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.state !== "play") {
      if ((code === "Enter" || code === "Space") && this.stateT > 0.5) this.start(this.state === "win" ? this.level + 1 : 1);
      return code === "Enter" || code === "Space";
    }
    if (code === "ArrowLeft") this.aim = clamp(this.aim - 0.06, -Math.PI + 0.18, -0.18);
    else if (code === "ArrowRight") this.aim = clamp(this.aim + 0.06, -Math.PI + 0.18, -0.18);
    else if (code === "Space" || code === "ArrowUp") this.fire();
    else return false;
    return true;
  }

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    for (const b of [this.startBtn, this.nextBtn, this.againBtn]) b.update(dt);
    for (const a of this.ambient) {
      a.y -= a.v * dt;
      a.x += Math.sin(this.time + a.y * 10) * 0.002 * dt;
      if (a.y < -0.05) a.y = 1.05;
    }
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.25);
    for (const f of this.falling) {
      f.vy += 1400 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    this.falling = this.falling.filter((f) => f.y < this.h + 40);
    const fl = this.flyer;
    if (!fl || this.state !== "play") return;
    const steps = 4;
    for (let i = 0; i < steps && this.flyer; i++) {
      fl.x += (fl.vx * dt) / steps;
      fl.y += (fl.vy * dt) / steps;
      const minX = this.left + this.R;
      const maxX = this.left + this.R * COLS * 2 - this.R;
      if (fl.x < minX) {
        fl.x = minX;
        fl.vx = Math.abs(fl.vx);
        this.env.sfx.tone({ freq: 900, dur: 0.03, vol: 0.03 });
      }
      if (fl.x > maxX) {
        fl.x = maxX;
        fl.vx = -Math.abs(fl.vx);
        this.env.sfx.tone({ freq: 900, dur: 0.03, vol: 0.03 });
      }
      let hit = fl.y <= this.top + this.R;
      if (!hit) {
        outer: for (let r = 0; r < ROWS_MAX; r++)
          for (let c = 0; c < this.rowLen(r); c++) {
            if (this.grid[r][c] < 0) continue;
            const p = this.cellXY(r, c);
            if (Math.hypot(p.x - fl.x, p.y - fl.y) < this.R * 1.7) {
              hit = true;
              break outer;
            }
          }
      }
      if (hit) {
        this.flyer = null;
        this.snap(fl.x, fl.y, fl.color);
      }
    }
  }

  /** Dotted aim path with one bounce off a side wall. */
  private drawAim() {
    const { ctx } = this.env;
    const s = this.shooter();
    const a = clamp(this.aim, -Math.PI + 0.18, -0.18);
    let x = s.x;
    let y = s.y;
    let vx = Math.cos(a);
    let vy = Math.sin(a);
    const minX = this.left + this.R;
    const maxX = this.left + this.R * COLS * 2 - this.R;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    let bounces = 0;
    for (let i = 0; i < 70 && y > this.top; i++) {
      x += vx * 12;
      y += vy * 12;
      if (x < minX || x > maxX) {
        vx = -vx;
        x = clamp(x, minX, maxX);
        if (++bounces > 1) break;
      }
      let blocked = false;
      for (let r = 0; r < ROWS_MAX && !blocked; r++)
        for (let c = 0; c < this.rowLen(r); c++) {
          if (this.grid[r][c] < 0) continue;
          const p = this.cellXY(r, c);
          if (Math.hypot(p.x - x, p.y - y) < this.R * 1.7) {
            blocked = true;
            break;
          }
        }
      if (blocked) break;
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, 2.6 - i * 0.02, 0, TAU);
        ctx.fill();
      }
    }
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    for (const a of this.ambient) {
      ctx.strokeStyle = "rgba(200,240,255,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.x * w, a.y * h, a.r, 0, TAU);
      ctx.stroke();
    }
    const D = this.R * 2;
    // Danger line
    const s = this.shooter();
    ctx.strokeStyle = "rgba(255,120,140,0.3)";
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(this.left, s.y - this.R * 2.2);
    ctx.lineTo(this.left + this.R * COLS * 2, s.y - this.R * 2.2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let r = 0; r < ROWS_MAX; r++)
      for (let c = 0; c < this.rowLen(r); c++) {
        const k = this.grid[r][c];
        if (k < 0) continue;
        const p = this.cellXY(r, c);
        ctx.drawImage(this.sprites[k], p.x - this.R, p.y - this.R, D, D);
      }
    for (const p of this.pops) {
      const k = p.t / 0.25;
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(this.sprites[p.color], p.x - this.R * (1 + k * 0.6), p.y - this.R * (1 + k * 0.6), D * (1 + k * 0.6), D * (1 + k * 0.6));
      ctx.globalAlpha = 1;
    }
    for (const f of this.falling) ctx.drawImage(this.sprites[f.color], f.x - this.R, f.y - this.R, D, D);

    if (this.state === "play") {
      if (this.aiming && !this.flyer) this.drawAim();
      if (this.flyer) ctx.drawImage(this.sprites[this.flyer.color], this.flyer.x - this.R, this.flyer.y - this.R, D, D);
      // Shooter base
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, this.R * 1.7, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(clamp(this.aim, -Math.PI + 0.18, -0.18) + Math.PI / 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(-6, -this.R * 1.6);
      ctx.lineTo(0, -this.R * 2.3);
      ctx.lineTo(6, -this.R * 1.6);
      ctx.fill();
      ctx.restore();
      if (!this.flyer) ctx.drawImage(this.sprites[this.current], s.x - this.R, s.y - this.R, D, D);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.sprites[this.next], s.x + this.R * 3 - this.R * 0.75, s.y - this.R * 0.75, D * 0.75, D * 0.75);
      ctx.globalAlpha = 1;
      ctx.font = `500 11px ${FONT_BODY}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText("แตะเพื่อสลับ", s.x + this.R * 3, s.y + this.R * 1.4);
      const left = 7 - (this.shots % 7);
      ctx.fillText(`อีก ${left} นัด แถวใหม่จะลงมา`, s.x - this.R * 4, s.y + this.R * 1.4);
    }

    this.particles.render(ctx);
    this.floaters.render(ctx);

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `800 28px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(this.score.toLocaleString(), 14, 14);
    ctx.textAlign = "right";
    ctx.font = `600 13px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(`ด่าน ${this.level} · สถิติ ${this.best.toLocaleString()}`, w - 14, 22);

    const icon = (c: CanvasRenderingContext2D) => {
      [[-34, 4, 0], [0, -8, 3], [34, 4, 1]].forEach(([x, y, k]) => {
        c.save();
        c.translate(x, y + Math.sin(this.time * 3 + x) * 3);
        drawBubble(c, 20, k);
        c.restore();
      });
    };
    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "บับเบิลใต้ทะเล",
        subtitle: "เล็งแล้วปล่อยนิ้วเพื่อยิง",
        body: "แตะค้างแล้วลากเพื่อเล็ง เส้นจุดบอกทางที่ลูกจะไป ปล่อยนิ้วเพื่อยิง สีเดียวกัน 3 ลูกขึ้นไปจะแตก ลูกที่ไม่มีอะไรยึดจะหล่นได้คะแนนเพิ่ม",
        accent: "#2f8cff",
        buttons: [this.startBtn],
        appear: this.stateT * 3,
        icon,
        chips: this.best ? [`สถิติ ${this.best.toLocaleString()}`] : undefined,
      });
    } else if (this.state === "win") {
      drawCard(ctx, w, h, { title: `ผ่านด่าน ${this.level}!`, subtitle: "เคลียร์ทะเลได้หมดแล้ว +200", bigValue: this.score.toLocaleString(), bigLabel: "คะแนน", accent: "#2f8cff", buttons: [this.nextBtn], appear: this.stateT * 2.5, icon });
    } else if (this.state === "over") {
      drawCard(ctx, w, h, {
        title: this.newBest ? "สถิติใหม่!" : "บับเบิลลงมาถึงเส้นแล้ว",
        subtitle: "ความอยากตอนนี้เป็นยังไงบ้าง?",
        bigValue: this.score.toLocaleString(),
        bigLabel: "คะแนน",
        chips: [`ด่าน ${this.level}`, `สถิติ ${this.best.toLocaleString()}`],
        accent: this.newBest ? "#ffc634" : "#2f8cff",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5,
      });
    }
  }
}
