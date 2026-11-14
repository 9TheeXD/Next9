// "Star Path" — watch stars light up in order, then tap them back. Holding a growing sequence in
// visual working memory leaves little room for the vivid images a craving is built on
// (elaborated intrusion theory; Kavanagh, Andrade & May 2005).

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeStars, drawStars, rgba, makeSprite, clamp, ease, TAU, FONT_DISPLAY, FONT_BODY, glow, rng, type Star } from "./engine/fx";
import { Button, drawCard, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";

const STAR_COLORS = ["#ffd66b", "#7ad8ff", "#ff8fd0", "#a6ff9e", "#c7a2ff", "#ffb27a", "#8ff5ff", "#ff9b9b"];

interface Node {
  x: number; // normalised 0..1 inside the play area
  y: number;
  color: string;
  note: number;
  lit: number; // 0..1 brightness boost
  twinkle: number;
}

interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export const starsGame: GameDefinition = {
  id: "stars",
  title: "เส้นทางดวงดาว",
  tagline: "จำลำดับดาวที่สว่าง แล้วแตะตาม",
  why: "การจำลำดับภาพต้องใช้ความจำส่วนเดียวกับที่ความอยากใช้สร้างภาพบุหรี่ในหัว พอสมองไม่ว่าง ความอยากก็จางลง",
  minutes: "2–4 นาที",
  palette: ["#0e1440", "#c7a2ff"],
  create: (env) => new StarsGame(env),
};

type State = "intro" | "show" | "input" | "pause" | "over";

class StarsGame implements GameInstance {
  private w = 0;
  private h = 0;
  private area = { x: 0, y: 0, w: 0, h: 0 };
  private bg: HTMLCanvasElement | null = null;
  private stars: Star[] = makeStars(220, 21);
  private nodes: Node[] = [];
  private seq: number[] = [];
  private showIdx = 0;
  private showT = 0;
  private inputIdx = 0;
  private lives = 3;
  private round = 0;
  private best = 0;
  private newBest = false;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private pauseNext: State = "show";
  private message = "";
  private lines: [number, number][] = [];
  private shake = 0;
  private particles = new Particles();
  private floaters = new Floaters();
  private shooting: Shooting[] = [];
  private startBtn = new Button("เริ่มเลย", "#8b6cff");
  private againBtn = new Button("เล่นอีกครั้ง", "#8b6cff");
  private rand = rng(Date.now() % 100000);
  private celebrate = 0;

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    this.layout(7);
  }

  /** Places n stars on a loose ring with jitter, kept apart so each is easy to tap. */
  private layout(n: number) {
    const r = rng(Math.floor(this.rand() * 1e6));
    const nodes: Node[] = [];
    let guard = 0;
    while (nodes.length < n && guard++ < 2000) {
      const a = (nodes.length / n) * TAU + (r() - 0.5) * 0.6;
      const rad = 0.28 + r() * 0.17;
      const x = 0.5 + Math.cos(a) * rad;
      const y = 0.5 + Math.sin(a) * rad * 1.1;
      if (nodes.some((o) => Math.hypot(o.x - x, (o.y - y) * 1.3) < 0.2)) continue;
      nodes.push({ x, y, color: STAR_COLORS[nodes.length % STAR_COLORS.length], note: nodes.length, lit: 0, twinkle: r() * TAU });
    }
    // Sort by angle so notes rise around the ring
    this.nodes = nodes;
  }

  private pos(i: number) {
    const n = this.nodes[i];
    return { x: this.area.x + n.x * this.area.w, y: this.area.y + n.y * this.area.h };
  }

  private nodeRadius() {
    return clamp(Math.min(this.area.w, this.area.h) * 0.055, 14, 30);
  }

  private start() {
    this.lives = 3;
    this.round = 0;
    this.seq = [];
    this.newBest = false;
    this.layout(7);
    this.nextRound();
    this.env.emit({ type: "start" });
  }

  private nextRound(): void {
    this.round++;
    let next: number;
    do {
      next = Math.floor(this.rand() * this.nodes.length);
    } while (this.seq.length && next === this.seq[this.seq.length - 1]);
    this.seq.push(next);
    if (this.seq.length < 3) return this.nextRound();
    this.beginShow(0.9);
  }

  private beginShow(delay: number) {
    this.lines = [];
    this.showIdx = -1;
    this.showT = -delay;
    this.inputIdx = 0;
    this.state = "show";
    this.stateT = 0;
    this.message = "ดูให้ดี…";
  }

  private stepTime() {
    // A little faster as the sequence grows, never rushed
    return clamp(0.78 - this.seq.length * 0.025, 0.48, 0.78);
  }

  private light(i: number) {
    const n = this.nodes[i];
    n.lit = 1;
    const p = this.pos(i);
    this.env.sfx.chime(pentatonic(n.note + 2, 330), 0.13);
    this.particles.burst(p.x, p.y, n.color, 10, { speed: 90, size: 2.2, gravity: 0, life: 0.7 });
    this.particles.ring(p.x, p.y, n.color, this.nodeRadius() * 2.4, 0.6);
  }

  private tap(i: number) {
    const expected = this.seq[this.inputIdx];
    if (i === expected) {
      this.light(i);
      if (this.inputIdx > 0) this.lines.push([this.seq[this.inputIdx - 1], i]);
      this.inputIdx++;
      if (this.inputIdx >= this.seq.length) {
        // Round complete
        this.celebrate = 1;
        this.env.emit({ type: "score", score: this.seq.length });
        const words = ["เยี่ยม!", "ความจำดีมาก", "สวยงาม!", "แม่นยำ!"];
        this.floaters.add(words[this.round % words.length], this.w / 2, this.area.y + this.area.h / 2, "#ffffff", 26);
        for (const idx of new Set(this.seq)) {
          const p = this.pos(idx);
          this.particles.burst(p.x, p.y, this.nodes[idx].color, 8, { speed: 140, size: 2.5, gravity: 30, life: 1 });
        }
        [0, 2, 4].forEach((s, k) => this.env.sfx.chime(pentatonic(s + 7, 330), 0.08, 0.15 + k * 0.08));
        this.state = "pause";
        this.stateT = 0;
        this.pauseNext = "show";
        this.message = `ครบ ${this.seq.length} ดวง`;
      } else {
        this.message = `แตะตามลำดับ ${this.inputIdx}/${this.seq.length}`;
      }
    } else {
      this.lives--;
      this.shake = 10;
      const p = this.pos(i);
      this.particles.burst(p.x, p.y, "#ff7b7b", 8, { speed: 80, size: 2, gravity: 0, life: 0.5 });
      this.env.sfx.tone({ freq: 220, dur: 0.35, vol: 0.08, type: "triangle", glideTo: 150 });
      if (this.lives <= 0) {
        this.end();
      } else {
        this.message = "ไม่เป็นไร ดูอีกรอบนะ";
        this.state = "pause";
        this.stateT = 0;
        this.pauseNext = "input"; // replays the same sequence
      }
    }
  }

  private end() {
    const reached = Math.max(0, this.seq.length - 1);
    const r = bestScore(this.env.store, "best", reached);
    this.best = r.best;
    this.newBest = r.isNew;
    this.state = "over";
    this.stateT = 0;
    this.env.emit({
      type: "end",
      score: reached,
      best: this.best,
      summary: `จำได้ยาวสุด ${reached} ดวง`,
      stats: { longest: reached, rounds: this.round },
    });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 110;
    const bottom = 70;
    const size = Math.min(w - 32, h - top - bottom);
    this.area = { x: (w - size) / 2, y: top + (h - top - bottom - size) / 2, w: size, h: size };
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#050822");
      g.addColorStop(0.5, "#0d1240");
      g.addColorStop(1, "#1a0d38");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const r = rng(77);
      const blobs: [string, number][] = [["#5b3cff", 0.5], ["#ff4fb0", 0.35], ["#1fb5ff", 0.4], ["#7b2cff", 0.45], ["#ff8a4f", 0.2]];
      for (const [col, a] of blobs) {
        for (let k = 0; k < 5; k++) {
          const x = w * (0.2 + r() * 0.6) + (r() - 0.5) * w * 0.3;
          const y = h * (0.15 + r() * 0.7);
          const rad = Math.max(w, h) * (0.12 + r() * 0.22);
          const rg = c.createRadialGradient(x, y, 0, x, y, rad);
          rg.addColorStop(0, rgba(col, a * 0.22));
          rg.addColorStop(1, rgba(col, 0));
          c.fillStyle = rg;
          c.fillRect(0, 0, w, h);
        }
      }
      // Dust
      for (let i = 0; i < 1400; i++) {
        c.fillStyle = `rgba(255,255,255,${r() * 0.12})`;
        c.fillRect(r() * w, r() * h, 1, 1);
      }
    });
  }

  pointer(p: PointerInfo) {
    if (this.state === "intro" || this.state === "over") {
      const btn = this.state === "intro" ? this.startBtn : this.againBtn;
      if (p.type === "down" && btn.hit(p.x, p.y)) btn.pressed = true;
      if (p.type === "up") {
        if (btn.pressed && btn.hit(p.x, p.y) && this.stateT > 0.3) this.start();
        btn.pressed = false;
      }
      return;
    }
    if (p.type !== "down" || this.state !== "input") return;
    const rad = Math.max(this.nodeRadius() * 1.9, 30);
    let bestI = -1;
    let bestD = Infinity;
    this.nodes.forEach((_, i) => {
      const q = this.pos(i);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < rad && d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    if (bestI >= 0) this.tap(bestI);
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if ((code === "Enter" || code === "Space") && (this.state === "intro" || this.state === "over")) {
      if (this.stateT > 0.5) this.start();
      return true;
    }
    const m = /^Digit([1-9])$/.exec(code);
    if (m && this.state === "input") {
      const i = parseInt(m[1], 10) - 1;
      if (i < this.nodes.length) this.tap(i);
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.startBtn.update(dt);
    this.againBtn.update(dt);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.celebrate = Math.max(0, this.celebrate - dt * 0.8);
    for (const n of this.nodes) n.lit = Math.max(0, n.lit - dt * 2.2);

    if (!this.env.reducedMotion && Math.random() < dt * 0.12) {
      const fromLeft = Math.random() < 0.5;
      this.shooting.push({ x: fromLeft ? -20 : this.w + 20, y: Math.random() * this.h * 0.5, vx: (fromLeft ? 1 : -1) * (380 + Math.random() * 200), vy: 120 + Math.random() * 80, life: 1.4 });
    }
    for (const s of this.shooting) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.shooting = this.shooting.filter((s) => s.life > 0);

    if (this.state === "show") {
      this.showT += dt;
      const step = this.stepTime();
      const gap = 0.16;
      const idx = Math.floor(this.showT / (step + gap));
      if (this.showT >= 0 && idx !== this.showIdx && idx < this.seq.length) {
        this.showIdx = idx;
        this.light(this.seq[idx]);
        if (idx > 0) this.lines.push([this.seq[idx - 1], this.seq[idx]]);
      }
      if (this.showT >= this.seq.length * (step + gap) + 0.2) {
        this.state = "input";
        this.stateT = 0;
        this.lines = [];
        this.inputIdx = 0;
        this.message = `แตะตามลำดับ 0/${this.seq.length}`;
      }
    } else if (this.state === "pause" && this.stateT > 1.3) {
      if (this.pauseNext === "show") this.nextRound();
      else this.beginShow(0.3);
    }
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    drawStars(ctx, this.stars, w, h, this.time * 0.7);

    // Shooting stars
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.shooting) {
      const a = clamp(s.life, 0, 1);
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.18, s.y - s.vy * 0.18);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.18, s.y - s.vy * 0.18);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    if (this.shake > 0 && !this.env.reducedMotion) ctx.translate(Math.sin(this.time * 60) * this.shake * 0.6, 0);

    // Constellation lines
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const [a, b] of this.lines) {
      const p = this.pos(a);
      const q = this.pos(b);
      const g = ctx.createLinearGradient(p.x, p.y, q.x, q.y);
      g.addColorStop(0, rgba(this.nodes[a].color, 0.8));
      g.addColorStop(1, rgba(this.nodes[b].color, 0.8));
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.5 + this.celebrate * 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.restore();

    // Stars
    const R = this.nodeRadius();
    this.nodes.forEach((n, i) => {
      const p = this.pos(i);
      const tw = 0.85 + 0.15 * Math.sin(this.time * 2 + n.twinkle);
      const lit = ease.outCubic(n.lit);
      const active = this.state === "input";
      glow(ctx, p.x, p.y, R * (3 + lit * 3), n.color, 0.25 + lit * 0.5);
      // Rays
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(this.time * 0.2 + n.twinkle);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba(n.color, 0.35 + lit * 0.5);
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.25);
        ctx.lineTo(R * (1.6 + lit * 1.2) * tw, 0);
        ctx.lineTo(0, R * 0.25);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // Core
      const core = ctx.createRadialGradient(p.x - R * 0.2, p.y - R * 0.2, 0, p.x, p.y, R * 0.8);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.5, n.color);
      core.addColorStop(1, rgba(n.color, 0.2));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * (0.55 + lit * 0.25) * tw, 0, TAU);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 1.25, 0, TAU);
        ctx.stroke();
      }
    });
    ctx.restore();

    this.particles.render(ctx);
    this.floaters.render(ctx);

    // HUD
    if (this.state !== "intro" && this.state !== "over") {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 24px ${FONT_DISPLAY}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.message, w / 2, 52);
      ctx.font = `500 12px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(`ลำดับยาว ${this.seq.length} ดวง`, w / 2, 82);
      // Lives as small moons
      for (let i = 0; i < 3; i++) {
        const x = w / 2 + (i - 1) * 26;
        const y = h - 36;
        ctx.fillStyle = i < this.lives ? "#ffe9a8" : "rgba(255,255,255,0.15)";
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, TAU);
        ctx.fill();
        if (i < this.lives) {
          ctx.fillStyle = "#0d1240";
          ctx.beginPath();
          ctx.arc(x + 4, y - 3, 7, 0, TAU);
          ctx.fill();
        }
      }
    }

    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "เส้นทางดวงดาว",
        subtitle: "ฝึกความจำ เบี่ยงความคิด",
        body: "ดาวจะสว่างทีละดวงเป็นลำดับ จำไว้ แล้วแตะตามให้ถูก ทุกรอบลำดับจะยาวขึ้นหนึ่งดวง ผิดได้ 3 ครั้ง",
        accent: "#8b6cff",
        buttons: [this.startBtn],
        appear: this.stateT * 3,
        icon: (c) => {
          const pts: [number, number, string][] = [[-36, 8, "#ffd66b"], [-10, -14, "#7ad8ff"], [18, 2, "#ff8fd0"], [38, -18, "#c7a2ff"]];
          c.strokeStyle = "rgba(255,255,255,0.5)";
          c.lineWidth = 1.5;
          c.beginPath();
          pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.stroke();
          pts.forEach(([x, y, col], i) => {
            glow(c, x, y, 18, col, 0.5 + 0.3 * Math.sin(this.time * 3 + i));
            c.fillStyle = "#ffffff";
            c.beginPath();
            c.arc(x, y, 4, 0, TAU);
            c.fill();
          });
        },
        chips: this.best ? [`จำได้ยาวสุด ${this.best} ดวง`] : undefined,
      });
    } else if (this.state === "over") {
      const reached = Math.max(0, this.seq.length - 1);
      drawCard(ctx, w, h, {
        title: this.newBest ? "สถิติใหม่!" : "เก่งมาก",
        subtitle: "สมองได้พักจากความอยากแล้ว",
        bigValue: `${reached}`,
        bigLabel: "ดวงที่จำได้ยาวที่สุด",
        chips: [`สถิติ ${this.best} ดวง`],
        accent: "#8b6cff",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5,
      });
    }
  }
}
