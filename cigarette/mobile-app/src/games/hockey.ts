// Air hockey ("แอร์ฮอกกี้"): two people at the two ends of one phone, or you against a bot.
// Each player drags a mallet in their own half; multi-touch so both can play at once.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, clamp, TAU, FONT_DISPLAY, glow, rgba, roundRectPath, makeSprite } from "./engine/fx";
import { renderScale } from "./engine/quality";
import { SetupMenu, OPPONENT_ROW, duelCoins } from "./engine/menu";
import { DuelOver } from "./engine/duel";
import { pentatonic } from "./engine/audio";

export const hockeyGame: GameDefinition = {
  id: "hockey",
  title: "แอร์ฮอกกี้",
  tagline: "ตบลูกเข้าประตู 2 คนเครื่องเดียวหรือสู้บอท",
  why: "เร็ว มันส์ ต้องใช้ทั้งมือทั้งตา เล่นกับเพื่อนแล้วหัวเราะกันลั่น ความอยากหายไปโดยไม่รู้ตัว",
  category: "duel",
  minutes: "2–5 นาที",
  palette: ["#0e7490", "#f0abfc"],
  countdown: true,
  create: (env) => new Hockey(env),
};

const COL = ["#22d3ee", "#f472b6"];
const LV = ["ง่าย", "กลาง", "ยาก", "โหด"];

/** How one computer player plays. Speeds are in table heights per second (table ~700 px tall). */
export interface BotParams {
  speed: number; // top mallet speed
  accel: number; // how fast it reaches that speed
  react: number; // seconds before it sees what the puck did
  think: number; // seconds between decisions
  noise: number; // aim error as a share of the table width
  predict: number; // 0 = chases the puck, 1 = reads bounces and leads it
  aggro: number; // chance to go for a puck in its half rather than stay home
  lapse: number; // chance per decision to misjudge for half a second
  power: number; // share of top speed used when shooting
}

/** ง่าย / กลาง / ยาก / โหด, tuned with the bot-vs-casual-human simulation (see report). */
export const BOT_LEVELS: BotParams[] = [
  { speed: 0.8, accel: 4.5, react: 0.3, think: 0.22, noise: 0.1, predict: 0.15, aggro: 0.55, lapse: 0.08, power: 0.8 },
  { speed: 1.18, accel: 7.5, react: 0.2, think: 0.14, noise: 0.065, predict: 0.55, aggro: 0.7, lapse: 0.045, power: 0.9 },
  { speed: 1.25, accel: 8.5, react: 0.19, think: 0.12, noise: 0.06, predict: 0.68, aggro: 0.8, lapse: 0.022, power: 0.95 },
  { speed: 1.45, accel: 11, react: 0.155, think: 0.09, noise: 0.053, predict: 0.82, aggro: 0.85, lapse: 0.018, power: 1 },
];

/** A casual human (about 200 ms reaction, a so-so aim, not that fast), used only to test balance. */
export const CASUAL_HUMAN: BotParams = { speed: 1.2, accel: 9, react: 0.2, think: 0.12, noise: 0.07, predict: 0.5, aggro: 0.7, lapse: 0.03, power: 0.9 };

interface Snap {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Brain {
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  thinkT: number;
  lapseT: number;
  lapseX: number;
  roll: number;
  idle: number;
  drive: boolean;
}

const newBrain = (): Brain => ({ vx: 0, vy: 0, tx: 0, ty: 0, thinkT: 0, lapseT: 0, lapseX: 0, roll: -1, idle: 0, drive: false });

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

class Hockey implements GameInstance {
  private w = 0;
  private h = 0;
  private state: "menu" | "play" | "over" = "menu";
  private time = 0;
  private menu: SetupMenu;
  private over: DuelOver;
  private mode = "bot";
  private level = 1;
  private target = 7;
  private puck: Body = { x: 0, y: 0, vx: 0, vy: 0, r: 14 };
  private mallets: Body[] = [
    { x: 0, y: 0, vx: 0, vy: 0, r: 26 },
    { x: 0, y: 0, vx: 0, vy: 0, r: 26 },
  ];
  private aim = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  private touch: (number | null)[] = [null, null];
  private score = [0, 0];
  private goalT = 0;
  private lastGoal = -1;
  private particles = new Particles();
  private floaters = new Floaters();
  private earned = 0;
  private trail: { x: number; y: number }[] = [];
  private rink = { x: 0, y: 0, w: 0, h: 0, goal: 0 };
  private hitCd = 0;
  /** Sides moved by a brain (velocity) instead of a finger (aim point). */
  driven = [false, false];
  private brains: Brain[] = [newBrain(), newBrain()];
  private hist: Snap[] = Array.from({ length: 48 }, () => ({ t: -1, x: 0, y: 0, vx: 0, vy: 0 }));
  private histHead = 0;

  constructor(private env: GameEnv) {
    this.menu = new SetupMenu(env, {
      title: "แอร์ฮอกกี้",
      subtitle: "ลากไม้ตีในฝั่งตัวเอง ยิงเข้าประตูฝั่งตรงข้าม",
      accent: "#0891b2",
      rows: [
        OPPONENT_ROW,
        {
          key: "level",
          label: "ความเก่งของบอท",
          choices: LV.map((l, i) => ({ value: `${i}`, label: l })),
          when: (v) => v.mode !== "friend",
        },
        {
          key: "target",
          label: "เล่นถึงกี่แต้ม",
          choices: [
            { value: "5", label: "5" },
            { value: "7", label: "7" },
            { value: "10", label: "10" },
          ],
        },
      ],
      icon: (c) => {
        c.fillStyle = "#111827";
        c.beginPath();
        c.arc(0, 0, 12, 0, TAU);
        c.fill();
        c.strokeStyle = "#e5e7eb";
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = COL[0];
        c.beginPath();
        c.arc(-32, 10, 18, 0, TAU);
        c.fill();
        c.fillStyle = COL[1];
        c.beginPath();
        c.arc(32, -16, 18, 0, TAU);
        c.fill();
      },
    });
    this.over = new DuelOver("#0891b2");
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const pad = 10;
    const rw = w - pad * 2;
    const rh = h - pad * 2;
    this.rink = { x: pad, y: pad, w: rw, h: rh, goal: Math.min(rw * 0.42, 170) };
    const s = Math.min(rw, rh * 0.6);
    this.puck.r = s * 0.045;
    for (const m of this.mallets) m.r = s * 0.08;
    if (this.state === "play") this.clampAll();
  }

  private start() {
    const v = this.menu.values;
    this.mode = v.mode;
    this.level = +v.level || 0;
    this.target = +v.target || 7;
    this.score = [0, 0];
    this.driven = [false, this.mode === "bot"];
    this.state = "play";
    this.resetRound(Math.random() < 0.5 ? 0 : 1);
    this.env.emit({ type: "start" });
  }

  /** Put the puck on the side of `toward` (the one who conceded serves). */
  private resetRound(toward: number) {
    const r = this.rink;
    this.puck.x = r.x + r.w / 2;
    this.puck.y = r.y + r.h / 2 + (toward === 0 ? 1 : -1) * r.h * 0.12;
    this.puck.vx = 0;
    this.puck.vy = 0;
    this.mallets[0].x = r.x + r.w / 2;
    this.mallets[0].y = r.y + r.h * 0.85;
    this.mallets[1].x = r.x + r.w / 2;
    this.mallets[1].y = r.y + r.h * 0.15;
    for (let i = 0; i < 2; i++) {
      this.aim[i] = { x: this.mallets[i].x, y: this.mallets[i].y };
      this.mallets[i].vx = this.mallets[i].vy = 0;
      this.brains[i] = newBrain();
      this.brains[i].tx = this.mallets[i].x;
      this.brains[i].ty = this.mallets[i].y;
    }
    for (const s of this.hist) s.t = -1;
    this.trail = [];
  }

  pointer(p: PointerInfo) {
    if (this.state === "menu") {
      if (this.menu.pointer(p)) this.start();
      return;
    }
    if (this.state === "over") {
      const a = this.over.pointer(p.type, p.x, p.y);
      if (a === "again") this.start();
      if (a === "setup") {
        this.state = "menu";
        this.menu.reset();
      }
      return;
    }
    const r = this.rink;
    if (p.type === "down") {
      // Small menu button on the centre line
      if (Math.hypot(p.x - (r.x + 22), p.y - (r.y + r.h / 2)) < 20) {
        this.state = "menu";
        this.menu.reset();
        return;
      }
      const side = p.y > r.y + r.h / 2 ? 0 : 1;
      if (side === 1 && this.mode === "bot") return;
      if (this.touch[side] === null) this.touch[side] = p.id;
    }
    for (const side of [0, 1]) {
      if (this.touch[side] !== p.id) continue;
      if (p.type === "up" || p.type === "cancel") this.touch[side] = null;
      else {
        // Mallet sits a little above the finger so it is not hidden under it
        const off = this.mallets[side].r * 0.6 * (side === 0 ? -1 : 1);
        this.aim[side] = { x: p.x, y: p.y + off };
      }
    }
  }

  key(code: string, down: boolean) {
    if (down && this.state === "menu" && this.menu.key(code)) {
      this.start();
      return true;
    }
    return false;
  }

  private clampMallet(i: number) {
    const r = this.rink;
    const m = this.mallets[i];
    m.x = clamp(m.x, r.x + m.r, r.x + r.w - m.r);
    const mid = r.y + r.h / 2;
    if (i === 0) m.y = clamp(m.y, mid + m.r, r.y + r.h - m.r);
    else m.y = clamp(m.y, r.y + m.r, mid - m.r);
  }

  private clampAll() {
    this.clampMallet(0);
    this.clampMallet(1);
  }

  /** Puck as a player saw it `delay` seconds ago (reaction time). */
  private perceive(delay: number): Snap {
    const want = this.time - delay;
    const n = this.hist.length;
    let best = this.hist[(this.histHead + n - 1) % n];
    for (let k = 1; k <= n; k++) {
      const s = this.hist[(this.histHead + n - k) % n];
      if (s.t < 0) break;
      best = s;
      if (s.t <= want) break;
    }
    return best;
  }

  /**
   * Computer player for one side. It only sees the puck after its reaction delay, decides a few
   * times a second, aims with an error, and moves its mallet with a speed and acceleration limit.
   * Everything that makes a level easy or hard is in BOT_LEVELS. Side 1 is the top (the bot);
   * the balance simulation also drives side 0 with CASUAL_HUMAN.
   */
  brain(side: number, P: BotParams, dt: number) {
    const r = this.rink;
    const m = this.mallets[side];
    const b = this.brains[side];
    const H = r.h / 700; // all speeds are tuned for a 700 px tall table
    // Mirror so that, seen from this side, our own goal is at the top (y = r.y).
    const fy = (y: number) => (side === 1 ? y : 2 * r.y + r.h - y);
    const mid = r.y + r.h / 2;
    const gc = r.x + r.w / 2;
    b.thinkT -= dt;
    b.lapseT -= dt;
    if (b.thinkT <= 0) {
      b.thinkT = P.think * (0.8 + Math.random() * 0.4);
      const s = this.perceive(P.react);
      const lead = P.react * P.predict; // a skilled player makes up for its own delay
      const svy = side === 1 ? s.vy : -s.vy;
      const px = clamp(s.x + s.vx * lead, r.x, r.x + r.w);
      const py = clamp(fy(s.y) + svy * lead, r.y, r.y + r.h);
      const my = fy(m.y);
      const slow = Math.hypot(s.vx, s.vy) < r.h * 0.18;
      const inMine = py < mid;
      if (!inMine) b.roll = -1;
      else if (b.roll < 0) b.roll = Math.random() < P.aggro ? 1 : 0;
      if (inMine && slow) b.idle += P.think;
      else b.idle = 0;
      if (Math.random() < P.lapse) {
        b.lapseT = 0.45 + Math.random() * 0.5;
        b.lapseX = (Math.random() - 0.5) * r.w * 0.55;
      }
      const err = (Math.random() + Math.random() - 1) * P.noise * r.w;
      const comingAtUs = svy < -r.h * 0.45 && py > mid - r.h * 0.15;
      const attack = inMine && (b.roll === 1 || b.idle > 0.9) && !comingAtUs;
      let tx: number;
      let ty: number;
      b.drive = false;
      const pinned = inMine && (py - r.y < m.r * 1.15 || b.idle > 2.4);
      if (pinned) {
        // Puck stuck in our corner or sitting still too long: jab straight at it to free it
        const jx = px - m.x;
        const jy = py - my;
        const jd = Math.hypot(jx, jy) || 1;
        tx = px + (jx / jd) * m.r;
        ty = py + (jy / jd) * m.r;
        b.drive = jd < m.r * 4;
      } else if (attack && py > my - m.r * 0.4) {
        // Shoot: aim beside the opponent's mallet, line up behind the puck, then drive through it
        const other = this.mallets[1 - side];
        const aimX = gc + (other.x < gc ? 1 : -1) * r.goal * (0.12 + 0.25 * P.predict) + err * 2;
        const ang = Math.atan2(r.y + r.h - py, aimX - px);
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const behind = (m.x - px) * ux + (my - py) * uy; // < 0: mallet is behind the puck
        const side2 = Math.abs((m.x - px) * -uy + (my - py) * ux);
        if (behind < -(m.r + this.puck.r) * 0.6 && side2 < m.r * 1.1) {
          tx = px + ux * m.r * 2.2;
          ty = py + uy * m.r * 2.2;
          b.drive = true;
        } else {
          tx = px - ux * (m.r + this.puck.r) * 1.25;
          ty = py - uy * (m.r + this.puck.r) * 1.25;
        }
      } else if (inMine && py <= my - m.r * 0.4) {
        // Puck got behind us: swing round it on the side away from our goal mouth
        tx = px + (px < gc ? 1 : -1) * (m.r + this.puck.r) * 1.6;
        ty = py - m.r * 0.3;
      } else {
        // Guard: stand on the line from our goal to where the puck will cross
        const guardY = r.y + m.r * (1.3 + 0.7 * (1 - P.predict));
        let cx = px;
        if (svy < 0) {
          const t = (py - guardY) / -svy;
          let q = px + s.vx * Math.min(t, 1.4) - (r.x + this.puck.r);
          const span = r.w - this.puck.r * 2;
          q = ((q % (2 * span)) + 2 * span) % (2 * span);
          const folded = r.x + this.puck.r + (q > span ? 2 * span - q : q);
          cx = px + (folded - px) * P.predict;
        }
        const k = (guardY - r.y) / Math.max(1, py - r.y);
        tx = gc + (cx - gc) * clamp(k * 2.2, 0.3, 1);
        ty = guardY;
      }
      tx += err;
      if (b.lapseT > 0) tx += b.lapseX;
      b.tx = clamp(tx, r.x + m.r, r.x + r.w - m.r);
      b.ty = fy(ty);
    }
    // Move towards the target with limited speed and acceleration
    const maxV = P.speed * 700 * H;
    const acc = P.accel * 700 * H;
    const dx = b.tx - m.x;
    const dy = b.ty - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = b.drive ? maxV * P.power : Math.min(maxV, d * 9);
    let ax = (dx / d) * want - b.vx;
    let ay = (dy / d) * want - b.vy;
    const dv = Math.hypot(ax, ay);
    if (dv > acc * dt) {
      ax *= (acc * dt) / dv;
      ay *= (acc * dt) / dv;
    }
    b.vx += ax;
    b.vy += ay;
  }

  update(dtRaw: number) {
    this.time += dtRaw;
    this.particles.update(dtRaw);
    this.floaters.update(dtRaw);
    if (this.state === "menu") this.menu.update(dtRaw);
    if (this.state === "over") this.over.update(dtRaw);
    if (this.state !== "play") return;
    if (this.goalT > 0) {
      this.goalT -= dtRaw;
      if (this.goalT <= 0) {
        if (this.score[0] >= this.target || this.score[1] >= this.target) return this.finish();
        this.resetRound(this.lastGoal === 0 ? 1 : 0);
        // Count down before the next serve so nobody is caught off guard
        const near = Math.max(this.score[0], this.score[1]) === this.target - 1;
        this.env.countdown(3, `${this.score[0]} – ${this.score[1]}${near ? " · แต้มชี้ขาด" : " · ลูกต่อไป"}`);
      }
      return;
    }
    const steps = 4;
    const dt = dtRaw / steps;
    const snap = this.hist[this.histHead];
    snap.t = this.time;
    snap.x = this.puck.x;
    snap.y = this.puck.y;
    snap.vx = this.puck.vx;
    snap.vy = this.puck.vy;
    this.histHead = (this.histHead + 1) % this.hist.length;
    if (this.mode === "bot") this.brain(1, BOT_LEVELS[this.level] || BOT_LEVELS[0], dtRaw);
    for (let s = 0; s < steps && this.goalT <= 0; s++) this.physics(dt);
    this.trail.push({ x: this.puck.x, y: this.puck.y });
    if (this.trail.length > 10) this.trail.shift();
  }

  private physics(dt: number) {
    const r = this.rink;
    const p = this.puck;
    this.hitCd = Math.max(0, this.hitCd - dt);
    // Mallets follow their target; velocity is what they moved this step
    for (let i = 0; i < 2; i++) {
      const m = this.mallets[i];
      const ox = m.x;
      const oy = m.y;
      if (this.driven[i]) {
        m.x += this.brains[i].vx * dt;
        m.y += this.brains[i].vy * dt;
      } else {
        const k = Math.min(1, dt * 40);
        m.x += (this.aim[i].x - m.x) * k;
        m.y += (this.aim[i].y - m.y) * k;
      }
      this.clampMallet(i);
      m.vx = (m.x - ox) / dt;
      m.vy = (m.y - oy) / dt;
      if (this.driven[i]) {
        // A wall or the centre line stops the mallet
        this.brains[i].vx = m.vx;
        this.brains[i].vy = m.vy;
      }
    }
    // Puck
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const fr = Math.pow(0.55, dt);
    p.vx *= fr;
    p.vy *= fr;
    const maxV = r.h * 2.1;
    const v = Math.hypot(p.vx, p.vy);
    if (v > maxV) {
      p.vx *= maxV / v;
      p.vy *= maxV / v;
    }
    const gl = r.x + r.w / 2 - r.goal / 2;
    const gr = r.x + r.w / 2 + r.goal / 2;
    if (p.x - p.r < r.x) {
      p.x = r.x + p.r;
      p.vx = Math.abs(p.vx) * 0.92;
      this.wallHit();
    }
    if (p.x + p.r > r.x + r.w) {
      p.x = r.x + r.w - p.r;
      p.vx = -Math.abs(p.vx) * 0.92;
      this.wallHit();
    }
    const inGoalX = p.x > gl + p.r * 0.3 && p.x < gr - p.r * 0.3;
    if (p.y - p.r < r.y) {
      if (inGoalX) {
        if (p.y < r.y - p.r) return this.goal(0);
      } else {
        p.y = r.y + p.r;
        p.vy = Math.abs(p.vy) * 0.92;
        this.wallHit();
      }
    }
    if (p.y + p.r > r.y + r.h) {
      if (inGoalX) {
        if (p.y > r.y + r.h + p.r) return this.goal(1);
      } else {
        p.y = r.y + r.h - p.r;
        p.vy = -Math.abs(p.vy) * 0.92;
        this.wallHit();
      }
    }
    // Mallet collisions
    for (const m of this.mallets) {
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const d = Math.hypot(dx, dy);
      const min = p.r + m.r;
      if (d < min && d > 0) {
        const nx = dx / d;
        const ny = dy / d;
        p.x = m.x + nx * min;
        p.y = m.y + ny * min;
        const rvx = p.vx - m.vx;
        const rvy = p.vy - m.vy;
        const dot = rvx * nx + rvy * ny;
        if (dot < 0) {
          p.vx -= 1.85 * dot * nx;
          p.vy -= 1.85 * dot * ny;
          if (this.hitCd <= 0) {
            const power = Math.min(1, Math.abs(dot) / (r.h * 2));
            this.env.sfx.tone({ freq: 300 + power * 400, dur: 0.05, vol: 0.06 + power * 0.08, type: "triangle" });
            this.particles.burst(p.x - nx * p.r, p.y - ny * p.r, "#ffffff", 4 + Math.round(power * 10), { speed: 120 + power * 200, size: 2, life: 0.3 });
            this.hitCd = 0.06;
          }
        }
        // A mallet must not push the puck through a rail. If the puck is wedged between the two,
        // keep it on the table and let it squirt out towards the middle instead of sticking.
        const inMouth = Math.abs(p.x - (r.x + r.w / 2)) < r.goal / 2 - p.r * 0.3;
        const cx = clamp(p.x, r.x + p.r, r.x + r.w - p.r);
        const cy = inMouth ? p.y : clamp(p.y, r.y + p.r, r.y + r.h - p.r);
        if (cx !== p.x || cy !== p.y) {
          p.x = cx;
          p.y = cy;
          const kx = r.x + r.w / 2 - p.x;
          const ky = r.y + r.h / 2 - p.y;
          const kd = Math.hypot(kx, ky) || 1;
          const kick = r.h * 0.7;
          if (Math.hypot(p.vx, p.vy) < kick) {
            p.vx = (kx / kd) * kick;
            p.vy = (ky / kd) * kick;
          }
        }
      }
    }
  }

  private wallHit() {
    if (this.hitCd > 0) return;
    this.hitCd = 0.05;
    this.env.sfx.tone({ freq: 180, dur: 0.04, vol: 0.05, type: "square" });
  }

  private goal(scorer: number) {
    this.score[scorer]++;
    this.lastGoal = scorer;
    this.goalT = 1.3;
    const r = this.rink;
    const y = scorer === 0 ? r.y : r.y + r.h;
    this.particles.burst(r.x + r.w / 2, y, COL[scorer], 50, { speed: 320, size: 3.5, gravity: 0, life: 1 });
    [0, 3, 5].forEach((s, k) => this.env.sfx.chime(pentatonic(s + 5), 0.1, k * 0.08));
    this.puck.vx = 0;
    this.puck.vy = 0;
  }

  private finish() {
    this.state = "over";
    this.over.t = 0;
    const win = this.score[0] > this.score[1] ? 0 : 1;
    const res = this.mode === "friend" || win === 0 ? "win" : "lose";
    this.earned = duelCoins(this.mode, this.level, res);
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: this.score[0],
      best: 0,
      summary: `แอร์ฮอกกี้ ${this.score[0]}–${this.score[1]}${this.mode === "bot" ? ` (บอท${LV[this.level]})` : ""}`,
      stats: { you: this.score[0], them: this.score[1], level: this.level },
    });
  }

  /** Static table (background, air holes, lines, goals, rail) and the puck/mallet looks, cached at canvas resolution. */
  private sprites: { key: string; ds: number; table: HTMLCanvasElement; puck: HTMLCanvasElement; mallets: HTMLCanvasElement[] } | null = null;

  private getSprites(c: CanvasRenderingContext2D) {
    const { w, h } = this;
    // The canvas' own pixel ratio (normally renderScale()), so the table can be copied 1:1.
    const ds = c.canvas.width / w || renderScale();
    const pr = this.puck.r;
    const mr = this.mallets[0].r;
    const key = `${w}x${h}@${ds}/${renderScale()}:${pr}:${mr}`;
    if (this.sprites && this.sprites.key === key) return this.sprites;
    const r = this.rink;
    const table = makeSprite(w, h, ds, (c) => {
      c.fillStyle = "#020617";
      c.fillRect(0, 0, w, h);
      // Table
      const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, "#0b1d33");
      g.addColorStop(0.5, "#0f2a47");
      g.addColorStop(1, "#0b1d33");
      c.fillStyle = g;
      roundRectPath(c, r.x, r.y, r.w, r.h, 26);
      c.fill();
      // Air holes
      c.fillStyle = "rgba(255,255,255,0.05)";
      c.beginPath();
      for (let y = r.y + 16; y < r.y + r.h; y += 22) for (let x = r.x + 16 + ((y / 22) % 2) * 11; x < r.x + r.w; x += 22) c.rect(x, y, 1.5, 1.5);
      c.fill();
      // Lines
      c.strokeStyle = "rgba(244,114,182,0.5)";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(r.x, r.y + r.h / 2);
      c.lineTo(r.x + r.w, r.y + r.h / 2);
      c.stroke();
      c.strokeStyle = "rgba(34,211,238,0.35)";
      c.beginPath();
      c.arc(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.17, 0, TAU);
      c.stroke();
      for (const [side, y] of [
        [1, r.y],
        [0, r.y + r.h],
      ] as const) {
        c.strokeStyle = rgba(COL[side], 0.45);
        c.beginPath();
        c.arc(r.x + r.w / 2, y, r.goal * 0.62, side === 1 ? 0 : Math.PI, side === 1 ? Math.PI : TAU);
        c.stroke();
        // Goal mouth
        c.fillStyle = "#000";
        c.fillRect(r.x + r.w / 2 - r.goal / 2, side === 1 ? r.y - 6 : r.y + r.h - 2, r.goal, 8);
        glow(c, r.x + r.w / 2, y, r.goal * 0.5, COL[side], 0.25);
      }
      // Rail glow
      c.strokeStyle = "rgba(148,163,255,0.5)";
      c.lineWidth = 3;
      roundRectPath(c, r.x, r.y, r.w, r.h, 26);
      c.stroke();
    });
    const ph = pr + 6;
    const puck = makeSprite(ph * 2, ph * 2, ds, (c) => {
      c.translate(ph, ph);
      c.fillStyle = "rgba(0,0,0,0.4)";
      c.beginPath();
      c.arc(3, 4, pr, 0, TAU);
      c.fill();
      const pg = c.createRadialGradient(-pr * 0.3, -pr * 0.3, 1, 0, 0, pr);
      pg.addColorStop(0, "#4b5563");
      pg.addColorStop(1, "#0b0f19");
      c.fillStyle = pg;
      c.beginPath();
      c.arc(0, 0, pr, 0, TAU);
      c.fill();
      c.strokeStyle = "#e5e7eb";
      c.lineWidth = 2;
      c.stroke();
    });
    const mh = mr * 1.8;
    const mallets = COL.map((col) =>
      makeSprite(mh * 2, mh * 2, ds, (c) => {
        c.translate(mh, mh);
        glow(c, 0, 0, mr * 1.8, col, 0.35);
        const mg = c.createRadialGradient(-mr * 0.3, -mr * 0.35, 2, 0, 0, mr);
        mg.addColorStop(0, "#ffffff");
        mg.addColorStop(0.35, col);
        mg.addColorStop(1, rgba(col, 0.7));
        c.fillStyle = mg;
        c.beginPath();
        c.arc(0, 0, mr, 0, TAU);
        c.fill();
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.beginPath();
        c.arc(0, 0, mr * 0.45, 0, TAU);
        c.fill();
        c.fillStyle = col;
        c.beginPath();
        c.arc(0, -2, mr * 0.38, 0, TAU);
        c.fill();
      })
    );
    this.sprites = { key, ds, table, puck, mallets };
    return this.sprites;
  }

  render() {
    const c = this.env.ctx;
    const { w, h } = this;
    const r = this.rink;
    const sp = this.getSprites(c);
    if (sp.table.width === c.canvas.width && sp.table.height === c.canvas.height) {
      // 1:1 device-pixel copy (no resampling) is much cheaper than a scaled blit.
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(sp.table, 0, 0);
      c.restore();
    } else c.drawImage(sp.table, 0, 0, w, h);

    // Scores along the centre line, one facing each player
    c.font = `800 34px ${FONT_DISPLAY}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = rgba(COL[0], 0.5);
    c.fillText(`${this.score[0]}`, r.x + r.w - 34, r.y + r.h / 2 + 30);
    c.save();
    c.translate(r.x + r.w - 34, r.y + r.h / 2 - 30);
    c.rotate(this.mode === "friend" ? Math.PI : 0);
    c.fillStyle = rgba(COL[1], 0.5);
    c.fillText(`${this.score[1]}`, 0, 0);
    c.restore();

    if (this.state !== "menu") {
      // Puck trail
      const tl = this.trail.length;
      c.fillStyle = "#ffffff";
      for (let i = 0; i < tl; i++) {
        const t = this.trail[i];
        c.globalAlpha = (i / tl) * 0.15;
        c.beginPath();
        c.arc(t.x, t.y, this.puck.r * (i / tl), 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
      const p = this.puck;
      if (this.goalT <= 0) {
        const pw = sp.puck.width / sp.ds;
        c.drawImage(sp.puck, p.x - pw / 2, p.y - pw / 2, pw, pw);
      }
      for (let i = 0; i < this.mallets.length; i++) {
        const m = this.mallets[i];
        const mw = sp.mallets[i].width / sp.ds;
        c.drawImage(sp.mallets[i], m.x - mw / 2, m.y - mw / 2, mw, mw);
      }
      if (this.goalT > 0) {
        const msg = this.mode === "friend" ? (this.lastGoal === 0 ? "ฟ้าได้ประตู!" : "ชมพูได้ประตู!") : this.lastGoal === 0 ? "ประตู!" : "บอทยิงเข้า";
        c.font = `800 30px ${FONT_DISPLAY}`;
        c.lineWidth = 6;
        c.strokeStyle = "rgba(0,0,0,0.6)";
        for (const flip of this.mode === "friend" ? [false, true] : [false]) {
          c.save();
          c.translate(r.x + r.w / 2, r.y + r.h / 2 + (flip ? -50 : 50));
          if (flip) c.rotate(Math.PI);
          c.strokeText(msg, 0, 0);
          c.fillStyle = COL[this.lastGoal];
          c.fillText(msg, 0, 0);
          c.restore();
        }
      }
      if (this.state === "play" && this.time < 4 && this.score[0] + this.score[1] === 0) {
        c.font = `600 14px ${FONT_DISPLAY}`;
        c.fillStyle = "rgba(255,255,255,0.7)";
        c.fillText("ลากนิ้วในครึ่งของตัวเองเพื่อขยับไม้ตี", r.x + r.w / 2, r.y + r.h * 0.68);
      }
      // Leave button
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.beginPath();
      c.arc(r.x + 22, r.y + r.h / 2, 15, 0, TAU);
      c.fill();
      c.strokeStyle = "#ffffff";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(r.x + 16, r.y + r.h / 2 - 5);
      c.lineTo(r.x + 28, r.y + r.h / 2 - 5);
      c.moveTo(r.x + 16, r.y + r.h / 2);
      c.lineTo(r.x + 28, r.y + r.h / 2);
      c.moveTo(r.x + 16, r.y + r.h / 2 + 5);
      c.lineTo(r.x + 28, r.y + r.h / 2 + 5);
      c.stroke();
    }
    this.particles.render(c);
    this.floaters.render(c);
    if (this.state === "menu") this.menu.render(c, w, h);
    if (this.state === "over") {
      const win = this.score[0] > this.score[1] ? 0 : 1;
      this.over.render(c, w, h, {
        title: this.mode === "friend" ? (win === 0 ? "ฝั่งฟ้าชนะ!" : "ฝั่งชมพูชนะ!") : win === 0 ? "คุณชนะ!" : "บอทชนะ",
        subtitle: `${this.score[0]} – ${this.score[1]}`,
        coins: this.earned,
        chips: [this.mode === "bot" ? `บอท${LV[this.level]}` : "โหมดเพื่อน", `ถึง ${this.target} แต้ม`],
        accent: "#0891b2",
      });
    }
  }
}
