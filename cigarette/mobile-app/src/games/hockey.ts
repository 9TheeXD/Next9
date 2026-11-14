// Air hockey ("แอร์ฮอกกี้"): two people at the two ends of one phone, or you against a bot.
// Each player drags a mallet in their own half; multi-touch so both can play at once.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, clamp, TAU, FONT_DISPLAY, glow, rgba, roundRectPath } from "./engine/fx";
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
  create: (env) => new Hockey(env),
};

const COL = ["#22d3ee", "#f472b6"];
const LV = ["ง่าย", "กลาง", "ยาก", "โหด"];

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
  private serveT = 0;
  private goalT = 0;
  private lastGoal = -1;
  private particles = new Particles();
  private floaters = new Floaters();
  private earned = 0;
  private trail: { x: number; y: number }[] = [];
  private rink = { x: 0, y: 0, w: 0, h: 0, goal: 0 };
  private hitCd = 0;
  private botJitter = { x: 0, y: 0, t: 0 };

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
    for (let i = 0; i < 2; i++) this.aim[i] = { x: this.mallets[i].x, y: this.mallets[i].y };
    this.serveT = 0.6;
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

  private bot(dt: number) {
    const r = this.rink;
    const m = this.mallets[1];
    const p = this.puck;
    const skill = [0.3, 0.55, 0.8, 1][this.level];
    const goal = { x: r.x + r.w / 2, y: r.y };
    const mid = r.y + r.h / 2;
    this.botJitter.t -= dt;
    if (this.botJitter.t <= 0) this.botJitter = { x: (Math.random() - 0.5) * (1 - skill) * 70, y: (Math.random() - 0.5) * (1 - skill) * 40, t: 0.35 };
    let tx: number;
    let ty: number;
    const inMyHalf = p.y < mid;
    const comingAtUs = p.vy < -r.h * 0.4;
    if (inMyHalf && p.y > m.y - m.r * 0.5 && !(comingAtUs && p.y > mid - r.h * 0.12)) {
      // Attack: line up behind the puck and drive through it towards the far goal
      // Aim for the side of the goal the other mallet is not covering
      const other = this.mallets[0];
      const aimX = r.x + r.w / 2 + (other.x < r.x + r.w / 2 ? 1 : -1) * r.goal * (0.2 + 0.2 * skill);
      const ang = Math.atan2(r.y + r.h - p.y, aimX - p.x);
      tx = p.x + Math.cos(ang) * m.r * 0.8;
      ty = p.y + Math.sin(ang) * m.r * 0.8;
    } else if (inMyHalf && p.y <= m.y - m.r * 0.5) {
      // Puck got behind us: swing round it on the side away from our goal mouth
      tx = p.x + (p.x < goal.x ? 1 : -1) * (m.r + p.r) * 1.5;
      ty = p.y - m.r * 0.2;
    } else {
      // Defend: sit on the line from our goal to the puck, predicting where it will cross
      const guardY = r.y + m.r * (1.2 + 0.8 * (1 - skill));
      let px = p.x;
      if (p.vy < 0 && skill > 0.5) {
        const t = (p.y - guardY) / -p.vy;
        px = p.x + p.vx * Math.min(t, 1.2);
        // Fold bounces off the side rails back into the table
        const lo = r.x + p.r;
        const hi = r.x + r.w - p.r;
        const span = hi - lo;
        let q = (px - lo) % (2 * span);
        if (q < 0) q += 2 * span;
        px = lo + (q > span ? 2 * span - q : q);
      }
      const k = (guardY - goal.y) / Math.max(1, p.y - goal.y);
      tx = goal.x + (px - goal.x) * clamp(k * 2.2, 0.3, 1);
      ty = guardY;
    }
    tx += this.botJitter.x;
    ty += this.botJitter.y;
    const maxV = (500 + skill * 1800) * (r.h / 700);
    const dx = tx - m.x;
    const dy = ty - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(maxV, d * 14);
    this.aim[1] = { x: m.x + (dx / d) * sp * dt * 1.5, y: m.y + (dy / d) * sp * dt * 1.5 };
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
      }
      return;
    }
    const steps = 4;
    const dt = dtRaw / steps;
    if (this.mode === "bot") this.bot(dtRaw);
    for (let s = 0; s < steps && this.goalT <= 0; s++) this.physics(dt);
    this.trail.push({ x: this.puck.x, y: this.puck.y });
    if (this.trail.length > 10) this.trail.shift();
  }

  private physics(dt: number) {
    const r = this.rink;
    const p = this.puck;
    this.serveT = Math.max(0, this.serveT - dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    // Mallets follow their target; velocity is what they moved this step
    for (let i = 0; i < 2; i++) {
      const m = this.mallets[i];
      const ox = m.x;
      const oy = m.y;
      const k = Math.min(1, dt * 40);
      m.x += (this.aim[i].x - m.x) * k;
      m.y += (this.aim[i].y - m.y) * k;
      this.clampMallet(i);
      m.vx = (m.x - ox) / dt;
      m.vy = (m.y - oy) / dt;
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

  render() {
    const c = this.env.ctx;
    const { w, h } = this;
    c.fillStyle = "#020617";
    c.fillRect(0, 0, w, h);
    const r = this.rink;
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
    for (let y = r.y + 16; y < r.y + r.h; y += 22) for (let x = r.x + 16 + ((y / 22) % 2) * 11; x < r.x + r.w; x += 22) c.fillRect(x, y, 1.5, 1.5);
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
      this.trail.forEach((t, i) => {
        c.fillStyle = `rgba(255,255,255,${(i / this.trail.length) * 0.15})`;
        c.beginPath();
        c.arc(t.x, t.y, this.puck.r * (i / this.trail.length), 0, TAU);
        c.fill();
      });
      const p = this.puck;
      if (this.goalT <= 0) {
        c.fillStyle = "rgba(0,0,0,0.4)";
        c.beginPath();
        c.arc(p.x + 3, p.y + 4, p.r, 0, TAU);
        c.fill();
        const pg = c.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 1, p.x, p.y, p.r);
        pg.addColorStop(0, "#4b5563");
        pg.addColorStop(1, "#0b0f19");
        c.fillStyle = pg;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, TAU);
        c.fill();
        c.strokeStyle = "#e5e7eb";
        c.lineWidth = 2;
        c.stroke();
      }
      this.mallets.forEach((m, i) => {
        glow(c, m.x, m.y, m.r * 1.8, COL[i], 0.35);
        const mg = c.createRadialGradient(m.x - m.r * 0.3, m.y - m.r * 0.35, 2, m.x, m.y, m.r);
        mg.addColorStop(0, "#ffffff");
        mg.addColorStop(0.35, COL[i]);
        mg.addColorStop(1, rgba(COL[i], 0.7));
        c.fillStyle = mg;
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, TAU);
        c.fill();
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.beginPath();
        c.arc(m.x, m.y, m.r * 0.45, 0, TAU);
        c.fill();
        c.fillStyle = COL[i];
        c.beginPath();
        c.arc(m.x, m.y - 2, m.r * 0.38, 0, TAU);
        c.fill();
      });
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
