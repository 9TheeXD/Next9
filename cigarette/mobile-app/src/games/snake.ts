// "Neon Snakes" — eat light, grow, and make rival snakes crash into you. Fourteen bot rivals roam a
// large round arena (the camera follows you, a minimap shows the rest); they steer around danger,
// chase food and try to cut you off, and get sharper the longer you survive. Now and then a crowned
// "king snake" turns up: smarter, hungrier, and out to take the top spot. Fast decisions all the
// time, which is what pulls attention off a craving.
//
// Performance: snake bodies are capped at MAX_SEGS points (spacing grows instead), segments and
// orbs go into uniform grids rebuilt once per frame (counting sort into typed arrays, no per-frame
// allocation), and drawing is culled to the viewport. New snakes are never placed on screen, near
// another snake, or in the path ahead of the player.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Floaters, Particles, makeSprite, clamp, TAU, FONT_DISPLAY, FONT_BODY, rng, glow, roundRectPath } from "./engine/fx";
import { Button, drawCard, glassPanel, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { wallet, coinsFor } from "./engine/economy";
import { snakeColor } from "./art/skins";

const ARENA = 2500; // radius (the old arena was 1300: this is 3.7x the area)
const ORBS = 1900; // food kept on the map
const ORB_CAP = ORBS + 2600; // room for death bursts and boost trails
const BOTS = 14;
const MAX_SEGS = 260; // body points per snake; longer snakes space them further apart
const CELL = 100; // grid cell size (world px)
const GRID = Math.ceil((ARENA * 2) / CELL) + 1;
const SEG_CAP = (BOTS + 3) * MAX_SEGS;
const ORB_HUES = 24;
const ELITE_NAME = "ราชางู";
const NAMES = [
  "เจ้าเขียว", "ซิ่งสายฟ้า", "ป้าแดง", "น้องมิว", "ไวไฟ", "TurboPon", "หนูนา", "ลุงเล็ก", "NeonX", "ปลาหมึก",
  "BotKing", "จิ๋วแต่แจ๋ว", "มังกรน้อย", "SpeedyBoi", "เต่าซิ่ง", "Kaew", "ฟ้าใส", "ข้าวตัง", "Mango", "พี่หมี",
];

interface Snake {
  name: string;
  segs: { x: number; y: number }[];
  dir: number;
  target: number;
  len: number; // grows by eating; body points = min(len, MAX_SEGS)
  boosting: boolean;
  alive: boolean;
  bot: boolean;
  elite: boolean;
  hue: number;
  col: [string, string];
  think: number;
  skill: number;
  deadT: number;
  r: number; // body radius
  sp: number; // spacing between body points
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Elite only: > 0 seconds of hunting left, < 0 seconds of feeding left. */
  phase: number;
  boostT: number;
  boostCool: number;
}

interface Orb {
  x: number;
  y: number;
  v: number;
  hue: number; // 0..ORB_HUES-1
  t: number;
}

export const snakeGame: GameDefinition = {
  id: "snake",
  title: "งูแสงล่าแต้ม",
  tagline: "สนามใหญ่ บอท 14 ตัว ระวังราชางูสวมมงกุฎ",
  why: "ต้องตัดสินใจเร็วทุกวินาที ทั้งหลบ ทั้งดักคู่แข่ง สนุกจนลืมความอยาก บอทเก่งขึ้นเรื่อยๆ ตามฝีมือคุณ",
  category: "action",
  minutes: "2–5 นาที",
  palette: ["#0a0f22", "#5eead4"],
  countdown: true,
  create: (env) => new SnakeGame(env),
};

type State = "intro" | "play" | "over";

const angDiff = (a: number, b: number) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const cellIx = (v: number) => {
  const c = Math.floor((v + ARENA) / CELL);
  return c < 0 ? 0 : c >= GRID ? GRID - 1 : c;
};
const radiusFor = (len: number) => clamp(7 + Math.sqrt(len) * 0.75, 8, 26);
const segCount = (len: number) => clamp(Math.round(len), 8, MAX_SEGS);
const spacingFor = (len: number) => radiusFor(len) * 0.6 * Math.max(1, len / MAX_SEGS);

/** A gold crown centred at (x, y), `s` about its width. */
function drawCrown(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const g = c.createLinearGradient(x, y - s * 0.4, x, y + s * 0.3);
  g.addColorStop(0, "#fff3b0");
  g.addColorStop(0.5, "#ffc93c");
  g.addColorStop(1, "#c98a0b");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - s * 0.5, y + s * 0.28);
  c.lineTo(x - s * 0.55, y - s * 0.3);
  c.lineTo(x - s * 0.25, y - s * 0.02);
  c.lineTo(x, y - s * 0.42);
  c.lineTo(x + s * 0.25, y - s * 0.02);
  c.lineTo(x + s * 0.55, y - s * 0.3);
  c.lineTo(x + s * 0.5, y + s * 0.28);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(120,70,0,0.8)";
  c.lineWidth = Math.max(1, s * 0.06);
  c.stroke();
  c.fillStyle = "#ef4444";
  c.beginPath();
  c.arc(x, y + s * 0.1, s * 0.09, 0, TAU);
  c.fill();
  c.fillStyle = "#60a5fa";
  c.beginPath();
  c.arc(x - s * 0.3, y + s * 0.12, s * 0.06, 0, TAU);
  c.arc(x + s * 0.3, y + s * 0.12, s * 0.06, 0, TAU);
  c.fill();
}

class SnakeGame implements GameInstance {
  private w = 0;
  private h = 0;
  private snakes: Snake[] = [];
  private orbs: Orb[] = Array.from({ length: ORB_CAP }, () => ({ x: 0, y: 0, v: 0, hue: 0, t: 0 }));
  private orbN = 0;
  private player: Snake | null = null;
  private elite: Snake | null = null;
  private eliteAt = Infinity; // elapsed seconds when the next king snake appears
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
  private eliteKills = 0;
  private bestLen = 0;
  private best = 0;
  private newBest = false;
  private earned = 0;
  private skin = "snake_mint";
  private tile: HTMLCanvasElement | null = null;
  private orbSprites: HTMLCanvasElement[] = [];
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
  private ranking: Snake[] = [];
  private rankT = 0;

  // Uniform grids, rebuilt every frame by counting sort.
  private segStart = new Int32Array(GRID * GRID + 1);
  private segCur = new Int32Array(GRID * GRID);
  private segX = new Float32Array(SEG_CAP);
  private segY = new Float32Array(SEG_CAP);
  private segR = new Float32Array(SEG_CAP);
  private segOwner = new Int16Array(SEG_CAP);
  private tmpCell = new Int32Array(SEG_CAP);
  private tmpX = new Float32Array(SEG_CAP);
  private tmpY = new Float32Array(SEG_CAP);
  private tmpR = new Float32Array(SEG_CAP);
  private tmpOwner = new Int16Array(SEG_CAP);
  private orbStart = new Int32Array(GRID * GRID + 1);
  private orbCur = new Int32Array(GRID * GRID);
  private orbItems = new Int32Array(ORB_CAP);
  private orbCell = new Int32Array(ORB_CAP);

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    this.seedWorld(false);
  }

  // ── World setup and spawning ───────────────────────────────────────────

  private makeSnake(name: string, bot: boolean, len: number, x: number, y: number, dir: number): Snake {
    const hue = this.rand() * 360;
    const s: Snake = {
      name, segs: [], dir, target: dir, len, boosting: false, alive: true, bot, elite: false, hue,
      col: [`hsl(${hue | 0},85%,58%)`, `hsl(${(hue + 12) % 360 | 0},85%,50%)`],
      think: 0, skill: 0.5, deadT: 0, r: radiusFor(len), sp: spacingFor(len),
      minX: x, maxX: x, minY: y, maxY: y, phase: 0, boostT: 0, boostCool: 0,
    };
    const n = segCount(len);
    for (let i = 0; i < n; i++) {
      const px = x - Math.cos(dir) * i * s.sp;
      const py = y - Math.sin(dir) * i * s.sp;
      s.segs.push({ x: px, y: py });
      s.minX = Math.min(s.minX, px);
      s.maxX = Math.max(s.maxX, px);
      s.minY = Math.min(s.minY, py);
      s.maxY = Math.max(s.maxY, py);
    }
    return s;
  }

  private deadSlot(name: string): Snake {
    const s = this.makeSnake(name, true, 10, 0, 0, 0);
    s.alive = false;
    s.deadT = 99;
    return s;
  }

  /** Spawn test for one point of a new snake's body. */
  private spawnPointOk(px: number, py: number, halfW: number, halfH: number, minBody: number, minHead: number): boolean {
    if (px * px + py * py > (ARENA - 140) * (ARENA - 140)) return false;
    // Never inside what the player can see (plus a margin)
    if (Math.abs(px - this.camX) < halfW && Math.abs(py - this.camY) < halfH) return false;
    const pl = this.player && this.player.alive ? this.player : null;
    if (pl) {
      // Never in a cone ahead of the player's heading
      const hx = px - pl.segs[0].x;
      const hy = py - pl.segs[0].y;
      const ux = Math.cos(pl.dir);
      const uy = Math.sin(pl.dir);
      const along = hx * ux + hy * uy;
      const perp = Math.abs(hx * uy - hy * ux);
      if (along > -150 && along < 1700 && perp < 380 + along * 0.4) return false;
      if (hx * hx + hy * hy < 1000 * 1000) return false;
    }
    // Clear of every snake's head and body
    const mb2 = minBody * minBody;
    const mh2 = minHead * minHead;
    for (const o of this.snakes) {
      if (!o.alive) continue;
      const h0 = o.segs[0];
      if ((h0.x - px) ** 2 + (h0.y - py) ** 2 < mh2) return false;
      if (px < o.minX - minBody || px > o.maxX + minBody || py < o.minY - minBody || py > o.maxY + minBody) continue;
      for (let i = 0; i < o.segs.length; i += 2) {
        const sg = o.segs[i];
        if ((sg.x - px) ** 2 + (sg.y - py) ** 2 < mb2) return false;
      }
    }
    return true;
  }

  /** A head position and heading for a new snake of length `len`, or null if no safe spot was found. */
  private findSpawn(len: number, strict = 1): { x: number; y: number; dir: number } | null {
    const z = Math.max(0.3, this.zoom * 0.88); // allow for the view widening as the player grows
    const halfW = this.w / 2 / z + 260;
    const halfH = this.h / 2 / z + 260;
    const bodyLen = (segCount(len) - 1) * spacingFor(len);
    const pts = Math.max(2, Math.ceil(bodyLen / 110));
    const pl = this.player && this.player.alive ? this.player : null;
    for (let tries = 0; tries < 50; tries++) {
      const a = this.rand() * TAU;
      const d = Math.sqrt(this.rand()) * ARENA * 0.86;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      let dir = this.rand() * TAU;
      if (d > ARENA * 0.55) dir = Math.atan2(-y, -x) + (this.rand() - 0.5) * 1.6; // face inwards near the wall
      if (pl) {
        // Do not point at the player either
        const toP = Math.atan2(pl.segs[0].y - y, pl.segs[0].x - x);
        if (Math.abs(angDiff(dir, toP)) < 1.1) dir = toP + Math.PI + (this.rand() - 0.5) * 1.2;
      }
      let ok = true;
      for (let k = 0; k <= pts && ok; k++) {
        const t = (k / pts) * bodyLen;
        ok = this.spawnPointOk(x - Math.cos(dir) * t, y - Math.sin(dir) * t, halfW, halfH, 260 * strict, 650 * strict);
      }
      if (ok) return { x, y, dir };
    }
    return null;
  }

  private pickName() {
    const free = NAMES.filter((n) => !this.snakes.some((s) => s.alive && s.name === n));
    return free[Math.floor(this.rand() * free.length)] || "บอท";
  }

  private spawnBot(i: number, len: number): boolean {
    const at = this.findSpawn(len) || this.findSpawn(len, 0.6);
    if (!at) return false;
    this.snakes[i] = this.makeSnake(this.pickName(), true, len, at.x, at.y, at.dir);
    return true;
  }

  private addOrb(x: number, y: number, v: number, hue: number) {
    if (this.orbN >= ORB_CAP) return;
    const o = this.orbs[this.orbN++];
    o.x = x;
    o.y = y;
    o.v = v;
    o.hue = hue;
    o.t = this.rand() * 6;
  }

  /** New food somewhere random, preferably out of sight so it does not pop up on screen. */
  private addRandomOrb() {
    let x = 0;
    let y = 0;
    const halfW = this.w / 2 / this.zoom + 40;
    const halfH = this.h / 2 / this.zoom + 40;
    for (let k = 0; k < 6; k++) {
      const a = this.rand() * TAU;
      const d = Math.sqrt(this.rand()) * ARENA * 0.97;
      x = Math.cos(a) * d;
      y = Math.sin(a) * d;
      if (Math.abs(x - this.camX) > halfW || Math.abs(y - this.camY) > halfH) break;
    }
    this.addOrb(x, y, 1, Math.floor(this.rand() * ORB_HUES));
  }

  private seedWorld(withPlayer: boolean) {
    this.snakes = [];
    this.elite = null;
    this.orbN = 0;
    for (let i = 0; i < ORBS; i++) this.addRandomOrb();
    if (withPlayer) {
      const startLen = 14 + 6 * wallet.level("snake_start");
      const a = this.rand() * TAU;
      const d = this.rand() * ARENA * 0.45;
      this.player = this.makeSnake("คุณ", false, startLen, Math.cos(a) * d, Math.sin(a) * d, this.rand() * TAU);
      this.snakes.push(this.player);
      this.followCamera();
    }
    for (let i = 0; i < BOTS; i++) {
      const idx = this.snakes.length;
      this.snakes.push(this.deadSlot("บอท"));
      // A few bigger bots so the map feels lived in from the start
      const len = i < 3 ? 70 + Math.floor(this.rand() * 70) : 14 + Math.floor(this.rand() * 40);
      if (!this.spawnBot(idx, len)) this.snakes[idx].deadT = 2.5;
    }
    this.buildGrids();
  }

  private start() {
    this.skin = wallet.equipped("snakeSkin") || "snake_mint";
    this.seedWorld(true);
    this.kills = 0;
    this.eliteKills = 0;
    this.bestLen = this.player ? Math.round(this.player.len) : 0;
    this.elapsed = 0;
    this.newBest = false;
    // About one game in three gets an early king snake; longer games may get one later.
    const r = this.rand();
    this.eliteAt = r < 0.34 ? 18 + this.rand() * 30 : r < 0.75 ? 100 + this.rand() * 70 : Infinity;
    this.state = "play";
    this.stateT = 0;
    this.rankT = 0.25;
    this.ranking = this.snakes.filter((s) => s.alive).sort((a, b) => b.len - a.len);
    this.env.emit({ type: "start" });
  }

  private leaderLen(except: Snake | null) {
    let m = 0;
    for (const s of this.snakes) if (s.alive && s !== except && s.len > m) m = s.len;
    return m;
  }

  private spawnElite(): boolean {
    const len = Math.max(50, Math.round(this.leaderLen(null) * 0.5));
    const at = this.findSpawn(len) || this.findSpawn(len, 0.6);
    if (!at) return false;
    const s = this.makeSnake(ELITE_NAME, true, len, at.x, at.y, at.dir);
    s.elite = true;
    s.hue = 45;
    s.col = ["#ffd54a", "#f59e0b"];
    s.phase = -(4 + this.rand() * 3); // starts by feeding
    const i = this.elite ? this.snakes.indexOf(this.elite) : -1;
    if (i >= 0) this.snakes[i] = s;
    else this.snakes.push(s);
    this.elite = s;
    this.floaters.add("ราชางูปรากฏตัว!", this.w / 2, Math.max(200, this.h * 0.3), "#ffd76a", 26, 2.2);
    [0, 2, 4].forEach((k, j) => this.env.sfx.chime(pentatonic(k + 3), 0.1, j * 0.12));
    return true;
  }

  /** How sharp the bots are: grows with time survived and with the player's best length. */
  private botSkill() {
    return clamp(0.35 + this.elapsed / 240 + this.best / 900, 0.35, 0.95);
  }

  private die(s: Snake, killer: Snake | null) {
    s.alive = false;
    s.deadT = 0;
    // Body turns into big orbs worth about as much as the snake was
    const n = s.segs.length;
    const v = Math.min(9, (3 * s.len) / n);
    const hue = s === this.player ? 11 : Math.round(s.hue / (360 / ORB_HUES)) % ORB_HUES;
    for (let i = 0; i < n; i += 2) {
      const p = s.segs[i];
      this.addOrb(p.x + (this.rand() - 0.5) * 10, p.y + (this.rand() - 0.5) * 10, v, hue);
    }
    const hx = (s.segs[0].x - this.camX) * this.zoom + this.w / 2;
    const hy = (s.segs[0].y - this.camY) * this.zoom + this.h / 2;
    if (hx > -60 && hx < this.w + 60 && hy > -60 && hy < this.h + 60) {
      this.particles.burst(hx, hy, s.elite ? "#ffd54a" : s.bot ? `hsl(${s.hue | 0},90%,60%)` : "#5eead4", s.elite ? 60 : 30, { speed: 240, size: 3, gravity: 0, life: 0.8 });
    }
    if (killer === this.player && s.bot) {
      this.kills++;
      if (s.elite) {
        this.eliteKills++;
        this.floaters.add("ล้มราชางูได้! โบนัส!", this.w / 2, this.h * 0.3, "#ffd76a", 26, 2);
        [0, 2, 4, 7].forEach((k, j) => this.env.sfx.chime(pentatonic(k + 6), 0.12, j * 0.09));
      } else {
        this.floaters.add(`ล้ม ${s.name}!`, this.w / 2, this.h * 0.3, "#ffe58a", 24, 1.4);
        this.env.sfx.chime(pentatonic(7 + (this.kills % 4)), 0.12);
      }
    }
    if (s.elite) this.eliteAt = this.rand() < 0.5 ? this.elapsed + 80 + this.rand() * 80 : Infinity;
    if (s === this.player) this.gameOver(killer);
  }

  private gameOver(killer: Snake | null) {
    this.state = "over";
    this.stateT = 0;
    const r = bestScore(this.env.store, "best", this.bestLen);
    this.best = r.best;
    this.newBest = r.isNew;
    this.earned = coinsFor(this.bestLen + this.kills * 20 + this.eliteKills * 60, 8);
    this.env.sfx.noise({ dur: 0.6, vol: 0.12, freq: 400, sweepTo: 80, type: "lowpass" });
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: this.bestLen,
      best: this.best,
      summary: `ยาวสุด ${this.bestLen} · ล้มคู่แข่ง ${this.kills} ตัว${this.eliteKills ? " (รวมราชางู)" : ""}${killer ? ` · แพ้ให้ ${killer.name}` : ""}`,
      stats: { length: this.bestLen, kills: this.kills, kingKills: this.eliteKills },
    });
  }

  // ── Camera ───────────────────────────────────────────────────────────────

  private followCamera() {
    const pl = this.player;
    if (!pl) return;
    this.camX = pl.segs[0].x;
    this.camY = pl.segs[0].y;
    this.zoom = clamp(1.15 - Math.sqrt(pl.len) * 0.025, 0.6, 1.05) * Math.min(1, Math.min(this.w, this.h) / 420 + 0.15);
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
    // One glowing orb sprite per hue band, drawn once and blitted (much cheaper than gradients per orb)
    if (!this.orbSprites.length) {
      for (let k = 0; k < ORB_HUES; k++) {
        const hue = (k * 360) / ORB_HUES;
        this.orbSprites.push(
          makeSprite(32, 32, dpr, (c) => {
            const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
            g.addColorStop(0, `hsla(${hue},95%,80%,1)`);
            g.addColorStop(0.3, `hsla(${hue},95%,65%,0.95)`);
            g.addColorStop(0.42, `hsla(${hue},95%,60%,0.3)`);
            g.addColorStop(1, `hsla(${hue},95%,60%,0)`);
            c.fillStyle = g;
            c.fillRect(0, 0, 32, 32);
          })
        );
      }
    }
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

  // ── Spatial grids ──────────────────────────────────────────────────────

  private buildGrids() {
    // Body segments (owner index, position, radius), bucketed by cell
    const cells = GRID * GRID;
    const start = this.segStart;
    start.fill(0);
    let n = 0;
    for (let si = 0; si < this.snakes.length; si++) {
      const s = this.snakes[si];
      if (!s.alive) continue;
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let j = 0; j < s.segs.length && n < SEG_CAP; j++) {
        const g = s.segs[j];
        if (g.x < x0) x0 = g.x;
        if (g.x > x1) x1 = g.x;
        if (g.y < y0) y0 = g.y;
        if (g.y > y1) y1 = g.y;
        const c = cellIx(g.x) + cellIx(g.y) * GRID;
        this.tmpCell[n] = c;
        this.tmpX[n] = g.x;
        this.tmpY[n] = g.y;
        this.tmpR[n] = s.r;
        this.tmpOwner[n] = si;
        start[c + 1]++;
        n++;
      }
      s.minX = x0;
      s.maxX = x1;
      s.minY = y0;
      s.maxY = y1;
    }
    for (let c = 1; c <= cells; c++) start[c] += start[c - 1];
    this.segCur.set(start.subarray(0, cells));
    for (let k = 0; k < n; k++) {
      const at = this.segCur[this.tmpCell[k]]++;
      this.segX[at] = this.tmpX[k];
      this.segY[at] = this.tmpY[k];
      this.segR[at] = this.tmpR[k];
      this.segOwner[at] = this.tmpOwner[k];
    }
    // Orbs
    const os = this.orbStart;
    os.fill(0);
    for (let i = 0; i < this.orbN; i++) {
      const o = this.orbs[i];
      const c = cellIx(o.x) + cellIx(o.y) * GRID;
      this.orbCell[i] = c;
      os[c + 1]++;
    }
    for (let c = 1; c <= cells; c++) os[c] += os[c - 1];
    this.orbCur.set(os.subarray(0, cells));
    for (let i = 0; i < this.orbN; i++) this.orbItems[this.orbCur[this.orbCell[i]]++] = i;
  }

  /** True when (px, py) is within `extra` of another snake's body (ignores snake `self`). */
  private blocked(px: number, py: number, extra: number, self: number): boolean {
    const reach = extra + 26;
    const cx0 = cellIx(px - reach);
    const cx1 = cellIx(px + reach);
    const cy0 = cellIx(py - reach);
    const cy1 = cellIx(py + reach);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cx + cy * GRID;
        for (let k = this.segStart[c], e = this.segStart[c + 1]; k < e; k++) {
          const o = this.segOwner[k];
          if (o === self || !this.snakes[o].alive) continue;
          const r = this.segR[k] + extra;
          const dx = this.segX[k] - px;
          const dy = this.segY[k] - py;
          if (dx * dx + dy * dy < r * r) return true;
        }
      }
    }
    return false;
  }

  /** The snake whose body the head of snake `si` touches, or -1. */
  private headHit(si: number): number {
    const s = this.snakes[si];
    const hx = s.segs[0].x;
    const hy = s.segs[0].y;
    const hr = s.r * 0.7;
    const reach = hr + 26;
    const cx0 = cellIx(hx - reach);
    const cx1 = cellIx(hx + reach);
    const cy0 = cellIx(hy - reach);
    const cy1 = cellIx(hy + reach);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cx + cy * GRID;
        for (let k = this.segStart[c], e = this.segStart[c + 1]; k < e; k++) {
          const o = this.segOwner[k];
          if (o === si || !this.snakes[o].alive) continue;
          const r = this.segR[k] + hr;
          const dx = this.segX[k] - hx;
          const dy = this.segY[k] - hy;
          if (dx * dx + dy * dy < r * r) return o;
        }
      }
    }
    return -1;
  }

  /** Heading towards the best orb within `range` (bigger orbs weigh more), or NaN. */
  private foodDir(x: number, y: number, range: number, weight: number): number {
    let best = -Infinity;
    let dir = NaN;
    const cx0 = cellIx(x - range);
    const cx1 = cellIx(x + range);
    const cy0 = cellIx(y - range);
    const cy1 = cellIx(y + range);
    const r2 = range * range;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = cx + cy * GRID;
        for (let k = this.orbStart[c], e = this.orbStart[c + 1]; k < e; k++) {
          const o = this.orbs[this.orbItems[k]];
          if (o.v <= 0) continue;
          const dx = o.x - x;
          const dy = o.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const sc = o.v * weight - Math.sqrt(d2);
          if (sc > best) {
            best = sc;
            dir = Math.atan2(dy, dx);
          }
        }
      }
    }
    return dir;
  }

  private freeDistance(self: number, x: number, y: number, a: number, look: number, margin: number) {
    const steps = 6;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let k = 1; k <= steps; k++) {
      const px = x + (ca * look * k) / steps;
      const py = y + (sa * look * k) / steps;
      if (px * px + py * py > (ARENA - 30) * (ARENA - 30)) return (look * (k - 1)) / steps;
      if (this.blocked(px, py, margin, self)) return (look * (k - 1)) / steps;
    }
    return look;
  }

  /** Pick the safest of several headings around `goal`; returns the free distance of the pick. */
  private avoid(s: Snake, si: number, goal: number, look: number, options: readonly number[]) {
    const head = s.segs[0];
    const margin = Math.max(14, s.r * 0.7 + 8); // the head's own size plus a little room
    let bestDir = goal;
    let bestFree = -Infinity;
    for (const off of options) {
      const a = goal + off;
      const free = this.freeDistance(si, head.x, head.y, a, look, margin);
      const score = free - Math.abs(off) * 18;
      if (score > bestFree) {
        bestFree = score;
        bestDir = a;
      }
    }
    s.target = bestDir;
    return bestFree;
  }

  // ── Bot brains ─────────────────────────────────────────────────────────

  /** Ordinary bot: food, sometimes cut off the player, always dodge. */
  private think(s: Snake, si: number) {
    const head = s.segs[0];
    const look = 90 + s.skill * 140;
    let goal = this.foodDir(head.x, head.y, 360, 2000);
    if (Number.isNaN(goal)) goal = s.dir + (this.rand() - 0.5) * 0.6;
    // Steer back in when near the wall
    if (head.x * head.x + head.y * head.y > (ARENA - 260) * (ARENA - 260)) goal = Math.atan2(-head.y, -head.x);
    const pl = this.player;
    if (pl && pl.alive && s.len > pl.len * 0.8 && this.rand() < s.skill * 0.6) {
      const ph = pl.segs[0];
      const d = Math.hypot(ph.x - head.x, ph.y - head.y);
      if (d < 420) {
        const ax = ph.x + Math.cos(pl.dir) * 120;
        const ay = ph.y + Math.sin(pl.dir) * 120;
        goal = Math.atan2(ay - head.y, ax - head.x);
        s.boosting = d < 260 && s.len > 30 && this.rand() < s.skill;
      }
    } else if (s.len < 25) s.boosting = false;
    const free = this.avoid(s, si, goal, look, BOT_OPTIONS);
    if (free < look * 0.35) s.boosting = false;
  }

  /**
   * King snake: alternates hunting (cuts in front of its prey, boosts in short bursts) and feeding
   * (goes for the richest food). Same speed and turning as the player, so it can be outplayed.
   */
  private thinkElite(s: Snake, si: number) {
    const head = s.segs[0];
    const look = s.boosting ? 460 : 360;
    let goal = NaN;
    if (s.phase > 0) {
      // Prey: the player if near, otherwise the nearest smaller bot
      let prey: Snake | null = null;
      let pd = Infinity;
      for (const o of this.snakes) {
        if (!o.alive || o === s) continue;
        const d = Math.hypot(o.segs[0].x - head.x, o.segs[0].y - head.y);
        // The player is the main prey; bots only when they are much smaller (an easy meal)
        const isPl = o === this.player;
        if (!isPl && o.len > s.len * 0.35) continue;
        const range = isPl ? 1000 : 500;
        const score = isPl ? d * 0.6 : d;
        if (d < range && (isPl || o.len < s.len * 1.3) && score < pd) {
          pd = score;
          prey = o;
        }
      }
      if (prey) {
        const ph = prey.segs[0];
        const d = Math.hypot(ph.x - head.x, ph.y - head.y);
        const lead = clamp(d * 0.7, 110, 420);
        const ax = ph.x + Math.cos(prey.dir) * lead;
        const ay = ph.y + Math.sin(prey.dir) * lead;
        goal = Math.atan2(ay - head.y, ax - head.x);
        if (d < 520 && s.len > 40 && s.boostCool <= 0 && Math.abs(angDiff(s.dir, goal)) < 0.6) {
          s.boostT = 0.8 + this.rand() * 0.6;
          s.boostCool = 2.8;
        }
      }
    }
    if (Number.isNaN(goal)) goal = this.foodDir(head.x, head.y, 520, 900);
    if (Number.isNaN(goal)) goal = Math.atan2(-head.y, -head.x) + (this.rand() - 0.5) * 2;
    if (head.x * head.x + head.y * head.y > (ARENA - 300) * (ARENA - 300)) goal = Math.atan2(-head.y, -head.x);
    const free = this.avoid(s, si, goal, look, ELITE_OPTIONS);
    if (free < look * 0.5) s.boostT = 0;
    s.boosting = s.boostT > 0 && s.len > 30;
  }

  // ── Simulation ───────────────────────────────────────────────────────────

  private moveSnake(s: Snake, dt: number) {
    const turn = (s.elite ? 4.2 : s.bot ? 3 + s.skill * 1.5 : 4.2) * dt;
    s.dir += clamp(angDiff(s.target, s.dir), -turn, turn);
    const boostLvl = s.bot ? 0 : wallet.level("snake_boost");
    const canBoost = s.boosting && s.len > 12;
    const speed = canBoost ? 300 : 155;
    if (canBoost) {
      s.len -= dt * (s.bot ? 3 : 3.2 / (1 + boostLvl * 0.12));
      if (this.rand() < dt * 10) {
        const tail = s.segs[s.segs.length - 1];
        this.addOrb(tail.x, tail.y, 1, Math.round(s.hue / (360 / ORB_HUES)) % ORB_HUES);
      }
    }
    s.r = radiusFor(s.len);
    s.sp = spacingFor(s.len);
    const head = s.segs[0];
    head.x += Math.cos(s.dir) * speed * dt;
    head.y += Math.sin(s.dir) * speed * dt;
    const sp = s.sp;
    for (let i = 1; i < s.segs.length; i++) {
      const a = s.segs[i - 1];
      const b = s.segs[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > sp * sp) {
        const k = sp / Math.sqrt(d2);
        b.x = a.x + dx * k;
        b.y = a.y + dy * k;
      }
    }
    const want = segCount(s.len);
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

    // 1. Move
    for (const s of this.snakes) if (s.alive) this.moveSnake(s, dt);
    // 2. Grids for this frame
    this.buildGrids();

    // 3. Eating
    const magnetLvl = wallet.level("snake_magnet");
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const hx = s.segs[0].x;
      const hy = s.segs[0].y;
      const reach = s.r + 14 + (s.bot ? 0 : magnetLvl * 6);
      const pull = s.bot ? reach : reach + 40;
      const gain = s.elite ? 1.5 : 1;
      const cx0 = cellIx(hx - pull);
      const cx1 = cellIx(hx + pull);
      const cy0 = cellIx(hy - pull);
      const cy1 = cellIx(hy + pull);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = cx + cy * GRID;
          for (let k = this.orbStart[c], e = this.orbStart[c + 1]; k < e; k++) {
            const o = this.orbs[this.orbItems[k]];
            if (o.v <= 0) continue;
            const dx = o.x - hx;
            const dy = o.y - hy;
            const d2 = dx * dx + dy * dy;
            if (d2 < reach * reach) {
              s.len += o.v * 0.7 * gain;
              o.v = 0;
              if (s === pl && this.time % 0.08 < dt) this.env.sfx.tone({ freq: 700 + Math.random() * 400, dur: 0.04, vol: 0.025 });
            } else if (!s.bot && d2 < pull * pull) {
              // Orbs drift towards the player's mouth
              o.x -= dx * dt * 4;
              o.y -= dy * dt * 4;
            }
          }
        }
      }
    }

    // 4. Collisions: wall and other snakes' bodies
    for (let si = 0; si < this.snakes.length; si++) {
      const s = this.snakes[si];
      if (!s.alive) continue;
      const head = s.segs[0];
      if (head.x * head.x + head.y * head.y > ARENA * ARENA) {
        this.die(s, null);
        continue;
      }
      const o = this.headHit(si);
      if (o >= 0) this.die(s, this.snakes[o]);
    }

    // 5. Bot decisions (they use this frame's grids)
    const skill = this.botSkill();
    for (let si = 0; si < this.snakes.length; si++) {
      const s = this.snakes[si];
      if (!s.alive || !s.bot) continue;
      s.skill = skill;
      s.think -= dt;
      if (s.elite) {
        s.boostT -= dt;
        s.boostCool -= dt;
        if (s.phase > 0) {
          s.phase -= dt;
          if (s.phase <= 0) s.phase = -(4 + this.rand() * 3);
        } else {
          s.phase += dt;
          if (s.phase >= 0) s.phase = 6 + this.rand() * 4;
        }
        // Grows fast until it leads the board
        const lead = this.leaderLen(s);
        s.len += dt * (s.len < lead * 1.08 ? 1.6 + lead * 0.004 : 0.2);
        if (s.think <= 0) {
          s.think = 0.06 + this.rand() * 0.02;
          this.thinkElite(s, si);
        }
        if (s.boostT <= 0 && s.boosting) s.boosting = false;
      } else if (s.think <= 0) {
        s.think = 0.18 - skill * 0.08 + this.rand() * 0.05;
        this.think(s, si);
      }
    }

    // 6. Food upkeep: drop eaten orbs (swap-remove), top the map back up
    for (let i = 0; i < this.orbN; i++) {
      if (this.orbs[i].v > 0) continue;
      const last = this.orbs[this.orbN - 1];
      this.orbs[this.orbN - 1] = this.orbs[i];
      this.orbs[i] = last;
      this.orbN--;
      i--;
    }
    for (let k = 0; this.orbN < ORBS && k < 40; k++) this.addRandomOrb();

    // 7. Respawn bots (one per frame at most, off screen and clear of everyone)
    for (const s of this.snakes) if (!s.alive && s.bot) s.deadT += dt;
    for (let i = 0; i < this.snakes.length; i++) {
      const s = this.snakes[i];
      if (s.alive || !s.bot || s.elite || s.deadT < 2.5) continue;
      if (this.spawnBot(i, 14 + Math.floor(this.rand() * (20 + this.elapsed / 4)))) break;
      s.deadT = 2.2; // no safe spot right now: try again a little later
      break;
    }
    if (playing && (!this.elite || !this.elite.alive) && this.elapsed >= this.eliteAt) {
      if (this.spawnElite()) this.eliteAt = Infinity;
    }

    if (pl && pl.alive) {
      this.bestLen = Math.max(this.bestLen, Math.round(pl.len));
      this.followCamera();
    } else if (!pl) {
      // Attract mode before the first game: drift around the arena
      this.camX = Math.cos(this.time * 0.1) * 600;
      this.camY = Math.sin(this.time * 0.1) * 600;
      this.zoom = 0.8;
    }
    this.rankT -= dt;
    if (this.rankT <= 0) {
      this.rankT = 0.25;
      this.ranking = this.snakes.filter((s) => s.alive).sort((a, b) => b.len - a.len);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private drawSnake(c: CanvasRenderingContext2D, s: Snake) {
    const z = this.zoom;
    const r = s.r * z;
    const ox = this.w / 2 - this.camX * z;
    const oy = this.h / 2 - this.camY * z;
    const pad = r * 2;
    const x0 = -pad;
    const x1 = this.w + pad;
    const y0 = -pad;
    const y1 = this.h + pad;
    // Whole snake off screen?
    if (s.maxX * z + ox < x0 || s.minX * z + ox > x1 || s.maxY * z + oy < y0 || s.minY * z + oy > y1) return;
    const n = s.segs.length;
    if (s.elite) {
      // Golden aura along the body; redder while hunting
      c.save();
      c.globalCompositeOperation = "lighter";
      c.lineJoin = "round";
      c.lineCap = "round";
      const hunting = s.phase > 0;
      const pulse = Math.sin(this.time * (hunting ? 8 : 3));
      c.beginPath();
      for (let i = 0; i < n; i += 2) {
        const sg = s.segs[i];
        if (i) c.lineTo(sg.x * z + ox, sg.y * z + oy);
        else c.moveTo(sg.x * z + ox, sg.y * z + oy);
      }
      c.strokeStyle = hunting ? `rgba(255,90,40,${0.14 + 0.05 * pulse})` : `rgba(255,190,50,${0.12 + 0.04 * pulse})`;
      c.lineWidth = r * 5;
      c.stroke();
      c.strokeStyle = hunting ? `rgba(255,140,60,${0.28 + 0.08 * pulse})` : `rgba(255,215,90,${0.24 + 0.06 * pulse})`;
      c.lineWidth = r * 2.9;
      c.stroke();
      c.restore();
    }
    const skinned = !s.bot;
    for (let i = n - 1; i >= 0; i--) {
      const sg = s.segs[i];
      const px = sg.x * z + ox;
      const py = sg.y * z + oy;
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      c.fillStyle = skinned ? snakeColor(this.skin, i, this.time) : s.elite ? (i % 8 < 2 ? "#7c4a03" : s.col[i % 8 < 5 ? 0 : 1]) : s.col[i % 6 < 3 ? 0 : 1];
      c.beginPath();
      c.arc(px, py, r, 0, TAU);
      c.fill();
      if (i % 3 === 0) {
        c.fillStyle = "rgba(255,255,255,0.18)";
        c.beginPath();
        c.arc(px - r * 0.3, py - r * 0.3, r * 0.4, 0, TAU);
        c.fill();
      }
      if (skinned && this.skin === "snake_galaxy" && i % 5 === 0) {
        c.fillStyle = "rgba(255,255,255,0.8)";
        c.fillRect(px + r * 0.2, py - r * 0.1, 1.5, 1.5);
      }
    }
    // Head: eyes looking where it goes
    const hx = s.segs[0].x * z + ox;
    const hy = s.segs[0].y * z + oy;
    if (s.boosting) glow(c, hx, hy, r * 3, s.elite ? "#ffb020" : s.bot ? "#ffffff" : "#9ef0ff", 0.3);
    for (const side of [-1, 1]) {
      const ex = hx + Math.cos(s.dir + side * 0.6) * r * 0.55;
      const ey = hy + Math.sin(s.dir + side * 0.6) * r * 0.55;
      c.fillStyle = s.elite ? "#fff7d6" : "#ffffff";
      c.beginPath();
      c.arc(ex, ey, r * 0.38, 0, TAU);
      c.fill();
      c.fillStyle = s.elite ? "#b91c1c" : "#111827";
      c.beginPath();
      c.arc(ex + Math.cos(s.dir) * r * 0.14, ey + Math.sin(s.dir) * r * 0.14, r * 0.2, 0, TAU);
      c.fill();
    }
    // Name tag (and crown for the king)
    c.font = `${s.elite ? 800 : 600} ${Math.round(11 + r * 0.2)}px ${FONT_BODY}`;
    c.textAlign = "center";
    c.textBaseline = "bottom";
    let tagY = hy - r - 4;
    if (s.elite) {
      const cs = Math.max(18, r * 1.5);
      drawCrown(c, hx, hy - r - 6 - cs * 0.28, cs);
      tagY = hy - r - 6 - cs * 0.28 - cs * 0.42 - 12;
    }
    c.fillStyle = s.elite ? "#ffd76a" : s.bot ? "rgba(255,255,255,0.75)" : "#a7f3d0";
    c.fillText(s.name, hx, tagY);
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    const z = this.zoom;
    ctx.fillStyle = "#070b1c";
    ctx.fillRect(0, 0, w, h);
    // Hex floor scrolling with the camera
    if (this.tile) {
      const tw = 56 * z;
      const th = 56 * Math.sqrt(3) * z;
      const ox = -(((this.camX * z) % tw) + tw) % tw - tw;
      const oy = -(((this.camY * z) % th) + th) % th - th;
      for (let y = oy; y < h + th; y += th) for (let x = ox; x < w + tw; x += tw) ctx.drawImage(this.tile, x, y, tw + 0.5, th + 0.5);
    }
    // World border: dark red outside, a glowing double rim
    const cx0 = w / 2 - this.camX * z;
    const cy0 = h / 2 - this.camY * z;
    const R = ARENA * z;
    const dCenter = Math.hypot(this.camX, this.camY);
    const viewR = Math.hypot(w, h) / 2;
    if (dCenter + viewR > R - 40 * z) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(cx0, cy0, R, 0, TAU, true);
      ctx.fillStyle = "rgba(70,0,24,0.72)";
      ctx.fill("evenodd");
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,60,110,0.12)";
      ctx.lineWidth = 34 * z;
      ctx.beginPath();
      ctx.arc(cx0, cy0, R, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,80,130,0.35)";
      ctx.lineWidth = 12 * z;
      ctx.stroke();
      ctx.strokeStyle = "#ff7aa2";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([18 * z, 22 * z]);
      ctx.lineDashOffset = -this.time * 30 * z;
      ctx.strokeStyle = "rgba(255,220,230,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx0, cy0, R - 16 * z, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Orbs: pre-rendered glow sprites, only those on screen
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const minX = this.camX - w / 2 / z - 20;
    const maxX = this.camX + w / 2 / z + 20;
    const minY = this.camY - h / 2 / z - 20;
    const maxY = this.camY + h / 2 / z + 20;
    if (this.orbSprites.length) {
      for (let i = 0; i < this.orbN; i++) {
        const o = this.orbs[i];
        if (o.x < minX || o.x > maxX || o.y < minY || o.y > maxY || o.v <= 0) continue;
        const s = (o.v > 1 ? 18 : 11.5) * z * (1 + 0.15 * Math.sin(this.time * 4 + o.t));
        ctx.drawImage(this.orbSprites[o.hue], (o.x - this.camX) * z + w / 2 - s, (o.y - this.camY) * z + h / 2 - s, s * 2, s * 2);
      }
    }
    ctx.restore();

    for (const s of this.snakes) if (s.alive && s !== this.player) this.drawSnake(ctx, s);
    if (this.player && this.player.alive) this.drawSnake(ctx, this.player);
    this.particles.render(ctx);
    this.floaters.render(ctx);

    if (this.state === "play" && this.player) this.renderHud(ctx, w, h);
    if (this.state !== "play") this.renderMenu(ctx, w, h);
  }

  private renderHud(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const pl = this.player!;
    // Near the wall: red edge glow and a warning
    const dist = Math.hypot(pl.segs[0].x, pl.segs[0].y);
    if (pl.alive && dist > ARENA - 420) {
      const k = clamp((dist - (ARENA - 420)) / 380, 0, 1);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(255,40,90,0)");
      g.addColorStop(1, `rgba(255,40,90,${0.35 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.5 + 0.5 * k;
      ctx.font = `700 15px ${FONT_DISPLAY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffb3c7";
      ctx.fillText("ใกล้ขอบสนาม! เลี้ยวกลับ", w / 2, Math.max(176, h * 0.26));
      ctx.globalAlpha = 1;
    }
    // Length
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `600 11px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("ความยาว", 14, 10);
    ctx.font = `800 26px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#a7f3d0";
    ctx.fillText(`${Math.round(pl.len)}`, 14, 24);
    // Leaderboard
    const ranking = this.ranking;
    const top = ranking.slice(0, 5);
    const bw = 158;
    const myRank = ranking.indexOf(pl) + 1;
    const extra = myRank > 5 ? 20 : 0;
    const ph = 26 + top.length * 19 + extra;
    ctx.fillStyle = "rgba(8,12,30,0.62)";
    roundRectPath(ctx, w - bw - 10, 10, bw, ph, 12);
    ctx.fill();
    glassPanel(ctx, w - bw - 10, 10, bw, ph, 12, 0.06);
    ctx.font = `700 11px ${FONT_DISPLAY}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(`อันดับ · ${ranking.length} ตัว`, w - bw, 16);
    top.forEach((s, i) => {
      const y = 34 + i * 19;
      ctx.font = `${s === pl || s.elite ? 800 : 500} 12px ${FONT_BODY}`;
      ctx.fillStyle = s === pl ? "#a7f3d0" : s.elite ? "#ffd76a" : "rgba(255,255,255,0.85)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      let x = w - bw;
      ctx.fillText(`${i + 1}.`, x, y);
      x += 16;
      if (s.elite) {
        drawCrown(ctx, x + 7, y + 8, 13);
        x += 17;
        ctx.fillStyle = "#ffd76a";
      }
      ctx.fillText(s.name, x, y);
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(s.len)}`, w - 18, y);
    });
    if (myRank > 5) {
      ctx.textAlign = "right";
      ctx.font = `800 12px ${FONT_BODY}`;
      ctx.fillStyle = "#a7f3d0";
      ctx.fillText(`คุณอันดับ ${myRank} · ${Math.round(pl.len)}`, w - 18, 34 + top.length * 19 + 2);
    }
    // Arrow at the screen edge pointing to an off-screen king snake
    const el = this.elite;
    if (el && el.alive) {
      const ex = (el.segs[0].x - this.camX) * this.zoom + w / 2;
      const ey = (el.segs[0].y - this.camY) * this.zoom + h / 2;
      if (ex < 0 || ex > w || ey < 0 || ey > h) {
        const a = Math.atan2(ey - h / 2, ex - w / 2);
        const m = 30;
        const k = Math.min((w / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (h / 2 - m - 40) / Math.abs(Math.sin(a) || 1e-6));
        const ax = w / 2 + Math.cos(a) * k;
        const ay = h / 2 + 20 + Math.sin(a) * k;
        ctx.save();
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 6);
        glow(ctx, ax, ay, 26, "#ffb020", 0.35);
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.fillStyle = "#ffd76a";
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-6, -9);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-6, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        drawCrown(ctx, ax - Math.cos(a) * 22, ay - Math.sin(a) * 22, 14);
      }
    }
    // Minimap: the whole arena, your view box, every snake
    const mr = 46;
    const mx = 14 + mr;
    const my = h - 14 - mr;
    const ms = mr / ARENA;
    ctx.save();
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
    mg.addColorStop(0, "rgba(10,20,45,0.75)");
    mg.addColorStop(1, "rgba(30,6,24,0.75)");
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,90,140,0.75)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.clip();
    ctx.strokeStyle = "rgba(167,243,208,0.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + (this.camX - w / 2 / this.zoom) * ms, my + (this.camY - h / 2 / this.zoom) * ms, (w / this.zoom) * ms, (h / this.zoom) * ms);
    for (const s of this.snakes) {
      if (!s.alive || s === pl || s.elite) continue;
      ctx.fillStyle = `hsla(${s.hue | 0},90%,65%,0.85)`;
      ctx.fillRect(mx + s.segs[0].x * ms - 1.25, my + s.segs[0].y * ms - 1.25, 2.5, 2.5);
    }
    if (el && el.alive) {
      const ex = mx + el.segs[0].x * ms;
      const ey = my + el.segs[0].y * ms;
      glow(ctx, ex, ey, 9, "#ffb020", 0.6 + 0.3 * Math.sin(this.time * 6));
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, TAU);
      ctx.fill();
    }
    if (pl.alive) {
      const px = mx + pl.segs[0].x * ms;
      const py = my + pl.segs[0].y * ms;
      ctx.fillStyle = "#a7f3d0";
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(pl.dir) * 7, py + Math.sin(pl.dir) * 7);
      ctx.stroke();
    }
    ctx.restore();
    // Boost button
    const b = this.boostBtn;
    const on = pl.boosting && pl.len > 12;
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
      ctx.fillText("แตะค้างแล้วลากเพื่อเลี้ยว · กดปุ่มสายฟ้าเพื่อพุ่ง", w / 2, h - 150);
      ctx.globalAlpha = 1;
    }
  }

  private renderMenu(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // Upgrade buttons under the card
    const ups = this.upgradeBtns;
    const labels: Record<string, string> = { snake_start: "ตัวยาวตั้งต้น", snake_boost: "พลังพุ่ง", snake_magnet: "ดูดแสง" };
    ctx.fillStyle = `rgba(6,8,28,${0.62 * clamp(this.stateT * 3, 0, 1)})`;
    ctx.fillRect(0, h * 0.82, w, h * 0.18 + 1);
    const card = drawCard(ctx, w, h * 0.82, {
      title: this.state === "intro" ? "งูแสงล่าแต้ม" : this.newBest ? "สถิติใหม่!" : "ชนแล้ว!",
      subtitle: this.state === "intro" ? `สนามใหญ่ · บอท ${BOTS} ตัว` : `ยาวสุด ${this.bestLen} · ล้มคู่แข่ง ${this.kills} ตัว`,
      body:
        this.state === "intro"
          ? "แตะค้างแล้วลากไปทางที่จะเลี้ยว กินเม็ดแสงให้ตัวยาว หัวชนตัวงูอื่นจะแพ้ บางเกมมีราชางูสวมมงกุฎโผล่มา ล้มได้รับโบนัส"
          : this.eliteKills
            ? "คุณล้มราชางูได้ สุดยอด!"
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
      u.btn.place(x0 + i * (bw + 8) + bw / 2, y, bw, 44);
      u.btn.render(ctx);
      ctx.font = `600 11px ${FONT_BODY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffd76a";
      ctx.fillText(`อัป ${cost.toLocaleString()} เหรียญ`, x0 + i * (bw + 8) + bw / 2, y + 48);
    });
    ctx.globalAlpha = 1;
    ctx.font = `600 12px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(`มีอยู่ ${wallet.coins().toLocaleString()} เหรียญ`, w / 2, y + 68);
  }
}

const BOT_OPTIONS = [0, -0.5, 0.5, -1, 1, -1.6, 1.6, Math.PI] as const;
const ELITE_OPTIONS = [0, -0.35, 0.35, -0.7, 0.7, -1.1, 1.1, -1.6, 1.6, -2.2, 2.2, Math.PI] as const;
