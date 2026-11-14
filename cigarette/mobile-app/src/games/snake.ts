// "Neon Snakes" — eat light, grow, and make rival snakes crash into you. Eight bot rivals steer
// around danger, chase food and try to cut you off; they get sharper the longer you survive and the
// better your best score. Fast decisions all the time, which is what pulls attention off a craving.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Floaters, Particles, makeSprite, clamp, TAU, FONT_DISPLAY, FONT_BODY, rng, glow } from "./engine/fx";
import { Button, drawCard, glassPanel, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { wallet, coinsFor } from "./engine/economy";
import { snakeColor } from "./art/skins";

const ARENA = 1300; // radius
const ORBS = 520;
const BOTS = 8;
const NAMES = ["เจ้าเขียว", "ซิ่งสายฟ้า", "ป้าแดง", "น้องมิว", "ไวไฟ", "TurboPon", "หนูนา", "ลุงเล็ก", "NeonX", "ปลาหมึก", "BotKing", "จิ๋วแต่แจ๋ว", "มังกรน้อย", "SpeedyBoi", "เต่าซิ่ง", "Kaew"];

interface Snake {
  name: string;
  segs: { x: number; y: number }[];
  dir: number;
  target: number;
  len: number; // target segment count
  boosting: boolean;
  alive: boolean;
  bot: boolean;
  hue: number;
  think: number;
  skill: number;
  deadT: number;
}

interface Orb {
  x: number;
  y: number;
  v: number;
  hue: number;
  t: number;
}

export const snakeGame: GameDefinition = {
  id: "snake",
  title: "งูแสงล่าแต้ม",
  tagline: "แข่งกับบอท 8 ตัว กินแสงให้ตัวยาวที่สุด",
  why: "ต้องตัดสินใจเร็วทุกวินาที ทั้งหลบ ทั้งดักคู่แข่ง สนุกจนลืมความอยาก บอทเก่งขึ้นเรื่อยๆ ตามฝีมือคุณ",
  category: "action",
  minutes: "2–5 นาที",
  palette: ["#0a0f22", "#5eead4"],
  create: (env) => new SnakeGame(env),
};

type State = "intro" | "play" | "over";

class SnakeGame implements GameInstance {
  private w = 0;
  private h = 0;
  private snakes: Snake[] = [];
  private orbs: Orb[] = [];
  private player: Snake | null = null;
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private steer: { id: number } | null = null;
  private boostId: number | null = null;
  private keys = new Set<string>();
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private elapsed = 0;
  private kills = 0;
  private bestLen = 0;
  private best = 0;
  private newBest = false;
  private earned = 0;
  private skin = "snake_mint";
  private tile: HTMLCanvasElement | null = null;
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มเลย", "#14b8a6");
  private againBtn = new Button("เล่นอีกครั้ง", "#14b8a6");
  private upgradeBtns: { id: string; btn: Button }[] = [
    { id: "snake_start", btn: new Button("", "#334155") },
    { id: "snake_boost", btn: new Button("", "#334155") },
    { id: "snake_magnet", btn: new Button("", "#334155") },
  ];
  private rand = rng(Date.now() % 60601);
  private boostBtn = { x: 0, y: 0, r: 38 };

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    this.seedWorld();
  }

  private radius(s: Snake) {
    return clamp(7 + Math.sqrt(s.len) * 0.75, 8, 26);
  }

  private spacing(s: Snake) {
    return this.radius(s) * 0.6;
  }

  private makeSnake(name: string, bot: boolean, len: number): Snake {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 40; tries++) {
      const a = this.rand() * TAU;
      const d = this.rand() * ARENA * 0.75;
      x = Math.cos(a) * d;
      y = Math.sin(a) * d;
      if (!this.snakes.some((o) => o.alive && Math.hypot(o.segs[0].x - x, o.segs[0].y - y) < 300)) break;
    }
    const dir = this.rand() * TAU;
    const s: Snake = { name, segs: [], dir, target: dir, len, boosting: false, alive: true, bot, hue: this.rand() * 360, think: 0, skill: 0.5, deadT: 0 };
    const sp = this.spacing(s);
    for (let i = 0; i < len; i++) s.segs.push({ x: x - Math.cos(dir) * i * sp, y: y - Math.sin(dir) * i * sp });
    return s;
  }

  private addOrb(x?: number, y?: number, v = 1) {
    if (x === undefined || y === undefined) {
      const a = this.rand() * TAU;
      const d = Math.sqrt(this.rand()) * ARENA * 0.97;
      x = Math.cos(a) * d;
      y = Math.sin(a) * d;
    }
    this.orbs.push({ x, y, v, hue: this.rand() * 360, t: this.rand() * 6 });
  }

  private seedWorld() {
    this.snakes = [];
    this.orbs = [];
    for (let i = 0; i < ORBS; i++) this.addOrb();
    const names = [...NAMES].sort(() => this.rand() - 0.5);
    for (let i = 0; i < BOTS; i++) this.snakes.push(this.makeSnake(names[i], true, 14 + Math.floor(this.rand() * 40)));
  }

  private start() {
    this.skin = wallet.equipped("snakeSkin") || "snake_mint";
    this.seedWorld();
    const startLen = 14 + 6 * wallet.level("snake_start");
    this.player = this.makeSnake("คุณ", false, startLen);
    this.snakes.push(this.player);
    this.kills = 0;
    this.bestLen = startLen;
    this.elapsed = 0;
    this.newBest = false;
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  /** How sharp the bots are: grows with time survived and with the player's best length. */
  private botSkill() {
    return clamp(0.35 + this.elapsed / 240 + this.best / 900, 0.35, 0.95);
  }

  private die(s: Snake, killer: Snake | null) {
    s.alive = false;
    s.deadT = 0;
    // Body turns into big orbs
    for (let i = 0; i < s.segs.length; i += 2) {
      const p = s.segs[i];
      this.orbs.push({ x: p.x + (this.rand() - 0.5) * 10, y: p.y + (this.rand() - 0.5) * 10, v: 3, hue: s.bot ? s.hue : 170, t: 0 });
    }
    if (this.visible(s.segs[0].x, s.segs[0].y)) {
      const p = this.toScreen(s.segs[0].x, s.segs[0].y);
      this.particles.burst(p.x, p.y, s.bot ? `hsl(${s.hue},90%,60%)` : "#5eead4", 30, { speed: 240, size: 3, gravity: 0, life: 0.8 });
    }
    if (killer === this.player && s.bot) {
      this.kills++;
      this.floaters.add(`ล้ม ${s.name}!`, this.w / 2, this.h * 0.3, "#ffe58a", 24, 1.4);
      this.env.sfx.chime(pentatonic(7 + (this.kills % 4)), 0.12);
    }
    if (s === this.player) this.gameOver(killer);
  }

  private gameOver(killer: Snake | null) {
    this.state = "over";
    this.stateT = 0;
    const r = bestScore(this.env.store, "best", this.bestLen);
    this.best = r.best;
    this.newBest = r.isNew;
    this.earned = coinsFor(this.bestLen + this.kills * 20, 3, 5, 200);
    this.env.sfx.noise({ dur: 0.6, vol: 0.12, freq: 400, sweepTo: 80, type: "lowpass" });
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: this.bestLen,
      best: this.best,
      summary: `ยาวสุด ${this.bestLen} · ล้มคู่แข่ง ${this.kills} ตัว${killer ? ` · แพ้ให้ ${killer.name}` : ""}`,
      stats: { length: this.bestLen, kills: this.kills },
    });
  }

  // ── Camera ───────────────────────────────────────────────────────────────

  private toScreen(x: number, y: number) {
    return { x: (x - this.camX) * this.zoom + this.w / 2, y: (y - this.camY) * this.zoom + this.h / 2 };
  }

  private visible(x: number, y: number, pad = 60) {
    const p = this.toScreen(x, y);
    return p.x > -pad && p.x < this.w + pad && p.y > -pad && p.y < this.h + pad;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.boostBtn = { x: w - 60, y: h - 70, r: 38 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const t = 56;
    this.tile = makeSprite(t, t * Math.sqrt(3), dpr, (c) => {
      c.fillStyle = "#0b1126";
      c.fillRect(0, 0, t, t * Math.sqrt(3));
      c.strokeStyle = "rgba(94,234,212,0.07)";
      c.lineWidth = 1.5;
      const hex = (cx: number, cy: number) => {
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          const x = cx + Math.cos(a) * t * 0.5;
          const y = cy + Math.sin(a) * t * 0.5;
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.closePath();
        c.stroke();
      };
      hex(0, 0);
      hex(t, 0);
      hex(t * 0.5 + t * 0.25, t * Math.sqrt(3) * 0.5);
      hex(0, t * Math.sqrt(3));
      hex(t, t * Math.sqrt(3));
      hex(-t * 0.25, t * Math.sqrt(3) * 0.5);
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
    const onBoost = Math.hypot(p.x - this.boostBtn.x, p.y - this.boostBtn.y) < this.boostBtn.r * 1.2;
    if (p.type === "down") {
      if (onBoost) this.boostId = p.id;
      else this.steer = { id: p.id };
    }
    if ((p.type === "down" || p.type === "move") && this.steer && this.steer.id === p.id && this.player) {
      this.player.target = Math.atan2(p.y - this.h / 2, p.x - this.w / 2);
    }
    if (p.type === "up" || p.type === "cancel") {
      if (this.boostId === p.id) this.boostId = null;
      if (this.steer && this.steer.id === p.id) this.steer = null;
    }
  }

  key(code: string, down: boolean) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD"].includes(code)) {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      if (down && code === "Space" && this.state !== "play" && this.stateT > 0.5) this.start();
      return true;
    }
    if (down && code === "Enter" && this.state !== "play" && this.stateT > 0.5) {
      this.start();
      return true;
    }
    return false;
  }

  // ── Simulation ───────────────────────────────────────────────────────────

  /** Bot brain: pick the safest of several headings, biased towards food or towards cutting off the player. */
  private think(s: Snake) {
    const head = s.segs[0];
    const look = 90 + s.skill * 140;
    let goal = s.dir;
    // Food: nearest orb nearby, bigger orbs weigh more
    let bestScoreOrb = -Infinity;
    for (const o of this.orbs) {
      const dx = o.x - head.x;
      const dy = o.y - head.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 360 * 360) continue;
      const sc = o.v * 2000 - Math.sqrt(d2);
      if (sc > bestScoreOrb) {
        bestScoreOrb = sc;
        goal = Math.atan2(dy, dx);
      }
    }
    // Hunt: a longer, skilled bot tries to cross in front of the player's head
    const pl = this.player;
    if (pl && pl.alive && s.len > pl.len * 0.8 && this.rand() < s.skill * 0.6) {
      const ph = pl.segs[0];
      const d = Math.hypot(ph.x - head.x, ph.y - head.y);
      if (d < 420) {
        const ahead = { x: ph.x + Math.cos(pl.dir) * 120, y: ph.y + Math.sin(pl.dir) * 120 };
        goal = Math.atan2(ahead.y - head.y, ahead.x - head.x);
        s.boosting = d < 260 && s.len > 30 && this.rand() < s.skill;
      }
    } else if (s.len < 25) s.boosting = false;
    // Danger: test headings around the goal and keep the one with the most free space
    const options = [0, -0.5, 0.5, -1, 1, -1.6, 1.6, Math.PI];
    let bestDir = goal;
    let bestFree = -1;
    for (const off of options) {
      const a = goal + off;
      const free = this.freeDistance(s, head.x, head.y, a, look);
      const score = free - Math.abs(off) * 18;
      if (score > bestFree) {
        bestFree = score;
        bestDir = a;
      }
    }
    s.target = bestDir;
    if (bestFree < look * 0.35) s.boosting = false;
  }

  private freeDistance(self: Snake, x: number, y: number, a: number, look: number) {
    const steps = 6;
    for (let k = 1; k <= steps; k++) {
      const px = x + Math.cos(a) * (look * k) / steps;
      const py = y + Math.sin(a) * (look * k) / steps;
      if (px * px + py * py > (ARENA - 30) * (ARENA - 30)) return (look * (k - 1)) / steps;
      for (const o of this.snakes) {
        if (!o.alive || o === self) continue;
        const r = this.radius(o) + 14;
        for (let i = 0; i < o.segs.length; i += 3) {
          const sgm = o.segs[i];
          if (Math.abs(sgm.x - px) < r && Math.abs(sgm.y - py) < r) return (look * (k - 1)) / steps;
        }
      }
    }
    return look;
  }

  private moveSnake(s: Snake, dt: number) {
    const turn = (s.bot ? 3 + s.skill * 1.5 : 4.2) * dt;
    let diff = s.target - s.dir;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    s.dir += clamp(diff, -turn, turn);
    const boostLvl = s.bot ? 0 : wallet.level("snake_boost");
    const canBoost = s.boosting && s.len > 12;
    const speed = canBoost ? 300 : 155;
    if (canBoost) {
      s.len -= dt * (s.bot ? 3 : 3.2 / (1 + boostLvl * 0.12));
      if (this.rand() < dt * 10) {
        const tail = s.segs[s.segs.length - 1];
        this.orbs.push({ x: tail.x, y: tail.y, v: 1, hue: s.hue, t: 0 });
      }
    }
    const head = s.segs[0];
    head.x += Math.cos(s.dir) * speed * dt;
    head.y += Math.sin(s.dir) * speed * dt;
    const sp = this.spacing(s);
    for (let i = 1; i < s.segs.length; i++) {
      const a = s.segs[i - 1];
      const b = s.segs[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > sp) {
        b.x = a.x + (dx / d) * sp;
        b.y = a.y + (dy / d) * sp;
      }
    }
    const want = Math.max(8, Math.round(s.len));
    while (s.segs.length < want) {
      const t = s.segs[s.segs.length - 1];
      s.segs.push({ x: t.x, y: t.y });
    }
    if (s.segs.length > want) s.segs.length = want;
  }

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    for (const b of [this.startBtn, this.againBtn, ...this.upgradeBtns.map((u) => u.btn)]) b.update(dt);
    const playing = this.state === "play";
    if (playing) this.elapsed += dt;
    const pl = this.player;

    if (pl && pl.alive && playing) {
      if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) pl.target = pl.dir - 0.6;
      if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) pl.target = pl.dir + 0.6;
      pl.boosting = this.boostId !== null || this.keys.has("Space") || this.keys.has("ArrowUp");
    }
    const skill = this.botSkill();
    for (const s of this.snakes) {
      if (!s.alive) continue;
      if (s.bot) {
        s.skill = skill;
        s.think -= dt;
        if (s.think <= 0) {
          s.think = 0.18 - skill * 0.08 + this.rand() * 0.05;
          this.think(s);
        }
      }
      this.moveSnake(s, dt);
    }

    // Eating
    const magnetLvl = wallet.level("snake_magnet");
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const head = s.segs[0];
      const reach = this.radius(s) + 14 + (s.bot ? 0 : magnetLvl * 6);
      for (const o of this.orbs) {
        if (o.v <= 0) continue;
        const dx = o.x - head.x;
        const dy = o.y - head.y;
        if (dx * dx + dy * dy < reach * reach) {
          s.len += o.v * 0.7;
          o.v = 0;
          if (s === pl && this.time % 0.08 < dt) this.env.sfx.tone({ freq: 700 + Math.random() * 400, dur: 0.04, vol: 0.025 });
        } else if (!s.bot && dx * dx + dy * dy < (reach + 40) * (reach + 40)) {
          // Orbs drift towards the player's mouth
          o.x -= dx * dt * 4;
          o.y -= dy * dt * 4;
        }
      }
    }
    this.orbs = this.orbs.filter((o) => o.v > 0);
    while (this.orbs.length < ORBS) this.addOrb();
    if (this.orbs.length > ORBS * 2) this.orbs.splice(0, this.orbs.length - ORBS * 2);

    // Collisions
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const head = s.segs[0];
      if (head.x * head.x + head.y * head.y > ARENA * ARENA) {
        this.die(s, null);
        continue;
      }
      const hr = this.radius(s) * 0.7;
      outer: for (const o of this.snakes) {
        if (!o.alive || o === s) continue;
        const r = this.radius(o) + hr;
        for (let i = 0; i < o.segs.length; i += 2) {
          const sg = o.segs[i];
          const dx = sg.x - head.x;
          const dy = sg.y - head.y;
          if (dx * dx + dy * dy < r * r) {
            this.die(s, o);
            break outer;
          }
        }
      }
    }
    // Respawn bots
    for (const s of this.snakes) {
      if (!s.alive && s.bot) s.deadT += dt;
    }
    const deadBots = this.snakes.filter((s) => s.bot && !s.alive && s.deadT > 2.5);
    for (const d of deadBots) {
      const i = this.snakes.indexOf(d);
      const names = NAMES.filter((n) => !this.snakes.some((s) => s.alive && s.name === n));
      this.snakes[i] = this.makeSnake(names[Math.floor(this.rand() * names.length)] || "บอท", true, 14 + Math.floor(this.rand() * (20 + this.elapsed / 4)));
    }

    if (pl && pl.alive) {
      this.bestLen = Math.max(this.bestLen, Math.round(pl.len));
      this.camX = pl.segs[0].x;
      this.camY = pl.segs[0].y;
      this.zoom = clamp(1.15 - Math.sqrt(pl.len) * 0.025, 0.6, 1.05) * Math.min(1, Math.min(this.w, this.h) / 420 + 0.15);
    } else if (!pl) {
      // Attract mode before the first game: drift around the arena
      this.camX = Math.cos(this.time * 0.1) * 300;
      this.camY = Math.sin(this.time * 0.1) * 300;
      this.zoom = 0.8;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private drawSnake(c: CanvasRenderingContext2D, s: Snake) {
    const r = this.radius(s) * this.zoom;
    const n = s.segs.length;
    for (let i = n - 1; i >= 0; i--) {
      const sg = s.segs[i];
      if (!this.visible(sg.x, sg.y, r * 2)) continue;
      const p = this.toScreen(sg.x, sg.y);
      const col = s.bot ? `hsl(${(s.hue + (i % 6 < 3 ? 0 : 12)) % 360},85%,${i % 6 < 3 ? 58 : 50}%)` : snakeColor(this.skin, i, this.time);
      c.fillStyle = col;
      c.beginPath();
      c.arc(p.x, p.y, r, 0, TAU);
      c.fill();
      if (i % 3 === 0) {
        c.fillStyle = "rgba(255,255,255,0.18)";
        c.beginPath();
        c.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.4, 0, TAU);
        c.fill();
      }
      if (!s.bot && this.skin === "snake_galaxy" && i % 5 === 0) {
        c.fillStyle = "rgba(255,255,255,0.8)";
        c.fillRect(p.x + r * 0.2, p.y - r * 0.1, 1.5, 1.5);
      }
    }
    // Head: eyes looking where it goes
    const hp = this.toScreen(s.segs[0].x, s.segs[0].y);
    if (s.boosting) glow(c, hp.x, hp.y, r * 3, s.bot ? `#ffffff` : "#9ef0ff", 0.3);
    for (const side of [-1, 1]) {
      const ex = hp.x + Math.cos(s.dir + side * 0.6) * r * 0.55;
      const ey = hp.y + Math.sin(s.dir + side * 0.6) * r * 0.55;
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(ex, ey, r * 0.38, 0, TAU);
      c.fill();
      c.fillStyle = "#111827";
      c.beginPath();
      c.arc(ex + Math.cos(s.dir) * r * 0.14, ey + Math.sin(s.dir) * r * 0.14, r * 0.2, 0, TAU);
      c.fill();
    }
    // Name tag
    c.font = `600 ${Math.round(11 + r * 0.2)}px ${FONT_BODY}`;
    c.textAlign = "center";
    c.textBaseline = "bottom";
    c.fillStyle = s.bot ? "rgba(255,255,255,0.75)" : "#a7f3d0";
    c.fillText(s.name, hp.x, hp.y - r - 4);
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    ctx.fillStyle = "#070b1c";
    ctx.fillRect(0, 0, w, h);
    // Hex floor scrolling with the camera
    if (this.tile) {
      const tw = 56 * this.zoom;
      const th = 56 * Math.sqrt(3) * this.zoom;
      const ox = -((this.camX * this.zoom) % tw) - tw;
      const oy = -((this.camY * this.zoom) % th) - th;
      for (let y = oy; y < h + th; y += th) for (let x = ox; x < w + tw; x += tw) ctx.drawImage(this.tile, x, y, tw + 0.5, th + 0.5);
    }
    // Arena wall
    const c0 = this.toScreen(0, 0);
    ctx.strokeStyle = "rgba(255,80,120,0.7)";
    ctx.lineWidth = 6 * this.zoom;
    ctx.beginPath();
    ctx.arc(c0.x, c0.y, ARENA * this.zoom, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(c0.x, c0.y, ARENA * this.zoom, 0, TAU, true);
    ctx.fillStyle = "rgba(60,0,20,0.55)";
    ctx.fill("evenodd");
    ctx.restore();

    // Orbs
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const o of this.orbs) {
      if (!this.visible(o.x, o.y)) continue;
      const p = this.toScreen(o.x, o.y);
      const r = (o.v > 1 ? 6 : 3.5) * this.zoom * (1 + 0.15 * Math.sin(this.time * 4 + o.t));
      ctx.fillStyle = `hsla(${o.hue},95%,60%,0.25)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `hsl(${o.hue},95%,70%)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    for (const s of this.snakes) if (s.alive && s !== this.player) this.drawSnake(ctx, s);
    if (this.player && this.player.alive) this.drawSnake(ctx, this.player);
    this.particles.render(ctx);
    this.floaters.render(ctx);

    if (this.state === "play" && this.player) {
      // Length + leaderboard
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `600 11px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText("ความยาว", 14, 10);
      ctx.font = `800 26px ${FONT_DISPLAY}`;
      ctx.fillStyle = "#a7f3d0";
      ctx.fillText(`${Math.round(this.player.len)}`, 14, 24);
      const ranking = this.snakes.filter((s) => s.alive).sort((a, b) => b.len - a.len);
      const top = ranking.slice(0, 5);
      const bw = 150;
      glassPanel(ctx, w - bw - 10, 10, bw, 24 + top.length * 19, 12, 0.06);
      ctx.font = `700 11px ${FONT_DISPLAY}`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("อันดับ", w - bw, 16);
      top.forEach((s, i) => {
        ctx.font = `${s === this.player ? 800 : 500} 12px ${FONT_BODY}`;
        ctx.fillStyle = s === this.player ? "#a7f3d0" : "rgba(255,255,255,0.85)";
        ctx.textAlign = "left";
        ctx.fillText(`${i + 1}. ${s.name}`, w - bw, 34 + i * 19);
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(s.len)}`, w - 18, 34 + i * 19);
      });
      const myRank = ranking.indexOf(this.player) + 1;
      if (myRank > 5) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#a7f3d0";
        ctx.fillText(`คุณอันดับ ${myRank}`, w - 18, 34 + top.length * 19 + 6);
      }
      // Minimap
      const mr = 38;
      const mx = 14 + mr;
      const my = h - 14 - mr;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,80,120,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (const s of this.snakes) {
        if (!s.alive) continue;
        ctx.fillStyle = s === this.player ? "#a7f3d0" : `hsla(${s.hue},90%,65%,0.8)`;
        ctx.beginPath();
        ctx.arc(mx + (s.segs[0].x / ARENA) * mr, my + (s.segs[0].y / ARENA) * mr, s === this.player ? 3 : 2, 0, TAU);
        ctx.fill();
      }
      // Boost button
      const b = this.boostBtn;
      const on = this.player.boosting && this.player.len > 12;
      ctx.fillStyle = on ? "rgba(94,234,212,0.45)" : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(b.x - 10, b.y + 8);
      ctx.lineTo(b.x + 2, b.y - 2);
      ctx.lineTo(b.x - 4, b.y - 2);
      ctx.lineTo(b.x + 10, b.y - 14);
      ctx.lineTo(b.x - 2, b.y + 2);
      ctx.lineTo(b.x + 4, b.y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.font = `600 11px ${FONT_BODY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("พุ่ง", b.x, b.y + b.r + 4);
      if (this.stateT < 4) {
        ctx.globalAlpha = clamp(4 - this.stateT, 0, 1);
        ctx.font = `600 14px ${FONT_BODY}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText("แตะค้างแล้วลากเพื่อเลี้ยว · กดปุ่มสายฟ้าเพื่อพุ่ง", w / 2, h - 130);
        ctx.globalAlpha = 1;
      }
    }

    if (this.state !== "play") {
      // Upgrade buttons under the card
      const ups = this.upgradeBtns;
      const labels: Record<string, string> = { snake_start: "ตัวยาวตั้งต้น", snake_boost: "พลังพุ่ง", snake_magnet: "ดูดแสง" };
      ctx.fillStyle = `rgba(6,8,28,${0.62 * clamp(this.stateT * 3, 0, 1)})`;
      ctx.fillRect(0, h * 0.82, w, h * 0.18 + 1);
      const card = drawCard(ctx, w, h * 0.82, {
        title: this.state === "intro" ? "งูแสงล่าแต้ม" : this.newBest ? "สถิติใหม่!" : "ชนแล้ว!",
        subtitle: this.state === "intro" ? "แข่งกับบอท 8 ตัว" : `ยาวสุด ${this.bestLen} · ล้มคู่แข่ง ${this.kills} ตัว`,
        body:
          this.state === "intro"
            ? "แตะค้างแล้วลากไปทางที่จะเลี้ยว กินเม็ดแสงให้ตัวยาว ถ้าหัวชนตัวงูอื่นจะแพ้ ทำให้งูอื่นชนตัวคุณเพื่อล้มมัน"
            : undefined,
        chips: [`สถิติ ${this.best}`],
        coins: this.state === "over" ? this.earned : undefined,
        accent: "#14b8a6",
        buttons: [this.state === "intro" ? this.startBtn : this.againBtn],
        appear: this.stateT * 3,
      });
      const y = card.y + card.h + 12;
      const bw = (Math.min(card.w, w - 20) - 16) / 3;
      const x0 = w / 2 - (bw * 3 + 16) / 2;
      ctx.globalAlpha = clamp(this.stateT * 3, 0, 1);
      ups.forEach((u, i) => {
        const cost = wallet.upgradeCost(u.id);
        u.btn.label = `${labels[u.id]} ${wallet.level(u.id)}`;
        u.btn.color = wallet.coins() >= cost ? "#0f766e" : "#334155";
        u.btn.place(x0 + i * (bw + 8) + bw / 2, y, bw, 40);
        u.btn.render(ctx);
        ctx.font = `600 11px ${FONT_BODY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#ffd76a";
        ctx.fillText(`อัป ${cost.toLocaleString()} เหรียญ`, x0 + i * (bw + 8) + bw / 2, y + 44);
      });
      ctx.globalAlpha = 1;
      ctx.font = `600 12px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`มีอยู่ ${wallet.coins().toLocaleString()} เหรียญ`, w / 2, y + 66);
    }
  }
}
