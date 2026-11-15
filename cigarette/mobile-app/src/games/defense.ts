// "ปกป้องต้นไม้ลมหายใจ" — smog monsters march along a trail towards the Tree of Breath. Twenty maps
// over five years: the tree grows from a seedling to a giant, seasons turn every map, trails change
// (forks, two or three entrances, routes that switch each wave) and new monsters arrive (jumpers,
// healers, armour, flyers, shield-bearers, a boss at the end of every map). Towers are unlocked
// for good with coins and the player picks up to five to bring before each map. Endless mode opens
// after the first year. Planning plus quick reactions keeps the mind busy through a craving.
//
// Simulation: defense/world.ts (grid units, no canvas). Art: defense/art.ts. Data: defense/data.ts.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Floaters, Particles, makeSprite, clamp, TAU, FONT_DISPLAY, FONT_BODY, glow, roundRectPath, rgba, shade, type Particle } from "./engine/fx";
import { Button, drawCard, drawCoin, bestScore, glassPanel, wrapText } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { wallet } from "./engine/economy";
import {
  GW, GH, TOWERS, ENEMIES, ALL_TOWERS, STARTER_TOWERS, LOADOUT_SLOTS, MAX_LVL, MAPS, MAP_COUNT, LAYOUTS, SEASONS,
  SEASON_NAME, SEASON_COLOR, TREE_TIER_NAME, layoutFor, mapCoins, endlessCoins,
  type TowerKind, type EnemyKind, type Season, type Layout, type MapSpec,
} from "./defense/data";
import { World, BREAK, routeAt, type Barrier, type WorldEvent } from "./defense/world";
import { drawGround, drawTree, drawTower, drawEnemy, drawFence, drawShot, drawLock, drawStar, iconEnemy, Weather, LOOK, type Geo } from "./defense/art";
import { renderScale } from "./engine/quality";

export const defenseGame: GameDefinition = {
  id: "defense",
  title: "ปกป้องต้นไม้ลมหายใจ",
  tagline: "20 ด่าน 4 ฤดู ต้นไม้โตขึ้นทุกปี",
  why: "ต้องวางแผนว่าจะพาป้อมไหนไปและสร้างตรงไหน แล้วลุ้นทุกคลื่น ใจจดจ่อจนความอยากผ่านไป และได้เห็นต้นไม้ค่อยๆ โตขึ้นเหมือนตัวเราที่เลิกบุหรี่",
  category: "action",
  minutes: "3–8 นาที",
  palette: ["#14321f", "#86efac"],
  countdown: true,
  create: (env) => new DefenseGame(env),
};

type State = "maps" | "loadout" | "play" | "result";
type Sel = { t: "pad"; i: number } | { t: "spot"; x: number; y: number } | { t: "fence"; b: Barrier } | null;
interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  act: () => void;
  enabled?: boolean;
}

const ENDLESS = 0;
const ENDLESS_AT = 5; // endless opens once map 4 is cleared
const PERM_LABEL: Record<string, string> = { td_gold: "ทองตั้งต้น", td_power: "ป้อมแรง", td_lives: "ต้นไม้ทน" };

class DefenseGame implements GameInstance {
  private w = 0;
  private h = 0;
  private geo: Geo = { ox: 0, oy: 0, cell: 40 };
  private bg: HTMLCanvasElement | null = null;
  private bgKey = "";
  private mapBg: HTMLCanvasElement | null = null;
  private mapBgKey = "";
  private nodeDiscs = new Map<string, HTMLCanvasElement>();
  private loadBg: HTMLCanvasElement | null = null;
  private loadBgKey = "";
  private startSpr: HTMLCanvasElement | null = null;
  private startKey = "";
  private barTop = 0;

  private state: State = "maps";
  private stateT = 0;
  private time = 0;
  private world: World | null = null;
  private mapN = 1;
  private season: Season = "spring";
  private tier = 0;
  private layout: Layout = LAYOUTS.meadow;
  private weather = new Weather("spring");
  private speed = 1;
  private sel: Sel = null;
  private treeHurt = 0;
  private lastCount = 0;
  private banner: { kind: EnemyKind; t: number } | null = null;
  private visRings: { x: number; y: number; r: number; t: number; color: string }[] = [];
  private beams: { x: number; y: number; tx: number; ty: number; t: number }[] = [];
  private sfxT = 0;

  // Progress
  private unlocked = 1;
  private stars: number[] = [];
  private endlessBest = 0;
  private loadout: TowerKind[] = [...STARTER_TOWERS];

  // Result
  private won = false;
  private gotStars = 0;
  private earned = 0;
  private newBest = false;
  private nextBtn = new Button("ด่านถัดไป", "#16a34a");
  private retryBtn = new Button("เล่นอีกครั้ง", "#16a34a");
  private mapsBtn = new Button("เลือกด่าน", "#ffffff", "ghost");

  // Screens
  private hits: Hit[] = [];
  private scroll = 0;
  private maxScroll = 0;
  private drag: { id: number; y: number; s: number; moved: number } | null = null;
  private vel = 0;
  private info: TowerKind = "leaf";
  private toast = "";
  private toastT = 0;

  private particles = new Particles();
  private floaters = new Floaters();

  constructor(private env: GameEnv) {
    const st = env.store;
    this.unlocked = clamp(parseInt(st.get("unlocked") || "1", 10) || 1, 1, MAP_COUNT + 1);
    this.endlessBest = parseInt(st.get("best") || "0", 10) || 0;
    for (let n = 1; n <= MAP_COUNT; n++) this.stars[n] = parseInt(st.get(`m${n}_best`) || "0", 10) || 0;
    const saved = (st.get("loadout") || "").split(",").filter((k): k is TowerKind => k in TOWERS);
    if (saved.length) this.loadout = saved.slice(0, LOADOUT_SLOTS);
    this.loadout = this.loadout.filter((k) => this.owns(k));
    if (!this.loadout.length) this.loadout = [...STARTER_TOWERS];
    this.scrollToCurrent = true;
  }
  private scrollToCurrent = false;

  // ── Helpers ──────────────────────────────────────────────────────────────

  private owns(k: TowerKind) {
    const up = TOWERS[k].up;
    return !up || wallet.level(up) >= 1;
  }

  private px(gx: number, gy: number) {
    return { x: this.geo.ox + gx * this.geo.cell, y: this.geo.oy + gy * this.geo.cell };
  }

  private toGrid(x: number, y: number) {
    return { x: (x - this.geo.ox) / this.geo.cell, y: (y - this.geo.oy) / this.geo.cell };
  }

  private say(text: string) {
    this.toast = text;
    this.toastT = 2;
  }

  private spec(): MapSpec | null {
    return this.mapN === ENDLESS ? null : MAPS[this.mapN - 1];
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 54;
    const bottom = 92;
    const cell = Math.min(w / GW, (h - top - bottom) / GH);
    this.geo = { cell, ox: (w - cell * GW) / 2, oy: top + (h - top - bottom - cell * GH) / 2 };
    this.barTop = h - bottom + 8;
    this.bgKey = "";
  }

  private ensureBackground() {
    if (!this.world) return;
    const key = `${this.mapN}|${this.layout.name}|${this.season}|${this.w}x${this.h}@${renderScale()}`;
    if (key === this.bgKey && this.bg) return;
    this.bgKey = key;
    const dpr = renderScale();
    const world = this.world;
    this.bg = makeSprite(this.w, this.h, dpr, (c) =>
      drawGround(c, this.w, this.h, this.geo, this.layout.routes, world.pads, this.season, 4242 + this.mapN * 17)
    );
  }

  // ── Flow ─────────────────────────────────────────────────────────────────

  private openLoadout(n: number) {
    this.mapN = n;
    this.state = "loadout";
    this.stateT = 0;
    this.info = this.loadout[0] || "leaf";
    const m = this.spec();
    if (m && m.tip && !this.owns(m.tip)) this.info = m.tip;
    this.env.sfx.tone({ freq: 620, dur: 0.06, vol: 0.05 });
  }

  private startMap() {
    const m = this.spec();
    const perm: Partial<Record<TowerKind, number>> = {};
    for (const k of ALL_TOWERS) perm[k] = TOWERS[k].up ? wallet.level(TOWERS[k].up) : 1;
    const seed = (Date.now() % 100000) + 7;
    if (m) {
      this.layout = layoutFor(m);
      this.season = m.season;
      this.tier = m.tier;
    } else {
      const names = Object.keys(LAYOUTS);
      const pick = names[Math.floor(Math.random() * names.length)];
      this.layout = layoutFor({ layout: pick, mirror: Math.random() < 0.5 });
      this.season = "spring";
      this.tier = 0;
    }
    this.world = new World({
      layout: this.layout,
      map: m,
      power: 1 + 0.1 * wallet.level("td_power"),
      perm,
      goldBonus: 40 * wallet.level("td_gold"),
      livesBonus: 3 * wallet.level("td_lives"),
      seed,
    });
    this.env.store.set("loadout", this.loadout.join(","));
    this.weather = new Weather(this.season);
    this.particles = new Particles();
    this.floaters = new Floaters();
    this.visRings = [];
    this.beams = [];
    this.banner = null;
    this.sel = null;
    this.speed = 1;
    this.lastCount = 0;
    this.treeHurt = 0;
    this.bgKey = "";
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  private finish(won: boolean) {
    const world = this.world!;
    this.state = "result";
    this.stateT = 0;
    this.sel = null;
    this.won = won;
    const m = this.spec();
    if (m) {
      const cleared = won ? world.wave : Math.max(0, world.wave - 1);
      this.gotStars = won ? (world.lives >= world.maxLives * 0.85 ? 3 : world.lives >= world.maxLives * 0.5 ? 2 : 1) : 0;
      this.newBest = won && this.gotStars > (this.stars[m.n] || 0);
      if (won) {
        const r = bestScore(this.env.store, `m${m.n}_best`, this.gotStars);
        this.stars[m.n] = r.best;
        if (m.n + 1 > this.unlocked) {
          this.unlocked = Math.min(MAP_COUNT + 1, m.n + 1);
          this.env.store.set("unlocked", String(this.unlocked));
        }
      }
      this.earned = mapCoins(m.n, won, this.gotStars, cleared, world.kills);
      const highest = this.unlocked - 1;
      this.env.emit({
        type: "end",
        coins: this.earned,
        score: won ? m.n : 0,
        best: highest,
        summary: won ? `ผ่านด่าน ${m.n} ได้ ${this.gotStars} ดาว` : `ด่าน ${m.n}: ผ่าน ${cleared}/${m.waves} คลื่น · ปัดเป่าควัน ${world.kills} ก้อน`,
        stats: { map: m.n, stars: this.gotStars, waves: cleared, kills: world.kills },
      });
    } else {
      const survived = Math.max(0, world.wave - 1);
      const r = bestScore(this.env.store, "best", survived);
      this.endlessBest = r.best;
      this.newBest = r.isNew;
      this.earned = endlessCoins(survived, world.kills);
      this.env.emit({
        type: "end",
        coins: this.earned,
        score: survived,
        best: r.best,
        summary: `โหมดไม่รู้จบ: ผ่าน ${survived} คลื่น · ปัดเป่าควัน ${world.kills} ก้อน`,
        stats: { waves: survived, kills: world.kills },
      });
    }
    if (won) {
      [0, 2, 4, 7].forEach((s, i) => this.env.sfx.chime(pentatonic(5 + s), 0.12, i * 0.12));
      const t = this.px(world.tree[0], world.tree[1] - 1);
      this.particles.burst(t.x, t.y, "#bbf7d0", 60, { speed: 220, size: 4, gravity: -40, life: 1.4 });
    } else this.env.sfx.tone({ freq: 300, dur: 0.9, vol: 0.08, type: "triangle", glideTo: 110 });
  }

  private toMaps() {
    this.state = "maps";
    this.stateT = 0;
    this.world = null;
    this.scrollToCurrent = true;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  pointer(p: PointerInfo) {
    if (this.state === "maps") return this.pointerMaps(p);
    if (this.state === "loadout") {
      if (p.type === "down") this.tapHits(p.x, p.y);
      return;
    }
    if (this.state === "result") {
      const btns = this.resultButtons();
      for (const b of btns) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.5) {
            if (b === this.nextBtn) this.openLoadout(this.mapN + 1);
            else if (b === this.retryBtn) this.openLoadout(this.mapN);
            else this.toMaps();
          }
          b.pressed = false;
        }
      }
      return;
    }
    if (p.type !== "down" || !this.world) return;
    this.tapPlay(p.x, p.y);
  }

  private tapHits(x: number, y: number) {
    for (const h of this.hits) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        if (h.enabled === false) this.env.sfx.tone({ freq: 180, dur: 0.08, vol: 0.05, type: "triangle" });
        h.act();
        return true;
      }
    }
    return false;
  }

  private pointerMaps(p: PointerInfo) {
    if (p.type === "down") {
      this.drag = { id: p.id, y: p.y, s: this.scroll, moved: 0 };
      this.vel = 0;
    } else if (p.type === "move" && this.drag && this.drag.id === p.id) {
      const dy = p.y - this.drag.y;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(dy));
      const ns = clamp(this.drag.s + dy, -40, this.maxScroll + 40);
      this.vel = (ns - this.scroll) * 60;
      this.scroll = ns;
    } else if ((p.type === "up" || p.type === "cancel") && this.drag && this.drag.id === p.id) {
      const tap = this.drag.moved < 8;
      this.drag = null;
      if (tap && p.type === "up") this.tapHits(p.x, p.y);
    }
  }

  private tapPlay(x: number, y: number) {
    const world = this.world!;
    if (this.tapHits(x, y)) return;
    if (y > this.barTop - 4) return;
    const g = this.toGrid(x, y);
    // Pads
    let best = -1;
    let bd = 0.62;
    world.pads.forEach(([px, py], i) => {
      const d = Math.hypot(px - g.x, py - g.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) {
      this.sel = this.sel && this.sel.t === "pad" && this.sel.i === best ? null : { t: "pad", i: best };
      this.env.sfx.tone({ freq: 520, dur: 0.05, vol: 0.04 });
      return;
    }
    // Fences
    const fence = world.barriers.find((b) => Math.hypot(b.x - g.x, b.y - g.y) < 0.6);
    if (fence) {
      this.sel = this.sel && this.sel.t === "fence" && this.sel.b === fence ? null : { t: "fence", b: fence };
      this.env.sfx.tone({ freq: 480, dur: 0.05, vol: 0.04 });
      return;
    }
    // A spot on the trail for a fence
    if (this.loadout.includes("barrier")) {
      const spot = world.barrierSpot(g.x, g.y);
      if (spot) {
        this.sel = { t: "spot", x: spot.x, y: spot.y };
        this.env.sfx.tone({ freq: 440, dur: 0.05, vol: 0.04 });
        return;
      }
      const near = world.routes.some((r) => {
        for (let d = 0; d < r.len; d += 0.3) {
          const q = routeAt(r, d);
          if (Math.hypot(q.x - g.x, q.y - g.y) < 0.5) return true;
        }
        return false;
      });
      if (near) {
        this.floaters.add("วางรั้วตรงนี้ไม่ได้", x, y - 10, "#fecaca", 14, 1);
        this.sel = null;
        return;
      }
    }
    this.sel = null;
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.state === "play" && code === "Space" && this.world) {
      this.callWave();
      return true;
    }
    if (this.state === "loadout" && (code === "Enter" || code === "Space") && this.stateT > 0.3) {
      this.startMap();
      return true;
    }
    if (this.state === "loadout" && code === "Escape") {
      this.toMaps();
      return true;
    }
    if (this.state === "result" && (code === "Enter" || code === "Space") && this.stateT > 0.5) {
      this.openLoadout(this.won && this.mapN && this.mapN < MAP_COUNT ? this.mapN + 1 : this.mapN);
      return true;
    }
    return false;
  }

  private callWave() {
    const world = this.world!;
    if (world.waveActive || world.result) return;
    const bonus = world.nextWave();
    if (bonus > 0) this.floaters.add(`เรียกเร็ว +${bonus} ทอง`, this.w / 2, this.barTop - 20, "#ffd76a", 18);
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.toastT = Math.max(0, this.toastT - dt);
    this.particles.update(dt);
    this.floaters.update(dt);
    for (const b of [this.nextBtn, this.retryBtn, this.mapsBtn]) b.update(dt);
    if (this.state === "maps" && !this.drag) {
      this.scroll += this.vel * dt;
      this.vel *= Math.pow(0.04, dt);
      if (this.scroll < 0) this.scroll += (0 - this.scroll) * Math.min(1, dt * 12);
      if (this.scroll > this.maxScroll) this.scroll += (this.maxScroll - this.scroll) * Math.min(1, dt * 12);
    }
    if (this.state !== "play" && this.state !== "result") return;
    this.weather.update(dt, this.w, this.h, this.env.reducedMotion);
    this.treeHurt = Math.max(0, this.treeHurt - dt * 2);
    for (const r of this.visRings) r.t += dt * 2.5;
    this.visRings = this.visRings.filter((r) => r.t < 1);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < 0.18);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 4.5) this.banner = null;
    }
    const world = this.world;
    if (this.state !== "play" || !world) return;
    this.sfxT = Math.max(0, this.sfxT - dt);
    for (let s = 0; s < this.speed; s++) {
      world.step(dt);
      this.handleEvents(world.events);
      world.events.length = 0;
      if (this.state !== "play") break;
    }
    if (this.sel && this.sel.t === "fence" && !world.barriers.includes(this.sel.b)) this.sel = null;
    // Short in-game countdown before a wave starts by itself
    if (!world.waveActive && world.breakT > 0 && world.breakT <= 3.05) {
      const n = Math.ceil(world.breakT);
      if (n !== this.lastCount) {
        this.lastCount = n;
        this.floaters.add(String(n), this.w / 2, this.h * 0.42, "#ffffff", 44, 0.9);
        this.env.sfx.tone({ freq: 520, dur: 0.1, vol: 0.06 });
      }
    } else this.lastCount = 0;
    // Endless: the seasons turn every 5 waves and the tree grows
    if (this.mapN === ENDLESS) {
      const season = SEASONS[Math.floor(Math.max(0, world.wave - 1) / 5) % 4];
      this.tier = Math.min(4, Math.floor(Math.max(0, world.wave - 1) / 8));
      if (season !== this.season) {
        this.season = season;
        this.weather = new Weather(season);
        this.floaters.add(SEASON_NAME[season], this.w / 2, this.h * 0.3, SEASON_COLOR[season], 24, 1.6);
      }
    }
  }

  private handleEvents(evs: WorldEvent[]) {
    const c = this.geo.cell;
    for (const e of evs) {
      switch (e.type) {
        case "kill": {
          const p = this.px(e.x, e.y);
          const winter = this.season === "winter";
          this.particles.burst(p.x, p.y, winter ? "#475569" : "#cbd5e1", e.kind === "boss" ? 60 : 14, { speed: 120, size: 4, gravity: -30, life: 0.9 });
          this.particles.burst(p.x, p.y, "#bbf7d0", 6, { speed: 60, size: 2.5, gravity: -40, life: 1 });
          this.floaters.add(`+${e.gold}`, p.x, p.y - 10, "#ffd76a", 14, 0.8);
          if (e.kind === "boss") {
            this.env.sfx.chime(pentatonic(10), 0.16);
            this.floaters.add("ปราบราชาควันแล้ว!", this.w / 2, this.h * 0.35, "#fde68a", 24, 1.8);
          } else if (this.sfxT <= 0) {
            this.sfxT = 0.05;
            this.env.sfx.noise({ dur: 0.18, vol: 0.05, freq: 1200, sweepTo: 300, type: "bandpass" });
          }
          break;
        }
        case "leak": {
          const world = this.world!;
          this.treeHurt = 1;
          const tp = this.px(world.tree[0], world.tree[1] - 0.8);
          this.particles.burst(tp.x, tp.y, "#6b7280", 18, { speed: 90, size: 4, gravity: -20 });
          this.floaters.add(`-${e.harm}`, tp.x, tp.y - 20, "#fca5a5", 20);
          this.env.sfx.noise({ dur: 0.3, vol: 0.1, freq: 300, type: "lowpass" });
          break;
        }
        case "fire":
          if (this.sfxT > 0) break;
          if (e.kind === "leaf") this.env.sfx.tone({ freq: 880 + Math.random() * 200, dur: 0.04, vol: 0.015, type: "triangle" });
          else if (e.kind === "fan") this.env.sfx.noise({ dur: 0.25, vol: 0.025, freq: 1800, type: "highpass" });
          else if (e.kind === "mortar") this.env.sfx.tone({ freq: 140, dur: 0.15, vol: 0.06, type: "sine", glideTo: 90 });
          else if (e.kind === "sniper") this.env.sfx.tone({ freq: 1400, dur: 0.08, vol: 0.04, type: "triangle", glideTo: 600 });
          else if (e.kind === "poison") this.env.sfx.tone({ freq: 300, dur: 0.07, vol: 0.03, type: "sine", glideTo: 520 });
          break;
        case "ring": {
          const p = this.px(e.x, e.y);
          this.visRings.push({ x: p.x, y: p.y, r: e.r * c, t: 0, color: e.color });
          break;
        }
        case "splash": {
          const p = this.px(e.x, e.y);
          if (e.kind === "cloud") {
            this.visRings.push({ x: p.x, y: p.y, r: e.r * c, t: 0, color: TOWERS.cloud.color });
            this.particles.burst(p.x, p.y, "#c4b5fd", 14, { speed: 80, size: 2, gravity: 200, life: 0.5 });
          } else if (e.kind === "mortar") {
            this.visRings.push({ x: p.x, y: p.y, r: e.r * c, t: 0, color: "#fb923c" });
            this.particles.burst(p.x, p.y, "#fdba74", 22, { speed: 160, size: 3, gravity: 160, life: 0.6 });
            this.particles.burst(p.x, p.y, "#78350f", 10, { speed: 120, size: 3, gravity: 260, life: 0.7, kind: "shard" });
            this.env.sfx.noise({ dur: 0.25, vol: 0.06, freq: 500, type: "lowpass" });
          } else if (e.kind === "poison") this.particles.burst(p.x, p.y, "#bef264", 6, { speed: 50, size: 2.5, gravity: -20, life: 0.6 });
          else this.particles.burst(p.x, p.y, "#86efac", 4, { speed: 70, size: 2, life: 0.35 });
          break;
        }
        case "beam": {
          const a = this.px(e.x, e.y);
          const b = this.px(e.tx, e.ty);
          this.beams.push({ x: a.x, y: a.y, tx: b.x, ty: b.y, t: 0 });
          this.particles.burst(b.x, b.y, "#fda4af", 6, { speed: 90, size: 2, life: 0.3, kind: "spark" });
          break;
        }
        case "heal": {
          const p = this.px(e.x, e.y);
          this.floaters.add("+", p.x, p.y - 14, "#5eead4", 16, 0.6);
          break;
        }
        case "shield": {
          const p = this.px(e.x, e.y);
          this.particles.ring(p.x, p.y, "#67e8f9", c * 0.5, 0.4);
          break;
        }
        case "shieldBreak": {
          const p = this.px(e.x, e.y);
          this.particles.burst(p.x, p.y, "#a5f3fc", 10, { speed: 110, size: 3, gravity: 120, life: 0.5, kind: "shard" });
          this.env.sfx.tone({ freq: 1200, dur: 0.08, vol: 0.03, type: "triangle", glideTo: 700 });
          break;
        }
        case "jump": {
          const p = this.px(e.x, e.y);
          this.particles.burst(p.x, p.y + c * 0.2, "#a8a29e", 6, { speed: 50, size: 2.5, gravity: 40, life: 0.4 });
          break;
        }
        case "summon": {
          const p = this.px(e.x, e.y);
          this.visRings.push({ x: p.x, y: p.y, r: c, t: 0, color: "#a78bfa" });
          break;
        }
        case "bank": {
          const p = this.px(e.x, e.y);
          this.floaters.add(`+${e.gold}`, p.x, p.y - c * 0.5, "#fde047", 14, 0.9);
          break;
        }
        case "barrierHit":
          break;
        case "barrierBreak": {
          const p = this.px(e.x, e.y);
          this.particles.burst(p.x, p.y, "#b45309", 20, { speed: 140, size: 3.5, gravity: 300, life: 0.8, kind: "shard" });
          this.floaters.add("รั้วพัง!", p.x, p.y - 16, "#fdba74", 16);
          this.env.sfx.noise({ dur: 0.35, vol: 0.08, freq: 700, sweepTo: 200, type: "bandpass" });
          break;
        }
        case "wave": {
          const n = this.world!.nWaves;
          const label = e.boss ? "ราชาควันมาแล้ว!" : Number.isFinite(n) ? `คลื่นที่ ${e.wave}/${n}` : `คลื่นที่ ${e.wave}`;
          this.floaters.add(label, this.w / 2, this.h * 0.4, e.boss ? "#fca5a5" : "#ffffff", 28, 1.6);
          if (e.intro) this.banner = { kind: e.intro, t: 0 };
          this.env.sfx.tone({ freq: 220, dur: 0.5, vol: 0.06, type: "sawtooth", glideTo: 330 });
          break;
        }
        case "clear": {
          this.floaters.add(`ผ่านคลื่น ${e.wave}! +${e.bonus} ทอง`, this.w / 2, this.h * 0.4, "#86efac", 22, 1.5);
          this.env.sfx.chime(pentatonic(5), 0.12);
          this.env.sfx.chime(pentatonic(7), 0.1, 0.12);
          break;
        }
        case "win":
          this.finish(true);
          return;
        case "lose":
          this.finish(false);
          return;
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    const c = this.env.ctx;
    this.hits = [];
    if (this.state === "maps") this.renderMaps(c);
    else if (this.state === "loadout") this.renderLoadout(c);
    else {
      this.renderPlay(c);
      if (this.state === "play") {
        this.renderHud(c);
        this.renderBar(c);
        this.renderBanner(c);
      } else this.renderResult(c);
    }
    if (this.toastT > 0) {
      c.save();
      c.globalAlpha = clamp(this.toastT * 2, 0, 1);
      c.font = `600 14px ${FONT_BODY}`;
      const tw = c.measureText(this.toast).width + 32;
      c.fillStyle = "rgba(15,23,42,0.92)";
      roundRectPath(c, this.w / 2 - tw / 2, this.h - 130, tw, 36, 18);
      c.fill();
      c.fillStyle = "#ffffff";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(this.toast, this.w / 2, this.h - 112);
      c.restore();
    }
  }

  // ── Map select ───────────────────────────────────────────────────────────

  private mapNodes() {
    // Distance from the bottom of the scroll content for each node: maps 1..20, then endless.
    const out: { n: number; b: number; x: number }[] = [];
    const amp = Math.min(this.w * 0.27, 130);
    let b = 150;
    for (let n = 1; n <= MAP_COUNT + 1; n++) {
      if (n > 1 && (n - 1) % 4 === 0) b += 70; // year banner
      out.push({ n: n > MAP_COUNT ? ENDLESS : n, b, x: this.w / 2 + Math.sin(n * 1.15) * amp });
      b += 96;
    }
    return { nodes: out, total: b + 20 };
  }

  private renderMaps(c: CanvasRenderingContext2D) {
    const { w, h } = this;
    const { nodes, total } = this.mapNodes();
    const head = 64;
    this.maxScroll = Math.max(0, total - (h - head));
    if (this.scrollToCurrent) {
      this.scrollToCurrent = false;
      const cur = nodes.find((n) => n.n === Math.min(this.unlocked, MAP_COUNT)) || nodes[0];
      this.scroll = clamp(cur.b - h * 0.45, 0, this.maxScroll);
    }
    const sy = (b: number) => h - b + this.scroll;
    // Background: each year a band in its own light
    // Background gradient plus the faint season glows: they only move with the scroll, so they are
    // kept in one screen-sized layer that is redrawn only when the scroll or the size changes.
    const mk = `${w}x${h}@${renderScale()}|${this.scroll}`;
    if (!this.mapBg || this.mapBgKey !== mk) {
      const sc = renderScale();
      if (!this.mapBg || this.mapBg.width !== Math.ceil(w * sc) || this.mapBg.height !== Math.ceil(h * sc)) {
        this.mapBg = makeSprite(w, h, sc, () => {});
      }
      this.mapBgKey = mk;
      const cc = this.mapBg.getContext("2d")!;
      cc.setTransform(sc, 0, 0, sc, 0, 0);
      const g = cc.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0f1f2e");
      g.addColorStop(1, "#13301f");
      cc.fillStyle = g;
      cc.fillRect(0, 0, w, h);
      for (const nd of nodes) {
        if (!nd.n) continue;
        const gy = sy(nd.b);
        if (gy < -120 || gy > h + 120) continue; // off screen
        const m = MAPS[nd.n - 1];
        glow(cc, nd.x, gy, 120, SEASON_COLOR[m.season], 0.1);
      }
    }
    c.drawImage(this.mapBg, 0, 0, w, h);
    // Firefly dots that drift with the scroll
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97.3) % w) + Math.sin(this.time * 0.5 + i) * 6;
      const y = ((((i * 151.7) % (total + 200)) - this.scroll * 0.6) % h + h) % h;
      c.fillStyle = `rgba(254,249,195,${0.15 + 0.15 * Math.sin(this.time * 2 + i)})`;
      c.beginPath();
      c.arc(x, y, 1.6, 0, TAU);
      c.fill();
    }
    // Trail between nodes
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    for (const pass of [0, 1]) {
      c.beginPath();
      nodes.forEach((nd, i) => {
        const y = sy(nd.b);
        if (!i) c.moveTo(nd.x, y);
        else {
          const prev = nodes[i - 1];
          const py = sy(prev.b);
          c.bezierCurveTo(prev.x, py - 40, nd.x, y + 40, nd.x, y);
        }
      });
      if (pass === 0) {
        c.strokeStyle = "rgba(0,0,0,0.35)";
        c.lineWidth = 16;
      } else {
        c.strokeStyle = "rgba(214,190,150,0.55)";
        c.lineWidth = 8;
        c.setLineDash([2, 14]);
      }
      c.stroke();
    }
    c.restore();
    // Year banners with the tree at that size
    for (let y = 0; y < 5; y++) {
      const first = nodes[y * 4];
      const by = sy(first.b - 74);
      if (by < -80 || by > h + 80) continue;
      const bw = Math.min(w - 32, 300);
      c.save();
      c.fillStyle = "rgba(10,18,14,0.6)";
      roundRectPath(c, w / 2 - bw / 2, by - 22, bw, 44, 22);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.12)";
      c.stroke();
      drawTree(c, w / 2 - bw / 2 + 30, by + 14, 16 + y * 1.5, y, "spring", 1, this.time);
      c.font = `700 15px ${FONT_DISPLAY}`;
      c.fillStyle = "#ffffff";
      c.textAlign = "left";
      c.textBaseline = "middle";
      c.fillText(`ปีที่ ${y + 1} · ${TREE_TIER_NAME[y]}`, w / 2 - bw / 2 + 62, by);
      // Season dots
      SEASONS.forEach((s, k) => {
        c.fillStyle = SEASON_COLOR[s];
        c.beginPath();
        c.arc(w / 2 + bw / 2 - 64 + k * 14, by, 4.5, 0, TAU);
        c.fill();
      });
      c.restore();
    }
    // Nodes
    for (const nd of nodes) {
      const y = sy(nd.b);
      if (y < head - 40 || y > h + 40) continue;
      const open = nd.n === ENDLESS ? this.unlocked >= ENDLESS_AT : nd.n <= this.unlocked;
      const current = nd.n !== ENDLESS && nd.n === Math.min(this.unlocked, MAP_COUNT) && !this.stars[nd.n];
      const col = nd.n === ENDLESS ? "#a78bfa" : SEASON_COLOR[MAPS[nd.n - 1].season];
      const r = 29;
      if (current) glow(c, nd.x, y, r * 2.4, col, 0.55 + 0.2 * Math.sin(this.time * 3));
      // Disc with its drop shadow, gradient and rim: cached per colour (a blurred shadow is slow).
      const dk = `${col}|${open}|${renderScale()}`;
      let disc = this.nodeDiscs.get(dk);
      if (!disc) {
        const R = r + 4 + 24 / renderScale();
        disc = makeSprite(R * 2, R * 2, renderScale(), (cc) => {
          cc.save();
          cc.shadowColor = "rgba(0,0,0,0.45)";
          cc.shadowBlur = 12;
          cc.shadowOffsetY = 5;
          const ng = cc.createRadialGradient(R - r * 0.35, R - r * 0.4, 2, R, R, r);
          ng.addColorStop(0, open ? shade(col, 0.45) : "#64748b");
          ng.addColorStop(1, open ? shade(col, -0.35) : "#1e293b");
          cc.fillStyle = ng;
          cc.beginPath();
          cc.arc(R, R, r, 0, TAU);
          cc.fill();
          cc.restore();
          cc.strokeStyle = open ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)";
          cc.lineWidth = 2.5;
          cc.beginPath();
          cc.arc(R, R, r, 0, TAU);
          cc.stroke();
        });
        if (this.nodeDiscs.size > 32) this.nodeDiscs.clear();
        this.nodeDiscs.set(dk, disc);
      }
      const R = r + 4 + 24 / renderScale();
      c.drawImage(disc, nd.x - R, y - R, R * 2, R * 2);
      if (!open) drawLock(c, nd.x, y - 4, 22);
      else {
        c.font = `800 ${nd.n === ENDLESS ? 26 : 21}px ${FONT_DISPLAY}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.lineWidth = 4;
        c.strokeStyle = "rgba(0,0,0,0.35)";
        const label = nd.n === ENDLESS ? "∞" : String(nd.n);
        c.strokeText(label, nd.x, y + 1);
        c.fillStyle = "#ffffff";
        c.fillText(label, nd.x, y + 1);
      }
      if (nd.n !== ENDLESS) {
        const st = this.stars[nd.n] || 0;
        if (open) for (let k = 0; k < 3; k++) drawStar(c, nd.x - 15 + k * 15, y + r + 9 - (k === 1 ? 3 : 0), 7, k < st);
        // Season label to the side
        const m = MAPS[nd.n - 1];
        c.font = `600 11px ${FONT_BODY}`;
        c.textBaseline = "middle";
        const side = nd.x > w / 2 ? -1 : 1;
        c.textAlign = side > 0 ? "left" : "right";
        c.fillStyle = open ? rgba(col, 0.95) : "rgba(255,255,255,0.35)";
        c.fillText(SEASON_NAME[m.season], nd.x + side * (r + 10), y - 6);
        c.fillStyle = open ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)";
        c.fillText(`${m.waves} คลื่น${m.intro && m.n > 1 ? " · ศัตรูใหม่" : ""}`, nd.x + side * (r + 10), y + 9);
      } else {
        c.font = `600 12px ${FONT_BODY}`;
        c.textAlign = "center";
        c.textBaseline = "top";
        c.fillStyle = open ? "#ddd6fe" : "rgba(255,255,255,0.4)";
        c.fillText(open ? `โหมดไม่รู้จบ · สถิติ ${this.endlessBest}` : `โหมดไม่รู้จบ (ผ่านด่าน ${ENDLESS_AT - 1})`, nd.x, y + r + 6);
      }
      // Sprout marker on the current map
      if (current) {
        const by = y - r - 18 + Math.sin(this.time * 4) * 4;
        drawTree(c, nd.x, by + 8, 14, 0, "spring", 1, this.time);
      }
      const n = nd.n;
      this.hits.push({
        x: nd.x - r - 6, y: y - r - 6, w: r * 2 + 12, h: r * 2 + 22,
        enabled: open,
        act: () => {
          if (open) this.openLoadout(n);
          else this.say(n === ENDLESS ? `ผ่านด่าน ${ENDLESS_AT - 1} ก่อนนะ` : "ผ่านด่านก่อนหน้าก่อนนะ");
        },
      });
    }
    // Header
    c.fillStyle = "rgba(8,16,12,0.85)";
    c.fillRect(0, 0, w, head);
    c.font = `700 19px ${FONT_DISPLAY}`;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = "#ffffff";
    c.fillText("ปกป้องต้นไม้ลมหายใจ", 16, 24);
    c.font = `500 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.6)";
    const total3 = this.stars.reduce((s, v) => s + (v || 0), 0);
    c.fillText(`เลือกด่าน · ดาว ${total3}/${MAP_COUNT * 3}`, 16, 46);
    this.coinPill(c, w - 12, 32);
  }

  private coinPill(c: CanvasRenderingContext2D, right: number, cy: number) {
    const label = wallet.coins().toLocaleString();
    c.font = `800 15px ${FONT_DISPLAY}`;
    const tw = c.measureText(label).width + 40;
    c.fillStyle = "rgba(255,201,60,0.16)";
    roundRectPath(c, right - tw, cy - 15, tw, 30, 15);
    c.fill();
    drawCoin(c, right - tw + 16, cy, 9);
    c.fillStyle = "#ffd76a";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(label, right - tw + 30, cy + 1);
  }

  // ── Loadout ──────────────────────────────────────────────────────────────

  private toggleLoadout(k: TowerKind) {
    const i = this.loadout.indexOf(k);
    if (i >= 0) {
      if (this.loadout.length <= 1) return this.say("ต้องพาไปอย่างน้อย 1 ป้อม");
      this.loadout.splice(i, 1);
      this.env.sfx.tone({ freq: 420, dur: 0.06, vol: 0.04, glideTo: 320 });
    } else if (this.loadout.length >= LOADOUT_SLOTS) {
      this.say(`พาไปได้ ${LOADOUT_SLOTS} ป้อม แตะช่องด้านบนเพื่อเอาออก`);
      this.env.sfx.tone({ freq: 180, dur: 0.1, vol: 0.05, type: "triangle" });
    } else {
      this.loadout.push(k);
      this.env.sfx.tone({ freq: 660, dur: 0.06, vol: 0.05, glideTo: 880 });
    }
  }

  private buyTower(k: TowerKind, x: number, y: number) {
    const up = TOWERS[k].up;
    if (!up) return;
    const owned = this.owns(k);
    const cost = wallet.upgradeCost(up);
    if (wallet.upgrade(up)) {
      this.env.sfx.chime(pentatonic(7), 0.1);
      this.env.sfx.chime(pentatonic(9), 0.08, 0.1);
      this.particles.burst(x, y, "#ffd76a", 26, { speed: 200, size: 3, gravity: 120 });
      if (!owned) {
        this.say(`ได้ ${TOWERS[k].name} แล้ว`);
        if (this.loadout.length < LOADOUT_SLOTS) this.loadout.push(k);
      } else this.say(`${TOWERS[k].name} ขั้นถาวร ${wallet.level(up)}`);
    } else {
      this.env.sfx.tone({ freq: 180, dur: 0.12, vol: 0.06, type: "triangle" });
      this.say(`ยังขาดอีก ${(cost - wallet.coins()).toLocaleString()} เหรียญ`);
    }
  }

  private renderLoadout(c: CanvasRenderingContext2D) {
    const { w, h } = this;
    const m = this.spec();
    const season = m ? m.season : "spring";
    const L = LOOK[season];
    // Background gradient and its big season glow: one cached layer per season and size.
    const lk = `${w}x${h}@${renderScale()}|${season}`;
    if (!this.loadBg || this.loadBgKey !== lk) {
      this.loadBgKey = lk;
      this.loadBg = makeSprite(w, h, renderScale(), (cc) => {
        const bg = cc.createLinearGradient(0, 0, 0, h);
        const dark = season === "winter" ? -0.72 : -0.35;
        bg.addColorStop(0, shade(L.bg[0], dark));
        bg.addColorStop(1, shade(L.bg[2], dark - 0.1));
        cc.fillStyle = bg;
        cc.fillRect(0, 0, w, h);
        glow(cc, w / 2, 120, w * 0.7, SEASON_COLOR[season], 0.12);
      });
    }
    c.drawImage(this.loadBg, 0, 0, w, h);
    const cw = Math.min(w - 20, 440);
    const x0 = (w - cw) / 2;

    // Top bar
    c.fillStyle = "rgba(255,255,255,0.08)";
    roundRectPath(c, x0, 8, 48, 44, 16);
    c.fill();
    c.strokeStyle = "#ffffff";
    c.lineWidth = 3;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(x0 + 28, 20);
    c.lineTo(x0 + 18, 30);
    c.lineTo(x0 + 28, 40);
    c.stroke();
    this.hits.push({ x: x0 - 4, y: 4, w: 58, h: 52, act: () => this.toMaps() });
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = `700 18px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(m ? `ด่าน ${m.n}` : "โหมดไม่รู้จบ", x0 + 60, 22);
    c.font = `500 12px ${FONT_BODY}`;
    c.fillStyle = rgba(SEASON_COLOR[season], 0.95);
    c.fillText(m ? `${SEASON_NAME[season]} · ${TREE_TIER_NAME[m.tier]}` : "ฤดูเปลี่ยนทุก 5 คลื่น", x0 + 60, 42);
    this.coinPill(c, x0 + cw, 30);

    // Map card
    let y = 62;
    const cardH = 112;
    glassPanel(c, x0, y, cw, cardH, 18, 0.08);
    // Mini map
    const mmH = cardH - 16;
    const mmW = mmH * (GW / GH);
    const mx = x0 + 10;
    const my = y + 8;
    const layout = m ? layoutFor(m) : null;
    c.save();
    roundRectPath(c, mx, my, mmW, mmH, 10);
    c.clip();
    const mg = c.createLinearGradient(0, my, 0, my + mmH);
    mg.addColorStop(0, L.bg[0]);
    mg.addColorStop(1, L.bg[2]);
    c.fillStyle = mg;
    c.fillRect(mx, my, mmW, mmH);
    if (layout) {
      const sc = mmW / GW;
      c.lineJoin = "round";
      c.lineCap = "round";
      for (const [col, lw] of [[L.edge, 0.9], [L.pathHi, 0.55]] as [string, number][]) {
        for (const rt of layout.routes) {
          c.beginPath();
          rt.forEach(([gx, gy], i) => (i ? c.lineTo(mx + gx * sc, my + gy * sc) : c.moveTo(mx + gx * sc, my + gy * sc)));
          c.strokeStyle = col;
          c.lineWidth = sc * lw;
          c.stroke();
        }
      }
      drawTree(c, mx + layout.tree[0] * sc, my + layout.tree[1] * sc, sc * 1.1, m!.tier, season, 1, this.time);
    } else {
      c.font = `800 34px ${FONT_DISPLAY}`;
      c.fillStyle = "#ddd6fe";
      c.textAlign = "center";
      c.fillText("∞", mx + mmW / 2, my + mmH / 2);
    }
    c.restore();
    const tx = mx + mmW + 12;
    c.textAlign = "left";
    c.textBaseline = "top";
    c.font = `700 15px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(m ? `${LAYOUTS[m.layout].name} · ${m.waves} คลื่น` : `สถิติ ${this.endlessBest} คลื่น`, tx, y + 10);
    c.font = `500 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.7)";
    const routes = layout ? layout.routes.length : 1;
    const routeText = !m ? "ทางสุ่ม ศัตรูทุกแบบทยอยมา" : layout!.mode === "switch" ? "ทางเปลี่ยนทุกคลื่น ดูลูกศรก่อนเริ่ม" : routes > 1 ? `ศัตรูมาจาก ${routes} ทาง` : "ทางเดียว";
    c.fillText(routeText, tx, y + 32);
    // Enemy icons
    const pool: EnemyKind[] = m ? [...m.pool, "boss"] : ["puff", "runner", "brute", "splitter", "jumper", "healer", "shell", "flyer", "shield", "boss"];
    const iconR = 9;
    const room = x0 + cw - tx - 8;
    const step = Math.min(26, room / pool.length);
    pool.forEach((k, i) => {
      const ex = tx + iconR + i * step;
      const ey = y + 62;
      if (m && k === m.intro && m.n > 1) glow(c, ex, ey, 20, "#fde68a", 0.6);
      drawEnemy(c, iconEnemy(k), ex, ey - 2, k === "boss" ? iconR * 1.25 : iconR, iconR * 3, this.time, false);
    });
    if (m && m.intro && m.n > 1) {
      c.font = `600 12px ${FONT_BODY}`;
      c.fillStyle = "#fde68a";
      const line = wrapText(c, `ใหม่: ${ENEMIES[m.intro].name} — ${ENEMIES[m.intro].desc}`, x0 + cw - tx - 10)[0];
      c.fillText(line, tx, y + 82);
    } else if (m) {
      c.font = `500 12px ${FONT_BODY}`;
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillText(m.n === 1 ? "ด่านแรก ควันยังบางเบา" : "บอสท้ายด่าน: ราชาควัน", tx, y + 82);
    }
    y += cardH + 10;

    // Slots
    c.font = `700 14px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(`ป้อมที่พาไป ${this.loadout.length}/${LOADOUT_SLOTS}`, x0 + 4, y + 8);
    c.font = `500 11px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.textAlign = "right";
    c.fillText("แตะเพื่อเลือก / เอาออก", x0 + cw - 4, y + 8);
    y += 20;
    const slotW = (cw - 8 * (LOADOUT_SLOTS - 1)) / LOADOUT_SLOTS;
    const slotH = 52;
    for (let i = 0; i < LOADOUT_SLOTS; i++) {
      const sx = x0 + i * (slotW + 8);
      const k = this.loadout[i];
      c.fillStyle = k ? rgba(TOWERS[k].color, 0.16) : "rgba(255,255,255,0.05)";
      roundRectPath(c, sx, y, slotW, slotH, 14);
      c.fill();
      c.setLineDash(k ? [] : [4, 4]);
      c.strokeStyle = k ? rgba(TOWERS[k].color, 0.7) : "rgba(255,255,255,0.25)";
      c.lineWidth = 1.5;
      c.stroke();
      c.setLineDash([]);
      if (k) {
        drawTower(c, k, 1, sx + slotW / 2, y + slotH / 2 + 4, 15, -Math.PI / 2, this.time, 0, i);
        const kk = k;
        this.hits.push({ x: sx, y, w: slotW, h: slotH, act: () => {
          this.info = kk;
          this.toggleLoadout(kk);
        } });
      }
    }
    y += slotH + 12;

    // Tower grid
    const cols = 4;
    const rows = Math.ceil(ALL_TOWERS.length / cols);
    const fixedBelow = 8 + 64 + 8 + 50 + 8 + 52 + 10;
    const tileH = clamp((h - y - fixedBelow) / rows - 8, 62, 92);
    const tileW = (cw - 8 * (cols - 1)) / cols;
    ALL_TOWERS.forEach((k, i) => {
      const tx2 = x0 + (i % cols) * (tileW + 8);
      const ty2 = y + Math.floor(i / cols) * (tileH + 8);
      const owned = this.owns(k);
      const inL = this.loadout.includes(k);
      const isInfo = this.info === k;
      c.fillStyle = inL ? rgba(TOWERS[k].color, 0.2) : "rgba(255,255,255,0.06)";
      roundRectPath(c, tx2, ty2, tileW, tileH, 14);
      c.fill();
      c.strokeStyle = isInfo ? "#ffffff" : inL ? rgba(TOWERS[k].color, 0.8) : "rgba(255,255,255,0.12)";
      c.lineWidth = isInfo ? 2.5 : 1.5;
      c.stroke();
      c.globalAlpha = owned ? 1 : 0.45;
      const art = Math.min(18, tileH * 0.22);
      drawTower(c, k, 1, tx2 + tileW / 2, ty2 + tileH * (owned ? 0.42 : 0.5), art, -Math.PI / 2, this.time, 0, i);
      c.globalAlpha = 1;
      c.font = `600 11px ${FONT_BODY}`;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      c.fillStyle = owned ? "#ffffff" : "rgba(255,255,255,0.6)";
      const nm = TOWERS[k].name;
      c.fillText(c.measureText(nm).width > tileW - 6 ? wrapText(c, nm, tileW - 6)[0] : nm, tx2 + tileW / 2, ty2 + tileH - 8);
      if (!owned) {
        drawLock(c, tx2 + tileW - 14, ty2 + 14, 12);
        const price = wallet.upgradeCost(TOWERS[k].up);
        c.font = `700 11px ${FONT_DISPLAY}`;
        c.textAlign = "left";
        c.fillStyle = wallet.coins() >= price ? "#ffd76a" : "rgba(255,215,106,0.6)";
        drawCoin(c, tx2 + 12, ty2 + 13, 6);
        c.fillText(price.toLocaleString(), tx2 + 21, ty2 + 17);
      } else if (inL) {
        c.fillStyle = "#22c55e";
        c.beginPath();
        c.arc(tx2 + tileW - 13, ty2 + 13, 8, 0, TAU);
        c.fill();
        c.strokeStyle = "#ffffff";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(tx2 + tileW - 17, ty2 + 13);
        c.lineTo(tx2 + tileW - 14, ty2 + 16);
        c.lineTo(tx2 + tileW - 9, ty2 + 10);
        c.stroke();
      }
      if (m && m.tip === k) {
        c.font = `700 10px ${FONT_BODY}`;
        c.fillStyle = "#fde68a";
        c.textAlign = "left";
        c.fillText("แนะนำ", tx2 + 8, owned ? ty2 + 16 : ty2 + 30);
      }
      this.hits.push({ x: tx2, y: ty2, w: tileW, h: tileH, act: () => {
        const was = this.info === k;
        this.info = k;
        if (owned && (was || !inL)) this.toggleLoadout(k);
        else if (owned) this.env.sfx.tone({ freq: 560, dur: 0.05, vol: 0.04 });
        else this.env.sfx.tone({ freq: 400, dur: 0.05, vol: 0.04 });
      } });
    });
    y += rows * (tileH + 8);

    // Info strip for the chosen tower
    const k = this.info;
    const spec = TOWERS[k];
    const owned = this.owns(k);
    const infoH = 64;
    glassPanel(c, x0, y, cw, infoH, 16, 0.07);
    c.textAlign = "left";
    c.textBaseline = "top";
    c.font = `700 14px ${FONT_DISPLAY}`;
    c.fillStyle = spec.color;
    const lvl = spec.up ? wallet.level(spec.up) : 0;
    c.fillText(`${spec.name}${spec.up && owned && lvl > 1 ? ` · ถาวร ${lvl}` : ""}`, x0 + 12, y + 8);
    c.font = `500 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    const btnW = spec.up ? 104 : 0;
    const lines = wrapText(c, `${spec.desc} · สร้าง ${spec.cost} ทอง`, cw - 24 - btnW);
    lines.slice(0, 2).forEach((l, i) => c.fillText(l, x0 + 12, y + 28 + i * 16));
    if (spec.up) {
      const cost = wallet.upgradeCost(spec.up);
      const can = wallet.coins() >= cost;
      const bx = x0 + cw - btnW - 8;
      const by = y + 10;
      c.fillStyle = can ? (owned ? "#0f766e" : "#b45309") : "rgba(255,255,255,0.12)";
      roundRectPath(c, bx, by, btnW, infoH - 20, 14);
      c.fill();
      c.textAlign = "center";
      c.font = `700 12px ${FONT_DISPLAY}`;
      c.fillStyle = "#ffffff";
      c.fillText(owned ? "อัปถาวร +8%" : "ปลดล็อก", bx + btnW / 2, by + 5);
      drawCoin(c, bx + btnW / 2 - 22, by + 31, 6);
      c.font = `700 12px ${FONT_DISPLAY}`;
      c.fillStyle = "#ffd76a";
      c.textAlign = "left";
      c.fillText(cost.toLocaleString(), bx + btnW / 2 - 13, by + 24);
      this.hits.push({ x: bx, y: by, w: btnW, h: infoH - 20, enabled: can, act: () => this.buyTower(k, bx + btnW / 2, by + 20) });
    }
    y += infoH + 8;

    // Permanent upgrades
    const ids = ["td_gold", "td_power", "td_lives"];
    const pw = (cw - 16) / 3;
    ids.forEach((id, i) => {
      const bx = x0 + i * (pw + 8);
      const cost = wallet.upgradeCost(id);
      const can = wallet.coins() >= cost;
      c.fillStyle = can ? "rgba(21,128,61,0.75)" : "rgba(255,255,255,0.08)";
      roundRectPath(c, bx, y, pw, 50, 14);
      c.fill();
      c.textAlign = "center";
      c.textBaseline = "top";
      c.font = `700 12px ${FONT_DISPLAY}`;
      c.fillStyle = "#ffffff";
      c.fillText(`${PERM_LABEL[id]} ขั้น ${wallet.level(id)}`, bx + pw / 2, y + 7);
      c.font = `600 11px ${FONT_BODY}`;
      c.fillStyle = "#ffd76a";
      c.fillText(`อัป ${cost.toLocaleString()} เหรียญ`, bx + pw / 2, y + 27);
      this.hits.push({ x: bx, y, w: pw, h: 50, enabled: can, act: () => {
        if (wallet.upgrade(id)) {
          this.env.sfx.chime(pentatonic(6), 0.1);
          this.particles.burst(bx + pw / 2, y + 25, "#86efac", 18, { speed: 150, size: 3, gravity: 0 });
        } else this.say(`ยังขาดอีก ${(cost - wallet.coins()).toLocaleString()} เหรียญ`);
      } });
    });
    y += 58;

    // Start
    const sh = Math.max(46, Math.min(54, h - y - 10));
    // Start button body with its soft shadow: cached (a blurred shadow per frame is slow).
    {
      const k = renderScale();
      const P = 30 / k + 2;
      const sk = `${cw}x${sh}@${k}`;
      if (!this.startSpr || this.startKey !== sk) {
        this.startKey = sk;
        this.startSpr = makeSprite(cw + P * 2, sh + P * 2, k, (cc) => {
          const sg = cc.createLinearGradient(0, P, 0, P + sh);
          sg.addColorStop(0, "#22c55e");
          sg.addColorStop(1, "#15803d");
          cc.shadowColor = "rgba(34,197,94,0.5)";
          cc.shadowBlur = 16;
          cc.shadowOffsetY = 5;
          cc.fillStyle = sg;
          roundRectPath(cc, P, P, cw, sh, sh / 2);
          cc.fill();
        });
      }
      c.drawImage(this.startSpr, Math.round((x0 - P) * k) / k, Math.round((y - P) * k) / k, this.startSpr.width / k, this.startSpr.height / k);
    }
    c.font = `700 18px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(m ? `เริ่มด่าน ${m.n}` : "เริ่มโหมดไม่รู้จบ", w / 2, y + sh / 2 + 1);
    this.hits.push({ x: x0, y, w: cw, h: sh, act: () => this.startMap() });
    this.particles.render(c);
  }

  // ── Play ─────────────────────────────────────────────────────────────────

  private renderPlay(c: CanvasRenderingContext2D) {
    const world = this.world;
    if (!world) return;
    this.ensureBackground();
    const { w, h } = this;
    const cell = this.geo.cell;
    if (this.bg) c.drawImage(this.bg, 0, 0, w, h);
    else {
      c.fillStyle = LOOK[this.season].bg[1];
      c.fillRect(0, 0, w, h);
    }
    // Auras under everything
    world.towers.forEach((t, i) => {
      if (!t || (t.kind !== "frost" && t.kind !== "buff")) return;
      const p = this.px(world.pads[i][0], world.pads[i][1]);
      const r = world.stat(t).range * cell;
      const col = TOWERS[t.kind].color;
      const g = c.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
      g.addColorStop(0, rgba(col, 0.05));
      g.addColorStop(0.85, rgba(col, 0.12 + 0.04 * Math.sin(this.time * 2 + i)));
      g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, r, 0, TAU);
      c.fill();
    });
    // Next-wave route arrows
    if (!world.waveActive && !world.result) {
      for (const ri of world.nextRoutes()) {
        const r = world.routes[ri];
        for (let k = 0; k < 4; k++) {
          const d = 0.9 + ((this.time * 1.6 + k * 0.9) % 3.6);
          const q = routeAt(r, d);
          if (q.x < 0 || q.x > GW || q.y < 0) continue;
          const p = this.px(q.x, q.y);
          c.save();
          c.translate(p.x, p.y);
          c.rotate(q.a);
          c.globalAlpha = 0.85 * Math.sin(((d - 0.9) / 3.6) * Math.PI);
          c.fillStyle = "#fde68a";
          c.beginPath();
          c.moveTo(cell * 0.22, 0);
          c.lineTo(-cell * 0.12, -cell * 0.2);
          c.lineTo(-cell * 0.02, 0);
          c.lineTo(-cell * 0.12, cell * 0.2);
          c.closePath();
          c.fill();
          c.restore();
        }
      }
    }
    const health = world.maxLives ? world.lives / world.maxLives : 1;
    const tp = this.px(world.tree[0], world.tree[1]);
    drawTree(c, tp.x + (this.treeHurt > 0 ? Math.sin(this.time * 60) * this.treeHurt * 3 : 0), tp.y, cell, this.tier, this.season, health, this.time);

    // Selection range
    const sel = this.sel;
    if (sel && this.state === "play") {
      let cx = 0;
      let cy = 0;
      let range = 0;
      if (sel.t === "pad") {
        const t = world.towers[sel.i];
        const p = this.px(world.pads[sel.i][0], world.pads[sel.i][1]);
        cx = p.x;
        cy = p.y;
        range = t ? (t.kind === "bank" ? 0 : world.stat(t).range) : 2.4;
      } else if (sel.t === "fence") {
        const p = this.px(sel.b.x, sel.b.y);
        cx = p.x;
        cy = p.y;
      } else {
        const p = this.px(sel.x, sel.y);
        cx = p.x;
        cy = p.y;
      }
      if (range > 0) {
        c.fillStyle = "rgba(255,255,255,0.08)";
        c.strokeStyle = "rgba(255,255,255,0.5)";
        c.setLineDash([6, 6]);
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(cx, cy, range * cell, 0, TAU);
        c.fill();
        c.stroke();
        c.setLineDash([]);
      }
      c.strokeStyle = "#ffffff";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(cx, cy, cell * 0.55, 0, TAU);
      c.stroke();
    }
    // Empty pads pulse gently so new players see where to build
    if (this.state === "play") {
      world.pads.forEach(([gx, gy], i) => {
        if (world.towers[i]) return;
        const p = this.px(gx, gy);
        const light = this.season === "winter";
        c.strokeStyle = light ? `rgba(30,41,59,${0.25 + 0.12 * Math.sin(this.time * 3 + i)})` : `rgba(255,255,255,${0.15 + 0.12 * Math.sin(this.time * 3 + i)})`;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(p.x, p.y, cell * 0.3, 0, TAU);
        c.stroke();
        c.beginPath();
        c.moveTo(p.x - 5, p.y);
        c.lineTo(p.x + 5, p.y);
        c.moveTo(p.x, p.y - 5);
        c.lineTo(p.x, p.y + 5);
        c.stroke();
      });
    }
    // Ghost fence on the chosen trail spot
    if (sel && sel.t === "spot") {
      const p = this.px(sel.x, sel.y);
      const spot = world.barrierSpot(sel.x, sel.y);
      c.globalAlpha = 0.55 + 0.2 * Math.sin(this.time * 6);
      drawFence(c, p.x, p.y, cell, spot ? spot.angle : 0, 1, 1, 0, this.time);
      c.globalAlpha = 1;
    }
    for (const b of world.barriers) {
      const p = this.px(b.x, b.y);
      drawFence(c, p.x, p.y, cell, b.angle, b.hp / b.maxHp, b.lvl, b.flash, this.time);
    }
    // Enemies, nearest last
    const list = [...world.enemies].sort((a, b) => a.y - b.y);
    for (const e of list) {
      const p = this.px(e.x, e.y);
      drawEnemy(c, e, p.x + Math.sin(e.wob + this.time * 2) * cell * 0.06, p.y, e.r * cell, cell, this.time);
    }
    // Towers
    world.towers.forEach((t, i) => {
      if (!t) return;
      const p = this.px(world.pads[i][0], world.pads[i][1]);
      const s = cell * 0.56;
      drawTower(c, t.kind, t.lvl, p.x, p.y, s, t.aim, this.time, t.flash, i);
      for (let k = 0; k < t.lvl; k++) {
        c.fillStyle = "#ffd76a";
        c.beginPath();
        c.arc(p.x - (t.lvl - 1) * 4 + k * 8, p.y + s * 0.95, 2.6, 0, TAU);
        c.fill();
      }
      if (t.buff > 0) {
        glow(c, p.x + s * 0.8, p.y - s * 0.7, 8, "#f472b6", 0.9);
        c.fillStyle = "#fce7f3";
        c.beginPath();
        c.arc(p.x + s * 0.8, p.y - s * 0.7, 2.2, 0, TAU);
        c.fill();
      }
    });
    // Beams, shots, rings
    c.save();
    c.globalCompositeOperation = this.season === "winter" ? "source-over" : "lighter";
    world.towers.forEach((t, i) => {
      if (!t || t.kind !== "lens" || !t.target || t.target.dead) return;
      const a = this.px(world.pads[i][0], world.pads[i][1] - 0.1);
      const b = this.px(t.target.x, t.target.y);
      c.strokeStyle = "rgba(251,191,36,0.35)";
      c.lineWidth = 7 + t.lvl;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.strokeStyle = "#fff7d6";
      c.lineWidth = 2;
      c.stroke();
      glow(c, b.x, b.y, 14, "#fbbf24", 0.6);
    });
    for (const b of this.beams) {
      const k = 1 - b.t / 0.18;
      c.strokeStyle = `rgba(244,63,94,${0.6 * k})`;
      c.lineWidth = 5 * k;
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(b.tx, b.ty);
      c.stroke();
      c.strokeStyle = `rgba(255,241,242,${k})`;
      c.lineWidth = 1.5;
      c.stroke();
    }
    for (const r of this.visRings) {
      c.strokeStyle = rgba(r.color, 0.6 * (1 - r.t));
      c.lineWidth = 3;
      c.beginPath();
      c.arc(r.x, r.y, r.r * (0.3 + r.t * 0.7), 0, TAU);
      c.stroke();
    }
    c.restore();
    for (const s of world.shots) {
      const p = this.px(s.x, s.y);
      const z = s.kind === "mortar" ? Math.sin(Math.min(1, s.t / s.dur) * Math.PI) * cell * 1.6 : 0;
      drawShot(c, s.kind, p.x, p.y, z, this.time, cell);
    }
    if (this.season === "winter") this.renderParticlesFlat(c, this.particles.list);
    else this.particles.render(c);
    this.weather.render(c);
    this.floaters.render(c);
  }

  /** Particles drawn with normal blending, so they stay visible on the bright winter snow. */
  private renderParticlesFlat(c: CanvasRenderingContext2D, list: Particle[]) {
    c.save();
    for (const p of list) {
      const t = p.life / p.max;
      c.globalAlpha = Math.min(1, t * 1.6);
      if (p.kind === "ring") {
        c.strokeStyle = p.color;
        c.lineWidth = 3 * t;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (0.3 + 1 - t), 0, TAU);
        c.stroke();
      } else {
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, TAU);
        c.fill();
      }
    }
    c.restore();
  }

  private renderHud(c: CanvasRenderingContext2D) {
    const world = this.world!;
    const { w } = this;
    c.fillStyle = LOOK[this.season].hud;
    c.fillRect(0, 0, w, 46);
    c.textBaseline = "middle";
    c.fillStyle = "#4ade80";
    c.beginPath();
    c.ellipse(22, 23, 8, 11, 0.6, 0, TAU);
    c.fill();
    c.strokeStyle = "#14532d";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(16, 31);
    c.lineTo(27, 16);
    c.stroke();
    c.font = `800 18px ${FONT_DISPLAY}`;
    c.textAlign = "left";
    c.fillStyle = world.lives <= 5 ? "#fca5a5" : "#ffffff";
    c.fillText(`${world.lives}`, 36, 24);
    drawCoin(c, 96, 23, 10);
    c.fillStyle = "#ffd76a";
    c.fillText(`${world.gold}`, 111, 24);
    c.textAlign = "right";
    c.fillStyle = "#ffffff";
    c.font = `700 15px ${FONT_DISPLAY}`;
    const m = this.spec();
    c.fillText(m ? `ด่าน ${m.n} · คลื่น ${Math.max(1, world.wave)}/${m.waves}` : `คลื่น ${Math.max(1, world.wave)}`, w - 14, 17);
    c.font = `500 11px ${FONT_BODY}`;
    c.fillStyle = rgba(SEASON_COLOR[this.season], 0.9);
    c.fillText(m ? `${SEASON_NAME[this.season]} · ${TREE_TIER_NAME[this.tier]}` : `สถิติ ${this.endlessBest} คลื่น`, w - 14, 35);
  }

  private renderBanner(c: CanvasRenderingContext2D) {
    if (!this.banner) return;
    const b = this.banner;
    const a = clamp(Math.min(b.t * 4, (4.5 - b.t) * 2), 0, 1);
    const spec = ENEMIES[b.kind];
    const bw = Math.min(this.w - 24, 380);
    const x = (this.w - bw) / 2;
    const y = 54 + (1 - a) * -20;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = "rgba(24,16,40,0.9)";
    roundRectPath(c, x, y, bw, 62, 16);
    c.fill();
    c.strokeStyle = "rgba(253,230,138,0.6)";
    c.lineWidth = 1.5;
    c.stroke();
    glow(c, x + 34, y + 31, 28, "#fde68a", 0.35);
    drawEnemy(c, iconEnemy(b.kind), x + 34, y + 32, 15, 40, this.time, false);
    c.textAlign = "left";
    c.textBaseline = "top";
    c.font = `700 14px ${FONT_DISPLAY}`;
    c.fillStyle = "#fde68a";
    c.fillText(`ศัตรูใหม่: ${spec.name}`, x + 64, y + 9);
    c.font = `500 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.85)";
    wrapText(c, spec.desc, bw - 76).slice(0, 2).forEach((l, i) => c.fillText(l, x + 64, y + 30 + i * 15));
    c.restore();
  }

  private renderBar(c: CanvasRenderingContext2D) {
    const world = this.world!;
    const { w } = this;
    const bwid = Math.min(w - 16, 560);
    const bx0 = (w - bwid) / 2;
    const y = this.barTop;
    const bh = this.h - y - 10;
    c.fillStyle = "rgba(10,20,14,0.86)";
    roundRectPath(c, bx0, y, bwid, bh, 18);
    c.fill();
    const tile = (x: number, tw: number, enabled: boolean, draw: (cx: number, cy: number) => void, act: () => void) => {
      c.globalAlpha = enabled ? 1 : 0.45;
      c.fillStyle = "rgba(255,255,255,0.08)";
      roundRectPath(c, x, y + 8, tw, bh - 16, 12);
      c.fill();
      draw(x + tw / 2, y + bh / 2);
      c.globalAlpha = 1;
      this.hits.push({ x, y: y + 8, w: tw, h: bh - 16, act: () => (enabled ? act() : undefined), enabled });
    };
    const hint = (text: string) => {
      c.font = `600 12px ${FONT_BODY}`;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      c.lineWidth = 4;
      c.strokeStyle = "rgba(0,0,0,0.5)";
      c.strokeText(text, w / 2, y - 8);
      c.fillStyle = "rgba(255,255,255,0.92)";
      c.fillText(text, w / 2, y - 8);
    };
    const sel = this.sel;

    if (sel && sel.t === "pad" && !world.towers[sel.i]) {
      const kinds = this.loadout.filter((k) => k !== "barrier");
      const n = Math.max(1, kinds.length);
      const tw = Math.min(110, (bwid - 10 * (n + 1)) / n);
      const start = w / 2 - (tw * n + 10 * (n - 1)) / 2;
      kinds.forEach((k, i) => {
        const spec = TOWERS[k];
        const x = start + i * (tw + 10);
        const can = world.gold >= spec.cost;
        tile(x, tw, can, (cx, cy) => {
          drawTower(c, k, 1, cx, cy - 6, Math.min(16, this.geo.cell * 0.4), -Math.PI / 2, this.time, 0, i);
          c.font = `700 11px ${FONT_DISPLAY}`;
          c.textAlign = "left";
          c.textBaseline = "alphabetic";
          c.fillStyle = can ? "#ffd76a" : "rgba(255,215,106,0.6)";
          const label = `${spec.cost}`;
          const lw = c.measureText(label).width + 13;
          drawCoin(c, cx - lw / 2 + 4, y + bh - 17, 5);
          c.fillText(label, cx - lw / 2 + 12, y + bh - 13);
        }, () => {
          if (world.build(sel.i, k)) {
            this.sel = null;
            const p = this.px(world.pads[sel.i][0], world.pads[sel.i][1]);
            this.particles.burst(p.x, p.y, spec.color, 22, { speed: 140, size: 3, gravity: 0 });
            this.env.sfx.chime(pentatonic(3), 0.1);
          }
        });
      });
      hint(this.loadout.includes("barrier") ? "เลือกป้อม · รั้วหนามให้แตะบนทางเดิน" : "เลือกป้อมที่จะสร้าง");
      return;
    }

    if (sel && sel.t === "spot") {
      const spec = TOWERS.barrier;
      const can = world.gold >= spec.cost;
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.font = `700 15px ${FONT_DISPLAY}`;
      c.fillStyle = spec.color;
      c.fillText(spec.name, bx0 + 14, y + 28);
      c.font = `500 12px ${FONT_BODY}`;
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.fillText("ขวางทาง ตัวบินและกบข้ามได้", bx0 + 14, y + 48);
      tile(bx0 + bwid - 10 - 110, 110, can, (cx, cy) => {
        c.textAlign = "center";
        c.font = `700 13px ${FONT_DISPLAY}`;
        c.fillStyle = "#ffffff";
        c.fillText("วางรั้ว", cx, cy - 4);
        c.font = `600 11px ${FONT_BODY}`;
        c.fillStyle = "#ffd76a";
        c.fillText(`${spec.cost} ทอง`, cx, cy + 14);
      }, () => {
        const b = world.placeBarrier(sel.x, sel.y);
        if (b) {
          this.sel = null;
          const p = this.px(b.x, b.y);
          this.particles.burst(p.x, p.y, "#d6a35c", 18, { speed: 120, size: 3, gravity: 200 });
          this.env.sfx.tone({ freq: 200, dur: 0.12, vol: 0.07, type: "square", glideTo: 140 });
        }
      });
      return;
    }

    if (sel && (sel.t === "pad" || sel.t === "fence")) {
      const isFence = sel.t === "fence";
      const t = sel.t === "pad" ? world.towers[sel.i]! : null;
      const b = sel.t === "fence" ? sel.b : null;
      const kind: TowerKind = t ? t.kind : "barrier";
      const lvl = t ? t.lvl : b!.lvl;
      const spec = TOWERS[kind];
      const cost = world.upgradeCost(kind, lvl);
      const canUp = lvl < MAX_LVL && world.gold >= cost;
      const sell = t ? Math.round(t.spent * 0.7) : Math.round(b!.spent * 0.7 * (0.3 + 0.7 * b!.hp / b!.maxHp));
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.font = `700 15px ${FONT_DISPLAY}`;
      c.fillStyle = spec.color;
      c.fillText(`${spec.name} ขั้น ${lvl}`, bx0 + 14, y + 28);
      c.font = `500 12px ${FONT_BODY}`;
      c.fillStyle = "rgba(255,255,255,0.7)";
      let sub = spec.desc;
      if (t && t.kind === "bank") sub = `ผ่านคลื่นได้ +${world.stat(t).bank} ทอง`;
      else if (t && t.kind === "buff") sub = `ป้อมรอบๆ แรงขึ้น ${Math.round(world.stat(t).aura * 100)}%`;
      else if (t && t.kind === "frost") sub = `ช้าลง ${Math.round(world.stat(t).slow * 100)}% · โดนแรงขึ้น ${Math.round(world.stat(t).brittle * 100)}%`;
      else if (b) sub = `ทน ${Math.ceil(b.hp)}/${Math.round(b.maxHp)} · อัปแล้วซ่อมเต็ม`;
      const maxW = bwid - 2 * 98 - 30;
      c.fillText(wrapText(c, sub, maxW)[0], bx0 + 14, y + 48);
      if (t && t.buff > 0) {
        c.fillStyle = "#f9a8d4";
        c.fillText(`ดอกไม้ช่วย +${Math.round(t.buff * 100)}%`, bx0 + 14, y + 64);
      }
      const bw = 92;
      tile(bx0 + bwid - 10 - bw * 2 - 8, bw, canUp, (cx, cy) => {
        c.textAlign = "center";
        c.font = `700 13px ${FONT_DISPLAY}`;
        c.fillStyle = "#ffffff";
        c.fillText(lvl >= MAX_LVL ? "สูงสุด" : isFence ? "อัป+ซ่อม" : "อัปเกรด", cx, cy - 4);
        if (lvl < MAX_LVL) {
          c.font = `600 11px ${FONT_BODY}`;
          c.fillStyle = "#ffd76a";
          c.fillText(`${cost} ทอง`, cx, cy + 14);
        }
      }, () => {
        const ok = t ? world.upgrade(sel.t === "pad" ? sel.i : -1) : world.upgradeBarrier(b!);
        if (ok) {
          const p = t ? this.px(world.pads[t.pad][0], world.pads[t.pad][1]) : this.px(b!.x, b!.y);
          this.particles.burst(p.x, p.y, "#ffd76a", 20, { speed: 120, size: 3, gravity: 0 });
          this.env.sfx.chime(pentatonic(4 + lvl), 0.1);
        }
      });
      tile(bx0 + bwid - 10 - bw, bw, true, (cx, cy) => {
        c.textAlign = "center";
        c.font = `700 13px ${FONT_DISPLAY}`;
        c.fillStyle = "#fecaca";
        c.fillText("ขาย", cx, cy - 4);
        c.font = `600 11px ${FONT_BODY}`;
        c.fillStyle = "#ffd76a";
        c.fillText(`+${sell} ทอง`, cx, cy + 14);
      }, () => {
        if (t) world.sell(t.pad);
        else world.sellBarrier(b!);
        this.sel = null;
        this.env.sfx.tone({ freq: 400, dur: 0.12, vol: 0.05, glideTo: 250 });
      });
      return;
    }

    // Default: wave button + speed
    const m = this.spec();
    const total = m ? m.waves : 0;
    const next = world.wave + 1;
    const label = world.waveActive
      ? `คลื่น ${world.wave}${total ? `/${total}` : ""} กำลังมา`
      : world.wave === 0 ? "เริ่มคลื่นแรก" : `เริ่มคลื่น ${next}${total ? `/${total}` : ""}`;
    const bw = bwid - 20 - 92 - 10;
    tile(bx0 + 10, bw, !world.waveActive, (cx, cy) => {
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.font = `700 16px ${FONT_DISPLAY}`;
      c.fillStyle = world.waveActive ? "rgba(255,255,255,0.7)" : "#bbf7d0";
      c.fillText(label, cx, cy - (world.waveActive ? 0 : 8));
      if (!world.waveActive) {
        c.font = `500 11px ${FONT_BODY}`;
        c.fillStyle = "rgba(255,255,255,0.65)";
        c.fillText(world.wave === 0 ? "แตะแท่นหินเพื่อสร้างป้อมก่อน" : `เริ่มเองใน ${Math.ceil(world.breakT)} วิ · เรียกเร็วได้ทอง`, cx, cy + 11);
        if (world.breakT > 0) {
          c.fillStyle = "rgba(187,247,208,0.6)";
          const pw = bw - 24;
          roundRectPath(c, cx - pw / 2, y + bh - 16, pw * clamp(world.breakT / BREAK, 0, 1), 3, 1.5);
          c.fill();
        }
      } else {
        const left = world.toSpawn.length + world.enemies.length;
        c.font = `500 11px ${FONT_BODY}`;
        c.fillStyle = "rgba(255,255,255,0.5)";
        c.fillText(`เหลือ ${left} ก้อน`, cx, cy + 16);
      }
    }, () => this.callWave());
    tile(bx0 + bwid - 10 - 92, 92, true, (cx, cy) => {
      c.fillStyle = this.speed > 1 ? "#fde68a" : "#ffffff";
      for (let k = 0; k < this.speed; k++) {
        const x = cx - (this.speed - 1) * 7 + k * 14 - 6;
        c.beginPath();
        c.moveTo(x, cy - 9);
        c.lineTo(x + 12, cy);
        c.lineTo(x, cy + 9);
        c.closePath();
        c.fill();
      }
    }, () => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    });
    if (world.wave === 0 && !this.sel) hint(this.loadout.includes("barrier") ? "แตะแท่นหินเพื่อสร้างป้อม · แตะทางเดินเพื่อวางรั้ว" : "แตะแท่นหินเพื่อสร้างป้อม");
  }

  // ── Result ───────────────────────────────────────────────────────────────

  private resultButtons(): Button[] {
    const m = this.spec();
    if (this.won && m && m.n < MAP_COUNT) return [this.nextBtn, this.mapsBtn];
    return [this.retryBtn, this.mapsBtn];
  }

  private renderResult(c: CanvasRenderingContext2D) {
    const world = this.world!;
    const m = this.spec();
    const stars = this.gotStars;
    const appear = this.stateT * 2.5;
    if (m) {
      drawCard(c, this.w, this.h, {
        title: this.won ? (m.n === MAP_COUNT ? "ต้นไม้ยักษ์รอดแล้ว!" : `ผ่านด่าน ${m.n}!`) : "ต้นไม้ล้มแล้ว",
        subtitle: this.won ? `เหลือพลังต้นไม้ ${world.lives}/${world.maxLives}` : `ผ่าน ${Math.max(0, world.wave - 1)}/${m.waves} คลื่น · ปัดเป่าควัน ${world.kills} ก้อน`,
        body: this.won
          ? m.n % 4 === 0 && m.n < MAP_COUNT ? `ครบหนึ่งปีแล้ว ต้นไม้จะโตเป็น${TREE_TIER_NAME[Math.min(4, m.tier + 1)]}ในด่านถัดไป` : undefined
          : m.tip && !this.owns(m.tip) ? `ลองปลดล็อก ${TOWERS[m.tip].name} หรืออัปเกรดถาวรก่อนลองใหม่` : "ลองเปลี่ยนป้อมที่พาไป หรือวางป้อมใกล้ทางเลี้ยว",
        icon: this.won
          ? (cc) => {
              for (let k = 0; k < 3; k++) {
                const pop = clamp(this.stateT * 3 - k * 0.35, 0, 1);
                drawStar(cc, (k - 1) * 44, k === 1 ? -8 : 4, (k === 1 ? 24 : 19) * (0.6 + 0.4 * pop), k < stars && pop > 0.5);
              }
            }
          : (cc) => drawTree(cc, 0, 22, 34, m.tier, m.season, 0.1, this.time),
        chips: this.newBest ? ["สถิติดาวใหม่!"] : [`ดาวที่ดีที่สุด ${this.stars[m.n] || 0}/3`],
        coins: this.earned,
        accent: this.won ? "#16a34a" : "#dc2626",
        buttons: this.resultButtons(),
        appear,
      });
    } else {
      const survived = Math.max(0, world.wave - 1);
      drawCard(c, this.w, this.h, {
        title: this.newBest ? "สถิติใหม่!" : "ต้นไม้ล้มแล้ว",
        subtitle: `ผ่าน ${survived} คลื่น · ปัดเป่าควัน ${world.kills} ก้อน`,
        chips: [`สถิติ ${this.endlessBest} คลื่น`],
        coins: this.earned,
        accent: "#7c3aed",
        buttons: this.resultButtons(),
        appear,
      });
    }
  }
}
