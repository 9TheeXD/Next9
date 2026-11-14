// "Lantern Breath" — paced slow breathing (4 s in, 6 s out = 6 breaths a minute, close to the
// heart's resonance rate). Slow-paced breathing lowers stress and anxiety in meta-analyses
// (Fincham et al., Sci Rep 2023; Shao et al., Mindfulness 2024). Every breath in rhythm sends a
// lantern into the sky. Holding the screen is optional: breathing along without touching counts too.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { makeStars, drawStars, makeSprite, clamp, lerp, ease, TAU, FONT_DISPLAY, FONT_BODY, glow, rng, type Star } from "./engine/fx";
import { Button, drawCard, bestScore } from "./engine/ui";
import { pentatonic } from "./engine/audio";

const IN = 4;
const OUT = 6;
const CYCLE = IN + OUT;

interface SkyLantern {
  x: number;
  y: number;
  targetY: number;
  targetX: number;
  scale: number;
  sway: number;
  bright: number;
  age: number;
  hue: number;
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export const lanternGame: GameDefinition = {
  id: "lantern",
  title: "โคมลอยลมหายใจ",
  tagline: "หายใจช้าๆ ตามจังหวะ ปล่อยโคมขึ้นฟ้า",
  why: "การหายใจช้าๆ ราวนาทีละ 6 ครั้งช่วยลดความเครียดและความกระวนกระวาย ซึ่งเป็นตัวกระตุ้นความอยากที่พบบ่อย",
  category: "calm",
  minutes: "2–3 นาที",
  palette: ["#141a4d", "#ffb45c"],
  create: (env) => new LanternGame(env),
};

type State = "intro" | "play" | "over";

class LanternGame implements GameInstance {
  private earned = 0;
  private w = 0;
  private h = 0;
  private horizon = 0;
  private bg: HTMLCanvasElement | null = null;
  private stars: Star[] = makeStars(170, 7);
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private phaseT = 0; // seconds into the current breath cycle
  private breaths = 0;
  private target = 10;
  private holding = false;
  private touchedThisBreath = false;
  private touchedEver = false;
  private player = 0; // 0..1 how "full" the player's breath is
  private syncSum = 0;
  private syncN = 0;
  private totalSync = 0;
  private inRhythm = 0;
  private lanternGlow = 0.4;
  private released: SkyLantern[] = [];
  private flies: Firefly[] = [];
  private feedback = "";
  private feedbackT = 0;
  private lastPhase: "in" | "out" = "out";
  private btn10 = new Button("10 ลมหายใจ (ราว 2 นาที)", "#ff9d4d");
  private btn18 = new Button("3 นาที", "#ff9d4d", "ghost");
  private againBtn = new Button("หายใจต่ออีก 10 ครั้ง", "#ff9d4d");
  private best = 0;
  private rand = rng(99);

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    for (let i = 0; i < 14; i++) {
      this.flies.push({ x: Math.random(), y: 0.55 + Math.random() * 0.35, vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.01, phase: Math.random() * TAU });
    }
  }

  // Guide: 0 → 1 during the inhale, 1 → 0 during the exhale, eased like a real breath.
  private guide(t = this.phaseT) {
    return t < IN ? ease.inOutSine(t / IN) : 1 - ease.inOutSine((t - IN) / OUT);
  }

  private start(target: number) {
    this.target = target;
    this.state = "play";
    this.stateT = 0;
    this.phaseT = 0;
    this.breaths = 0;
    this.totalSync = 0;
    this.inRhythm = 0;
    this.syncSum = 0;
    this.syncN = 0;
    this.player = 0;
    this.touchedThisBreath = false;
    this.lastPhase = "out";
    this.env.emit({ type: "start" });
  }

  private finishBreath() {
    const touched = this.touchedThisBreath;
    // Without touching, the player is breathing along with the guide: count it as in rhythm.
    const sync = touched && this.syncN > 0 ? this.syncSum / this.syncN : 0.75;
    this.syncSum = 0;
    this.syncN = 0;
    this.touchedThisBreath = false;
    this.breaths++;
    this.totalSync += sync;
    const good = sync >= 0.62;
    if (good) this.inRhythm++;
    this.releaseLantern(sync);
    this.feedback = !touched
      ? this.touchedEver ? "แตะค้างไว้ตอนหายใจเข้านะ" : "หายใจตามวงแสงได้เลย"
      : sync > 0.85 ? "นุ่มนวลมาก" : good ? "ดีมาก" : "ลองช้าลงอีกนิด";
    this.feedbackT = 2.2;
    this.env.sfx.chime(pentatonic(this.breaths % 8, 330), 0.11);
    this.env.emit({ type: "score", score: this.inRhythm });
    if (this.breaths >= this.target) this.end();
  }

  private releaseLantern(sync: number) {
    const cx = this.w / 2;
    this.released.push({
      x: cx,
      y: this.horizon - 30,
      targetY: this.h * (0.08 + this.rand() * 0.34),
      targetX: this.w * (0.1 + this.rand() * 0.8),
      scale: 1,
      sway: this.rand() * TAU,
      bright: 0.55 + sync * 0.45,
      age: 0,
      hue: 28 + this.rand() * 18,
    });
    if (this.released.length > 40) this.released.shift();
  }

  private end() {
    this.state = "over";
    this.stateT = 0;
    const pct = Math.round((this.totalSync / Math.max(1, this.breaths)) * 100);
    const r = bestScore(this.env.store, "best", pct);
    this.best = r.best;
    this.env.emit({
      type: "end", coins: (this.earned = Math.max(10, this.breaths * 2)),
      score: this.inRhythm,
      best: this.best,
      summary: `หายใจช้า ${this.breaths} ครั้ง · เข้าจังหวะ ${pct}%`,
      stats: { breaths: this.breaths, rhythm: pct, seconds: Math.round(this.breaths * CYCLE) },
    });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.horizon = Math.round(h * 0.64);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const hz = this.horizon;
    this.bg = makeSprite(w, h, dpr, (c) => {
      // Sky
      const sky = c.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, "#070b26");
      sky.addColorStop(0.55, "#16205a");
      sky.addColorStop(0.85, "#33377c");
      sky.addColorStop(1, "#7a5a8e");
      c.fillStyle = sky;
      c.fillRect(0, 0, w, hz);
      // Horizon warmth
      const warm = c.createRadialGradient(w * 0.5, hz, 0, w * 0.5, hz, w * 0.9);
      warm.addColorStop(0, "rgba(255,170,110,0.35)");
      warm.addColorStop(1, "rgba(255,170,110,0)");
      c.fillStyle = warm;
      c.fillRect(0, 0, w, hz);
      // Moon
      const mx = w * 0.78;
      const my = h * 0.16;
      const mr = Math.min(w, h) * 0.06;
      glow(c, mx, my, mr * 6, "#cfd8ff", 0.25);
      const mg = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      mg.addColorStop(0, "#fffdf2");
      mg.addColorStop(1, "#dcd8c8");
      c.fillStyle = mg;
      c.beginPath();
      c.arc(mx, my, mr, 0, TAU);
      c.fill();
      c.fillStyle = "rgba(160,150,140,0.25)";
      [[-0.3, -0.1, 0.22], [0.25, 0.2, 0.16], [0.1, -0.4, 0.1], [-0.1, 0.35, 0.12]].forEach(([dx, dy, r]) => {
        c.beginPath();
        c.arc(mx + dx * mr, my + dy * mr, r * mr, 0, TAU);
        c.fill();
      });
      // Mountain layers
      const layers: [string, number, number, number][] = [
        ["#2a2c6a", 0.16, 0.9, 1],
        ["#1c1e50", 0.11, 1.6, 2],
        ["#11133a", 0.07, 2.4, 3],
      ];
      for (const [col, height, freq, seed] of layers) {
        const r = rng(seed * 31);
        const a1 = r() * 6, a2 = r() * 6, a3 = r() * 6;
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, hz);
        for (let x = 0; x <= w; x += 4) {
          const u = x / w;
          const y =
            hz - h * height * (0.55 + 0.25 * Math.sin(u * freq * 3 + a1) + 0.15 * Math.sin(u * freq * 7 + a2) + 0.05 * Math.sin(u * freq * 19 + a3));
          c.lineTo(x, y);
        }
        c.lineTo(w, hz);
        c.closePath();
        c.fill();
      }
      // Lake: a dimmed mirror of the sky
      c.save();
      c.translate(0, hz * 2);
      c.scale(1, -1);
      c.globalAlpha = 0.45;
      c.drawImage(c.canvas, 0, 0, c.canvas.width, hz * dpr, 0, 0, w, hz);
      c.restore();
      const lake = c.createLinearGradient(0, hz, 0, h);
      lake.addColorStop(0, "rgba(10,14,48,0.35)");
      lake.addColorStop(1, "rgba(4,6,22,0.92)");
      c.fillStyle = lake;
      c.fillRect(0, hz, w, h - hz);
    });
  }

  pointer(p: PointerInfo) {
    if (this.state !== "play") {
      const btns = this.state === "intro" ? [this.btn10, this.btn18] : [this.againBtn];
      for (const b of btns) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.3) this.start(b === this.btn18 ? 18 : 10);
          b.pressed = false;
        }
      }
      return;
    }
    if (p.type === "down") {
      this.holding = true;
      this.touchedThisBreath = true;
      this.touchedEver = true;
    } else if (p.type === "up" || p.type === "cancel") {
      this.holding = false;
    }
  }

  key(code: string, down: boolean) {
    if (code !== "Space" && code !== "Enter") return false;
    if (this.state !== "play") {
      if (down && this.stateT > 0.5) this.start(10);
      return true;
    }
    this.holding = down;
    if (down) {
      this.touchedThisBreath = true;
      this.touchedEver = true;
    }
    return true;
  }

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.btn10.update(dt);
    this.btn18.update(dt);
    this.againBtn.update(dt);
    this.feedbackT = Math.max(0, this.feedbackT - dt);

    for (const f of this.flies) {
      f.phase += dt;
      f.vx += (Math.random() - 0.5) * 0.02 * dt;
      f.vy += (Math.random() - 0.5) * 0.02 * dt;
      f.vx = clamp(f.vx, -0.02, 0.02);
      f.vy = clamp(f.vy, -0.012, 0.012);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < 0) f.x += 1;
      if (f.x > 1) f.x -= 1;
      f.y = clamp(f.y, 0.5, 0.95);
    }
    for (const l of this.released) {
      l.age += dt;
      l.y = lerp(l.y, l.targetY, 1 - Math.pow(0.85, dt * 2));
      l.scale = lerp(l.scale, 0.28 + (l.targetY / this.h) * 0.5, 1 - Math.pow(0.8, dt * 2));
      l.x = lerp(l.x, l.targetX, 1 - Math.pow(0.9, dt * 2)) + Math.sin(l.age * 0.6 + l.sway) * 6 * dt;
    }

    if (this.state !== "play") {
      this.lanternGlow = lerp(this.lanternGlow, 0.5 + 0.2 * Math.sin(this.time), 0.05);
      return;
    }

    const prevT = this.phaseT;
    this.phaseT += dt;
    const phase: "in" | "out" = this.phaseT % CYCLE < IN ? "in" : "out";
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      if (phase === "in") this.env.sfx.noise({ dur: IN, vol: 0.05, freq: 300, sweepTo: 1300, type: "lowpass", q: 0.7 });
      else this.env.sfx.noise({ dur: OUT, vol: 0.045, freq: 1300, sweepTo: 250, type: "lowpass", q: 0.7 });
    }
    if (prevT < CYCLE && this.phaseT >= CYCLE) {
      this.phaseT -= CYCLE;
      this.finishBreath();
      if (this.state !== "play") return;
    }

    // The player's breath fills at the inhale rate while holding and empties at the exhale rate.
    this.player = clamp(this.player + (this.holding ? dt / IN : -dt / OUT), 0, 1);
    const g = this.guide();
    if (this.touchedThisBreath) {
      this.syncSum += 1 - Math.min(1, Math.abs(this.player - g) * 1.6);
      this.syncN++;
    }
    const shown = this.touchedThisBreath ? this.player : g;
    const sync = this.touchedThisBreath ? 1 - Math.min(1, Math.abs(this.player - g) * 1.6) : 0.8;
    this.lanternGlow = lerp(this.lanternGlow, 0.35 + shown * 0.5 * (0.4 + sync * 0.6), 0.1);
  }

  private drawLantern(c: CanvasRenderingContext2D, x: number, y: number, s: number, bright: number, hue = 32, flicker = 0) {
    const lw = 34 * s;
    const lh = 44 * s;
    glow(c, x, y, lh * 2.6, `#ffb45c`, 0.28 * bright);
    // Body
    const g = c.createRadialGradient(x, y + lh * 0.1, lh * 0.05, x, y, lh * 0.75);
    const core = `hsl(${hue},100%,${70 + bright * 22 + flicker * 4}%)`;
    g.addColorStop(0, core);
    g.addColorStop(0.55, `hsl(${hue - 6},95%,${52 + bright * 12}%)`);
    g.addColorStop(1, `hsl(${hue - 14},85%,${30 + bright * 10}%)`);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - lw * 0.42, y - lh * 0.5);
    c.quadraticCurveTo(x - lw * 0.62, y, x - lw * 0.36, y + lh * 0.5);
    c.lineTo(x + lw * 0.36, y + lh * 0.5);
    c.quadraticCurveTo(x + lw * 0.62, y, x + lw * 0.42, y - lh * 0.5);
    c.closePath();
    c.fill();
    // Ribs
    c.strokeStyle = `rgba(120,40,10,${0.25 + 0.1 * bright})`;
    c.lineWidth = Math.max(0.6, 1.1 * s);
    for (const k of [-0.18, 0.18]) {
      c.beginPath();
      c.moveTo(x + lw * k * 1.4, y - lh * 0.5);
      c.quadraticCurveTo(x + lw * k * 2.1, y, x + lw * k * 1.3, y + lh * 0.5);
      c.stroke();
    }
    // Rims
    c.fillStyle = "#5a2a14";
    c.fillRect(x - lw * 0.44, y - lh * 0.55, lw * 0.88, lh * 0.08);
    c.fillRect(x - lw * 0.38, y + lh * 0.47, lw * 0.76, lh * 0.07);
    // Flame at the bottom opening
    glow(c, x, y + lh * 0.42, lh * 0.35, "#fff1b8", 0.8 * bright);
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    const hz = this.horizon;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    drawStars(ctx, this.stars, w, h, this.time * 0.6, (hz - 40) / h);

    // Released lanterns in the sky, plus their reflections
    for (const l of this.released) {
      const fl = this.env.reducedMotion ? 0 : Math.sin(l.age * 7 + l.sway) * 0.5;
      this.drawLantern(ctx, l.x, l.y, l.scale, l.bright * (0.85 + 0.15 * Math.sin(l.age * 2 + l.sway)), l.hue, fl);
      const ry = hz + (hz - l.y) * 0.9;
      if (ry < h) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        glow(ctx, l.x, ry, 18 * l.scale + 6, "#ffb45c", 0.5 * l.bright);
        ctx.restore();
      }
    }

    // Shimmering ripples on the lake
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 26; i++) {
      const y = hz + 8 + i * i * 0.55 + (i * (h - hz)) / 40;
      if (y > h) break;
      const len = 20 + ((i * 53) % 70);
      const x = ((i * 97 + this.time * (6 + (i % 5) * 3)) % (w + len)) - len;
      ctx.strokeStyle = `rgba(190,200,255,${0.05 + 0.05 * Math.sin(this.time * 1.5 + i)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.restore();

    // Fireflies
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.flies) {
      const a = 0.4 + 0.6 * Math.max(0, Math.sin(f.phase * 1.7));
      glow(ctx, f.x * w, f.y * h, 9, "#d6ff8a", 0.55 * a);
      ctx.fillStyle = `rgba(240,255,200,${a})`;
      ctx.beginPath();
      ctx.arc(f.x * w, f.y * h, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Breathing guide around the lantern floating on the water
    const cx = w / 2;
    const ly = hz - 6 + Math.sin(this.time * 1.2) * 3;
    const base = Math.min(w, h) * 0.12;
    const amp = Math.min(w, h) * 0.17;
    const playing = this.state === "play";
    const g = playing ? this.guide() : 0.5 + 0.5 * Math.sin(this.time * 0.8);
    const guideR = base + amp * g;
    const youR = base + amp * (playing && this.touchedThisBreath ? this.player : g);

    // Lantern reflection
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate(0, (ly + 20) * 2);
    ctx.scale(1, -1);
    this.drawLantern(ctx, cx, ly + 20, 1.5, this.lanternGlow);
    ctx.restore();

    // Player ring (filled) and guide ring (outline)
    const ringY = ly - 10;
    const rg = ctx.createRadialGradient(cx, ringY, youR * 0.6, cx, ringY, youR);
    rg.addColorStop(0, "rgba(255,190,110,0)");
    rg.addColorStop(0.85, `rgba(255,190,110,${0.08 + this.lanternGlow * 0.12})`);
    rg.addColorStop(1, "rgba(255,210,150,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, ringY, youR, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,236,200,${playing ? 0.8 : 0.5})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(cx, ringY, guideR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    if (playing && this.touchedThisBreath) {
      ctx.strokeStyle = "rgba(255,190,110,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, ringY, youR, 0, TAU);
      ctx.stroke();
    }

    this.drawLantern(ctx, cx, ly - 10, 1.5, this.lanternGlow);

    // Text
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (playing) {
      const inPhase = this.phaseT < IN;
      const remain = Math.ceil(inPhase ? IN - this.phaseT : CYCLE - this.phaseT);
      const label = inPhase ? "หายใจเข้า" : "หายใจออก";
      const y = h * 0.13;
      ctx.font = `700 30px ${FONT_DISPLAY}`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 12;
      ctx.fillText(label, cx, y);
      ctx.font = `600 18px ${FONT_DISPLAY}`;
      ctx.fillStyle = "rgba(255,230,190,0.9)";
      ctx.fillText(`${remain}`, cx, y + 34);
      ctx.shadowBlur = 0;
      ctx.font = `500 13px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(
        inPhase ? (this.touchedEver ? "แตะค้างไว้…" : "แตะค้างไว้ หรือหายใจตามวงแสงก็ได้") : this.touchedEver ? "ปล่อยนิ้ว ผ่อนลมยาวๆ" : "ผ่อนลมออกช้าๆ",
        cx,
        y + 64
      );
      // Progress dots
      const dotsY = h - 34;
      const n = this.target;
      const gap = Math.min(18, (w - 60) / n);
      for (let i = 0; i < n; i++) {
        const x = cx + (i - (n - 1) / 2) * gap;
        ctx.fillStyle = i < this.breaths ? "#ffc27a" : "rgba(255,255,255,0.22)";
        ctx.beginPath();
        ctx.arc(x, dotsY, i < this.breaths ? 4 : 3, 0, TAU);
        ctx.fill();
      }
      if (this.feedbackT > 0) {
        ctx.globalAlpha = clamp(this.feedbackT, 0, 1);
        ctx.font = `600 16px ${FONT_DISPLAY}`;
        ctx.fillStyle = "#ffe2b8";
        ctx.fillText(this.feedback, cx, dotsY - 26);
        ctx.globalAlpha = 1;
      }
    }

    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "โคมลอยลมหายใจ",
        subtitle: "หายใจเข้า 4 วินาที · ออก 6 วินาที",
        body: "แตะค้างไว้ตอนหายใจเข้า ปล่อยนิ้วตอนหายใจออก ไม่อยากแตะก็หายใจตามวงแสงได้ ทุกลมหายใจจะปล่อยโคมขึ้นฟ้า",
        accent: "#ff9d4d",
        buttons: [this.btn10, this.btn18],
        appear: this.stateT * 3,
        icon: (c) => this.drawLantern(c, 0, 4, 1.1, 0.8 + 0.2 * Math.sin(this.time * 2)),
      });
    } else if (this.state === "over") {
      const pct = Math.round((this.totalSync / Math.max(1, this.breaths)) * 100);
      drawCard(ctx, w, h, {
        title: "ร่างกายสงบลงแล้ว",
        subtitle: "ลองสังเกตความอยากตอนนี้ดู",
        bigValue: `${this.breaths}`,
        bigLabel: "ลมหายใจช้าๆ ที่คุณทำได้",
        chips: [`เข้าจังหวะ ${pct}%`, `ดีที่สุด ${this.best}%`],
        accent: "#ff9d4d",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5, coins: this.earned,
      });
    }
  }
}
