// "Neon Pulse" — an auto-runner set to a generated beat. Tap (or hold) to hop over crystal spikes,
// bounce on pads, tap glowing rings in mid-air, flip gravity through portals and glide through
// pillar fields on light wings. Every level is generated from its number, so level 7 is always the
// same level 7 and can be practised; it gets faster and denser the further you go.
// Original design: shapes, modes, art and music are all made for this app.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, clamp, TAU, FONT_DISPLAY, FONT_BODY, rng, glow, roundRectPath, makeSprite } from "./engine/fx";
import { Button, drawCard, drawCoin } from "./engine/ui";
import { pentatonic } from "./engine/audio";

export const pulseGame: GameDefinition = {
  id: "pulse",
  title: "พัลส์นีออน",
  tagline: "วิ่งตามจังหวะ กระโดดหลบหนาม ด่านไม่มีที่สิ้นสุด",
  why: "ต้องจับจังหวะและจดจำด่าน ใจอยู่กับทุกวินาทีจนลืมความอยาก ตายแล้วเริ่มใหม่ได้ทันที",
  category: "action",
  minutes: "2–10 นาที",
  palette: ["#12052e", "#f472b6"],
  create: (env) => new PulseGame(env),
};

type Kind = "block" | "spike" | "spikeDown" | "pad" | "orb" | "gravity" | "glide" | "cube" | "coin" | "saw" | "check";
interface Obj {
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  id: number;
  used?: boolean;
}

type Mode = "cube" | "glide";
type State = "intro" | "play" | "dead" | "done";

const G = 80; // gravity, units/s²
const JUMP = 18.6;
const CEIL = 8; // ceiling height in glide / gravity sections

class PulseGame implements GameInstance {
  private w = 0;
  private h = 0;
  private U = 40;
  private groundY = 0;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;

  private level = 1;
  private unlocked = 1;
  private practice = false;
  private objs: Obj[] = [];
  private length = 100;
  private speed = 8.6;
  private hue = 300;

  // Player
  private px = 0;
  private py = 0;
  private vy = 0;
  private grav = 1; // 1 normal, -1 flipped
  private mode: Mode = "cube";
  private onGround = false;
  private rot = 0;
  private held = false;
  private pressBuffer = 0;
  private hasCeil = false;
  private checkpoint: { x: number; y: number; grav: number; mode: Mode; ceil: boolean } | null = null;
  private attempts = 1;
  private best = 0;
  private coinsTaken = new Set<number>();
  private coinsRun = new Set<number>();
  private trail: { x: number; y: number; a: number }[] = [];
  private beat = 0;
  private nextBeatT = 0;
  private beatPulse = 0;
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มวิ่ง", "#db2777");
  private nextBtn = new Button("ด่านต่อไป", "#db2777");
  private menuBtn = new Button("เลือกด่าน", "#db2777", "ghost");
  private earned = 0;
  private stars: { x: number; y: number; r: number; d: number }[] = [];
  private skyline: HTMLCanvasElement | null = null;
  private hits: { x: number; y: number; w: number; h: number; act: () => void }[] = [];

  constructor(private env: GameEnv) {
    this.unlocked = parseInt(env.store.get("unlocked") || "1", 10) || 1;
    this.level = this.unlocked;
    this.practice = env.store.get("practice") === "1";
    const r = rng(99);
    for (let i = 0; i < 70; i++) this.stars.push({ x: r(), y: r() * 0.6, r: 0.5 + r() * 1.4, d: 0.05 + r() * 0.2 });
    this.build();
  }

  // ── Level generation ─────────────────────────────────────────────────────

  private build() {
    const L = this.level;
    const r = rng(L * 7919 + 13);
    this.speed = Math.min(12.5, 8.4 + (L - 1) * 0.28);
    this.hue = (300 + L * 47) % 360;
    const s = this.speed / 8.4; // spacing scale so jumps stay possible at higher speed
    const objs: Obj[] = [];
    let id = 0;
    const add = (kind: Kind, x: number, y: number, w = 1, h = 1) => objs.push({ kind, x, y, w, h, id: id++ });
    const tier = Math.min(4, 1 + Math.floor((L - 1) / 2));
    let x = 12;
    const target = (38 + Math.min(L, 12) * 4) * this.speed;

    type Chunk = (x: number) => number;
    const coinArc = (x0: number, y0: number) => {
      if (r() < 0.45) add("coin", x0, y0 + 0.2, 0.7, 0.7);
    };
    const spike1: Chunk = (x0) => {
      add("spike", x0 + 3 * s, 0);
      coinArc(x0 + 3 * s, 2.3);
      return 6 * s;
    };
    const spike2: Chunk = (x0) => {
      add("spike", x0 + 3 * s, 0);
      add("spike", x0 + 4 * s, 0);
      return 7.5 * s;
    };
    const stairs: Chunk = (x0) => {
      // Steps are wider than one jump so each hop has a comfortable window
      add("block", x0 + 2 * s, 0, 3.4 * s, 1);
      add("block", x0 + 5.4 * s, 0, 3.4 * s, 2);
      add("block", x0 + 8.8 * s, 0, 3.4 * s, 3);
      coinArc(x0 + 10 * s, 4.6);
      add("spike", x0 + 17 * s, 0);
      return 20 * s;
    };
    const platformPit: Chunk = (x0) => {
      add("block", x0 + 2 * s, 0, 3 * s, 1);
      for (let i = 0; i < 3; i++) add("spike", x0 + 5 * s + i, 0);
      add("block", x0 + 5 * s + 3, 0, 3 * s, 1);
      coinArc(x0 + 5 * s + 1.5, 3.4);
      return 12 * s;
    };
    const pad: Chunk = (x0) => {
      // Pad launch covers about 5.8 units at any speed, so three spikes leave a safe landing
      add("pad", x0 + 2 * s, 0, 1, 0.25);
      for (let i = 0; i < 3; i++) add("spike", x0 + 3.3 * s + i, 0);
      coinArc(x0 + 4.5 * s, 4.6);
      return 11 * s;
    };
    const orb: Chunk = (x0) => {
      for (let i = 0; i < 6; i++) add("spike", x0 + 3 * s + i, 0);
      add("orb", x0 + 5.2 * s, 2.2, 0.9, 0.9);
      coinArc(x0 + 7 * s, 4.6);
      return 12 * s;
    };
    const ledgeSpike: Chunk = (x0) => {
      add("block", x0 + 2 * s, 0, 6 * s, 1);
      add("spike", x0 + 4.5 * s, 1);
      return 10 * s;
    };
    const saw: Chunk = (x0) => {
      add("saw", x0 + 4 * s, 0.1, 1.5, 1.5);
      return 8 * s;
    };
    const glide: Chunk = (x0) => {
      add("glide", x0 + 1, 0, 1, CEIL);
      let xx = x0 + 6;
      const n = 4 + tier;
      const gap = Math.max(2.6, 3.4 - tier * 0.15);
      for (let i = 0; i < n; i++) {
        const low = 0.8 + r() * (CEIL - gap - 1.6);
        add("block", xx, 0, 1, low);
        add("block", xx, low + gap, 1, CEIL - low - gap);
        if (r() < 0.5) add("coin", xx + 0.15, low + gap / 2 - 0.35, 0.7, 0.7);
        xx += Math.max(3.4, 5 - tier * 0.3) * s;
      }
      add("cube", xx + 2, 0, 1, CEIL);
      return xx + 6 - x0;
    };
    const gravity: Chunk = (x0) => {
      add("gravity", x0 + 2, 0, 1, CEIL);
      // Ceiling run with hanging spikes, then flip back down
      const len = 18 * s;
      add("block", x0 + 3, CEIL - 0.01, len, 0.6);
      add("spikeDown", x0 + 8 * s, CEIL - 1);
      add("spikeDown", x0 + 13 * s, CEIL - 1);
      add("spikeDown", x0 + 14 * s, CEIL - 1);
      add("gravity", x0 + 3 + len - 2, 0, 1, CEIL);
      return len + 8;
    };

    const pools: Chunk[][] = [
      [spike1, spike1, spike2, stairs, ledgeSpike],
      [spike1, spike2, stairs, pad, ledgeSpike, platformPit, glide],
      [spike2, stairs, pad, orb, platformPit, saw, glide, gravity],
      [spike2, pad, orb, platformPit, saw, glide, gravity, stairs],
    ];
    const pool = pools[Math.min(3, tier - 1)];
    let n = 0;
    while (x < target) {
      if (n > 0 && n % 4 === 0) add("check", x, 0, 0.5, 1.5);
      const ch = pool[Math.floor(r() * pool.length)];
      x += ch(x);
      n++;
    }
    this.length = x + 8;
    this.objs = objs;
  }

  // ── Run control ──────────────────────────────────────────────────────────

  private respawn(fromCheckpoint: boolean) {
    const cp = fromCheckpoint && this.checkpoint;
    this.px = cp ? cp.x : 0;
    this.py = cp ? cp.y : 0;
    this.grav = cp ? cp.grav : 1;
    this.mode = cp ? cp.mode : "cube";
    this.hasCeil = cp ? cp.ceil : false;
    this.vy = 0;
    this.rot = 0;
    this.onGround = true;
    this.trail = [];
    // Anything behind the restart point has already happened
    for (const o of this.objs) o.used = o.x < this.px;
    this.coinsRun = new Set(cp ? this.coinsRun : []);
    this.state = "play";
    this.stateT = 0;
    this.beat = 0;
    this.nextBeatT = 0;
  }

  private begin() {
    this.build();
    this.checkpoint = null;
    this.attempts = 1;
    this.coinsTaken.clear();
    this.best = parseFloat(this.env.store.get(`best_${this.level}`) || "0") || 0;
    this.respawn(false);
    this.env.emit({ type: "start" });
  }

  private die() {
    if (this.state !== "play") return;
    this.state = "dead";
    this.stateT = 0;
    const sx = this.sx(this.px + 0.5);
    const sy = this.sy(this.py + 0.5);
    this.particles.burst(sx, sy, `hsl(${this.hue},95%,65%)`, 40, { speed: 320, size: 4, gravity: 300, life: 0.8 });
    this.particles.burst(sx, sy, "#ffffff", 14, { speed: 200, size: 2.5, life: 0.5 });
    this.env.sfx.noise({ dur: 0.4, vol: 0.12, freq: 900, sweepTo: 120, type: "lowpass" });
    const pct = this.progress();
    if (pct > this.best) {
      this.best = pct;
      this.env.store.set(`best_${this.level}`, pct.toFixed(1));
      if (pct > 5) this.floaters.add(`สถิติใหม่ ${Math.floor(pct)}%`, this.w / 2, this.h * 0.3, "#fde68a", 24, 1.2);
    }
  }

  private complete() {
    if (this.state !== "play") return;
    this.state = "done";
    this.stateT = 0;
    this.best = 100;
    this.env.store.set(`best_${this.level}`, "100");
    if (this.level >= this.unlocked) {
      this.unlocked = this.level + 1;
      this.env.store.set("unlocked", `${this.unlocked}`);
    }
    for (const id of this.coinsRun) this.coinsTaken.add(id);
    const coinBonus = this.coinsTaken.size * 5;
    this.earned = (this.practice ? 15 : 30) + this.level * (this.practice ? 4 : 8) + coinBonus;
    [0, 2, 4, 5, 7].forEach((k, i) => this.env.sfx.chime(pentatonic(k + 4), 0.11, i * 0.1));
    for (let i = 0; i < 4; i++) this.particles.burst(this.w * (0.2 + i * 0.2), this.h * 0.4, `hsl(${(this.hue + i * 40) % 360},95%,65%)`, 30, { speed: 300, size: 3, gravity: 200 });
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: this.level,
      best: this.unlocked - 1,
      summary: `ผ่านด่าน ${this.level}${this.practice ? " (โหมดฝึก)" : ""} · ลอง ${this.attempts} ครั้ง`,
      stats: { level: this.level, attempts: this.attempts, practice: this.practice ? 1 : 0 },
    });
  }

  private progress() {
    return clamp((this.px / this.length) * 100, 0, 100);
  }

  // ── Coordinates ──────────────────────────────────────────────────────────

  private camX() {
    return this.px - 2.2;
  }

  private camY() {
    // Follow the player up when they climb high, keep the ground in view otherwise
    return Math.max(0, this.py - 4.5);
  }

  private sx(x: number) {
    return (x - this.camX()) * this.U;
  }

  private sy(y: number) {
    return this.groundY - (y - this.camY()) * this.U;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.U = Math.min(w / 8.5, h / 13);
    this.groundY = h * 0.72;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = rng(5);
    const sw = Math.max(w, 600);
    this.skyline = makeSprite(sw, h * 0.35, dpr, (c) => {
      let x = 0;
      while (x < sw) {
        const bw = 20 + r() * 50;
        const bh = h * (0.08 + r() * 0.24);
        c.fillStyle = `rgba(20,10,50,0.9)`;
        c.fillRect(x, h * 0.35 - bh, bw, bh);
        c.fillStyle = "rgba(255,220,255,0.25)";
        for (let wy = h * 0.35 - bh + 6; wy < h * 0.35 - 6; wy += 9)
          for (let wx = x + 4; wx < x + bw - 4; wx += 8) if (r() < 0.3) c.fillRect(wx, wy, 3, 4);
        x += bw + r() * 6;
      }
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private press(down: boolean) {
    this.held = down;
    if (down) this.pressBuffer = 0.12;
  }

  pointer(p: PointerInfo) {
    if (this.state === "play" || this.state === "dead") {
      // Small pause/menu hit zone in the corner
      if (p.type === "down" && p.x > this.w - 54 && p.y < 54) {
        this.toMenu();
        return;
      }
      if (p.type === "down") this.press(true);
      if (p.type === "up" || p.type === "cancel") this.press(false);
      return;
    }
    if (this.state === "intro") {
      if (p.type === "down") {
        for (const h of this.hits) if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h.act();
        if (this.startBtn.hit(p.x, p.y)) this.startBtn.pressed = true;
      }
      if (p.type === "up") {
        if (this.startBtn.pressed && this.startBtn.hit(p.x, p.y)) this.begin();
        this.startBtn.pressed = false;
      }
      return;
    }
    if (this.state === "done") {
      for (const b of [this.nextBtn, this.menuBtn]) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.6) {
            if (b === this.nextBtn) {
              this.level = Math.min(this.level + 1, this.unlocked);
              this.begin();
            } else this.toMenu();
          }
          b.pressed = false;
        }
      }
    }
  }

  private toMenu() {
    // Pay out coins grabbed on unfinished attempts so the time spent still counts a little
    if ((this.state === "play" || this.state === "dead") && (this.coinsRun.size || this.attempts > 1)) {
      for (const id of this.coinsRun) this.coinsTaken.add(id);
      const coins = this.coinsTaken.size * 3 + Math.min(20, Math.floor(this.best / 5));
      if (coins > 0)
        this.env.emit({ type: "end", coins, score: Math.floor(this.best), best: Math.floor(this.best), summary: `ด่าน ${this.level} ไปได้ ${Math.floor(this.best)}% · ลอง ${this.attempts} ครั้ง`, stats: { level: this.level, attempts: this.attempts } });
    }
    this.state = "intro";
    this.stateT = 0;
    this.held = false;
  }

  key(code: string, down: boolean) {
    if (code === "Space" || code === "ArrowUp" || code === "KeyW") {
      if (this.state === "play" || this.state === "dead") this.press(down);
      else if (down && this.state === "intro" && this.stateT > 0.3) this.begin();
      return true;
    }
    if (down && code === "Enter" && this.state !== "play") {
      if (this.state === "done") this.level = Math.min(this.level + 1, this.unlocked);
      this.begin();
      return true;
    }
    if (down && code === "Escape" && this.state === "play") {
      this.toMenu();
      return true;
    }
    return false;
  }

  // ── Simulation ───────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    for (const b of [this.startBtn, this.nextBtn, this.menuBtn]) b.update(dt);
    if (this.state === "dead") {
      if (this.stateT > 0.7) {
        this.attempts++;
        this.respawn(this.practice);
      }
      return;
    }
    if (this.state !== "play") return;
    this.music(dt);
    // Fixed sub-steps keep collisions stable at high speed
    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps && this.state === "play"; i++) this.step(h);
    this.pressBuffer = Math.max(0, this.pressBuffer - dt);
    // Trail
    this.trail.push({ x: this.px + 0.5, y: this.py + 0.5, a: 1 });
    if (this.trail.length > 14) this.trail.shift();
    for (const t of this.trail) t.a -= dt * 3;
  }

  private music(dt: number) {
    const bpm = 120 + Math.min(40, this.level * 3);
    const eighth = 60 / bpm / 2;
    this.nextBeatT -= dt;
    if (this.nextBeatT > 0) return;
    this.nextBeatT += eighth;
    const b = this.beat++;
    const sfx = this.env.sfx;
    if (b % 2 === 0) {
      sfx.tone({ freq: 140, glideTo: 45, dur: 0.16, vol: 0.13, type: "sine", attack: 0.002 });
      this.beatPulse = 1;
      const bar = Math.floor(b / 8) % 4;
      const bass = [0, -2, -4, -1][bar];
      sfx.tone({ freq: pentatonic(bass, 110), dur: eighth * 1.6, vol: 0.05, type: "sawtooth" });
    } else sfx.noise({ dur: 0.05, vol: 0.025, freq: 7000, type: "highpass" });
    if (b % 16 === 6 || b % 16 === 11) sfx.tone({ freq: pentatonic(((b / 16) | 0) % 5 + 5, 220), dur: 0.2, vol: 0.035, type: "triangle", echo: 0.3 });
  }

  private overlap(o: Obj, pad = 0) {
    return this.px + 1 - pad > o.x && this.px + pad < o.x + o.w && this.py + 1 - pad > o.y && this.py + pad < o.y + o.h;
  }

  private step(dt: number) {
    const prevY = this.py;
    this.px += this.speed * dt;

    if (this.mode === "glide") {
      const lift = this.held ? 1 : -1;
      this.vy += lift * 70 * dt * this.grav;
      this.vy = clamp(this.vy, -11, 11);
      this.rot = Math.atan2(this.vy, this.speed) * -1;
    } else {
      this.vy -= G * this.grav * dt;
      this.vy = clamp(this.vy, -30, 30);
      if (this.onGround && (this.held || this.pressBuffer > 0)) {
        this.vy = JUMP * this.grav;
        this.onGround = false;
        this.pressBuffer = 0;
        this.env.sfx.tone({ freq: 460, glideTo: 700, dur: 0.06, vol: 0.03, type: "triangle" });
      }
    }
    this.py += this.vy * dt;
    let grounded = false;

    // Floor and ceiling
    if (this.py <= 0) {
      this.py = 0;
      if (this.grav === 1 || this.mode === "glide") {
        if (this.vy < 0) this.vy = 0;
        grounded = this.grav === 1;
      }
    }
    if (this.hasCeil && this.py + 1 >= CEIL) {
      this.py = CEIL - 1;
      if (this.vy > 0) this.vy = 0;
      grounded = this.grav === -1;
    }

    for (const o of this.objs) {
      if (o.x > this.px + 2 || o.x + o.w < this.px - 1) continue;
      switch (o.kind) {
        case "block": {
          if (!this.overlap(o)) break;
          const top = o.y + o.h;
          if (this.grav === 1 && prevY >= top - 0.25 && this.vy <= 0) {
            this.py = top;
            this.vy = 0;
            grounded = true;
          } else if (this.grav === -1 && prevY + 1 <= o.y + 0.25 && this.vy >= 0) {
            this.py = o.y - 1;
            this.vy = 0;
            grounded = true;
          } else return this.die();
          break;
        }
        case "spike":
          if (this.px + 0.85 > o.x + 0.3 && this.px + 0.15 < o.x + 0.7 && this.py + 0.1 < o.y + 0.6 && this.py + 1 > o.y) return this.die();
          break;
        case "spikeDown":
          if (this.px + 0.85 > o.x + 0.3 && this.px + 0.15 < o.x + 0.7 && this.py + 0.9 > o.y + 0.4 && this.py < o.y + 1) return this.die();
          break;
        case "saw": {
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          if (Math.hypot(this.px + 0.5 - cx, this.py + 0.5 - cy) < o.w / 2 + 0.3) return this.die();
          break;
        }
        case "pad":
          if (!o.used && this.overlap(o, -0.1) && this.mode === "cube") {
            o.used = true;
            this.vy = JUMP * 1.5 * this.grav;
            this.onGround = false;
            grounded = false;
            this.env.sfx.tone({ freq: 300, glideTo: 900, dur: 0.15, vol: 0.06, type: "square" });
            this.particles.burst(this.sx(o.x + 0.5), this.sy(o.y), "#fde047", 12, { speed: 160, angle: -Math.PI / 2, spread: 1.2, size: 2.5 });
          }
          break;
        case "orb":
          if (!o.used && this.overlap(o, -0.35) && this.pressBuffer > 0 && this.mode === "cube") {
            o.used = true;
            this.pressBuffer = 0;
            this.vy = JUMP * 1.05 * this.grav;
            this.env.sfx.chime(pentatonic(8), 0.06);
            this.particles.burst(this.sx(o.x + 0.45), this.sy(o.y + 0.45), "#fde047", 16, { speed: 180, size: 2.5 });
          }
          break;
        case "gravity":
          if (!o.used && this.px + 0.5 > o.x) {
            o.used = true;
            this.grav = -this.grav;
            this.hasCeil = this.grav === -1 || this.mode === "glide";
            this.vy *= 0.3;
            this.env.sfx.tone({ freq: this.grav === 1 ? 600 : 300, glideTo: this.grav === 1 ? 300 : 600, dur: 0.2, vol: 0.05, type: "triangle" });
          }
          break;
        case "glide":
          if (!o.used && this.px + 0.5 > o.x) {
            o.used = true;
            this.mode = "glide";
            this.hasCeil = true;
            this.env.sfx.tone({ freq: 400, glideTo: 800, dur: 0.25, vol: 0.05, type: "sine" });
          }
          break;
        case "cube":
          if (!o.used && this.px + 0.5 > o.x) {
            o.used = true;
            this.mode = "cube";
            this.hasCeil = this.grav === -1;
            this.rot = 0;
          }
          break;
        case "coin":
          if (!this.coinsRun.has(o.id) && this.overlap(o, -0.1)) {
            this.coinsRun.add(o.id);
            this.env.sfx.chime(pentatonic(9), 0.07);
            this.floaters.add("+เหรียญ", this.sx(o.x), this.sy(o.y + 1), "#ffd76a", 14, 0.7);
          }
          break;
        case "check":
          if (!o.used && this.px > o.x && this.practice && this.mode === "cube" && grounded) {
            o.used = true;
            this.checkpoint = { x: this.px, y: this.py, grav: this.grav, mode: this.mode, ceil: this.hasCeil };
            this.floaters.add("จุดเซฟ", this.sx(o.x), this.sy(2), "#86efac", 16, 0.9);
          }
          break;
      }
    }

    this.onGround = grounded;
    if (this.mode === "cube") {
      if (grounded) {
        // Snap rotation to the nearest quarter turn
        const q = Math.round(this.rot / (Math.PI / 2)) * (Math.PI / 2);
        this.rot += (q - this.rot) * Math.min(1, dt * 30);
      } else this.rot += dt * 7.2 * this.grav;
    }
    if (this.px >= this.length) this.complete();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    const { ctx } = this.env;
    const { w, h, U } = this;
    const hue = this.hue;
    const pulse = this.beatPulse;
    // Sky
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${(hue + 220) % 360},70%,${7 + pulse * 3}%)`);
    g.addColorStop(0.7, `hsl(${hue},65%,${16 + pulse * 4}%)`);
    g.addColorStop(1, `hsl(${(hue + 20) % 360},70%,10%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const cam = this.camX();
    for (const s of this.stars) {
      const x = (((s.x * w - cam * U * s.d) % w) + w) % w;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.3 * Math.sin(this.time * 2 + s.x * 30)})`;
      ctx.beginPath();
      ctx.arc(x, s.y * h, s.r, 0, TAU);
      ctx.fill();
    }
    // Big sun disc with stripes
    const sunY = this.groundY - h * 0.22;
    const sunR = Math.min(w, h) * 0.26;
    ctx.save();
    const sg = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sg.addColorStop(0, `hsl(${(hue + 60) % 360},100%,70%)`);
    sg.addColorStop(1, `hsl(${hue},100%,55%)`);
    ctx.fillStyle = sg;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(w * 0.68, sunY, sunR * (1 + pulse * 0.02), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = `hsl(${(hue + 220) % 360},60%,12%)`;
    for (let i = 0; i < 6; i++) ctx.fillRect(w * 0.68 - sunR, sunY + i * sunR * 0.17, sunR * 2, 2 + i * 1.3);
    ctx.restore();
    // Skyline parallax
    if (this.skyline) {
      const sw = this.skyline.width / Math.min(window.devicePixelRatio || 1, 2.5);
      const off = (((cam * U * 0.25) % sw) + sw) % sw;
      const sh = h * 0.35;
      const y = this.sy(0) - sh + 4;
      ctx.drawImage(this.skyline, -off, y, sw, sh);
      ctx.drawImage(this.skyline, -off + sw, y, sw, sh);
    }

    // Ground
    const gy = this.sy(0);
    const gg = ctx.createLinearGradient(0, gy, 0, h);
    gg.addColorStop(0, `hsl(${hue},60%,14%)`);
    gg.addColorStop(1, `hsl(${hue},60%,4%)`);
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, w, h - gy);
    ctx.strokeStyle = `hsla(${hue},100%,70%,0.25)`;
    ctx.lineWidth = 1;
    for (let gx = -((cam * U) % U); gx < w; gx += U) {
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(w / 2 + (gx - w / 2) * 2.4, h);
      ctx.stroke();
    }
    for (let k = 1; k < 5; k++) {
      const y = gy + (h - gy) * Math.pow(k / 5, 1.6);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = `hsl(${hue},100%,72%)`;
    ctx.lineWidth = 3;
    ctx.shadowColor = `hsl(${hue},100%,60%)`;
    ctx.shadowBlur = 12 + pulse * 8;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (this.hasCeil || this.state === "intro") {
      const cy = this.sy(CEIL);
      if (this.hasCeil && cy > -20) {
        ctx.fillStyle = `hsla(${hue},60%,8%,0.85)`;
        ctx.fillRect(0, 0, w, cy);
        ctx.strokeStyle = `hsl(${hue},100%,72%)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();
      }
    }

    // Objects
    const x0 = cam - 1;
    const x1 = cam + w / U + 2;
    for (const o of this.objs) {
      if (o.x + o.w < x0 || o.x > x1) continue;
      this.drawObj(ctx, o);
    }

    // Trail + player
    if (this.state === "play" || this.state === "done") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const t of this.trail) {
        if (t.a <= 0) continue;
        ctx.fillStyle = `hsla(${(hue + 160) % 360},100%,65%,${t.a * 0.35})`;
        const s = U * 0.5 * t.a;
        ctx.fillRect(this.sx(t.x) - s / 2, this.sy(t.y) - s / 2, s, s);
      }
      ctx.restore();
      this.drawPlayer(ctx);
    }
    this.particles.render(ctx);
    this.floaters.render(ctx);

    // HUD
    if (this.state === "play" || this.state === "dead") {
      const pct = this.progress();
      const bw = w * 0.5;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      roundRectPath(ctx, w / 2 - bw / 2, 14, bw, 10, 5);
      ctx.fill();
      ctx.fillStyle = `hsl(${(hue + 160) % 360},100%,65%)`;
      roundRectPath(ctx, w / 2 - bw / 2, 14, Math.max(10, bw * pct / 100), 10, 5);
      ctx.fill();
      if (this.best > 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(w / 2 - bw / 2 + (bw * this.best) / 100 - 1, 11, 2, 16);
      }
      ctx.font = `700 13px ${FONT_DISPLAY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${Math.floor(pct)}%`, w / 2, 30);
      ctx.textAlign = "left";
      ctx.font = `600 12px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(`ด่าน ${this.level}${this.practice ? " · ฝึก" : ""}`, 12, 12);
      ctx.fillText(`ครั้งที่ ${this.attempts}`, 12, 30);
      // Coins this run
      drawCoin(ctx, 20, 58, 7);
      ctx.fillText(`${this.coinsRun.size}`, 32, 51);
      // Menu button (top-right)
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(w - 28, 28, 18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(w - 34, 21, 4, 14);
      ctx.fillRect(w - 26, 21, 4, 14);
      if (this.attempts === 1 && this.px < 10) {
        ctx.font = `700 16px ${FONT_DISPLAY}`;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(255,255,255,${clamp(1 - this.px / 10, 0, 1)})`;
        ctx.fillText("แตะเพื่อกระโดด · กดค้างเพื่อกระโดดต่อเนื่อง", w / 2, this.sy(0) + 30);
      }
    }
    if (this.state === "intro") this.renderIntro(ctx);
    if (this.state === "done")
      drawCard(ctx, w, h, {
        title: `ผ่านด่าน ${this.level}!`,
        subtitle: `ลอง ${this.attempts} ครั้ง${this.practice ? " · โหมดฝึก" : ""}`,
        chips: [`เหรียญในด่าน ${this.coinsTaken.size}`],
        coins: this.earned,
        accent: "#db2777",
        buttons: [this.nextBtn, this.menuBtn],
        appear: this.stateT * 2,
      });
  }

  private drawObj(c: CanvasRenderingContext2D, o: Obj) {
    const { U, hue } = this;
    const x = this.sx(o.x);
    const y = this.sy(o.y + o.h);
    const w = o.w * U;
    const h = o.h * U;
    switch (o.kind) {
      case "block": {
        const g = c.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, `hsla(${hue},70%,28%,0.95)`);
        g.addColorStop(1, `hsla(${hue},70%,12%,0.95)`);
        c.fillStyle = g;
        c.fillRect(x, y, w, h);
        c.strokeStyle = `hsl(${hue},100%,75%)`;
        c.lineWidth = 2;
        c.strokeRect(x + 1, y + 1, w - 2, h - 2);
        c.strokeStyle = `hsla(${hue},100%,75%,0.25)`;
        c.lineWidth = 1;
        for (let k = 1; k < o.h; k++) {
          c.beginPath();
          c.moveTo(x + 2, y + k * U);
          c.lineTo(x + w - 2, y + k * U);
          c.stroke();
        }
        break;
      }
      case "spike":
      case "spikeDown": {
        const up = o.kind === "spike";
        const base = up ? this.sy(o.y) : this.sy(o.y + 1);
        const tip = up ? this.sy(o.y + 0.95) : this.sy(o.y + 0.05);
        const g = c.createLinearGradient(0, base, 0, tip);
        g.addColorStop(0, `hsl(${(hue + 180) % 360},80%,25%)`);
        g.addColorStop(1, `hsl(${(hue + 180) % 360},100%,80%)`);
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x + U * 0.08, base);
        c.lineTo(x + U * 0.5, tip);
        c.lineTo(x + U * 0.92, base);
        c.closePath();
        c.fill();
        c.strokeStyle = "#ffffff";
        c.lineWidth = 1.5;
        c.stroke();
        break;
      }
      case "saw": {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = w / 2;
        c.save();
        c.translate(cx, cy);
        c.rotate(-this.time * 8);
        c.fillStyle = "#e5e7eb";
        c.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU;
          const rr = k % 2 ? r * 0.78 : r;
          if (k) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else c.moveTo(rr, 0);
        }
        c.closePath();
        c.fill();
        c.fillStyle = `hsl(${hue},80%,30%)`;
        c.beginPath();
        c.arc(0, 0, r * 0.35, 0, TAU);
        c.fill();
        c.restore();
        break;
      }
      case "pad": {
        glow(c, x + U / 2, this.sy(o.y), U, "#fde047", 0.5 + this.beatPulse * 0.3);
        c.fillStyle = "#fde047";
        c.beginPath();
        c.ellipse(x + U / 2, this.sy(o.y) - U * 0.08, U * 0.45, U * 0.14, 0, Math.PI, 0);
        c.fill();
        break;
      }
      case "orb": {
        const cx = x + w / 2;
        const cy = y + h / 2;
        glow(c, cx, cy, U * 1.1, "#fde047", o.used ? 0.15 : 0.6);
        c.strokeStyle = o.used ? "rgba(253,224,71,0.3)" : "#fde047";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(cx, cy, U * 0.38 * (1 + 0.08 * Math.sin(this.time * 8)), 0, TAU);
        c.stroke();
        c.fillStyle = o.used ? "rgba(253,224,71,0.2)" : "rgba(253,224,71,0.6)";
        c.beginPath();
        c.arc(cx, cy, U * 0.18, 0, TAU);
        c.fill();
        break;
      }
      case "gravity":
      case "glide":
      case "cube": {
        const col = o.kind === "gravity" ? "#60a5fa" : o.kind === "glide" ? "#f472b6" : "#4ade80";
        const top = this.sy(o.y + o.h);
        const bot = this.sy(o.y);
        c.save();
        c.globalCompositeOperation = "lighter";
        const g = c.createLinearGradient(x - U * 0.4, 0, x + U * 0.8, 0);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.5, col);
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 6);
        c.fillRect(x - U * 0.4, top, U * 1.2, bot - top);
        c.restore();
        c.strokeStyle = col;
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(x + U * 0.2, (top + bot) / 2, U * 0.3, (bot - top) * 0.32, 0, 0, TAU);
        c.stroke();
        // Symbol: arrows for gravity, wing for glide, square for cube
        c.fillStyle = "#ffffff";
        const mx = x + U * 0.2;
        const my = (top + bot) / 2;
        c.save();
        c.translate(mx, my);
        if (o.kind === "gravity") {
          c.beginPath();
          c.moveTo(-6, -4);
          c.lineTo(0, -12);
          c.lineTo(6, -4);
          c.moveTo(-6, 4);
          c.lineTo(0, 12);
          c.lineTo(6, 4);
          c.strokeStyle = "#ffffff";
          c.lineWidth = 2.5;
          c.stroke();
        } else if (o.kind === "glide") {
          c.beginPath();
          c.moveTo(-10, 4);
          c.quadraticCurveTo(-2, -12, 12, -8);
          c.quadraticCurveTo(2, -2, 2, 6);
          c.closePath();
          c.fill();
        } else c.fillRect(-6, -6, 12, 12);
        c.restore();
        break;
      }
      case "coin": {
        if (this.coinsTaken.has(o.id) || this.coinsRun.has(o.id)) break;
        const cx = x + w / 2;
        const cy = y + h / 2 + Math.sin(this.time * 4 + o.id) * 3;
        glow(c, cx, cy, U * 0.7, "#ffd76a", 0.5);
        c.save();
        c.translate(cx, cy);
        c.scale(Math.abs(Math.cos(this.time * 3 + o.id)) * 0.7 + 0.3, 1);
        drawCoin(c, 0, 0, U * 0.28);
        c.restore();
        break;
      }
      case "check": {
        if (!this.practice) break;
        const cx = x;
        const base = this.sy(0);
        c.strokeStyle = "rgba(134,239,172,0.7)";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(cx, base);
        c.lineTo(cx, base - U * 1.5);
        c.stroke();
        c.fillStyle = o.used ? "#86efac" : "rgba(134,239,172,0.4)";
        c.beginPath();
        c.moveTo(cx, base - U * 1.5);
        c.lineTo(cx + U * 0.5, base - U * 1.3);
        c.lineTo(cx, base - U * 1.1);
        c.closePath();
        c.fill();
        break;
      }
    }
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    const { U } = this;
    const cx = this.sx(this.px + 0.5);
    const cy = this.sy(this.py + 0.5);
    const col = `hsl(${(this.hue + 160) % 360},100%,62%)`;
    glow(c, cx, cy, U * 1.3, col, 0.35 + this.beatPulse * 0.25);
    c.save();
    c.translate(cx, cy);
    if (this.mode === "glide") {
      c.rotate(this.rot);
      // Light glider: a dart with two swept wings
      const flap = Math.sin(this.time * 18) * (this.held ? 0.25 : 0.08);
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.moveTo(U * 0.6, 0);
      c.lineTo(-U * 0.45, -U * 0.22);
      c.lineTo(-U * 0.3, 0);
      c.lineTo(-U * 0.45, U * 0.22);
      c.closePath();
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(U * 0.1, 0);
      c.quadraticCurveTo(-U * 0.2, -U * (0.7 + flap), -U * 0.55, -U * (0.55 + flap));
      c.lineTo(-U * 0.2, 0);
      c.closePath();
      c.fill();
      c.globalAlpha = 0.6;
      c.beginPath();
      c.moveTo(U * 0.1, 0);
      c.quadraticCurveTo(-U * 0.2, U * (0.5 - flap), -U * 0.5, U * (0.4 - flap));
      c.lineTo(-U * 0.2, 0);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
    } else {
      c.rotate(this.rot);
      const s = U * 0.96;
      const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, col);
      g.addColorStop(1, `hsl(${(this.hue + 200) % 360},90%,35%)`);
      c.fillStyle = g;
      roundRectPath(c, -s / 2, -s / 2, s, s, s * 0.18);
      c.fill();
      c.strokeStyle = "#ffffff";
      c.lineWidth = 2;
      c.stroke();
      // Inner diamond core that pulses with the beat
      const k = 0.22 + this.beatPulse * 0.06;
      c.fillStyle = "rgba(255,255,255,0.9)";
      c.beginPath();
      c.moveTo(0, -s * k);
      c.lineTo(s * k, 0);
      c.lineTo(0, s * k);
      c.lineTo(-s * k, 0);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  private renderIntro(c: CanvasRenderingContext2D) {
    const { w, h } = this;
    const a = clamp(this.stateT * 3, 0, 1);
    c.fillStyle = `rgba(6,4,20,${0.55 * a})`;
    c.fillRect(0, 0, w, h);
    const cw = Math.min(360, w - 32);
    const ch = 380;
    const x = w / 2 - cw / 2;
    const y = h / 2 - ch / 2;
    c.globalAlpha = a;
    c.fillStyle = "rgba(24,10,48,0.94)";
    roundRectPath(c, x, y, cw, ch, 24);
    c.fill();
    c.strokeStyle = "rgba(244,114,182,0.5)";
    c.lineWidth = 1.5;
    c.stroke();
    c.textAlign = "center";
    c.textBaseline = "top";
    c.fillStyle = "#ffffff";
    c.font = `800 26px ${FONT_DISPLAY}`;
    c.fillText("พัลส์นีออน", w / 2, y + 22);
    c.font = `500 14px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.fillText("แตะเพื่อกระโดด · ค้างเพื่อบินในโหมดปีก", w / 2, y + 58);

    this.hits = [];
    // Level selector
    const ly = y + 100;
    c.font = `800 44px ${FONT_DISPLAY}`;
    c.fillStyle = `hsl(${this.hue},100%,75%)`;
    c.fillText(`ด่าน ${this.level}`, w / 2, ly);
    const best = parseFloat(this.env.store.get(`best_${this.level}`) || "0") || 0;
    c.font = `600 13px ${FONT_BODY}`;
    c.fillStyle = best >= 100 ? "#86efac" : "rgba(255,255,255,0.7)";
    c.fillText(best >= 100 ? "ผ่านแล้ว" : best > 0 ? `ไปได้ไกลสุด ${Math.floor(best)}%` : this.level === this.unlocked ? "ด่านใหม่" : "", w / 2, ly + 56);
    const arrow = (ax: number, dir: number, enabled: boolean) => {
      c.globalAlpha = a * (enabled ? 1 : 0.25);
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.beginPath();
      c.arc(ax, ly + 26, 22, 0, TAU);
      c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.moveTo(ax + dir * 7, ly + 26);
      c.lineTo(ax - dir * 5, ly + 17);
      c.lineTo(ax - dir * 5, ly + 35);
      c.closePath();
      c.fill();
      c.globalAlpha = a;
      if (enabled)
        this.hits.push({
          x: ax - 26,
          y: ly,
          w: 52,
          h: 52,
          act: () => {
            this.level = clamp(this.level + dir, 1, this.unlocked);
            this.build();
            this.env.sfx.tone({ freq: 600, dur: 0.05, vol: 0.04 });
          },
        });
    };
    arrow(x + 40, -1, this.level > 1);
    arrow(x + cw - 40, 1, this.level < this.unlocked);

    // Mode pills
    const py = y + 190;
    const pw = (cw - 52) / 2;
    [false, true].forEach((pr, i) => {
      const on = this.practice === pr;
      const px = x + 22 + i * (pw + 8);
      c.fillStyle = on ? "#db2777" : "rgba(255,255,255,0.08)";
      roundRectPath(c, px, py, pw, 38, 19);
      c.fill();
      c.fillStyle = "#ffffff";
      c.font = `600 14px ${FONT_DISPLAY}`;
      c.textBaseline = "middle";
      c.fillText(pr ? "ฝึก (มีจุดเซฟ)" : "ปกติ", px + pw / 2, py + 20);
      c.textBaseline = "top";
      this.hits.push({
        x: px,
        y: py,
        w: pw,
        h: 38,
        act: () => {
          this.practice = pr;
          this.env.store.set("practice", pr ? "1" : "0");
        },
      });
    });
    c.font = `500 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.fillText(this.practice ? "ตายแล้วเริ่มจากจุดเซฟล่าสุด เหรียญน้อยลง" : "ตายแล้วเริ่มด่านใหม่ ผ่านแล้วได้เหรียญเต็ม", w / 2, py + 48);
    c.fillText(`ปลดล็อกแล้ว ${this.unlocked} ด่าน · ด่านยากขึ้นเรื่อยๆ ไม่มีที่สิ้นสุด`, w / 2, py + 68);
    this.startBtn.place(w / 2, y + ch - 76, cw - 44, 52);
    this.startBtn.render(c);
    c.globalAlpha = 1;
  }
}
