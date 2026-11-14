// "Fruit Slash" — swipe to slice fruit thrown up from below; avoid the smoke clouds. A 75-second
// round of quick hand movement: it keeps the hands busy (smoking is also a hand habit) and the eyes
// tracking, and it is satisfying for every age.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeSprite, clamp, TAU, FONT_DISPLAY, FONT_BODY, rng, glow } from "./engine/fx";
import { Button, drawCard, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { drawFruit, drawFruitHalf, FRUITS } from "./art/fruits";

const ROUND = 75;

interface Thing {
  kind: number; // fruit index, or -1 for smoke
  gold: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  cut: boolean;
}

interface Half {
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  side: 1 | -1;
  rot: number;
  vr: number;
  life: number;
}

interface Splat {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  seed: number;
}

export const sliceGame: GameDefinition = {
  id: "slice",
  title: "หั่นผลไม้",
  tagline: "ปัดนิ้วหั่นผลไม้ หลบก้อนควัน",
  why: "มือและสายตาได้ขยับไม่หยุด แทนนิสัยมือที่เคยหยิบบุหรี่ หั่นแล้วสะใจ คลายเครียดได้ดี",
  category: "action",
  minutes: "75 วินาที",
  palette: ["#3b2414", "#ff5d73"],
  create: (env) => new SliceGame(env),
};

type State = "intro" | "play" | "over";

class SliceGame implements GameInstance {
  private w = 0;
  private h = 0;
  private things: Thing[] = [];
  private halves: Half[] = [];
  private splats: Splat[] = [];
  private trail: { x: number; y: number; t: number }[] = [];
  private touching = false;
  private sprites: HTMLCanvasElement[] = [];
  private bg: HTMLCanvasElement | null = null;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private timeLeft = ROUND;
  private spawnT = 0;
  private score = 0;
  private best = 0;
  private newBest = false;
  private sliced = 0;
  private smokeHits = 0;
  private bestCombo = 0;
  private swipeCuts: number[] = [];
  private lastSwish = 0;
  private shake = 0;
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มรอบ 75 วินาที", "#ff5d73");
  private againBtn = new Button("เล่นอีกครั้ง", "#ff5d73");
  private rand = rng(Date.now() % 31337);
  private fruitR = 34;

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
  }

  private start() {
    this.things = [];
    this.halves = [];
    this.splats = [];
    this.score = 0;
    this.sliced = 0;
    this.smokeHits = 0;
    this.bestCombo = 0;
    this.newBest = false;
    this.timeLeft = ROUND;
    this.spawnT = 0.6;
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  private launch() {
    const progress = 1 - this.timeLeft / ROUND;
    const n = 1 + Math.floor(this.rand() * (2 + progress * 3));
    const g = this.gravity();
    for (let i = 0; i < n; i++) {
      const smoke = this.rand() < 0.1 + progress * 0.06;
      const x = this.w * (0.15 + this.rand() * 0.7);
      const peak = this.h * (0.15 + this.rand() * 0.35);
      const vy = -Math.sqrt(2 * g * (this.h + 40 - peak));
      const vx = (this.w / 2 - x) * (0.35 + this.rand() * 0.5) + (this.rand() - 0.5) * 80;
      this.things.push({
        kind: smoke ? -1 : Math.floor(this.rand() * FRUITS.length),
        gold: !smoke && this.rand() < 0.05,
        x,
        y: this.h + 40 + i * 12,
        vx,
        vy,
        r: this.fruitR * (smoke ? 0.95 : 1),
        rot: this.rand() * TAU,
        vr: (this.rand() - 0.5) * 4,
        cut: false,
      });
    }
    this.env.sfx.noise({ dur: 0.18, vol: 0.05, freq: 500, sweepTo: 1400, type: "bandpass" });
  }

  private gravity() {
    return this.h * 1.25;
  }

  private cutThing(t: Thing, angle: number) {
    t.cut = true;
    if (t.kind < 0) {
      this.smokeHits++;
      this.score = Math.max(0, this.score - 10);
      this.shake = 12;
      this.floaters.add("ควัน! −10", t.x, t.y - 30, "#c7c7c7", 24);
      this.particles.burst(t.x, t.y, "#9ca3af", 30, { speed: 180, size: 7, gravity: -60, life: 1.2 });
      this.env.sfx.noise({ dur: 0.5, vol: 0.14, freq: 200, type: "lowpass" });
      this.env.sfx.tone({ freq: 110, dur: 0.4, vol: 0.12, type: "sawtooth", glideTo: 60 });
      return;
    }
    const spec = FRUITS[t.kind];
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    for (const side of [1, -1] as const) {
      this.halves.push({ kind: t.kind, x: t.x, y: t.y, vx: t.vx + nx * 90 * side, vy: t.vy * 0.4 + ny * 90 * side, r: t.r, angle, side, rot: 0, vr: side * 3, life: 2.5 });
    }
    this.particles.burst(t.x, t.y, spec.flesh, 14, { speed: 260, size: 4, gravity: this.gravity() * 0.6, life: 0.8 });
    this.particles.burst(t.x, t.y, spec.color, 8, { speed: 200, size: 3, gravity: this.gravity() * 0.6, life: 0.7 });
    this.splats.push({ x: t.x, y: t.y, r: t.r * 1.2, color: spec.flesh, life: 3, seed: this.rand() * 1000 });
    if (this.splats.length > 14) this.splats.shift();
    const pts = t.gold ? 10 : 1;
    this.score += pts;
    this.sliced++;
    if (t.gold) this.floaters.add("ทอง! +10", t.x, t.y - 30, "#ffe066", 24);
    this.swipeCuts.push(this.time);
    this.env.sfx.noise({ dur: 0.12, vol: 0.1, freq: 2500, type: "highpass" });
    this.env.sfx.tone({ freq: pentatonic(4 + (this.swipeCuts.length % 6), 350), dur: 0.15, vol: 0.07 });
  }

  private checkCombo() {
    const recent = this.swipeCuts.filter((t) => this.time - t < 0.3);
    if (recent.length >= 3 && !this.touching) {
      const bonus = recent.length * 2;
      this.score += bonus;
      this.bestCombo = Math.max(this.bestCombo, recent.length);
      this.floaters.add(`คอมโบ ${recent.length}! +${bonus}`, this.w / 2, this.h * 0.3, "#ffe58a", 28, 1.2);
      this.env.sfx.chime(pentatonic(9), 0.1);
      this.swipeCuts = [];
    }
    if (!this.touching) this.swipeCuts = this.swipeCuts.filter((t) => this.time - t < 0.3);
  }

  private end() {
    this.state = "over";
    this.stateT = 0;
    const r = bestScore(this.env.store, "best", this.score);
    this.best = r.best;
    this.newBest = r.isNew;
    [0, 2, 4].forEach((s, i) => this.env.sfx.chime(pentatonic(s + 5), 0.09, i * 0.1));
    this.env.emit({ type: "end", score: this.score, best: this.best, summary: `หั่นไป ${this.sliced} ลูก`, stats: { sliced: this.sliced, combo: this.bestCombo } });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.fruitR = clamp(Math.min(w, h) * 0.085, 24, 48);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const size = this.fruitR * 3;
    this.sprites = FRUITS.map((_, k) =>
      makeSprite(size, size, dpr, (c) => {
        c.translate(size / 2, size / 2);
        drawFruit(c, k, this.fruitR, false);
      })
    );
    this.bg = makeSprite(w, h, dpr, (c) => {
      // Wooden planks
      const r = rng(12);
      const pw = Math.max(60, w / 6);
      for (let x = 0; x < w; x += pw) {
        const base = 0.85 + r() * 0.3;
        const g = c.createLinearGradient(x, 0, x + pw, 0);
        g.addColorStop(0, `rgb(${Math.round(92 * base)},${Math.round(58 * base)},${Math.round(34 * base)})`);
        g.addColorStop(0.5, `rgb(${Math.round(110 * base)},${Math.round(70 * base)},${Math.round(40 * base)})`);
        g.addColorStop(1, `rgb(${Math.round(84 * base)},${Math.round(52 * base)},${Math.round(30 * base)})`);
        c.fillStyle = g;
        c.fillRect(x, 0, pw, h);
        c.strokeStyle = "rgba(40,22,10,0.35)";
        c.lineWidth = 1;
        for (let k = 0; k < 9; k++) {
          const gx = x + r() * pw;
          c.beginPath();
          c.moveTo(gx, 0);
          for (let y = 0; y <= h; y += 20) c.lineTo(gx + Math.sin(y * 0.02 + k) * 4, y);
          c.stroke();
        }
        c.fillStyle = "rgba(0,0,0,0.35)";
        c.fillRect(x + pw - 2, 0, 2, h);
      }
      const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      c.fillStyle = vg;
      c.fillRect(0, 0, w, h);
    });
  }

  pointer(p: PointerInfo) {
    if (this.state !== "play") {
      const btn = this.state === "intro" ? this.startBtn : this.againBtn;
      if (p.type === "down" && btn.hit(p.x, p.y)) btn.pressed = true;
      if (p.type === "up") {
        if (btn.pressed && btn.hit(p.x, p.y) && this.stateT > 0.5) this.start();
        btn.pressed = false;
      }
      return;
    }
    if (p.type === "down") {
      this.touching = true;
      this.trail = [{ x: p.x, y: p.y, t: this.time }];
    } else if (p.type === "move" && this.touching) {
      const last = this.trail[this.trail.length - 1];
      this.trail.push({ x: p.x, y: p.y, t: this.time });
      if (this.trail.length > 24) this.trail.shift();
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const len = Math.hypot(dx, dy);
      if (len < 3) return;
      if (len > 18 && this.time - this.lastSwish > 0.18) {
        this.lastSwish = this.time;
        this.env.sfx.noise({ dur: 0.12, vol: 0.04, freq: 1800, sweepTo: 700 });
      }
      const angle = Math.atan2(dy, dx);
      for (const t of this.things) {
        if (t.cut) continue;
        // Distance from the fruit centre to the swipe segment
        const k = clamp(((t.x - last.x) * dx + (t.y - last.y) * dy) / (len * len), 0, 1);
        const cx = last.x + dx * k;
        const cy = last.y + dy * k;
        if (Math.hypot(t.x - cx, t.y - cy) < t.r * 1.05) this.cutThing(t, angle);
      }
    } else if (p.type === "up" || p.type === "cancel") {
      this.touching = false;
      this.checkCombo();
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
    this.shake = Math.max(0, this.shake - dt * 30);
    this.trail = this.trail.filter((p) => this.time - p.t < 0.14);
    const g = this.gravity();
    for (const t of this.things) {
      t.vy += g * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.rot += t.vr * dt;
    }
    this.things = this.things.filter((t) => !t.cut && t.y < this.h + 80);
    for (const hf of this.halves) {
      hf.vy += g * dt;
      hf.x += hf.vx * dt;
      hf.y += hf.vy * dt;
      hf.rot += hf.vr * dt;
      hf.life -= dt;
    }
    this.halves = this.halves.filter((hf) => hf.life > 0 && hf.y < this.h + 100);
    for (const s of this.splats) s.life -= dt;
    this.splats = this.splats.filter((s) => s.life > 0);
    if (this.state !== "play") {
      // Gentle demo throw behind the cards
      if (this.things.length < 2 && this.rand() < dt * 0.8 && this.w) this.launch();
      return;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.end();
      return;
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.launch();
      const progress = 1 - this.timeLeft / ROUND;
      this.spawnT = 1.5 - progress * 0.7 + this.rand() * 0.5;
    }
    if (!this.touching) this.checkCombo();
  }

  private drawSmoke(c: CanvasRenderingContext2D, r: number) {
    glow(c, 0, 0, r * 1.8, "#6b7280", 0.35);
    const blobs: [number, number, number][] = [[-0.35, 0.1, 0.6], [0.3, 0.15, 0.6], [0, -0.25, 0.65], [-0.1, 0.35, 0.5], [0.35, -0.2, 0.45]];
    for (const [x, y, s] of blobs) {
      const g = c.createRadialGradient(x * r - r * 0.15, y * r - r * 0.15, 0, x * r, y * r, s * r);
      g.addColorStop(0, "#9ca3af");
      g.addColorStop(1, "#374151");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x * r, y * r, s * r, 0, TAU);
      c.fill();
    }
    // Warning mark
    c.strokeStyle = "#fca5a5";
    c.lineWidth = r * 0.12;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-r * 0.25, -r * 0.25);
    c.lineTo(r * 0.25, r * 0.25);
    c.moveTo(r * 0.25, -r * 0.25);
    c.lineTo(-r * 0.25, r * 0.25);
    c.stroke();
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    ctx.save();
    if (this.shake && !this.env.reducedMotion) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    // Juice stains on the board
    for (const s of this.splats) {
      ctx.globalAlpha = Math.min(0.55, s.life * 0.3);
      ctx.fillStyle = s.color;
      const r = rng(Math.floor(s.seed));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.6, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const a = r() * TAU;
        const d = s.r * (0.6 + r() * 0.7);
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, s.r * (0.08 + r() * 0.15), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    const size = this.fruitR * 3;
    for (const t of this.things) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rot);
      if (t.kind < 0) this.drawSmoke(ctx, t.r);
      else {
        if (t.gold) glow(ctx, 0, 0, t.r * 2, "#ffd84d", 0.6);
        ctx.drawImage(this.sprites[t.kind], -size / 2, -size / 2, size, size);
      }
      ctx.restore();
    }
    for (const hf of this.halves) {
      ctx.save();
      ctx.translate(hf.x, hf.y);
      ctx.rotate(hf.rot);
      ctx.globalAlpha = Math.min(1, hf.life * 2);
      drawFruitHalf(ctx, hf.kind, hf.r, hf.angle, hf.side);
      ctx.restore();
    }
    this.particles.render(ctx);
    ctx.restore();

    // Blade trail
    if (this.trail.length > 1) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1];
        const b = this.trail[i];
        const k = i / this.trail.length;
        ctx.strokeStyle = `rgba(200,240,255,${0.35 * k})`;
        ctx.lineWidth = 14 * k;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.95 * k})`;
        ctx.lineWidth = 5 * k;
        ctx.stroke();
      }
      ctx.restore();
    }
    this.floaters.render(ctx);

    // HUD
    if (this.state === "play") {
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.font = `800 34px ${FONT_DISPLAY}`;
      ctx.fillStyle = "#ffe8b0";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 8;
      ctx.fillText(`${this.score}`, 16, 12);
      ctx.textAlign = "right";
      const s = Math.ceil(this.timeLeft);
      ctx.font = `700 22px ${FONT_DISPLAY}`;
      ctx.fillStyle = s <= 10 ? "#ff9b9b" : "#ffffff";
      ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, w - 16, 16);
      ctx.shadowBlur = 0;
      ctx.font = `500 12px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(`สถิติ ${this.best}`, w - 16, 44);
      // Time bar
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(16, h - 10, w - 32, 4);
      ctx.fillStyle = s <= 10 ? "#ff9b9b" : "#ffd27a";
      ctx.fillRect(16, h - 10, (w - 32) * (this.timeLeft / ROUND), 4);
    }

    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "หั่นผลไม้",
        subtitle: "รอบละ 75 วินาที",
        body: "ปัดนิ้วผ่านผลไม้เพื่อหั่น หั่นหลายลูกในครั้งเดียวได้คอมโบ ระวังก้อนควันสีเทา หั่นโดนจะเสียคะแนน",
        accent: "#ff5d73",
        buttons: [this.startBtn],
        appear: this.stateT * 3,
        chips: this.best ? [`สถิติ ${this.best}`] : undefined,
        icon: (c) => {
          c.save();
          c.translate(-30, 4);
          drawFruitHalf(c, 10, 24, 0.5, -1);
          c.translate(10, 10);
          drawFruitHalf(c, 10, 24, 0.5, 1);
          c.restore();
          c.save();
          c.translate(36, 0);
          this.drawSmoke(c, 18);
          c.restore();
        },
      });
    } else if (this.state === "over") {
      drawCard(ctx, w, h, {
        title: this.newBest ? "สถิติใหม่!" : "หมดเวลา",
        subtitle: this.smokeHits ? `โดนควัน ${this.smokeHits} ครั้ง · ในชีวิตจริงก็หลบควันไว้นะ` : "ไม่โดนควันเลย เยี่ยมมาก!",
        bigValue: `${this.score}`,
        bigLabel: "คะแนน",
        chips: [`หั่น ${this.sliced} ลูก`, `คอมโบ ${this.bestCombo}`, `สถิติ ${this.best}`],
        accent: this.newBest ? "#ffc634" : "#ff5d73",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5,
      });
    }
  }
}
