// "Neon Pulse" — an auto-runner set to a generated beat. Tap (or hold) to hop over spikes, bounce on
// pads, tap rings in mid-air, glide through pillar gates, run upside down and dodge monsters.
// Levels are endless and generated from their number (see pulse/levels.ts); every ten levels form
// a world with its own scenery, blocks and music. Physics live in pulse/sim.ts so an offline solver
// can prove the levels are beatable with the same rules.
// Original design: shapes, modes, monsters, art and music are all made for this app.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, clamp, TAU, FONT_DISPLAY, FONT_BODY, roundRectPath } from "./engine/fx";
import { Button, drawCard, drawCoin } from "./engine/ui";
import { SUB, CEIL, cloneRun, newRun, setHeld, step, type Level, type Obj, type Run, type SimEvent } from "./pulse/sim";
import { buildLevel, levelTags, worldName, worldOf, LEVELS_PER_WORLD } from "./pulse/levels";
import { Backdrop, themeFor, drawBlock, drawSpike, drawHazard, drawPickup, drawPortal, drawCheck, drawFinish, drawSign, drawPlayer, hsl, type Theme, type View } from "./pulse/art";
import { WorldMap, type MapHost } from "./pulse/map";

export const pulseGame: GameDefinition = {
  id: "pulse",
  title: "พัลส์นีออน",
  tagline: "วิ่งตามจังหวะ ผ่านโลกใหม่ทุก 10 ด่าน ไม่มีที่สิ้นสุด",
  why: "ต้องจับจังหวะและจดจำด่าน ใจอยู่กับทุกวินาทีจนลืมความอยาก มีนับถอยหลังให้ตั้งตัวทุกครั้งที่เริ่มใหม่",
  category: "action",
  minutes: "2–10 นาที",
  palette: ["#12052e", "#f472b6"],
  countdown: true,
  create: (env) => new PulseGame(env),
};

type State = "map" | "play" | "dead" | "done";
const ACCENTS = ["#db2777", "#0891b2", "#16a34a", "#ea580c", "#7c3aed", "#ca8a04"];

class PulseGame implements GameInstance {
  private w = 0;
  private h = 0;
  private U = 40;
  private groundY = 0;
  private state: State = "map";
  private stateT = 0;
  private time = 0;

  private level = 1;
  private unlocked = 1;
  private practice = false;
  private lv: Level;
  private theme: Theme;
  private run: Run;
  private checkpoint: Run | null = null;
  private ceilSpans: [number, number][] = [];
  private coinIndex = new Map<number, number>(); // object id -> coin number inside the level
  private haveCoins = new Set<number>(); // coins found on earlier clears of this level
  private slowPortals = new Set<number>();
  private camY = 0;

  private attempts = 1;
  private best = 0;
  private sessionBest = 0;
  private trail: { x: number; y: number; a: number }[] = [];
  private beat = 0;
  private nextBeatT = 0;
  private beatPulse = 0;
  private beatHit = false;
  private particles = new Particles();
  private floaters = new Floaters();
  private nextBtn = new Button("ด่านต่อไป", "#db2777");
  private menuBtn = new Button("แผนที่", "#db2777", "ghost");
  private earned = 0;
  private freshCoins = 0;
  private newWorld = false;
  private backdrop = new Backdrop();
  private map: WorldMap;

  constructor(private env: GameEnv) {
    // Progress from the old single-track numbering carries over as is: a player who reached level N
    // keeps level N open (new levels at the same number are never harder), and levels below it
    // count as passed on the map. Stored values only ever grow.
    this.unlocked = Math.max(1, parseInt(env.store.get("unlocked") || "1", 10) || 1);
    this.level = this.unlocked;
    this.practice = env.store.get("practice") === "1";
    this.lv = buildLevel(this.level);
    this.theme = themeFor(this.lv.world);
    this.run = newRun(this.lv);
    const host: MapHost = {
      unlocked: () => this.unlocked,
      best: (n) => this.bestOf(n),
      coins: (n) => this.coinsOf(n),
      tags: (n) => levelTags(n === this.lv.n ? this.lv : buildLevel(n)),
      practice: () => this.practice,
      setPractice: (v) => {
        this.practice = v;
        env.store.set("practice", v ? "1" : "0");
        this.click();
      },
      play: (n) => {
        this.level = n;
        this.begin();
      },
      click: () => this.click(),
    };
    this.map = new WorldMap(host);
    this.map.focus(this.level);
  }

  // ── Persistent progress ─────────────────────────────────────────────────

  private bestOf(n: number) {
    if (n < this.unlocked) return 100;
    return clamp(parseFloat(this.env.store.get(`v2_best_${n}`) || "0") || 0, 0, 100);
  }

  private coinSet(n: number): Set<number> {
    const raw = this.env.store.get(`v2_coins_${n}`) || "";
    return new Set(raw.split(",").filter(Boolean).map(Number));
  }

  private coinsOf(n: number) {
    const lv = n === this.lv.n ? this.lv : buildLevel(n);
    return { got: Math.min(lv.coins, this.coinSet(n).size), total: lv.coins };
  }

  // ── Run control ─────────────────────────────────────────────────────────

  private load() {
    this.lv = buildLevel(this.level);
    this.theme = themeFor(this.lv.world);
    this.ceilSpans = [];
    this.coinIndex.clear();
    this.haveCoins = this.coinSet(this.level);
    this.slowPortals.clear();
    let spd = this.lv.speed;
    let open = -1;
    let flipped = false;
    let k = 0;
    for (const o of this.lv.objs) {
      if (o.kind === "coin") this.coinIndex.set(o.id, k++);
      if (o.kind === "speed") {
        if (o.v < spd - 0.01) this.slowPortals.add(o.id);
        spd = o.v;
      }
      if (o.kind === "glide" && open < 0) open = o.x;
      if (o.kind === "cube" && open >= 0 && !flipped) {
        this.ceilSpans.push([open, o.x + 1]);
        open = -1;
      }
      if (o.kind === "gravity") {
        flipped = !flipped;
        if (flipped && open < 0) open = o.x;
        else if (!flipped && open >= 0) {
          this.ceilSpans.push([open, o.x + 1]);
          open = -1;
        }
      }
    }
  }

  private begin() {
    this.load();
    this.checkpoint = null;
    this.attempts = 1;
    this.best = this.bestOf(this.level);
    this.sessionBest = 0;
    this.respawn();
    this.env.emit({ type: "start" }); // the runtime shows 3-2-1 for this
  }

  private respawn() {
    const cp = this.practice && this.checkpoint;
    this.run = cp ? cloneRun(cp) : newRun(this.lv);
    this.run.held = false;
    this.run.buf = 0;
    this.trail = [];
    this.camY = this.targetCamY();
    this.state = "play";
    this.stateT = 0;
    this.beat = 0;
    this.nextBeatT = 0;
  }

  private die() {
    this.state = "dead";
    this.stateT = 0;
    const sx = this.sx(this.run.px + 0.5);
    const sy = this.sy(this.run.py + 0.5);
    this.particles.burst(sx, sy, hsl(this.theme.player, 95, 65), 40, { speed: 320, size: 4, gravity: 300, life: 0.8 });
    this.particles.burst(sx, sy, "#ffffff", 14, { speed: 200, size: 2.5, life: 0.5 });
    this.particles.ring(sx, sy, "#ffffff", 50, 0.5);
    this.env.sfx.noise({ dur: 0.4, vol: 0.12, freq: 900, sweepTo: 120, type: "lowpass" });
    const pct = this.progress();
    this.sessionBest = Math.max(this.sessionBest, pct);
    if (pct > this.best) {
      this.best = pct;
      this.env.store.set(`v2_best_${this.level}`, pct.toFixed(1));
      if (pct > 5) this.floaters.add(`สถิติใหม่ ${Math.floor(pct)}%`, this.w / 2, this.h * 0.2, "#fde68a", 24, 0.75);
    }
  }

  private complete() {
    this.state = "done";
    this.stateT = 0;
    this.best = 100;
    this.env.store.set(`v2_best_${this.level}`, "100");
    this.newWorld = false;
    if (this.level >= this.unlocked) {
      this.unlocked = this.level + 1;
      this.env.store.set("unlocked", `${this.unlocked}`);
      this.newWorld = this.level % LEVELS_PER_WORLD === 0;
    }
    // Coins count once a level is finished; each coin pays only the first time it is collected
    const have = this.coinSet(this.level);
    this.freshCoins = 0;
    this.lv.objs.forEach((o, i) => {
      if (o.kind !== "coin" || !this.run.used[i]) return;
      const k = this.coinIndex.get(o.id)!;
      if (!have.has(k)) {
        have.add(k);
        this.freshCoins++;
      }
    });
    if (this.freshCoins) this.env.store.set(`v2_coins_${this.level}`, [...have].join(","));
    // Balance: a normal clear pays about 10-30, first-time coins push a great run towards the 50 cap
    this.earned = Math.min(50, Math.round((this.practice ? 5 : 10) + Math.min(20, this.level * 0.5) + this.freshCoins * 3));
    [0, 2, 4, 5, 7].forEach((k, i) => this.env.sfx.chime(this.note(k + 4), 0.11, i * 0.1));
    for (let i = 0; i < 4; i++) this.particles.burst(this.w * (0.2 + i * 0.2), this.h * 0.4, hsl(this.theme.hue + i * 40, 95, 65), 30, { speed: 300, size: 3, gravity: 200 });
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: this.level,
      best: this.unlocked - 1,
      summary: `ผ่านด่าน ${this.level}${this.practice ? " (โหมดฝึก)" : ""} · ลอง ${this.attempts} ครั้ง`,
      stats: { level: this.level, attempts: this.attempts, practice: this.practice ? 1 : 0, world: this.lv.world + 1 },
    });
  }

  private toMap() {
    // A little for the time spent on an unfinished level
    if (this.state === "play" || this.state === "dead") {
      const pct = Math.max(this.sessionBest, this.progress());
      const coins = this.attempts > 1 || pct > 10 ? Math.min(20, Math.floor(pct / 5)) : 0;
      if (coins > 0)
        this.env.emit({ type: "end", coins, score: Math.floor(pct), best: Math.floor(this.best), summary: `ด่าน ${this.level} ไปได้ ${Math.floor(pct)}% · ลอง ${this.attempts} ครั้ง`, stats: { level: this.level, attempts: this.attempts } });
    }
    // After a clear the map opens on the newest level; after quitting, on the level being played
    this.map.focus(this.state === "done" ? this.unlocked : Math.min(this.level, this.unlocked));
    this.state = "map";
    this.stateT = 0;
  }

  private progress() {
    return clamp((this.run.px / this.lv.length) * 100, 0, 100);
  }

  private click() {
    this.env.sfx.tone({ freq: 600, dur: 0.05, vol: 0.04 });
  }

  // ── Coordinates ─────────────────────────────────────────────────────────

  private camX() {
    return this.run.px - Math.max(1.6, (this.w * 0.18) / this.U);
  }

  private targetCamY() {
    const r = this.run;
    if (r.hasCeil || r.grav < 0) return 0;
    return Math.max(0, r.py - 6);
  }

  private sx(x: number) {
    return (x - this.camX()) * this.U;
  }

  private sy(y: number) {
    return this.groundY - (y - this.camY) * this.U;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.U = Math.min(w / 10, h / 15);
    this.groundY = h * 0.7;
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private press(down: boolean) {
    setHeld(this.run, down);
  }

  pointer(p: PointerInfo) {
    if (this.state === "map") return this.map.pointer(p);
    if (this.state === "play" || this.state === "dead") {
      if (p.type === "down" && p.x > this.w - 58 && p.y < 58) {
        this.toMap();
        return;
      }
      if (p.type === "down") this.press(true);
      if (p.type === "up" || p.type === "cancel") this.press(false);
      return;
    }
    if (this.state === "done") {
      for (const b of [this.nextBtn, this.menuBtn]) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.6) {
            if (b === this.nextBtn) this.nextLevel();
            else this.toMap();
          }
          b.pressed = false;
        }
      }
    }
  }

  private nextLevel() {
    this.level = Math.min(this.level + 1, this.unlocked);
    this.begin();
  }

  key(code: string, down: boolean) {
    const jump = code === "Space" || code === "ArrowUp" || code === "KeyW";
    if (this.state === "map") return down ? this.map.key(code) : jump;
    if (jump) {
      if (this.state === "play" || this.state === "dead") this.press(down);
      else if (down && this.state === "done" && this.stateT > 0.6) this.nextLevel();
      return true;
    }
    if (down && code === "Enter" && this.state === "done") {
      this.nextLevel();
      return true;
    }
    if (down && code === "Escape" && (this.state === "play" || this.state === "dead" || this.state === "done")) {
      this.toMap();
      return true;
    }
    return false;
  }

  // ── Simulation ──────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
    for (const b of [this.nextBtn, this.menuBtn]) b.update(dt);
    if (this.state === "map") {
      this.map.update(dt);
      return;
    }
    if (this.state === "dead") {
      if (this.stateT > 0.75) {
        this.attempts++;
        this.respawn();
        // Give the player time to get ready again instead of throwing them straight back in
        const fromSave = this.practice && this.checkpoint;
        this.env.countdown(3, fromSave ? "เริ่มจากจุดเซฟ" : `ครั้งที่ ${this.attempts}`);
      }
      return;
    }
    if (this.state !== "play") return;
    this.music(dt);
    const steps = Math.max(1, Math.ceil(dt / SUB - 1e-6));
    const hdt = dt / steps;
    const ev = (e: SimEvent, o?: Obj) => this.onEvent(e, o);
    for (let i = 0; i < steps && this.run.state === 0; i++) step(this.run, this.lv, hdt, ev);
    this.camY += (this.targetCamY() - this.camY) * Math.min(1, dt * 6);
    this.trail.push({ x: this.run.px + 0.5, y: this.run.py + 0.5, a: 1 });
    if (this.trail.length > 14) this.trail.shift();
    for (const t of this.trail) t.a -= dt * 3;
  }

  private onEvent(e: SimEvent, o?: Obj) {
    const sfx = this.env.sfx;
    switch (e) {
      case "jump":
        sfx.tone({ freq: 460, glideTo: 700, dur: 0.06, vol: 0.03, type: "triangle" });
        break;
      case "pad":
        sfx.tone({ freq: 300, glideTo: 900, dur: 0.15, vol: 0.06, type: "square" });
        if (o) this.particles.burst(this.sx(o.x + 0.5), this.sy(o.y), "#fde047", 12, { speed: 160, angle: -Math.PI / 2, spread: 1.2, size: 2.5 });
        break;
      case "orb":
        sfx.chime(this.note(8), 0.06);
        if (o) {
          this.particles.burst(this.sx(o.x + 0.45), this.sy(o.y + 0.45), "#fde047", 16, { speed: 180, size: 2.5 });
          this.particles.ring(this.sx(o.x + 0.45), this.sy(o.y + 0.45), "#fde047", 40, 0.4);
        }
        break;
      case "flip":
        sfx.tone({ freq: this.run.grav === 1 ? 600 : 300, glideTo: this.run.grav === 1 ? 300 : 600, dur: 0.2, vol: 0.05, type: "triangle" });
        break;
      case "glide":
        sfx.tone({ freq: 400, glideTo: 800, dur: 0.25, vol: 0.05, type: "sine" });
        break;
      case "speed":
        sfx.noise({ dur: 0.35, vol: 0.06, freq: 600, sweepTo: 3000, type: "bandpass" });
        break;
      case "coin":
        sfx.chime(this.note(9), 0.07);
        if (o) this.floaters.add("+เหรียญ", this.sx(o.x), this.sy(o.y + 1), "#ffd76a", 14, 0.7);
        break;
      case "check":
        if (this.practice) {
          const cp = cloneRun(this.run);
          cp.vy = 0;
          cp.onGround = true;
          cp.held = false;
          cp.buf = 0;
          cp.rot = 0;
          this.checkpoint = cp;
          if (o) this.floaters.add("จุดเซฟ", this.sx(o.x), this.sy(2), "#86efac", 16, 0.9);
        }
        break;
      case "die":
        this.die();
        break;
      case "done":
        this.complete();
        break;
    }
  }

  private note(stepN: number, base = this.theme.music.base) {
    const sc = this.theme.music.scale;
    const oct = Math.floor(stepN / sc.length);
    const idx = ((stepN % sc.length) + sc.length) % sc.length;
    return base * Math.pow(2, (sc[idx] + 12 * oct) / 12);
  }

  private music(dt: number) {
    const m = this.theme.music;
    const eighth = 60 / m.bpm / 2;
    this.nextBeatT -= dt;
    this.beatHit = false;
    if (this.nextBeatT > 0) return;
    this.nextBeatT += eighth;
    const b = this.beat++;
    const sfx = this.env.sfx;
    const style = this.theme.style;
    if (b % 2 === 0) {
      sfx.tone({ freq: style === 4 ? 110 : 140, glideTo: 45, dur: 0.16, vol: 0.13, type: "sine", attack: 0.002 });
      this.beatPulse = 1;
      this.beatHit = b % 8 === 0;
      const bar = Math.floor(b / 8) % 4;
      const bass = [0, -2, -4, -1][bar];
      sfx.tone({ freq: this.note(bass, m.base / 4), dur: eighth * 1.6, vol: 0.05, type: m.bass });
    } else sfx.noise({ dur: 0.05, vol: style === 2 ? 0.018 : 0.025, freq: m.hat, type: "highpass" });
    if (style === 3 && b % 4 === 3) sfx.noise({ dur: 0.08, vol: 0.03, freq: 2000, type: "bandpass" });
    const motif = [6, 11, 14][this.lv.n % 3];
    if (b % 16 === 6 || b % 16 === motif) sfx.tone({ freq: this.note((((b / 16) | 0) + this.lv.n) % 5 + 5, m.base / 2), dur: 0.2, vol: 0.035, type: m.lead, echo: 0.3 });
  }

  // ── Render ──────────────────────────────────────────────────────────────

  render() {
    const { ctx } = this.env;
    if (this.state === "map") {
      this.map.render(ctx, this.w, this.h);
      this.particles.render(ctx);
      return;
    }
    const { w, h, U } = this;
    const th = this.theme;
    const r = this.run;
    const cam = this.camX();
    const gy = this.sy(0);
    this.backdrop.render(ctx, th, w, h, cam, U, gy, this.time, this.beatPulse, this.beatHit && !this.env.reducedMotion);
    this.backdrop.floor(ctx, th, w, h, cam, U, gy, this.beatPulse);
    const v: View = {
      U,
      sx: (x) => this.sx(x),
      sy: (y) => this.sy(y),
      time: this.time,
      t: r.t,
      pulse: this.beatPulse,
      playerX: r.px,
      playerY: r.py,
    };
    const x0 = cam - 1.5;
    const x1 = cam + w / U + 2;

    // Ceiling over glide and upside-down sections
    const cy = this.sy(CEIL);
    for (const [a, b] of this.ceilSpans) {
      if (b < x0 || a > x1) continue;
      const sa = Math.max(-10, this.sx(a));
      const sb = Math.min(w + 10, this.sx(b));
      const g = ctx.createLinearGradient(0, 0, 0, cy);
      g.addColorStop(0, hsl(th.hue, 45, 5, 0.92));
      g.addColorStop(1, hsl(th.hue, 55, 13, 0.97));
      ctx.fillStyle = g;
      ctx.fillRect(sa, 0, sb - sa, cy);
      ctx.strokeStyle = hsl(th.style === 3 || th.style === 5 ? th.acc : th.hue, 100, 72);
      ctx.lineWidth = 3;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(sa, cy);
      ctx.lineTo(sb, cy);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    for (const hint of this.lv.hints) if (hint.x > x0 - 6 && hint.x < x1 + 4) drawSign(ctx, th, v, hint.x, hint.text, FONT_DISPLAY);
    if (this.lv.length > x0 && this.lv.length < x1 + 3) drawFinish(ctx, th, v, this.lv.length);

    // Objects
    const objs = this.lv.objs;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.x > x1) break;
      if (o.x + o.w < x0) continue;
      switch (o.kind) {
        case "block":
          drawBlock(ctx, th, v, o);
          break;
        case "spike":
        case "spikeDown":
          drawSpike(ctx, th, v, o);
          break;
        case "saw":
        case "rail":
        case "drone":
        case "crawler":
        case "chomper":
          drawHazard(ctx, th, v, o);
          break;
        case "pad":
        case "orb":
        case "coin":
          if (o.kind === "coin" && !r.used[i] && this.haveCoins.has(this.coinIndex.get(o.id)!)) {
            // found on an earlier clear: drawn faded, still collectable
            ctx.globalAlpha = 0.4;
            drawPickup(ctx, th, v, o, false);
            ctx.globalAlpha = 1;
          } else drawPickup(ctx, th, v, o, !!r.used[i]);
          break;
        case "gravity":
        case "glide":
        case "cube":
        case "speed":
          drawPortal(ctx, v, o, this.slowPortals.has(o.id));
          break;
        case "check":
          if (this.practice) drawCheck(ctx, v, o, !!r.used[i]);
          break;
      }
    }

    // Trail + player
    if (this.state === "play" || this.state === "done") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const t of this.trail) {
        if (t.a <= 0) continue;
        ctx.fillStyle = hsl(th.player, 100, 65, t.a * 0.35);
        const s = U * 0.5 * t.a;
        ctx.fillRect(this.sx(t.x) - s / 2, this.sy(t.y) - s / 2, s, s);
      }
      ctx.restore();
      drawPlayer(ctx, th, v, r.glide, r.rot, r.held, r.grav);
    }
    this.particles.render(ctx);
    this.floaters.render(ctx);
    if (this.state === "play" || this.state === "dead") this.hud(ctx);
    if (this.state === "done") this.doneCard(ctx);
  }

  private hud(c: CanvasRenderingContext2D) {
    const { w } = this;
    const th = this.theme;
    const pct = this.progress();
    const bw = Math.min(w * 0.46, 260);
    const bx = w / 2 - bw / 2;
    c.fillStyle = "rgba(0,0,0,0.45)";
    roundRectPath(c, bx, 16, bw, 10, 5);
    c.fill();
    c.fillStyle = hsl(th.player, 100, 65);
    roundRectPath(c, bx, 16, Math.max(10, (bw * pct) / 100), 10, 5);
    c.fill();
    if (this.best > 0 && this.best < 100) {
      c.fillStyle = "#ffffff";
      c.fillRect(bx + (bw * this.best) / 100 - 1, 12, 2, 18);
    }
    c.font = `700 13px ${FONT_DISPLAY}`;
    c.textAlign = "center";
    c.textBaseline = "top";
    c.fillStyle = "#ffffff";
    c.fillText(`${Math.floor(pct)}%`, w / 2, 32);
    // level card (top-left)
    c.fillStyle = "rgba(0,0,0,0.35)";
    roundRectPath(c, 8, 8, 104, 58, 14);
    c.fill();
    c.textAlign = "left";
    c.font = `700 13px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(`ด่าน ${this.level}${this.practice ? " · ฝึก" : ""}`, 16, 13);
    c.font = `500 11px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.fillText(`ครั้งที่ ${this.attempts}`, 16, 31);
    let got = 0;
    this.lv.objs.forEach((o, i) => o.kind === "coin" && this.run.used[i] && got++);
    drawCoin(c, 22, 54, 6);
    c.fillText(`${got}/${this.lv.coins}`, 32, 47);
    // menu button (top-right)
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.arc(w - 30, 30, 20, 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.4)";
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = "#ffffff";
    c.fillRect(w - 36, 23, 4, 14);
    c.fillRect(w - 28, 23, 4, 14);
    if (this.attempts === 1 && this.run.px < 12 && this.level <= 2) {
      c.font = `700 15px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.fillStyle = `rgba(255,255,255,${clamp(1 - this.run.px / 12, 0, 1)})`;
      c.fillText("แตะเพื่อกระโดด · กดค้างเพื่อกระโดดต่อเนื่อง", w / 2, this.sy(0) + 40);
    }
  }

  private doneCard(c: CanvasRenderingContext2D) {
    const chips = [`เหรียญในด่าน ${this.coinsOf(this.level).got}/${this.lv.coins}`];
    if (this.freshCoins) chips.push(`ใหม่ +${this.freshCoins}`);
    let subtitle = `ลอง ${this.attempts} ครั้ง${this.practice ? " · โหมดฝึก" : ""}`;
    if (this.newWorld) subtitle = `เปิดโลกใหม่: ${worldName(worldOf(this.level + 1))}!`;
    this.nextBtn.color = this.menuBtn.color = ACCENTS[this.theme.style];
    drawCard(c, this.w, this.h, {
      title: `ผ่านด่าน ${this.level}!`,
      subtitle,
      chips,
      coins: this.earned,
      accent: ACCENTS[this.theme.style],
      buttons: [this.nextBtn, this.menuBtn],
      appear: this.stateT * 2,
    });
  }

  destroy() {}
}
