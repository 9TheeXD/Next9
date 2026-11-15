// "Star Guardian" — a vertical space shooter in maps (sectors). Drag to fly, the ship fires by itself.
// Map 1 is a gentle practice run; beating a map's boss unlocks the next, without end. Each map has its
// own sky, brings in new enemies, attacks or hazards, and its own boss. Coins buy permanent upgrades in
// the hangar (no level cap). Fast and absorbing: there is no attention left over for a craving.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeSprite, makeStars, roundRectPath, clamp, rgba, TAU, FONT_DISPLAY, FONT_BODY, glow, ease, type Star } from "./engine/fx";
import { Button, drawCard, drawCoin, glassPanel } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { wallet, UPGRADES, ITEMS } from "./engine/economy";
import { drawShip, shipFlame } from "./art/skins";
import { ENEMIES, bossName, coinPlan, mapSpec, mapTheme, type MapSpec, type Theme } from "./shooter/maps";
import { World, shipStats, type WEvent } from "./shooter/world";
import { drawAmbient, drawBoss, drawBullets, drawEnemy, drawLasers, drawMapPlanet, drawMarks, drawPickup, makeBackdrop, PICKUP_COLOR } from "./shooter/draw";

export const shooterGame: GameDefinition = {
  id: "shooter",
  title: "ยานพิทักษ์ดาว",
  tagline: "ยิงฝ่าแมพอวกาศ ล้มบอสปลดล็อกแมพใหม่ไม่รู้จบ",
  why: "เกมเร็วที่ต้องหลบและเล็งตลอดเวลา สมองไม่มีที่ว่างให้คิดถึงบุหรี่ เก็บเหรียญไปอัปยานให้แรงขึ้นเรื่อยๆ",
  category: "action",
  minutes: "2–4 นาที/แมพ",
  palette: ["#070a24", "#4fa8ff"],
  countdown: true,
  create: (env) => new ShooterGame(env),
};

type State = "select" | "hangar" | "play" | "clear" | "over";

const HAZARD_NAME: Record<string, string> = { rocks: "อุกกาบาตลอย", meteors: "ดาวตก", bolts: "ฟ้าผ่า" };
const NODE_GAP = 112;

class ShooterGame implements GameInstance {
  private w = 0;
  private h = 0;
  private state: State = "select";
  private stateT = 0;
  private time = 0;
  private world: World | null = null;
  private spec: MapSpec;
  private theme: Theme;
  private bg: HTMLCanvasElement | null = null;
  private bgFor = "";
  private unlocked = 1;
  private sel = 1;
  private stars: Star[][] = [makeStars(60, 1), makeStars(40, 2), makeStars(25, 3)];
  private shipSprite: HTMLCanvasElement | null = null;
  private skin = "ship_falcon";
  private particles = new Particles();
  private floaters = new Floaters();
  private shake = 0;
  private hurtFlash = 0;
  private novaFlash = 0;
  private hints: string[] = [];
  private hintT = 0;
  private banner = { text: "", sub: "", color: "#ffffff", t: 0 };
  private drag: { id: number; ox: number; oy: number } | null = null;
  private keys = new Set<string>();
  private best = 0;
  private earned = 0;
  private newUnlock = false;
  private lastBlockSfx = 0;
  // Map select
  private scroll = 0;
  private scrollVel = 0;
  private pan: { id: number; y: number; s: number; moved: number; x: number } | null = null;
  private flyBtn = new Button("ออกบิน", "#2f8cff");
  private hangarBtn = new Button("โรงเก็บยาน", "#ffffff", "ghost");
  // Clear / over cards
  private nextBtn = new Button("ไปแมพถัดไป", "#22c55e");
  private mapsBtn = new Button("เลือกแมพ", "#ffffff", "ghost");
  private upBtn = new Button("อัปเกรดยาน", "#ffffff", "ghost");
  private retryBtn = new Button("ลองอีกครั้ง", "#2f8cff");
  // Hangar
  private backBtn = new Button("กลับไปเลือกแมพ", "#2f8cff");
  private hangarRows: { id: string; btn: Button }[] = [];
  private skinHits: { id: string; x: number; y: number; w: number; h: number }[] = [];
  private pendingBuy = "";
  private pendingT = 0;
  private hScroll = 0;
  private hMax = 0;
  private hTop = 0;
  private hBottom = 0;

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("score_best") || "0", 10) || 0;
    let u = parseInt(env.store.get("unlocked") || "0", 10) || 0;
    if (!u) {
      // Players of the old endless mode keep a little progress: one map per boss they beat.
      const oldWave = parseInt(env.store.get("best") || "0", 10) || 0;
      u = clamp(1 + Math.floor(oldWave / 5), 1, 6);
      if (u > 1) env.store.set("unlocked", String(u));
    }
    this.unlocked = u;
    this.sel = u;
    this.spec = mapSpec(this.sel);
    this.theme = mapTheme(this.spec);
    this.skin = wallet.equipped("shipSkin") || "ship_falcon";
  }

  // ── Flow ─────────────────────────────────────────────────────────────────

  private setState(s: State) {
    this.state = s;
    this.stateT = 0;
    for (const b of this.allButtons()) b.pressed = false;
    if (s === "select") this.centerOn(this.sel);
  }

  private selectMap(m: number) {
    this.sel = clamp(m, 1, this.unlocked);
    this.spec = mapSpec(this.sel);
    this.theme = mapTheme(this.spec);
    this.ensureBg();
  }

  private startMap(m: number) {
    this.selectMap(m);
    this.skin = wallet.equipped("shipSkin") || "ship_falcon";
    this.buildShip();
    this.world = new World(this.spec, shipStats((id) => wallet.level(id)), this.w, this.h, (Date.now() + m * 977) % 1e9);
    this.particles = new Particles();
    this.floaters = new Floaters();
    this.hints = [];
    this.hintT = 0;
    this.drag = null;
    this.banner.t = 0;
    this.setState("play");
    this.env.emit({ type: "start" });
  }

  private finish(won: boolean) {
    const w = this.world!;
    const m = this.spec.m;
    this.newUnlock = false;
    if (won) {
      this.earned = Math.min(60, w.coins + coinPlan(m).clear);
      if (m + 1 > this.unlocked) {
        this.unlocked = m + 1;
        this.newUnlock = true;
        this.env.store.set("unlocked", String(this.unlocked));
      }
      this.env.sfx.chime(pentatonic(5), 0.14);
      this.env.sfx.chime(pentatonic(7), 0.12, 0.15);
      this.env.sfx.chime(pentatonic(9), 0.12, 0.3);
    } else {
      this.earned = Math.min(60, w.coins + Math.max(0, w.wave - 1));
      this.particles.burst(w.px, w.py, shipFlame(this.skin), 60, { speed: 300, size: 3, gravity: 0, life: 1.2 });
      this.env.sfx.noise({ dur: 0.9, vol: 0.18, freq: 500, sweepTo: 60, type: "lowpass" });
    }
    if (w.score > this.best) {
      this.best = w.score;
      this.env.store.set("score_best", String(this.best));
    }
    const where = won ? `ผ่านแมพ ${m}` : w.wave > this.spec.waves ? `แพ้บอสแมพ ${m}` : `แมพ ${m} ระลอก ${w.wave}`;
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: w.score,
      best: this.best,
      summary: `${where} · ยิงไป ${w.kills} ลำ`,
      stats: { map: m, wave: w.wave, kills: w.kills, cleared: won ? 1 : 0, unlocked: this.unlocked },
    });
    this.nextBtn.label = `ไปแมพ ${m + 1}`;
    this.setState(won ? "clear" : "over");
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  private buildShip() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const size = 56;
    this.shipSprite = makeSprite(size * 1.6, size * 1.6, dpr, (c) => {
      c.translate(size * 0.8, size * 0.8);
      drawShip(c, size, this.skin, 0);
    });
  }

  private ensureBg() {
    const key = `${this.spec.m}:${this.w}x${this.h}`;
    if (key === this.bgFor || !this.w) return;
    this.bgFor = key;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.bg = makeBackdrop(this.theme, this.w, this.h, dpr, this.spec.seed);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.world?.resize(w, h);
    this.buildShip();
    this.ensureBg();
    if (this.state === "select") this.centerOn(this.sel);
  }

  // ── Map select geometry ──────────────────────────────────────────────────

  private areaTop() {
    return 70;
  }
  private areaBottom() {
    return this.h - 200;
  }
  private shownMaps() {
    return this.unlocked + 3;
  }
  private maxScroll() {
    return Math.max(0, (this.shownMaps() - 1) * NODE_GAP - (this.areaBottom() - this.areaTop() - 110));
  }
  private nodePos(m: number) {
    const y = this.areaBottom() - 56 - (m - 1) * NODE_GAP + this.scroll;
    const x = this.w / 2 + Math.sin(m * 1.25) * Math.min(this.w * 0.26, 150);
    return { x, y };
  }
  private centerOn(m: number) {
    const mid = (this.areaTop() + this.areaBottom()) / 2;
    this.scroll = clamp(mid - (this.areaBottom() - 56 - (m - 1) * NODE_GAP), 0, this.maxScroll());
    this.scrollVel = 0;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private allButtons() {
    return [this.flyBtn, this.hangarBtn, this.nextBtn, this.mapsBtn, this.upBtn, this.retryBtn, this.backBtn, ...this.hangarRows.map((r) => r.btn)];
  }

  private press(btns: Button[], p: PointerInfo, ready: boolean, act: (b: Button) => void) {
    for (const b of btns) {
      if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
      if (p.type === "up" || p.type === "cancel") {
        if (p.type === "up" && b.pressed && b.hit(p.x, p.y) && ready) act(b);
        b.pressed = false;
      }
    }
  }

  pointer(p: PointerInfo) {
    if (this.state === "select") return this.pointerSelect(p);
    if (this.state === "hangar") return this.pointerHangar(p);
    if (this.state === "clear") {
      this.press([this.nextBtn, this.mapsBtn, this.upBtn], p, this.stateT > 0.6, (b) => {
        if (b === this.nextBtn) this.startMap(this.spec.m + 1);
        else if (b === this.mapsBtn) {
          this.selectMap(this.unlocked);
          this.setState("select");
        } else this.setState("hangar");
      });
      return;
    }
    if (this.state === "over") {
      this.press([this.retryBtn, this.upBtn, this.mapsBtn], p, this.stateT > 0.6, (b) => {
        if (b === this.retryBtn) this.startMap(this.spec.m);
        else if (b === this.mapsBtn) this.setState("select");
        else this.setState("hangar");
      });
      return;
    }
    const w = this.world;
    if (!w) return;
    if (p.type === "down") this.drag = { id: p.id, ox: w.px - p.x, oy: w.py - p.y };
    else if (p.type === "move" && this.drag && this.drag.id === p.id) w.movePlayer(p.x + this.drag.ox, p.y + this.drag.oy);
    else if ((p.type === "up" || p.type === "cancel") && this.drag && this.drag.id === p.id) this.drag = null;
  }

  private pointerSelect(p: PointerInfo) {
    this.press([this.flyBtn, this.hangarBtn], p, this.stateT > 0.3, (b) => {
      if (b === this.flyBtn) this.startMap(this.sel);
      else this.setState("hangar");
    });
    const inArea = p.y > this.areaTop() - 20 && p.y < this.areaBottom() + 10;
    if (p.type === "down" && inArea) this.pan = { id: p.id, y: p.y, x: p.x, s: this.scroll, moved: 0 };
    else if (p.type === "move" && this.pan && this.pan.id === p.id) {
      const ns = clamp(this.pan.s + (p.y - this.pan.y), -40, this.maxScroll() + 40);
      this.scrollVel = (ns - this.scroll) * 60;
      this.scroll = ns;
      this.pan.moved = Math.max(this.pan.moved, Math.abs(p.y - this.pan.y));
    } else if ((p.type === "up" || p.type === "cancel") && this.pan && this.pan.id === p.id) {
      if (p.type === "up" && this.pan.moved < 10) {
        this.scrollVel = 0;
        for (let m = 1; m <= this.shownMaps(); m++) {
          const n = this.nodePos(m);
          if (Math.hypot(p.x - n.x, p.y - n.y) < 34) {
            if (m <= this.unlocked) {
              this.selectMap(m);
              this.env.sfx.chime(pentatonic(m % 10, 330), 0.08);
            } else {
              this.floaters.add("ล้มบอสแมพก่อนหน้าเพื่อปลดล็อก", this.w / 2, n.y - 40, "#ffd166", 15, 1.6);
              this.env.sfx.tone({ freq: 200, dur: 0.12, vol: 0.06, type: "triangle" });
            }
          }
        }
      }
      this.pan = null;
    }
  }

  private pointerHangar(p: PointerInfo) {
    this.press([this.backBtn], p, this.stateT > 0.25, () => this.setState("select"));
    if (p.type === "down" && p.y > this.hTop && p.y < this.hBottom) this.pan = { id: p.id, y: p.y, x: p.x, s: this.hScroll, moved: 0 };
    else if (p.type === "move" && this.pan && this.pan.id === p.id) {
      this.hScroll = clamp(this.pan.s - (p.y - this.pan.y), 0, this.hMax);
      this.pan.moved = Math.max(this.pan.moved, Math.abs(p.y - this.pan.y));
    }
    // Skins (above the list)
    if (p.type === "up" && this.stateT > 0.25) {
      for (const s of this.skinHits) {
        if (p.x < s.x || p.x > s.x + s.w || p.y < s.y || p.y > s.y + s.h) continue;
        this.tapSkin(s.id, s.x + s.w / 2, s.y);
      }
    }
    // Upgrade buttons: only a tap (not a scroll) inside the visible list counts
    const tap = !this.pan || this.pan.moved < 10;
    for (const r of this.hangarRows) {
      const b = r.btn;
      const visible = b.y >= this.hTop - 2 && b.y + b.h <= this.hBottom + 2;
      if (p.type === "down" && visible && b.hit(p.x, p.y)) b.pressed = true;
      if (p.type === "up" || p.type === "cancel") {
        if (p.type === "up" && b.pressed && tap && b.hit(p.x, p.y) && this.stateT > 0.25) this.buyUpgrade(r.id, b);
        b.pressed = false;
      }
      if (p.type === "move" && this.pan && this.pan.moved >= 10) b.pressed = false;
    }
    if ((p.type === "up" || p.type === "cancel") && this.pan && this.pan.id === p.id) this.pan = null;
  }

  private buyUpgrade(id: string, b: Button) {
    if (wallet.upgrade(id)) {
      this.env.sfx.chime(pentatonic(6 + (wallet.level(id) % 5)), 0.1);
      this.particles.burst(b.x + b.w / 2, b.y + b.h / 2, "#ffd76a", 16, { speed: 140, size: 3, gravity: 0, life: 0.6 });
    } else {
      this.env.sfx.tone({ freq: 200, dur: 0.12, vol: 0.06, type: "triangle" });
      this.floaters.add("เหรียญยังไม่พอ", b.x + b.w / 2, b.y - 6, "#ffd166", 14, 1.1);
    }
  }

  private tapSkin(id: string, x: number, y: number) {
    if (wallet.owns(id)) {
      wallet.equip(id);
      this.skin = id;
      this.buildShip();
      this.env.sfx.chime(pentatonic(8), 0.08);
      return;
    }
    const item = ITEMS.find((i) => i.id === id)!;
    if (wallet.coins() < item.price) {
      this.floaters.add(`ต้องใช้ ${item.price.toLocaleString()} เหรียญ`, x, y - 6, "#ffd166", 14, 1.3);
      this.env.sfx.tone({ freq: 200, dur: 0.12, vol: 0.06, type: "triangle" });
      return;
    }
    if (this.pendingBuy !== id) {
      this.pendingBuy = id;
      this.pendingT = 3;
      this.floaters.add("แตะอีกครั้งเพื่อซื้อ", x, y - 6, "#ffffff", 14, 1.4);
      return;
    }
    if (wallet.buy(id)) {
      this.pendingBuy = "";
      this.skin = id;
      this.buildShip();
      this.env.sfx.chime(pentatonic(10), 0.12);
      this.particles.burst(x, y + 30, "#ffd76a", 24, { speed: 160, size: 3, gravity: 0, life: 0.7 });
    }
  }

  key(code: string, down: boolean) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"].includes(code)) {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      if (down && this.state === "select" && (code === "ArrowUp" || code === "ArrowDown")) {
        this.selectMap(this.sel + (code === "ArrowUp" ? 1 : -1));
        this.centerOn(this.sel);
      }
      return true;
    }
    if (down && (code === "Enter" || code === "Space") && this.stateT > 0.5) {
      if (this.state === "select") this.startMap(this.sel);
      else if (this.state === "clear") this.startMap(this.spec.m + 1);
      else if (this.state === "over") this.startMap(this.spec.m);
      else return false;
      return true;
    }
    return false;
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    for (const b of this.allButtons()) b.update(dt);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.novaFlash = Math.max(0, this.novaFlash - dt * 2);
    this.banner.t = Math.max(0, this.banner.t - dt);
    this.pendingT = Math.max(0, this.pendingT - dt);
    if (this.pendingT <= 0) this.pendingBuy = "";
    if (this.state === "select" && !this.pan) {
      this.scroll += this.scrollVel * dt;
      this.scrollVel *= Math.pow(0.04, dt);
      if (this.scroll < 0) this.scroll += (0 - this.scroll) * Math.min(1, dt * 12);
      if (this.scroll > this.maxScroll()) this.scroll += (this.maxScroll() - this.scroll) * Math.min(1, dt * 12);
    }
    if (this.hints.length) {
      this.hintT += dt;
      if (this.hintT > 3.4) {
        this.hints.shift();
        this.hintT = 0;
      }
    }
    const w = this.world;
    if (this.state !== "play" || !w) return;
    const sp = 340 * dt;
    let mx = 0;
    let my = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) mx -= sp;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) mx += sp;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) my -= sp;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) my += sp;
    if (mx || my) w.movePlayer(w.px + mx, w.py + my);
    w.update(dt);
    if (!this.env.reducedMotion) this.particles.burst(w.px, w.py + 22, shipFlame(this.skin), 1, { speed: 60, size: 3, gravity: 300, life: 0.25, spread: 0.6, angle: Math.PI / 2 });
    const evs = w.events.splice(0);
    for (const e of evs) this.onEvent(e);
  }

  private onEvent(ev: WEvent) {
    const w = this.world!;
    const sfx = this.env.sfx;
    switch (ev.t) {
      case "kill": {
        const e = ev.e;
        const big = e.kind === "boss";
        const col = big ? e.boss!.spec.color : ENEMIES[e.kind].color;
        this.particles.burst(e.x, e.y, col, big ? 90 : 16, { speed: big ? 380 : 220, size: 3, gravity: 0, life: 0.8 });
        this.particles.burst(e.x, e.y, "#fff2c2", big ? 30 : 6, { speed: 160, size: 2, kind: "spark", gravity: 0, life: 0.45 });
        this.particles.ring(e.x, e.y, col, e.r * 3, 0.45);
        this.shake = Math.max(this.shake, big ? 18 : 3);
        sfx.noise({ dur: big ? 1.3 : 0.22, vol: big ? 0.22 : 0.07, freq: 600, sweepTo: 80, type: "lowpass" });
        if (e.kind === "splitter") this.particles.ring(e.x, e.y, "#ff9ae6", 30, 0.3);
        break;
      }
      case "hurt":
        this.shake = Math.max(this.shake, 8);
        this.hurtFlash = 1;
        sfx.tone({ freq: 160, dur: 0.2, vol: 0.1, type: "square", glideTo: 90 });
        break;
      case "block":
        this.particles.burst(ev.x, ev.y, "#a5f3fc", 3, { speed: 120, size: 1.6, kind: "spark", gravity: 0, life: 0.25 });
        if (this.time - this.lastBlockSfx > 0.12) {
          this.lastBlockSfx = this.time;
          sfx.tone({ freq: 1800, dur: 0.04, vol: 0.025, type: "triangle" });
        }
        break;
      case "coin":
        sfx.tone({ freq: 1320, dur: 0.05, vol: 0.04 });
        break;
      case "pickup": {
        const text = ev.kind === "spread" ? "ยิงกระจาย!" : ev.kind === "shield" ? "โล่พลังงาน!" : ev.kind === "heal" ? "ซ่อมยาน!" : "คลื่นล้างจอ!";
        this.floaters.add(text, ev.x, ev.y - 40, PICKUP_COLOR[ev.kind] || "#ffffff", 20);
        sfx.chime(pentatonic(8), 0.09);
        break;
      }
      case "wave":
        this.banner = { text: `ระลอก ${ev.n}/${this.spec.waves}`, sub: ev.n === 1 ? this.spec.name : "", color: "#ffffff", t: 1.8 };
        sfx.chime(pentatonic(ev.n % 8, 330), 0.08);
        break;
      case "bosswarn":
        this.banner = { text: "บอสมาแล้ว!", sub: bossName(this.spec), color: "#ff7a9a", t: 2.6 };
        sfx.tone({ freq: 110, dur: 1.2, vol: 0.12, type: "sawtooth", glideTo: 70 });
        break;
      case "phase":
        this.banner = { text: `บอสเฟส ${ev.n}`, sub: "ท่าโจมตีใหม่", color: "#ffd166", t: 1.6 };
        this.particles.ring(ev.x, ev.y, "#ffffff", 160, 0.6);
        sfx.tone({ freq: 220, dur: 0.6, vol: 0.1, type: "sawtooth", glideTo: 440 });
        break;
      case "bossdown":
        this.floaters.add("ล้มบอสแล้ว!", this.w / 2, this.h * 0.35, "#ffe58a", 30, 2);
        break;
      case "clear":
        this.finish(true);
        break;
      case "dead":
        this.finish(false);
        break;
      case "hint":
        if (this.hints.length === 0) this.hintT = 0;
        this.hints.push(ev.text);
        break;
      case "boom":
        this.particles.ring(ev.x, ev.y, ev.color, ev.r * 1.5, 0.4);
        this.particles.burst(ev.x, ev.y, ev.color, 10, { speed: 140, size: 2.5, gravity: 0, life: 0.5 });
        sfx.noise({ dur: 0.25, vol: 0.06, freq: 900, sweepTo: 200, type: "bandpass" });
        break;
      case "laser":
        sfx.tone({ freq: 900, dur: 0.35, vol: 0.05, type: "sawtooth", glideTo: 300 });
        break;
      case "nova":
        this.novaFlash = 1;
        this.particles.ring(w.px, w.py, "#ffd36e", 400, 0.7);
        sfx.noise({ dur: 0.7, vol: 0.14, freq: 1200, sweepTo: 100, type: "lowpass" });
        break;
      case "tele":
        this.particles.ring(ev.x, ev.y, "#c7d2fe", 80, 0.4);
        sfx.tone({ freq: 600, dur: 0.2, vol: 0.05, type: "sine", glideTo: 1200 });
        break;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private drawSky() {
    const c = this.env.ctx;
    const w = this.w;
    const h = this.h;
    this.ensureBg();
    if (this.bg) c.drawImage(this.bg, 0, 0, w, h);
    const moving = this.state === "play" || this.state === "select";
    this.stars.forEach((layer, k) => {
      const speed = [0.02, 0.05, 0.1][k] * (moving ? 1 : 0.3);
      c.fillStyle = rgba(this.theme.star, 0.25 + k * 0.2);
      for (const s of layer) {
        const y = ((s.y + this.time * speed) % 1) * h;
        c.beginPath();
        c.arc(s.x * w, y, s.r * (0.5 + k * 0.35), 0, TAU);
        c.fill();
      }
    });
    drawAmbient(c, this.theme, w, h, this.time, this.env.reducedMotion);
  }

  render() {
    const c = this.env.ctx;
    c.save();
    if (this.shake && !this.env.reducedMotion) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.drawSky();
    if (this.world && this.state !== "select" && this.state !== "hangar") this.renderWorld();
    this.particles.render(c);
    this.floaters.render(c);
    c.restore();

    if (this.state === "play" && this.world) this.renderHud();
    else if (this.state === "select") this.renderSelect();
    else if (this.state === "hangar") this.renderHangar();
    else if (this.state === "clear") this.renderClear();
    else if (this.state === "over") this.renderOver();
    if (this.state === "select" || this.state === "hangar") this.floaters.render(c);
  }

  private renderWorld() {
    const c = this.env.ctx;
    const wd = this.world!;
    for (const d of wd.drops) {
      if (d.kind === "coin") drawCoin(c, d.x, d.y, 7 + Math.sin(d.t * 8) * 0.8);
      else drawPickup(c, d, this.time);
    }
    drawMarks(c, wd.marks, this.w, this.h, this.time);
    drawLasers(c, wd.lasers, this.h, this.time);
    for (const e of wd.enemies) {
      if (e.kind === "boss") drawBoss(c, e, wd, this.time);
      else drawEnemy(c, e, this.time);
    }
    drawBullets(c, wd.bullets, shipFlame(this.skin));
    if (this.state !== "play" || wd.state === "dead") return;
    // Drones
    const drones = wd.stats.drones;
    for (const side of drones === 2 ? [-1, 1] : drones === 1 ? [-1] : []) {
      const dx = wd.px + side * 34;
      const dy = wd.py + 6 + Math.sin(this.time * 4 + side) * 3;
      glow(c, dx, dy, 14, "#9ef0ff", 0.5);
      c.fillStyle = "#cdfaff";
      c.beginPath();
      c.arc(dx, dy, 5, 0, TAU);
      c.fill();
    }
    if (this.shipSprite) {
      const sw = 56 * 1.6;
      c.globalAlpha = wd.hurtT > 0 && Math.sin(this.time * 50) > 0 ? 0.4 : 1;
      c.drawImage(this.shipSprite, wd.px - sw / 2, wd.py - sw / 2, sw, sw);
      c.globalAlpha = 1;
      // Hit box dot, so the player knows what counts
      c.fillStyle = "rgba(255,255,255,0.85)";
      c.beginPath();
      c.arc(wd.px, wd.py, 3, 0, TAU);
      c.fill();
      if (wd.shieldT > 0) {
        c.strokeStyle = `rgba(160,240,255,${(0.5 + 0.3 * Math.sin(this.time * 10)) * Math.min(1, wd.shieldT)})`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(wd.px, wd.py, 34, 0, TAU);
        c.stroke();
      }
    }
  }

  private renderHud() {
    const c = this.env.ctx;
    const w = this.w;
    const h = this.h;
    const wd = this.world!;
    if (this.hurtFlash > 0) {
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(255,40,80,0)");
      g.addColorStop(1, `rgba(255,40,80,${0.35 * this.hurtFlash})`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    if (this.novaFlash > 0) {
      c.fillStyle = `rgba(255,240,200,${0.45 * this.novaFlash})`;
      c.fillRect(0, 0, w, h);
    }
    c.textBaseline = "top";
    c.textAlign = "left";
    c.font = `800 24px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(wd.score.toLocaleString(), 14, 10);
    c.font = `600 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    const waveText = wd.wave > this.spec.waves ? "บอส" : `ระลอก ${wd.wave}/${this.spec.waves}`;
    c.fillText(`แมพ ${this.spec.m} · ${waveText}`, 14, 40);
    c.textAlign = "right";
    c.font = `800 18px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffd76a";
    c.fillText(`${wd.coins}`, w - 14, 12);
    drawCoin(c, w - 24 - c.measureText(`${wd.coins}`).width, 22, 8);
    const bw = Math.min(160, w * 0.4);
    c.fillStyle = "rgba(255,255,255,0.15)";
    roundRectPath(c, w - 14 - bw, 40, bw, 8, 4);
    c.fill();
    c.fillStyle = wd.hp / wd.maxHp < 0.3 ? "#ff5a7a" : "#5eead4";
    roundRectPath(c, w - 14 - bw, 40, Math.max(0, bw * (wd.hp / wd.maxHp)), 8, 4);
    c.fill();
    // Active power-ups
    let px = w - 14;
    for (const [t, max, col] of [
      [wd.spreadT, 8 * wd.stats.luck, PICKUP_COLOR.spread],
      [wd.shieldT, 5 * wd.stats.luck, PICKUP_COLOR.shield],
    ] as [number, number, string][]) {
      if (t <= 0) continue;
      c.strokeStyle = rgba(col, 0.3);
      c.lineWidth = 3;
      c.beginPath();
      c.arc(px - 8, 62, 7, 0, TAU);
      c.stroke();
      c.strokeStyle = col;
      c.beginPath();
      c.arc(px - 8, 62, 7, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(t / max, 0, 1));
      c.stroke();
      px -= 22;
    }
    const boss = wd.boss();
    let hintY = 78;
    if (boss && !boss.boss!.entering) {
      const bb = w - 60;
      c.fillStyle = "rgba(0,0,0,0.5)";
      roundRectPath(c, 30, 72, bb, 10, 5);
      c.fill();
      const bg = c.createLinearGradient(30, 0, 30 + bb, 0);
      bg.addColorStop(0, boss.boss!.spec.color);
      bg.addColorStop(1, boss.boss!.spec.accent);
      c.fillStyle = bg;
      roundRectPath(c, 30, 72, Math.max(0, bb * (boss.hp / boss.max)), 10, 5);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.6)";
      for (const f of [1 / 3, 2 / 3]) c.fillRect(30 + bb * f - 1, 72, 2, 10);
      c.font = `700 11px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.fillStyle = "#ffffff";
      c.fillText(`${boss.boss!.name} · เฟส ${boss.boss!.phase + 1}/3`, w / 2, 85);
      hintY = 104;
    }
    // Hint pill
    if (this.hints.length) {
      const t = this.hintT;
      const a = Math.min(1, t * 4, (3.4 - t) * 3);
      c.save();
      c.globalAlpha = clamp(a, 0, 1);
      c.font = `600 14px ${FONT_DISPLAY}`;
      const text = this.hints[0];
      const tw = Math.min(w - 30, c.measureText(text).width + 34);
      glassPanel(c, w / 2 - tw / 2, hintY, tw, 34, 17, 0.14);
      c.fillStyle = "#fff7d6";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, w / 2, hintY + 17, w - 44);
      c.restore();
    }
    if (this.banner.t > 0 && !this.env.counting()) {
      c.save();
      c.globalAlpha = Math.min(1, this.banner.t * 1.5);
      const k = ease.outBack(clamp((this.banner.t > 1.4 ? 2.6 - this.banner.t : 1.2) / 0.35, 0, 1));
      c.translate(w / 2, h * 0.42);
      c.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
      c.font = `900 32px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 6;
      c.strokeStyle = "rgba(6,8,30,0.6)";
      c.strokeText(this.banner.text, 0, 0);
      c.fillStyle = this.banner.color;
      c.fillText(this.banner.text, 0, 0);
      if (this.banner.sub) {
        c.font = `600 16px ${FONT_DISPLAY}`;
        c.lineWidth = 4;
        c.strokeText(this.banner.sub, 0, 32);
        c.fillStyle = "#e2e8f0";
        c.fillText(this.banner.sub, 0, 32);
      }
      c.restore();
    }
  }

  private fitLabel(spec: MapSpec): { text: string; color: string } {
    const s = shipStats((id) => wallet.level(id));
    const power = ((s.damage / 10) * (0.26 / s.interval) * (1 + 0.6 * (s.guns - 1) + 0.35 * s.drones) * s.maxHp) / 100;
    const ratio = power / (spec.diff.hp * spec.diff.dmg);
    if (spec.m === 1) return { text: "ง่ายมาก · ฝึกบิน", color: "#86efac" };
    if (ratio >= 0.9) return { text: "สบายๆ", color: "#86efac" };
    if (ratio >= 0.6) return { text: "พอดีมือ", color: "#a5f3fc" };
    if (ratio >= 0.42) return { text: "ท้าทาย", color: "#fde68a" };
    return { text: "ยากมาก · ลองอัปเกรดยานก่อน", color: "#fca5a5" };
  }

  private renderSelect() {
    const c = this.env.ctx;
    const w = this.w;
    const h = this.h;
    const appear = ease.outCubic(clamp(this.stateT * 3, 0, 1));
    c.save();
    c.globalAlpha = appear;
    // Header
    const hg = c.createLinearGradient(0, 0, 0, 74);
    hg.addColorStop(0, "rgba(4,6,24,0.85)");
    hg.addColorStop(1, "rgba(4,6,24,0)");
    c.fillStyle = hg;
    c.fillRect(0, 0, w, 74);
    c.textAlign = "left";
    c.textBaseline = "top";
    c.font = `800 22px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText("ยานพิทักษ์ดาว", 16, 12);
    c.font = `500 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.65)";
    c.fillText(`ปลดล็อกแล้ว ${this.unlocked} แมพ · ล้มบอสเพื่อไปต่อ`, 16, 40);
    const coins = wallet.coins().toLocaleString();
    c.font = `800 17px ${FONT_DISPLAY}`;
    c.textAlign = "right";
    c.fillStyle = "#ffd76a";
    c.fillText(coins, w - 14, 16);
    drawCoin(c, w - 24 - c.measureText(coins).width, 26, 9);

    // Star chart
    const top = this.areaTop();
    const bottom = this.areaBottom();
    c.save();
    c.beginPath();
    c.rect(0, top + 6, w, bottom - top + 4);
    c.clip();
    const shown = this.shownMaps();
    // Path between nodes
    for (let m = 1; m < shown; m++) {
      const a = this.nodePos(m);
      const b = this.nodePos(m + 1);
      if (Math.max(a.y, b.y) < top - 60 || Math.min(a.y, b.y) > bottom + 60) continue;
      const open = m + 1 <= this.unlocked;
      c.strokeStyle = open ? rgba(mapTheme(mapSpec(m + 1)).color, 0.7) : "rgba(255,255,255,0.16)";
      c.lineWidth = open ? 3 : 2;
      c.setLineDash(open ? [] : [6, 8]);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.bezierCurveTo(a.x, a.y - NODE_GAP * 0.5, b.x, b.y + NODE_GAP * 0.5, b.x, b.y);
      c.stroke();
      c.setLineDash([]);
      if (open && !this.env.reducedMotion) {
        // a light travelling up the open path
        const u = (this.time * 0.5 + m * 0.37) % 1;
        const x = (1 - u) ** 3 * a.x + 3 * (1 - u) ** 2 * u * a.x + 3 * (1 - u) * u * u * b.x + u ** 3 * b.x;
        const y = (1 - u) ** 3 * a.y + 3 * (1 - u) ** 2 * u * (a.y - NODE_GAP * 0.5) + 3 * (1 - u) * u * u * (b.y + NODE_GAP * 0.5) + u ** 3 * b.y;
        glow(c, x, y, 8, "#ffffff", 0.7);
      }
    }
    for (let m = 1; m <= shown; m++) {
      const n = this.nodePos(m);
      if (n.y < top - 70 || n.y > bottom + 70) continue;
      const locked = m > this.unlocked;
      const th = mapTheme(mapSpec(m));
      const selected = m === this.sel;
      const r = selected ? 25 : 20;
      const fade = locked ? Math.max(0.25, 1 - (m - this.unlocked - 1) * 0.25) : 1;
      c.save();
      c.globalAlpha = appear * fade;
      if (selected) {
        c.strokeStyle = rgba(th.color, 0.6 + 0.3 * Math.sin(this.time * 4));
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(n.x, n.y, r + 9 + Math.sin(this.time * 4) * 2, 0, TAU);
        c.stroke();
      }
      drawMapPlanet(c, n.x, n.y, r, th, locked, this.time, m * 31);
      c.textBaseline = "middle";
      c.font = `800 ${selected ? 16 : 14}px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.lineWidth = 3;
      c.strokeStyle = "rgba(4,6,24,0.7)";
      c.strokeText(String(m), n.x, n.y + 1);
      c.fillStyle = "#ffffff";
      c.fillText(String(m), n.x, n.y + 1);
      if (locked) {
        // padlock
        const lx = n.x + r * 0.75;
        const ly = n.y - r * 0.75;
        c.fillStyle = "#cbd5e1";
        roundRectPath(c, lx - 7, ly - 3, 14, 11, 3);
        c.fill();
        c.strokeStyle = "#cbd5e1";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(lx, ly - 3, 4.5, Math.PI, TAU);
        c.stroke();
      }
      // Name to the side with more room
      const right = n.x < w / 2;
      c.textAlign = right ? "left" : "right";
      const tx = n.x + (right ? 1 : -1) * (r + 14);
      c.font = `700 ${selected ? 15 : 13}px ${FONT_DISPLAY}`;
      c.strokeText(locked ? "ยังล็อกอยู่" : mapSpec(m).name, tx, n.y - 7);
      c.fillStyle = locked ? "rgba(255,255,255,0.55)" : selected ? "#ffffff" : "rgba(255,255,255,0.85)";
      c.fillText(locked ? "ยังล็อกอยู่" : mapSpec(m).name, tx, n.y - 7);
      c.font = `500 11px ${FONT_BODY}`;
      c.fillStyle = locked ? "rgba(255,255,255,0.4)" : rgba(th.color, 0.95);
      const sub = locked ? `ล้มบอสแมพ ${m - 1} ก่อน` : m === this.unlocked && m > 1 ? "แมพล่าสุด" : m < this.unlocked ? "ผ่านแล้ว" : "ฝึกบิน";
      c.fillText(sub, tx, n.y + 11);
      c.restore();
    }
    c.restore();

    // Info panel for the selected map
    const spec = this.spec;
    const pw = Math.min(w - 24, 420);
    const px = (w - pw) / 2;
    const py = h - 192;
    glassPanel(c, px, py, pw, 112, 20, 0.1);
    c.fillStyle = rgba(this.theme.color, 0.18);
    roundRectPath(c, px, py, pw, 112, 20);
    c.fill();
    c.textAlign = "left";
    c.textBaseline = "top";
    c.font = `800 18px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(`แมพ ${spec.m} · ${spec.name}`, px + 16, py + 12, pw - 32);
    c.font = `500 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.fillText(`${spec.waves} ระลอก + บอส "${bossName(spec)}"`, px + 16, py + 38, pw - 32);
    const news = spec.fresh.map((k) => ENEMIES[k].name);
    for (const hz of spec.hazards) if (spec.m === 3 || spec.m === 5 || spec.m === 8 || spec.m >= 17) news.push(HAZARD_NAME[hz]);
    let line = "";
    if (spec.m === 1) line = "ฝึกบิน: ศัตรูช้า กระสุนน้อย มีคำแนะนำ";
    else if (news.length) line = `ใหม่: ${news.join(", ")}`;
    else if (spec.m > 13) line = `ศัตรูผสม: ${spec.roster.slice(1, 4).map((r) => ENEMIES[r.kind].name).join(", ")}${spec.remix.length ? " · บอสมีท่าใหม่" : ""}`;
    c.fillStyle = "#fde68a";
    c.fillText(line, px + 16, py + 58, pw - 32);
    const fit = this.fitLabel(spec);
    c.font = `700 12px ${FONT_DISPLAY}`;
    const fl = `ความยาก: ${fit.text}`;
    const fw = c.measureText(fl).width + 20;
    c.fillStyle = rgba(fit.color, 0.16);
    roundRectPath(c, px + 14, py + 80, fw, 22, 11);
    c.fill();
    c.fillStyle = fit.color;
    c.textBaseline = "middle";
    c.fillText(fl, px + 24, py + 91);

    const bw = Math.min(pw, 420);
    const bx = (w - bw) / 2;
    this.flyBtn.label = `ออกบิน แมพ ${spec.m}`;
    this.flyBtn.color = this.theme.color === "#4fa8ff" ? "#2f8cff" : this.theme.color;
    this.flyBtn.place(bx + bw * 0.31, h - 68, bw * 0.62, 52);
    this.flyBtn.render(c);
    this.hangarBtn.place(bx + bw * 0.81, h - 68, bw * 0.36, 52);
    this.hangarBtn.render(c);
    c.restore();
  }

  private renderHangar() {
    const c = this.env.ctx;
    const w = this.w;
    const h = this.h;
    c.fillStyle = "rgba(4,6,24,0.8)";
    c.fillRect(0, 0, w, h);
    c.textAlign = "center";
    c.textBaseline = "top";
    c.font = `800 22px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText("โรงเก็บยาน", w / 2, 14);
    const coins = wallet.coins();
    c.font = `800 18px ${FONT_DISPLAY}`;
    const label = coins.toLocaleString();
    const tw = c.measureText(label).width;
    drawCoin(c, w / 2 - tw / 2 - 14, 55, 10);
    c.fillStyle = "#ffd76a";
    c.textAlign = "left";
    c.fillText(label, w / 2 - tw / 2 + 2, 45);
    // Ship preview
    c.save();
    c.translate(w / 2, 108 + Math.sin(this.time * 2) * 4);
    glow(c, 0, 0, 60, shipFlame(this.skin), 0.25);
    drawShip(c, 52, this.skin, this.time);
    c.restore();
    // Skins
    const cw = Math.min(w - 24, 440);
    const x0 = (w - cw) / 2;
    const skins = ITEMS.filter((i) => i.slot === "shipSkin");
    const sw = (cw - 8 * (skins.length - 1)) / skins.length;
    const sy = 146;
    this.skinHits = [];
    skins.forEach((it, i) => {
      const sx = x0 + i * (sw + 8);
      const owned = wallet.owns(it.id);
      const on = this.skin === it.id;
      glassPanel(c, sx, sy, sw, 58, 12, on ? 0.2 : 0.07);
      if (on) {
        c.strokeStyle = "#7cc8ff";
        c.lineWidth = 2;
        roundRectPath(c, sx, sy, sw, 58, 12);
        c.stroke();
      }
      if (this.pendingBuy === it.id) {
        c.strokeStyle = `rgba(255,215,106,${0.6 + 0.4 * Math.sin(this.time * 10)})`;
        c.lineWidth = 2;
        roundRectPath(c, sx, sy, sw, 58, 12);
        c.stroke();
      }
      c.save();
      c.translate(sx + sw / 2, sy + 20);
      c.globalAlpha = owned ? 1 : 0.55;
      drawShip(c, 24, it.id, this.time);
      c.restore();
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = `600 11px ${FONT_DISPLAY}`;
      if (owned) {
        c.fillStyle = on ? "#7cc8ff" : "rgba(255,255,255,0.8)";
        c.fillText(on ? "ใช้อยู่" : it.name, sx + sw / 2, sy + 46);
      } else {
        c.fillStyle = "#ffd76a";
        c.fillText(it.price.toLocaleString(), sx + sw / 2 + 6, sy + 46);
        drawCoin(c, sx + sw / 2 - c.measureText(it.price.toLocaleString()).width / 2 - 4, sy + 46, 5);
      }
      this.skinHits.push({ id: it.id, x: sx, y: sy, w: sw, h: 58 });
    });
    // Upgrades (scrollable)
    const list = UPGRADES.filter((u) => u.game === "shooter");
    if (this.hangarRows.length !== list.length) this.hangarRows = list.map((u) => ({ id: u.id, btn: new Button("", "#2f8cff") }));
    const top = sy + 70;
    const bottom = h - 92;
    const rowH = 62;
    this.hTop = top;
    this.hBottom = bottom;
    this.hMax = Math.max(0, list.length * rowH - (bottom - top));
    this.hScroll = clamp(this.hScroll, 0, this.hMax);
    c.save();
    c.beginPath();
    c.rect(0, top, w, bottom - top);
    c.clip();
    list.forEach((u, i) => {
      const y = top + i * rowH - this.hScroll;
      const row = this.hangarRows[i];
      if (y + rowH < top - 4 || y > bottom + 4) {
        row.btn.place(-999, -999, 1, 1);
        return;
      }
      glassPanel(c, x0, y, cw, rowH - 8, 14, 0.08);
      const lvl = wallet.level(u.id);
      const cost = wallet.upgradeCost(u.id);
      c.textAlign = "left";
      c.textBaseline = "top";
      c.font = `700 15px ${FONT_DISPLAY}`;
      c.fillStyle = "#ffffff";
      c.fillText(`${u.name}  ขั้น ${lvl}`, x0 + 14, y + 8, cw - 140);
      c.font = `500 11px ${FONT_BODY}`;
      c.fillStyle = "rgba(255,255,255,0.65)";
      c.fillText(u.desc, x0 + 14, y + 31, cw - 136);
      row.btn.label = `${cost.toLocaleString()}`;
      row.btn.color = coins >= cost ? "#f0a71a" : "#555b77";
      row.btn.place(x0 + cw - 62, y + (rowH - 8 - 44) / 2, 104, 44);
      row.btn.render(c);
      drawCoin(c, row.btn.x + 16, row.btn.y + 22, 8);
    });
    c.restore();
    if (this.hMax > 0) {
      // scroll hint
      const k = this.hScroll / this.hMax;
      c.fillStyle = "rgba(255,255,255,0.25)";
      roundRectPath(c, w - 6, top + (bottom - top - 40) * k, 3, 40, 2);
      c.fill();
    }
    this.backBtn.place(w / 2, h - 74, Math.min(320, w - 40), 52);
    this.backBtn.render(c);
  }

  private renderClear() {
    const c = this.env.ctx;
    const next = mapSpec(this.spec.m + 1);
    const news = next.fresh.map((k) => ENEMIES[k].name);
    drawCard(c, this.w, this.h, {
      title: `ผ่านแมพ ${this.spec.m}!`,
      subtitle: this.newUnlock ? `ปลดล็อกแมพ ${next.m}: ${next.name}` : `แมพ ${next.m}: ${next.name}`,
      body: news.length ? `แมพถัดไปมีศัตรูใหม่: ${news.join(", ")}` : `บอสถัดไป: ${bossName(next)}`,
      bigValue: (this.world?.score ?? 0).toLocaleString(),
      bigLabel: "คะแนน",
      coins: this.earned,
      accent: mapTheme(next).color,
      buttons: [this.nextBtn, this.upBtn, this.mapsBtn],
      appear: this.stateT * 2.5,
    });
    if (this.newUnlock && this.stateT < 2.5 && !this.env.reducedMotion && Math.random() < 0.3) {
      this.particles.burst(this.w * Math.random(), this.h * 0.2, mapTheme(next).color, 2, { speed: 120, size: 3, gravity: 120, life: 1.2, kind: "shard" });
    }
  }

  private renderOver() {
    const wd = this.world!;
    const where = wd.wave > this.spec.waves ? "ตอนสู้บอส" : `ระลอก ${wd.wave}/${this.spec.waves}`;
    drawCard(this.env.ctx, this.w, this.h, {
      title: "ยานถูกยิงตก",
      subtitle: `แมพ ${this.spec.m} · ${where}`,
      bigValue: wd.score.toLocaleString(),
      bigLabel: "คะแนน",
      chips: [`ยิงไป ${wd.kills} ลำ`, `สถิติ ${this.best.toLocaleString()}`],
      coins: this.earned,
      accent: "#2f8cff",
      buttons: [this.retryBtn, this.upBtn, this.mapsBtn],
      appear: this.stateT * 2.5,
    });
  }
}
