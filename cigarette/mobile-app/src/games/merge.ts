// "Fruit Merge" — drop fruits into a jar; two of the same fruit merge into the next bigger one.
// Easy to learn at any age, with physics that is fun to watch. Aiming each drop keeps attention
// on the jar for the few minutes a craving lasts.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeSprite, roundRectPath, clamp, TAU, FONT_DISPLAY, FONT_BODY, rng } from "./engine/fx";
import { Button, drawCard, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { coinsFor } from "./engine/economy";
import { BoosterButton } from "./engine/booster";
import { drawFruit, FRUITS } from "./art/fruits";

const LEVELS = FRUITS.length;

interface Body {
  id: number;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ang: number;
  age: number;
  pop: number;
  dead: boolean;
}

export const mergeGame: GameDefinition = {
  id: "merge",
  title: "รวมผลไม้",
  tagline: "หย่อนผลไม้ ลูกเหมือนกันจะรวมเป็นลูกใหญ่",
  why: "ต้องเล็งและวางแผนว่าจะหย่อนตรงไหน สายตาและความคิดอยู่กับโถผลไม้ ความอยากจึงค่อยๆ เบาลง",
  category: "puzzle",
  minutes: "3–10 นาที",
  palette: ["#ff9fb8", "#ffb347"],
  create: (env) => new MergeGame(env),
};

type State = "intro" | "play" | "over";

class MergeGame implements GameInstance {
  private earned = 0;
  private w = 0;
  private h = 0;
  private jar = { x: 0, y: 0, w: 0, h: 0 };
  private danger = 0;
  private radii: number[] = [];
  private sprites: HTMLCanvasElement[] = [];
  private bg: HTMLCanvasElement | null = null;
  private bodies: Body[] = [];
  private nextId = 1;
  private current = 0;
  private next = 0;
  private aimX = 0;
  private cooldown = 0;
  private aiming = false;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private score = 0;
  private best = 0;
  private newBest = false;
  private biggest = 0;
  private dangerT = 0;
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มเลย", "#ff7a59");
  private againBtn = new Button("เล่นอีกครั้ง", "#ff7a59");
  private rand = rng(Date.now() % 77777);
  private clouds: { x: number; y: number; s: number; v: number }[] = [];
  private bShake = new BoosterButton("boost_shake");
  private bPick = new BoosterButton("boost_pick");

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    const r = rng(8);
    for (let i = 0; i < 5; i++) this.clouds.push({ x: r(), y: 0.05 + r() * 0.25, s: 0.6 + r() * 0.8, v: 0.004 + r() * 0.006 });
    this.current = this.pick();
    this.next = this.pick();
  }

  private pick() {
    return Math.floor(this.rand() * 5);
  }

  private start() {
    this.bodies = [];
    this.score = 0;
    this.biggest = 0;
    this.dangerT = 0;
    this.newBest = false;
    this.current = this.pick();
    this.next = this.pick();
    this.aimX = this.jar.x + this.jar.w / 2;
    this.cooldown = 0.3;
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  private drop() {
    if (this.cooldown > 0 || this.state !== "play") return;
    const r = this.radii[this.current];
    const x = clamp(this.aimX, this.jar.x + r + 1, this.jar.x + this.jar.w - r - 1);
    this.bodies.push({ id: this.nextId++, level: this.current, x, y: this.jar.y - r * 0.2, vx: 0, vy: 40, r, ang: 0, age: 0, pop: 1, dead: false });
    this.current = this.next;
    this.next = this.pick();
    this.cooldown = 0.55;
    this.env.sfx.tone({ freq: 440, dur: 0.12, vol: 0.06, glideTo: 300 });
  }

  private merge(a: Body, b: Body) {
    a.dead = true;
    b.dead = true;
    const lvl = a.level + 1;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const pts = ((a.level + 1) * (a.level + 2)) / 2;
    this.score += pts;
    if (lvl >= LEVELS) {
      // Two watermelons: both vanish with a big bonus
      this.score += 100;
      this.floaters.add("แตงโมยักษ์! +100", x, y, "#ffe58a", 26, 1.6);
      this.particles.burst(x, y, "#ff5d73", 40, { speed: 300, size: 4, gravity: 200, life: 1.2 });
      [0, 2, 4, 7, 9].forEach((s, i) => this.env.sfx.chime(pentatonic(s + 5), 0.1, i * 0.08));
    } else {
      this.bodies.push({ id: this.nextId++, level: lvl, x, y, vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2 - 30, r: this.radii[lvl], ang: 0, age: 0, pop: 0, dead: false });
      this.biggest = Math.max(this.biggest, lvl);
      this.floaters.add(`+${pts}`, x, y - this.radii[lvl], "#ffffff", 18 + lvl);
      this.particles.burst(x, y, FRUITS[lvl].color, 10 + lvl * 2, { speed: 140 + lvl * 15, size: 3, gravity: 120, life: 0.7 });
      this.particles.ring(x, y, "#ffffff", this.radii[lvl] * 1.8, 0.4);
      this.env.sfx.chime(pentatonic(lvl + 2, 300), 0.12);
      if (lvl >= 7) this.floaters.add(FRUITS[lvl].name + "!", x, y - this.radii[lvl] - 26, "#fff3b0", 22, 1.4);
    }
    this.env.emit({ type: "score", score: this.score });
  }

  private physics(dt: number) {
    const g = 1500;
    const J = this.jar;
    for (const b of this.bodies) {
      b.age += dt;
      b.vy += g * dt;
      b.vx *= 0.995;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ang += (b.vx / b.r) * dt;
      // Walls and floor
      if (b.x - b.r < J.x) {
        b.x = J.x + b.r;
        b.vx = Math.abs(b.vx) * 0.2;
      }
      if (b.x + b.r > J.x + J.w) {
        b.x = J.x + J.w - b.r;
        b.vx = -Math.abs(b.vx) * 0.2;
      }
      if (b.y + b.r > J.y + J.h) {
        b.y = J.y + J.h - b.r;
        if (b.vy > 0) b.vy = -b.vy * 0.15;
        b.vx *= 0.96;
      }
    }
    const list = this.bodies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        if (a.level === b.level && a.age > 0.04 && b.age > 0.04) {
          this.merge(a, b);
          break;
        }
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = rr - d;
        const ma = a.r * a.r;
        const mb = b.r * b.r;
        const ka = mb / (ma + mb);
        const kb = ma / (ma + mb);
        a.x -= nx * overlap * ka;
        a.y -= ny * overlap * ka;
        b.x += nx * overlap * kb;
        b.y += ny * overlap * kb;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = (-(1 + 0.15) * rv) / (1 / ma + 1 / mb);
          a.vx -= (imp / ma) * nx;
          a.vy -= (imp / ma) * ny;
          b.vx += (imp / mb) * nx;
          b.vy += (imp / mb) * ny;
        }
      }
    }
    if (list.some((b) => b.dead)) this.bodies = list.filter((b) => !b.dead);
  }

  private end() {
    this.state = "over";
    this.stateT = 0;
    const r = bestScore(this.env.store, "best", this.score);
    this.best = r.best;
    this.newBest = r.isNew;
    this.env.sfx.tone({ freq: 330, dur: 0.6, vol: 0.09, glideTo: 180 });
    this.env.emit({ type: "end", coins: (this.earned = coinsFor(this.score, 15, 5, 150)), score: this.score, best: this.best, summary: `ผลไม้ใหญ่สุด: ${FRUITS[this.biggest].name}`, stats: { biggest: this.biggest } });
  }

  resize(w: number, h: number) {
    const oldJar = { ...this.jar };
    this.w = w;
    this.h = h;
    const top = 120;
    const jw = Math.min(w - 28, (h - top - 30) * 0.78, 460);
    const jh = Math.min(h - top - 30, jw * 1.3);
    this.jar = { x: (w - jw) / 2, y: top + (h - top - 20 - jh), w: jw, h: jh };
    this.danger = this.jar.y + jh * 0.08;
    const r0 = jw * 0.042;
    const r10 = jw * 0.22;
    this.radii = Array.from({ length: LEVELS }, (_, k) => r0 * Math.pow(r10 / r0, k / (LEVELS - 1)));
    // Keep fruits in place when the screen size changes
    if (oldJar.w > 0) {
      const k = jw / oldJar.w;
      for (const b of this.bodies) {
        b.x = this.jar.x + (b.x - oldJar.x) * k;
        b.y = this.jar.y + this.jar.h - (oldJar.y + oldJar.h - b.y) * k;
        b.r = this.radii[b.level];
      }
    }
    this.aimX = this.jar.x + jw / 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.sprites = this.radii.map((r, k) => {
      const pad = r * 0.7;
      const size = (r + pad) * 2;
      return makeSprite(size, size, dpr, (c) => {
        c.translate(size / 2, size / 2);
        drawFruit(c, k, r, true);
      });
    });
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#8fd3ff");
      g.addColorStop(0.55, "#ffd6e7");
      g.addColorStop(1, "#ffc9a8");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Sun
      const sx = w * 0.82;
      const sy = h * 0.1;
      const sg = c.createRadialGradient(sx, sy, 0, sx, sy, w * 0.35);
      sg.addColorStop(0, "rgba(255,250,210,0.95)");
      sg.addColorStop(0.15, "rgba(255,240,180,0.6)");
      sg.addColorStop(1, "rgba(255,240,180,0)");
      c.fillStyle = sg;
      c.fillRect(0, 0, w, h);
      // Rolling hills
      const hills: [string, number, number][] = [["#b8e6a8", 0.86, 0.9], ["#93d38d", 0.92, 1.6]];
      for (const [col, base, f] of hills) {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, h);
        for (let x = 0; x <= w; x += 6) c.lineTo(x, h * base - Math.sin((x / w) * Math.PI * f + 1) * h * 0.05);
        c.lineTo(w, h);
        c.fill();
      }
    });
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
    if (p.type === "down" && this.bShake.hit(p.x, p.y)) {
      if (this.bodies.length && this.bShake.consume()) {
        // Jolt every fruit up and sideways so the pile can resettle
        for (const b of this.bodies) {
          b.vy -= 260 + this.rand() * 320;
          b.vx += (this.rand() - 0.5) * 360;
        }
        this.dangerT = 0;
        this.env.sfx.noise({ dur: 0.4, vol: 0.08, freq: 600, type: "bandpass" });
      }
      return;
    }
    if (p.type === "down" && this.bPick.hit(p.x, p.y)) {
      if (this.bodies.length && this.bPick.consume()) {
        const smallest = [...this.bodies].sort((a, b) => a.level - b.level).slice(0, 3);
        for (const b of smallest) {
          b.dead = true;
          this.particles.burst(b.x, b.y, "#ffffff", 12, { speed: 140, size: 3, gravity: -60, life: 0.6 });
        }
        this.bodies = this.bodies.filter((b) => !b.dead);
        this.dangerT = 0;
        this.env.sfx.chime(pentatonic(7), 0.08);
      }
      return;
    }
    if (p.type === "down") {
      this.aiming = true;
      this.aimX = p.x;
    } else if (p.type === "move" && this.aiming) {
      this.aimX = p.x;
    } else if (p.type === "up" && this.aiming) {
      this.aiming = false;
      this.aimX = p.x;
      this.drop();
    } else if (p.type === "cancel") {
      this.aiming = false;
    }
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.state !== "play") {
      if ((code === "Enter" || code === "Space") && this.stateT > 0.5) this.start();
      return code === "Enter" || code === "Space";
    }
    const step = this.jar.w / 16;
    if (code === "ArrowLeft") this.aimX -= step;
    else if (code === "ArrowRight") this.aimX += step;
    else if (code === "Space" || code === "ArrowDown" || code === "Enter") this.drop();
    else return false;
    return true;
  }

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.startBtn.update(dt);
    this.againBtn.update(dt);
    this.bShake.update(dt);
    this.bPick.update(dt);
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > 1.2) c.x = -0.2;
    }
    for (const b of this.bodies) b.pop = Math.min(1, b.pop + dt * 5);
    if (this.state !== "play") return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const steps = 6;
    for (let i = 0; i < steps; i++) this.physics(dt / steps);
    // Over the line for too long ends the round
    const over = this.bodies.some((b) => b.age > 1.2 && b.y - b.r < this.danger && Math.abs(b.vy) < 120);
    this.dangerT = over ? this.dangerT + dt : Math.max(0, this.dangerT - dt * 2);
    if (this.dangerT > 2.2) this.end();
  }

  private drawCloud(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.arc(x, y, 18 * s, 0, TAU);
    c.arc(x + 20 * s, y - 8 * s, 22 * s, 0, TAU);
    c.arc(x + 44 * s, y, 17 * s, 0, TAU);
    c.rect(x, y, 44 * s, 17 * s);
    c.fill();
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    for (const c of this.clouds) this.drawCloud(ctx, c.x * w, c.y * h, c.s);
    const J = this.jar;

    // Jar back
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    roundRectPath(ctx, J.x - 6, J.y - 10, J.w + 12, J.h + 16, 20);
    ctx.fill();
    // Wooden floor
    const fg = ctx.createLinearGradient(0, J.y + J.h, 0, J.y + J.h + 14);
    fg.addColorStop(0, "#c98a4b");
    fg.addColorStop(1, "#8a5a2b");
    ctx.fillStyle = fg;
    roundRectPath(ctx, J.x - 10, J.y + J.h, J.w + 20, 14, 6);
    ctx.fill();

    // Danger line
    const warn = this.dangerT > 0 ? 0.5 + 0.5 * Math.sin(this.time * 14) : 0;
    ctx.strokeStyle = warn ? `rgba(255,60,90,${0.4 + warn * 0.6})` : "rgba(255,90,120,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(J.x, this.danger);
    ctx.lineTo(J.x + J.w, this.danger);
    ctx.stroke();
    ctx.setLineDash([]);

    // Aim guide + fruit waiting to drop
    if (this.state === "play") {
      const r = this.radii[this.current];
      const x = clamp(this.aimX, J.x + r + 1, J.x + J.w - r - 1);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(x, J.y);
      ctx.lineTo(x, J.y + J.h);
      ctx.stroke();
      ctx.setLineDash([]);
      if (this.cooldown <= 0.25) {
        const size = r * 1.7 * 2;
        ctx.globalAlpha = 1 - this.cooldown * 4;
        ctx.drawImage(this.sprites[this.current], x - size / 2, J.y - r - 8 - size / 2, size, size);
        ctx.globalAlpha = 1;
      }
    }

    // Fruits
    for (const b of this.bodies) {
      const spr = this.sprites[b.level];
      const size = (b.r + b.r * 0.7) * 2;
      const s = 0.6 + 0.4 * Math.min(1, b.pop * 1.3) + (b.pop < 1 ? Math.sin(b.pop * Math.PI) * 0.12 : 0);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang);
      ctx.scale(s, s);
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    // Jar glass front
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(J.x - 4, J.y - 6);
    ctx.lineTo(J.x - 4, J.y + J.h);
    ctx.moveTo(J.x + J.w + 4, J.y - 6);
    ctx.lineTo(J.x + J.w + 4, J.y + J.h);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(J.x + 6, J.y, 10, J.h - 10);

    this.particles.render(ctx);
    this.floaters.render(ctx);

    // HUD: score left, next fruit right
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `600 12px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(60,40,80,0.7)";
    ctx.fillText("คะแนน", 16, 12);
    ctx.font = `800 32px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#3b2a5a";
    ctx.fillText(this.score.toLocaleString(), 16, 26);
    ctx.textAlign = "right";
    ctx.font = `600 12px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(60,40,80,0.7)";
    ctx.fillText("ถัดไป", w - 16, 12);
    const nr = Math.min(this.radii[this.next], 22);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(w - 40, 56, 26, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(w - 40, 56);
    drawFruit(ctx, this.next, nr, true);
    ctx.restore();

    if (this.state === "play") {
      this.bShake.place(w / 2 - 32, 44, 19);
      this.bPick.place(w / 2 + 32, 44, 19);
      this.bShake.render(ctx, this.time);
      this.bPick.render(ctx, this.time);
    }

    // Evolution strip under the HUD
    const stripY = 98;
    const n = LEVELS;
    const gap = Math.min(30, (w - 40) / n);
    for (let k = 0; k < n; k++) {
      const x = w / 2 + (k - (n - 1) / 2) * gap;
      ctx.save();
      ctx.translate(x, stripY);
      ctx.globalAlpha = k <= this.biggest || this.state === "intro" ? 1 : 0.35;
      drawFruit(ctx, k, gap * 0.36, false);
      ctx.restore();
    }

    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "รวมผลไม้",
        subtitle: "เชอร์รี่ → … → แตงโม",
        body: "แตะค้างแล้วเลื่อนเพื่อเล็ง ปล่อยนิ้วเพื่อหย่อน ผลไม้ชนิดเดียวกันชนกันจะรวมเป็นลูกที่ใหญ่ขึ้น อย่าให้ล้นเส้นประด้านบน",
        accent: "#ff7a59",
        buttons: [this.startBtn],
        appear: this.stateT * 3,
        chips: this.best ? [`สถิติ ${this.best.toLocaleString()}`] : undefined,
        icon: (c) => {
          [[-40, 6, 3, 16], [0, 0, 5, 24], [42, 6, 10, 18]].forEach(([x, y, k, r]) => {
            c.save();
            c.translate(x, y + Math.sin(this.time * 3 + x) * 3);
            drawFruit(c, k, r, true);
            c.restore();
          });
        },
      });
    } else if (this.state === "over") {
      drawCard(ctx, w, h, {
        title: this.newBest ? "สถิติใหม่!" : "โถเต็มแล้ว",
        subtitle: `ผลไม้ใหญ่สุด: ${FRUITS[this.biggest].name}`,
        bigValue: this.score.toLocaleString(),
        bigLabel: "คะแนน",
        chips: [`สถิติ ${this.best.toLocaleString()}`],
        accent: this.newBest ? "#ffc634" : "#ff7a59",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5, coins: this.earned,
      });
    }
  }
}
