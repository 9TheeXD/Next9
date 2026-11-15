// Simulation for "ยานพิทักษ์ดาว": the player ship, waves, enemies, bosses, bullets, lasers and hazards
// of one map run. No DOM and no drawing: shooter.ts renders it and turns `events` into effects and
// sounds, and a headless autopilot can run it to check the difficulty curve.

import { clamp, rng, TAU } from "../engine/fx";
import { ENEMIES, bossName, coinPlan, waveCount, type BossSpec, type EnemyKind, type MapSpec, type Pattern } from "./maps";

export interface ShipStats {
  damage: number;
  interval: number;
  guns: number;
  drones: number;
  droneDmg: number;
  maxHp: number;
  magnet: number;
  /** Share of max HP repaired after each wave. */
  repair: number;
  /** Multiplier for pickup drop chance and duration. */
  luck: number;
}

/** Ship stats from hangar upgrade levels. */
export function shipStats(level: (id: string) => number): ShipStats {
  const damage = 10 * Math.pow(1.15, level("ship_damage"));
  const dl = level("ship_drone");
  return {
    damage,
    interval: Math.max(0.045, 0.26 / (1 + 0.13 * level("ship_rate"))),
    guns: Math.min(7, 1 + Math.floor(level("ship_guns") / 2)),
    drones: dl === 0 ? 0 : dl >= 5 ? 2 : 1,
    droneDmg: damage * 0.45 * (1 + dl * 0.12),
    maxHp: 100 + 20 * level("ship_hp"),
    magnet: 70 + 28 * level("ship_magnet"),
    repair: Math.min(0.6, 0.06 * level("ship_repair")),
    luck: 1 + 0.15 * level("ship_luck"),
  };
}

export interface BossState {
  spec: BossSpec;
  name: string;
  phase: number;
  rot: Pattern[][];
  idx: number;
  pat: Pattern | null;
  patT: number;
  patDur: number;
  emitT: number;
  rest: number;
  charge: number;
  chargeMax: number;
  next: Pattern | null;
  spin: number;
  dir: number;
  entering: boolean;
  trail: { x: number; y: number }[];
  segs: { x: number; y: number }[];
  tp: number;
  tx: number;
  ty: number;
  shots: number;
  side: number;
  /** Just teleported (the next attack comes before another jump). */
  jt: boolean;
}

export interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  max: number;
  r: number;
  t: number;
  fire: number;
  hit: number;
  phase: number;
  targetY: number;
  /** Free angle / timer slots used per kind. */
  a: number;
  aux: number;
  cycles: number;
  /** 0 visible … 1 fully cloaked. */
  cloak: number;
  /** Seconds of invulnerability (boss phase change, entering). */
  inv: number;
  elite: boolean;
  /** Seconds before the enemy leaves the screen. */
  life: number;
  leaving: boolean;
  /** 0..1 glow while charging an attack (drawn as a telegraph). */
  charge: number;
  boss?: BossState;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  enemy: boolean;
  color: string;
  kind: "dot" | "big" | "wall";
  t: number;
  /** Who fired it (for tuning stats). */
  src: string;
}

export interface Laser {
  x: number;
  y: number;
  w: number;
  warn: number;
  warnMax: number;
  dur: number;
  dmg: number;
  owner: Enemy | null;
  done: boolean;
  color: string;
}

export interface Mark {
  kind: "meteor" | "wall" | "tele";
  x: number;
  y: number;
  t: number;
  dur: number;
  gap: number;
  gw: number;
  owner: Enemy | null;
}

export type DropKind = "coin" | "spread" | "shield" | "heal" | "nova";

export interface Drop {
  x: number;
  y: number;
  vy: number;
  kind: DropKind;
  value: number;
  t: number;
}

export type WEvent =
  | { t: "kill"; e: Enemy }
  | { t: "hurt"; dmg: number }
  | { t: "block"; x: number; y: number }
  | { t: "coin" }
  | { t: "pickup"; kind: DropKind; x: number; y: number }
  | { t: "wave"; n: number }
  | { t: "bosswarn" }
  | { t: "phase"; n: number; x: number; y: number }
  | { t: "bossdown"; e: Enemy }
  | { t: "clear" }
  | { t: "dead" }
  | { t: "hint"; text: string }
  | { t: "boom"; x: number; y: number; r: number; color: string }
  | { t: "laser" }
  | { t: "nova" }
  | { t: "tele"; x: number; y: number };

export const PLAYER_R = 9;
const MAX_BULLETS = 650;

export class World {
  w: number;
  h: number;
  spec: MapSpec;
  stats: ShipStats;
  rand: () => number;
  state: "play" | "won" | "clear" | "dead" = "play";
  time = 0;
  px = 0;
  py = 0;
  hp = 100;
  maxHp = 100;
  fireT = 0;
  droneT = 0;
  spreadT = 0;
  shieldT = 0;
  hurtT = 0;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  lasers: Laser[] = [];
  marks: Mark[] = [];
  drops: Drop[] = [];
  wave = 0;
  toSpawn = 0;
  spawnT = 0;
  waveGap = 0;
  bossT = 0;
  bossSpawned = false;
  wonT = 0;
  hazardT: Record<string, number> = { rocks: 4, meteors: 6, bolts: 7 };
  score = 0;
  coins = 0;
  kills = 0;
  dmgTaken = 0;
  /** Damage taken by source, for tuning. */
  hurtBy: Record<string, number> = {};
  events: WEvent[] = [];
  private seen = new Set<string>();
  /** Current shooter kind while an enemy updates (for tuning stats). */
  private src = "";
  private coinChance = 0.3;
  private bossCoins = 6;
  private tutorialDrops = 0;

  constructor(spec: MapSpec, stats: ShipStats, w: number, h: number, seed = Date.now()) {
    this.spec = spec;
    this.stats = stats;
    this.w = w;
    this.h = h;
    this.rand = rng(seed % 2147483647);
    this.maxHp = stats.maxHp;
    this.hp = this.maxHp;
    this.px = w / 2;
    this.py = h - 110;
    let expected = 0;
    for (let i = 1; i <= spec.waves; i++) expected += waveCount(spec.m, i);
    const plan = coinPlan(spec.m);
    this.coinChance = clamp(plan.kills / expected, 0.08, 0.7);
    this.bossCoins = plan.boss;
    this.shieldT = 2;
    this.nextWave();
  }

  get diff() {
    return this.spec.diff;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = clamp(this.px, 18, w - 18);
    this.py = clamp(this.py, 70, h - 24);
  }

  movePlayer(x: number, y: number) {
    this.px = clamp(x, 18, this.w - 18);
    this.py = clamp(y, 70, this.h - 24);
  }

  hint(text: string, key = text) {
    if (this.seen.has("h:" + key)) return;
    this.seen.add("h:" + key);
    this.events.push({ t: "hint", text });
  }

  boss(): Enemy | undefined {
    return this.enemies.find((e) => e.kind === "boss");
  }

  // ── Waves ─────────────────────────────────────────────────────────────────

  private nextWave() {
    this.wave++;
    const m = this.spec.m;
    if (this.wave > this.spec.waves) {
      this.toSpawn = 0;
      this.bossT = 2.4;
      this.events.push({ t: "bosswarn" });
      if (m === 1) this.hint("ล้มบอสเพื่อปลดล็อกแมพถัดไป");
      return;
    }
    this.toSpawn = waveCount(m, this.wave);
    this.spawnT = 1.6;
    this.events.push({ t: "wave", n: this.wave });
    if (m === 1 && this.wave === 1) {
      this.hint("ลากนิ้วเพื่อบังคับยาน");
      this.hint("ยานยิงอัตโนมัติ แค่หลบให้ดี");
    }
    if (m === 1 && this.wave === 2) this.hint("เก็บเหรียญทองไว้อัปเกรดยาน");
  }

  private pickKind(): EnemyKind {
    const roster = this.spec.roster;
    const total = roster.reduce((s, r) => s + r.w, 0);
    for (let tries = 0; tries < 6; tries++) {
      let x = this.rand() * total;
      let kind: EnemyKind = roster[0].kind;
      for (const r of roster) {
        x -= r.w;
        if (x <= 0) {
          kind = r.kind;
          break;
        }
      }
      if (this.spec.m === 1 && kind === "gunner" && this.wave < 3) continue;
      // Wave 1 eases in with the basics; the map's new arrivals come from wave 2 on (but early).
      if (this.wave === 1 && this.spec.m > 1 && this.toSpawn > 3 && ENEMIES[kind].intro === this.spec.m) continue;
      const alive = this.enemies.filter((e) => e.kind === kind).length;
      const cap: Partial<Record<EnemyKind, number>> = { weaver: 1, lancer: 2, carrier: 1, tank: 2, gunner: 3, spinner: this.spec.m < 20 ? 1 : 2, cloaker: 2, layer: 2, caster: 2 };
      if (cap[kind] !== undefined && alive >= cap[kind]!) continue;
      return kind;
    }
    return "drone";
  }

  private make(kind: EnemyKind, x: number, y: number, hpMul = 1): Enemy {
    const meta = ENEMIES[kind];
    const hp = meta.hp * this.diff.hp * hpMul;
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      hp,
      max: hp,
      r: meta.r,
      t: this.rand() * 6,
      fire: 1 + this.rand() * 1.5,
      hit: 0,
      phase: 0,
      targetY: this.h * (0.1 + this.rand() * 0.22),
      a: 0,
      aux: 0,
      cycles: 0,
      cloak: 0,
      inv: 0,
      elite: false,
      life: 12,
      leaving: false,
      charge: 0,
    };
  }

  spawn(kind: EnemyKind, x?: number, y?: number): Enemy {
    const d = this.diff;
    const mv = d.move;
    const xx = x ?? 30 + this.rand() * (this.w - 60);
    const e = this.make(kind, xx, y ?? -30);
    e.t = 0;
    switch (kind) {
      case "drone":
        e.vy = (80 + this.rand() * 40) * mv;
        e.vx = (this.rand() - 0.5) * 30;
        break;
      case "zig":
        e.vy = 70 * mv;
        e.t = this.rand() * 6;
        break;
      case "gunner":
        e.vy = 95 * mv;
        e.fire = 1.2 + this.rand();
        e.life = 11;
        break;
      case "diver":
        e.vy = 75 * mv;
        e.targetY = this.h * (0.12 + this.rand() * 0.2);
        break;
      case "darter":
        e.vx = (this.rand() < 0.5 ? -1 : 1) * 170 * mv;
        e.vy = 75 * mv;
        break;
      case "tank":
        e.vy = 38 * mv;
        e.fire = 1.5 + this.rand();
        e.targetY = this.h * (0.12 + this.rand() * 0.2);
        e.life = 13;
        break;
      case "splitter":
        e.vy = 62 * mv;
        break;
      case "shield":
        e.vy = 80 * mv;
        e.fire = 2 + this.rand() * 1.5;
        e.life = 14;
        break;
      case "layer": {
        const left = this.rand() < 0.5;
        e.x = left ? -26 : this.w + 26;
        e.y = this.h * (0.1 + this.rand() * 0.2);
        e.vx = (left ? 1 : -1) * 72 * mv;
        e.fire = 0.8;
        break;
      }
      case "chaser":
        e.a = Math.PI / 2;
        e.vy = 120 * mv;
        e.life = 4.5;
        break;
      case "lancer":
        e.vy = 90 * mv;
        e.targetY = this.h * (0.08 + this.rand() * 0.14);
        break;
      case "carrier":
        e.vy = 40 * mv;
        e.targetY = this.h * (0.1 + this.rand() * 0.12);
        e.fire = 1.6;
        e.life = 16;
        break;
      case "caster":
        e.vy = 85 * mv;
        e.fire = 1.5;
        e.life = 14;
        break;
      case "spinner":
        e.vy = 80 * mv;
        e.targetY = this.h * (0.12 + this.rand() * 0.16);
        break;
      case "cloaker":
        e.targetY = this.h * (0.1 + this.rand() * 0.25);
        e.y = e.targetY;
        e.cloak = 1;
        e.phase = 0;
        e.aux = 0.7;
        break;
      case "weaver":
        e.vy = 80 * mv;
        e.targetY = this.h * (0.07 + this.rand() * 0.07);
        e.fire = 1.4;
        break;
      case "wisp":
        e.life = 5.5;
        break;
      case "mine":
        e.vy = 34;
        e.aux = 2.8;
        break;
      case "rock":
        e.r = 16 + this.rand() * 14;
        e.hp = e.max = 60 * d.hp * (e.r / 22);
        e.vy = (45 + this.rand() * 35) * mv;
        e.vx = (this.rand() - 0.5) * 40;
        e.a = this.rand() * TAU;
        e.aux = (this.rand() - 0.5) * 2;
        break;
      default:
        break;
    }
    if (ENEMIES[kind].counts && kind !== "boss" && this.rand() < d.elite) {
      e.elite = true;
      e.hp = e.max = e.max * 2.2;
      e.r *= 1.12;
    }
    this.enemies.push(e);
    const meta = ENEMIES[kind];
    if (meta.hint && (meta.intro === this.spec.m || (this.spec.m === 1 && kind === "gunner"))) this.hint(meta.hint, kind);
    return e;
  }

  private counted() {
    let n = 0;
    for (const e of this.enemies) if (ENEMIES[e.kind].counts) n++;
    return n;
  }

  // ── Shots ────────────────────────────────────────────────────────────────

  shot(x: number, y: number, angle: number, speed: number, o: { r?: number; dmg?: number; kind?: Bullet["kind"]; color?: string; src?: string } = {}) {
    if (this.bullets.length > MAX_BULLETS) return;
    this.bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      dmg: (o.dmg ?? 10) * this.diff.dmg,
      r: o.r ?? 5,
      enemy: true,
      color: o.color ?? "#ff5aa0",
      kind: o.kind ?? "dot",
      t: 0,
      src: o.src ?? this.src,
    });
  }

  private aim(x: number, y: number) {
    return Math.atan2(this.py - y, this.px - x);
  }

  private wallMark(owner: Enemy | null, y: number) {
    const gw = Math.max(88, 128 - 40 * this.diff.k);
    const gap = gw / 2 + 14 + this.rand() * (this.w - gw - 28);
    this.marks.push({ kind: "wall", x: 0, y, t: 0, dur: this.spec.m < 6 ? 1.1 : 0.9, gap, gw, owner });
  }

  private fireWall(m: Mark) {
    const y = m.owner ? m.owner.y + m.owner.r : m.y;
    const speed = Math.max(95, this.diff.bullet * 0.5);
    for (let x = 10; x <= this.w - 10; x += 24) {
      if (Math.abs(x - m.gap) < m.gw / 2) continue;
      this.shot(x, y, Math.PI / 2, speed, { r: 6, kind: "wall", color: "#ffb347" });
    }
  }

  private laser(x: number, y: number, owner: Enemy | null, o: { w?: number; warn?: number; dur?: number; dmg?: number; color?: string } = {}) {
    this.lasers.push({
      x: clamp(x, 12, this.w - 12),
      y,
      w: o.w ?? 18,
      warn: o.warn ?? 1.1,
      warnMax: o.warn ?? 1.1,
      dur: o.dur ?? 0.6,
      dmg: (o.dmg ?? 16) * this.diff.dmg,
      owner,
      done: false,
      color: o.color ?? "#ff4d8d",
    });
  }

  // ── Kill / hurt / drops ──────────────────────────────────────────────────

  private kill(e: Enemy) {
    if (e.hp < -1e8) return;
    e.hp = -1e9;
    const meta = ENEMIES[e.kind];
    this.kills++;
    this.score += Math.round(meta.score * (e.elite ? 2 : 1) * (1 + (this.spec.m - 1) * 0.15));
    this.events.push({ t: "kill", e });
    if (e.kind === "boss") {
      this.score += Math.round(500 * (1 + 0.2 * (this.spec.m - 1)));
      for (let i = 0; i < this.bossCoins; i++) this.dropAt(e.x + (this.rand() - 0.5) * 80, e.y + (this.rand() - 0.5) * 40, "coin");
      this.events.push({ t: "bossdown", e });
      this.state = "won";
      this.wonT = 0;
      for (const b of this.bullets) if (b.enemy) b.y = -9999;
      this.lasers = [];
      this.marks = [];
      for (const o of this.enemies) if (o !== e) o.hp = -1e9;
      return;
    }
    if (e.kind === "splitter") {
      const n = this.spec.m >= 10 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const c = this.make("mini", e.x, e.y);
        c.vx = (i - (n - 1) / 2) * 90;
        c.vy = 105 * this.diff.move;
        c.t = 0;
        this.enemies.push(c);
      }
    }
    if (meta.counts && (e.elite || this.rand() < this.coinChance)) this.dropAt(e.x, e.y, "coin");
    // Map 1 teaches pickups: the first kill of waves 2 and 3 always drops one.
    if (this.spec.m === 1 && meta.counts && this.wave >= 2 && this.tutorialDrops < this.wave - 1 && this.tutorialDrops < 2) {
      this.tutorialDrops++;
      this.dropAt(e.x, e.y, this.tutorialDrops === 1 ? "spread" : "shield");
    } else if (meta.counts && this.rand() < 0.035 * this.stats.luck * (e.elite ? 3 : 1)) {
      const low = this.hp < this.maxHp * 0.5;
      const pool: DropKind[] = ["spread", "spread", "shield", "heal", ...(low ? (["heal", "heal"] as DropKind[]) : []), ...(this.spec.m >= 3 ? (["nova"] as DropKind[]) : [])];
      this.dropAt(e.x, e.y, pool[Math.floor(this.rand() * pool.length)]);
    }
  }

  private dropAt(x: number, y: number, kind: DropKind) {
    this.drops.push({ x, y, vy: kind === "coin" ? 40 + this.rand() * 80 : 70, kind, value: 1, t: 0 });
    if (kind !== "coin") this.hint("เก็บลูกแก้วเรืองแสงเพื่อเสริมพลัง", "pickup");
  }

  private hurt(dmg: number, src: string) {
    if (this.shieldT > 0 || this.hurtT > 0 || this.state !== "play") return;
    this.hp -= dmg;
    this.dmgTaken += dmg;
    this.hurtBy[src] = (this.hurtBy[src] || 0) + dmg;
    this.hurtT = 0.7;
    this.events.push({ t: "hurt", dmg });
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "dead";
      this.events.push({ t: "dead" });
    }
  }

  private damage(e: Enemy, dmg: number) {
    e.hp -= dmg;
    e.hit = 1;
    if (e.hp <= 0) this.kill(e);
    else if (e.kind === "boss" && e.boss) this.checkPhase(e);
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt: number) {
    if (this.state === "dead" || this.state === "clear") return;
    this.time += dt;
    this.spreadT = Math.max(0, this.spreadT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.state === "won") {
      this.wonT += dt;
      this.stepPlayerFire(dt, false);
      this.stepBullets(dt);
      this.stepDrops(dt, true);
      this.enemies = this.enemies.filter((e) => e.hp > 0);
      if (this.wonT > 2.6) {
        this.state = "clear";
        this.events.push({ t: "clear" });
      }
      return;
    }
    this.stepPlayerFire(dt, true);
    this.stepSpawning(dt);
    this.stepHazards(dt);
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.t += dt;
      e.hit = Math.max(0, e.hit - dt * 6);
      e.inv = Math.max(0, e.inv - dt);
      this.src = e.kind === "boss" ? "boss:" + (e.boss!.pat || "") : e.kind;
      if (e.kind === "boss") this.stepBoss(e, dt);
      else this.stepEnemy(e, dt);
      if (e.hp <= 0) continue;
      this.contact(e);
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.y < this.h + 70 && e.x > -90 && e.x < this.w + 90 && !(e.leaving && e.y < -50));
    this.stepMarks(dt);
    this.stepLasers(dt);
    this.stepBullets(dt);
    this.stepDrops(dt, false);
  }

  private stepPlayerFire(dt: number, live: boolean) {
    const s = this.stats;
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = s.interval;
      const n = s.guns + (this.spreadT > 0 ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.12;
        this.bullets.push({ x: this.px + (i - (n - 1) / 2) * 6, y: this.py - 22, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, dmg: s.damage, r: 4, enemy: false, color: "", kind: "dot", t: 0, src: "" });
      }
    }
    if (s.drones > 0 && live) {
      this.droneT -= dt;
      if (this.droneT <= 0) {
        this.droneT = 0.4;
        for (let k = 0; k < s.drones; k++) {
          const dx = this.px + (k === 0 ? -34 : 34);
          const target = this.nearest(dx, this.py);
          const a = target ? Math.atan2(target.y - this.py, target.x - dx) : -Math.PI / 2;
          this.bullets.push({ x: dx, y: this.py - 4, vx: Math.cos(a) * 600, vy: Math.sin(a) * 600, dmg: s.droneDmg, r: 3, enemy: false, color: "drone", kind: "dot", t: 0, src: "" });
        }
      }
    }
  }

  nearest(x: number, y: number) {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.y < 0 || e.cloak > 0.5 || e.kind === "meteor") continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private stepSpawning(dt: number) {
    if (this.wave > this.spec.waves) {
      if (!this.bossSpawned) {
        this.bossT -= dt;
        if (this.bossT <= 0) this.spawnBoss();
      }
      return;
    }
    if (this.toSpawn > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.counted() < this.diff.maxAlive) {
        this.spawn(this.pickKind());
        this.toSpawn--;
        this.spawnT = this.diff.gap * (0.6 + this.rand() * 0.8);
      }
    } else if (this.counted() === 0) {
      this.waveGap += dt;
      if (this.waveGap > 1.6) {
        this.waveGap = 0;
        if (this.stats.repair > 0 && this.hp < this.maxHp) {
          const add = Math.min(this.maxHp - this.hp, this.maxHp * this.stats.repair);
          if (add > 0) {
            this.hp += add;
            this.events.push({ t: "pickup", kind: "heal", x: this.px, y: this.py });
          }
        }
        this.nextWave();
      }
    }
  }

  private stepHazards(dt: number) {
    if (this.wave > this.spec.waves || this.toSpawn <= 0) return;
    const m = this.spec.m;
    for (const hz of this.spec.hazards) {
      this.hazardT[hz] -= dt;
      if (this.hazardT[hz] > 0) continue;
      if (hz === "rocks") {
        this.hazardT[hz] = Math.max(1.6, 3.4 - m * 0.05) * (0.7 + this.rand() * 0.6);
        this.spawn("rock");
        this.hint("อุกกาบาตลอยมา หลบหรือยิงให้แตก", "rocks");
      } else if (hz === "meteors") {
        this.hazardT[hz] = Math.max(2.4, 5.5 - m * 0.08) * (0.7 + this.rand() * 0.6);
        const x = clamp(this.px + (this.rand() - 0.5) * 160, 20, this.w - 20);
        this.marks.push({ kind: "meteor", x, y: 0, t: 0, dur: 1.25, gap: 0, gw: 0, owner: null });
        this.hint("ป้ายเตือนด้านบน = ดาวตกกำลังมา", "meteors");
      } else {
        this.hazardT[hz] = Math.max(3, 6.5 - m * 0.08) * (0.7 + this.rand() * 0.6);
        const x = clamp(this.px + (this.rand() - 0.5) * 200, 24, this.w - 24);
        this.laser(x, 0, null, { w: 36, warn: 1.35, dur: 0.28, dmg: 18, color: "#7ce8ff" });
        this.hint("แถบฟ้ากะพริบ = ฟ้าผ่า หลบออกจากแถบ", "bolts");
      }
    }
  }

  // ── Enemies ──────────────────────────────────────────────────────────────

  /** Done attacking: retreat back up and off the screen (never through the player). */
  private leave(e: Enemy, dt: number) {
    e.leaving = true;
    e.charge = 0;
    e.y -= 120 * dt;
  }

  private stepEnemy(e: Enemy, dt: number) {
    const d = this.diff;
    const mv = d.move;
    const fm = d.fire * (e.elite ? 1.3 : 1);
    const bs = d.bullet;
    switch (e.kind) {
      case "drone":
      case "mini":
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.x < e.r || e.x > this.w - e.r) e.vx = -e.vx;
        break;
      case "zig":
        e.x += Math.sin(e.t * 2.6) * 150 * mv * dt;
        e.y += e.vy * dt;
        break;
      case "gunner":
        if (e.life <= 0) {
          this.leave(e, dt);
          break;
        }
        if (e.y < e.targetY) e.y += e.vy * dt;
        else {
          e.x += Math.sin(e.t) * 55 * dt;
          e.life -= dt;
        }
        e.fire -= dt;
        e.charge = e.fire < 0.45 ? 1 - e.fire / 0.45 : 0;
        if (e.fire <= 0 && e.y > 10) {
          e.fire = 2.6 / fm;
          this.shot(e.x, e.y + e.r, this.aim(e.x, e.y), bs);
          if (e.elite) {
            this.shot(e.x, e.y + e.r, this.aim(e.x, e.y) - 0.2, bs);
            this.shot(e.x, e.y + e.r, this.aim(e.x, e.y) + 0.2, bs);
          }
        }
        break;
      case "diver":
        if (e.phase === 0) {
          e.y += e.vy * dt;
          if (e.y > e.targetY) {
            e.phase = 1;
            e.aux = this.spec.m <= 3 ? 1.0 : 0.85;
            e.a = this.aim(e.x, e.y);
          }
        } else if (e.phase === 1) {
          e.aux -= dt;
          e.charge = 1 - e.aux;
          if (e.aux <= 0) {
            e.phase = 2;
            e.vx = Math.cos(e.a) * 380 * mv;
            e.vy = Math.sin(e.a) * 380 * mv;
          }
        } else {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.y < -40) e.hp = 0;
        }
        break;
      case "darter":
        e.aux += dt;
        if (e.aux > 0.65) {
          e.aux = 0;
          e.vx = -e.vx;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.x < e.r) e.vx = Math.abs(e.vx);
        if (e.x > this.w - e.r) e.vx = -Math.abs(e.vx);
        break;
      case "tank":
        if (e.life <= 0) {
          this.leave(e, dt);
          break;
        }
        if (e.y < e.targetY) e.y += e.vy * dt;
        else {
          e.x += Math.sin(e.t * 0.5) * 25 * dt;
          e.life -= dt;
        }
        e.fire -= dt;
        e.charge = e.fire < 0.5 ? 1 - e.fire / 0.5 : 0;
        if (e.fire <= 0 && e.y > 10) {
          e.fire = 3.4 / fm;
          for (let i = -1; i <= 1; i++) this.shot(e.x, e.y + e.r, Math.PI / 2 + i * 0.28, bs * 0.8, { r: 6 });
        }
        break;
      case "splitter":
        e.x += Math.sin(e.t * 1.5) * 40 * dt;
        e.y += e.vy * dt;
        break;
      case "shield": {
        if (e.life <= 0) {
          this.leave(e, dt);
          break;
        }
        if (e.y < e.targetY) e.y += e.vy * dt;
        else e.life -= dt;
        const dx = this.px - e.x;
        e.x += clamp(dx, -42 * mv * dt, 42 * mv * dt);
        e.fire -= dt;
        e.charge = e.fire < 0.45 ? 1 - e.fire / 0.45 : 0;
        if (e.fire <= 0 && e.y > 10) {
          e.fire = 3.4 / fm;
          this.shot(e.x, e.y + e.r, Math.PI / 2, bs * 0.8);
        }
        break;
      }
      case "layer":
        e.x += e.vx * dt;
        e.y += Math.sin(e.t * 2) * 12 * dt;
        e.fire -= dt;
        if (e.fire <= 0 && e.x > 20 && e.x < this.w - 20) {
          e.fire = 1.5 / fm;
          this.spawn("mine", e.x, e.y + e.r);
        }
        break;
      case "mine": {
        e.y += e.vy * dt;
        e.vy = Math.max(16, e.vy - 8 * dt);
        e.aux -= dt;
        if (e.aux <= 0) this.explodeMine(e);
        break;
      }
      case "chaser": {
        e.life -= dt;
        const sp = (110 + Math.min(1, e.t / 2) * 100) * mv;
        // Homes in, but commits to a straight line once close, so a late side-step dodges it.
        if (e.life > 0 && Math.hypot(this.px - e.x, this.py - e.y) < 150) e.life = 0;
        if (e.life > 0) {
          const want = this.aim(e.x, e.y);
          let da = want - e.a;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          e.a += clamp(da, -1.9 * dt, 1.9 * dt);
        }
        e.x += Math.cos(e.a) * sp * dt;
        e.y += Math.sin(e.a) * sp * dt;
        e.charge = 0.5 + 0.5 * Math.sin(e.t * 12);
        break;
      }
      case "lancer":
        this.stepLancer(e, dt);
        break;
      case "carrier": {
        if (e.life <= 0) {
          this.leave(e, dt);
          break;
        }
        if (e.y < e.targetY) e.y += e.vy * dt;
        else {
          e.x += Math.sin(e.t * 0.6) * 35 * dt;
          e.life -= dt;
        }
        if (e.aux > 0) {
          // Burst in progress
          e.a -= dt;
          if (e.a <= 0) {
            e.a = 0.13;
            e.aux--;
            const gx = e.x + e.cycles * e.r * 0.75;
            const gy = e.y + e.r * 0.3;
            this.shot(gx, gy, this.aim(gx, gy), bs * 0.8);
          }
          break;
        }
        e.fire -= dt;
        e.charge = e.fire < 0.6 ? 1 - e.fire / 0.6 : 0;
        if (e.fire <= 0 && e.y > 10) {
          e.fire = 3.2 / fm;
          e.cycles = e.cycles === 1 ? -1 : 1;
          e.aux = 3 + (e.elite ? 2 : 0);
          e.a = 0;
        }
        break;
      }
      case "caster":
        if (e.life <= 0) {
          this.leave(e, dt);
          break;
        }
        if (e.y < e.targetY) e.y += e.vy * dt;
        else {
          e.x += Math.sin(e.t * 0.8) * 50 * dt;
          e.life -= dt;
        }
        e.fire -= dt;
        e.charge = e.fire < 0.6 ? 1 - e.fire / 0.6 : 0;
        if (e.fire <= 0 && e.y > 10) {
          e.fire = 3.8 / fm;
          const n = this.spec.m >= 16 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const wv = this.spawn("wisp", e.x + (i - (n - 1) / 2) * 20, e.y + e.r);
            wv.a = Math.PI / 2 + (i - (n - 1) / 2) * 0.6;
          }
        }
        break;
      case "wisp": {
        e.life -= dt;
        if (e.life <= 0) {
          e.hp = 0;
          this.events.push({ t: "boom", x: e.x, y: e.y, r: 14, color: "#e9a8ff" });
          break;
        }
        const want = this.aim(e.x, e.y);
        let da = want - e.a;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        e.a += clamp(da, -1.5 * dt, 1.5 * dt);
        const sp = 85 * mv;
        e.x += Math.cos(e.a) * sp * dt;
        e.y += Math.sin(e.a) * sp * dt;
        break;
      }
      case "spinner": {
        if (e.cycles >= 2) {
          this.leave(e, dt);
          break;
        }
        if (e.phase === 0) {
          e.y += e.vy * dt;
          if (e.y >= e.targetY) {
            e.phase = 1;
            e.aux = 1.0;
          }
        } else if (e.phase === 1) {
          // Wind-up
          e.aux -= dt;
          e.charge = 1 - e.aux;
          if (e.aux <= 0) {
            e.phase = 2;
            e.aux = 2.2;
            e.fire = 0;
          }
        } else if (e.phase === 2) {
          e.charge = 0;
          e.aux -= dt;
          e.a += 2.1 * dt * (e.cycles % 2 ? -1 : 1);
          e.fire -= dt;
          if (e.fire <= 0) {
            e.fire = 0.17;
            const arms = d.k > 0.5 ? 3 : 2;
            for (let i = 0; i < arms; i++) this.shot(e.x, e.y, e.a + (i / arms) * TAU, bs * 0.6, { color: "#5ff5df" });
          }
          if (e.aux <= 0) {
            e.phase = 3;
            e.aux = 2.4 / fm;
          }
        } else {
          e.aux -= dt;
          if (e.aux <= 0) {
            e.cycles++;
            e.phase = 1;
            e.aux = 0.9;
          }
        }
        break;
      }
      case "cloaker":
        this.stepCloaker(e, dt);
        break;
      case "weaver":
        if (e.cycles >= 2) {
          this.leave(e, dt);
          break;
        }
        if (e.y < e.targetY) e.y += e.vy * dt;
        else {
          e.x += Math.sin(e.t * 0.7) * 30 * dt;
          e.fire -= dt;
          if (e.fire <= 0) {
            e.fire = 4.4 / fm;
            e.cycles++;
            this.wallMark(e, e.y + e.r);
          }
        }
        break;
      case "rock":
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.a += e.aux * dt;
        break;
      case "meteor":
        e.y += e.vy * dt;
        break;
      default:
        break;
    }
    if (e.kind !== "layer") e.x = clamp(e.x, -40, this.w + 40);
  }

  private explodeMine(e: Enemy) {
    e.hp = 0;
    const n = this.diff.k > 0.5 ? 12 : 8;
    const off = this.rand() * TAU;
    for (let i = 0; i < n; i++) this.shot(e.x, e.y, off + (i / n) * TAU, Math.max(90, this.diff.bullet * 0.55), { color: "#ff9a5a" });
    this.events.push({ t: "boom", x: e.x, y: e.y, r: 40, color: "#ff7043" });
  }

  private stepLancer(e: Enemy, dt: number) {
    if (e.cycles >= 3) {
      this.leave(e, dt);
      return;
    }
    if (e.phase === 0) {
      e.y += e.vy * dt;
      if (e.y >= e.targetY) {
        e.phase = 1;
        e.aux = 1.1;
      }
    } else if (e.phase === 1) {
      e.aux -= dt;
      e.x += clamp(this.px - e.x, -85 * this.diff.move * dt, 85 * this.diff.move * dt);
      if (e.aux <= 0) {
        e.phase = 2;
        this.laser(e.x, e.y + e.r, e, { warn: this.spec.m <= 9 ? 1.15 : 1.0, dur: 0.55, w: 16 });
      }
    } else if (e.phase === 2) {
      if (!this.lasers.some((l) => l.owner === e)) {
        e.phase = 3;
        e.aux = 1.3 / this.diff.fire;
      }
    } else {
      e.aux -= dt;
      if (e.aux <= 0) {
        e.cycles++;
        e.phase = 1;
        e.aux = 1.1;
      }
    }
  }

  private stepCloaker(e: Enemy, dt: number) {
    e.aux -= dt;
    switch (e.phase) {
      case 0: // appearing
        e.cloak = Math.max(0, e.aux / 0.7);
        if (e.aux <= 0) {
          e.phase = 1;
          e.aux = 0.5;
          e.fire = 0;
        }
        break;
      case 1: // charge, then a 3-shot burst
        e.charge = 1 - e.aux / 0.5;
        if (e.aux <= 0) {
          e.charge = 0;
          e.fire -= dt;
          if (e.fire <= 0) {
            e.fire = 0.15;
            this.shot(e.x, e.y + e.r, this.aim(e.x, e.y), this.diff.bullet, { color: "#cbd5e1" });
            e.a++;
            if (e.a >= 3) {
              e.a = 0;
              e.phase = 2;
              e.aux = 0.8;
            }
          }
        }
        break;
      case 2: // linger (hittable)
        if (e.aux <= 0) {
          e.cycles++;
          if (e.cycles >= 3) {
            e.phase = 5;
            break;
          }
          e.phase = 3;
          e.aux = 0.5;
        }
        break;
      case 3: // vanish
        e.cloak = 1 - Math.max(0, e.aux / 0.5);
        if (e.aux <= 0) {
          e.phase = 4;
          e.aux = 1.0;
          e.vx = 30 + this.rand() * (this.w - 60);
          e.vy = this.h * (0.08 + this.rand() * 0.3);
        }
        break;
      case 4: // move unseen (a faint shimmer is drawn)
        e.x += (e.vx - e.x) * Math.min(1, dt * 3);
        e.y += (e.vy - e.y) * Math.min(1, dt * 3);
        if (e.aux <= 0) {
          e.phase = 0;
          e.aux = 0.7;
        }
        break;
      default:
        e.cloak = 0;
        this.leave(e, dt);
    }
  }

  private contact(e: Enemy) {
    if (this.state !== "play") return;
    const d = this.diff;
    if (e.kind === "boss") {
      const b = e.boss!;
      if (b.entering || e.cloak > 0.5) return;
      if (b.spec.move === "serpent") {
        for (const s of [{ x: e.x, y: e.y }, ...b.segs]) if (Math.hypot(s.x - this.px, s.y - this.py) < 20 + PLAYER_R) this.hurt(25 * d.dmg, "boss-body");
      } else if (Math.abs(e.x - this.px) < b.spec.hw * 0.85 + PLAYER_R && Math.abs(e.y - this.py) < b.spec.hh * 0.85 + PLAYER_R) this.hurt(30 * d.dmg, "boss-body");
      return;
    }
    if (e.cloak > 0.5) return;
    const reach = e.kind === "rock" ? e.r * 0.85 : e.kind === "mine" ? e.r + 16 : e.r * 0.8;
    if (Math.hypot(e.x - this.px, e.y - this.py) > reach + PLAYER_R) return;
    if (e.kind === "mine") {
      this.explodeMine(e);
      this.hurt(14 * d.dmg, "mine");
      return;
    }
    const dmg = e.kind === "meteor" ? 24 : e.kind === "rock" ? 16 : e.kind === "wisp" ? 12 : e.kind === "chaser" ? 22 : 20;
    this.hurt(dmg * d.dmg, "ram:" + e.kind);
    // Ramming breaks the enemy (meteors keep falling).
    if (e.kind !== "meteor") this.kill(e);
  }

  // ── Boss ─────────────────────────────────────────────────────────────────

  private spawnBoss() {
    this.bossSpawned = true;
    const spec = this.spec.boss;
    const m = this.spec.m;
    const hp = spec.hp * this.diff.hp * (1 + 0.05 * (m - 1));
    const e = this.make("boss", this.w / 2, -110);
    e.hp = e.max = hp;
    e.r = Math.max(spec.hw, spec.hh);
    e.targetY = Math.max(130, spec.move === "fortress" ? this.h * 0.25 : this.h * 0.21);
    e.t = 0;
    const rot = spec.phases.map((p, i) => {
      const extra = this.spec.remix.slice(0, i === 0 ? 0 : i === 1 ? 1 : 3);
      return [...p, ...extra];
    });
    e.boss = {
      spec,
      name: bossName(this.spec),
      phase: 0,
      rot,
      idx: 0,
      pat: null,
      patT: 0,
      patDur: 0,
      emitT: 0,
      rest: 1.2,
      charge: 0,
      chargeMax: 1,
      next: null,
      spin: 0,
      dir: 1,
      entering: true,
      trail: [],
      segs: spec.move === "serpent" ? Array.from({ length: 9 }, () => ({ x: this.w / 2, y: -110 })) : [],
      tp: 0,
      tx: 0,
      ty: 0,
      shots: 0,
      side: 1,
      jt: false,
    };
    e.inv = 99;
    this.enemies.push(e);
  }

  private checkPhase(e: Enemy) {
    const b = e.boss!;
    const want = e.hp < e.max / 3 ? 2 : e.hp < (e.max * 2) / 3 ? 1 : 0;
    if (want <= b.phase) return;
    b.phase = want;
    b.idx = 0;
    b.pat = null;
    b.charge = 0;
    b.rest = 1.5;
    e.inv = 1.3;
    // A breather: clear enemy fire when the boss changes phase.
    for (const bl of this.bullets) if (bl.enemy) bl.y = -9999;
    this.lasers = this.lasers.filter((l) => l.owner !== e);
    this.marks = this.marks.filter((mk) => mk.kind !== "wall" || mk.owner !== e);
    this.events.push({ t: "phase", n: want + 1, x: e.x, y: e.y });
  }

  private stepBoss(e: Enemy, dt: number) {
    const b = e.boss!;
    const spec = b.spec;
    const mv = this.diff.move;
    if (b.entering) {
      if (spec.move === "serpent") {
        e.y += 90 * dt;
        this.serpentTrail(e);
      } else e.y += 80 * dt;
      if (e.y >= e.targetY) {
        b.entering = false;
        e.inv = 0;
        b.rest = 1.0;
      }
      return;
    }
    // Movement
    switch (spec.move) {
      case "sway": {
        const amp = Math.max(0, this.w / 2 - spec.hw - 16);
        const tx = this.w / 2 + Math.sin(e.t * 0.45 * mv) * amp;
        e.x += (tx - e.x) * Math.min(1, dt * 2.5);
        e.y = e.targetY + Math.sin(e.t * 1.1) * 8;
        break;
      }
      case "hover":
        e.x += clamp(this.px - e.x, -48 * mv * dt, 48 * mv * dt);
        e.x = clamp(e.x, spec.hw, this.w - spec.hw);
        e.y = e.targetY + Math.sin(e.t) * 10;
        break;
      case "fortress":
        e.x = this.w / 2 + Math.sin(e.t * 0.3) * Math.min(30, this.w * 0.08);
        e.y = e.targetY + Math.sin(e.t * 0.7) * 4;
        break;
      case "serpent":
        e.x = this.w / 2 + Math.sin(e.t * 0.7 * mv) * (this.w / 2 - 40);
        e.y = Math.max(130, this.h * 0.23) + Math.sin(e.t * 1.25 * mv) * this.h * 0.09;
        this.serpentTrail(e);
        break;
      case "teleport":
        if (b.tp > 0) {
          b.tp -= dt;
          e.cloak = Math.min(1, e.cloak + dt * 3);
          if (b.tp <= 0) {
            e.x = b.tx;
            e.y = b.ty;
            this.events.push({ t: "tele", x: e.x, y: e.y });
          }
          return;
        }
        e.cloak = Math.max(0, e.cloak - dt * 3);
        e.y += Math.sin(e.t * 1.4) * 6 * dt;
        break;
    }
    // Attack state machine: rest → charge (telegraph) → pattern → rest …
    if (b.pat) {
      this.runPattern(e, dt);
      b.patT += dt;
      if (b.patT >= b.patDur) {
        b.pat = null;
        b.rest = Math.max(0.4, (1.5 - 0.25 * b.phase) / this.diff.fire);
      }
      return;
    }
    if (b.charge > 0) {
      b.charge -= dt;
      e.charge = 1 - b.charge / b.chargeMax;
      if (b.charge <= 0) {
        e.charge = 0;
        b.pat = b.next;
        b.patT = 0;
        b.emitT = 0;
        b.shots = 0;
        b.patDur = this.startPattern(e, b.pat!);
      }
      return;
    }
    b.rest -= dt;
    if (b.rest > 0) return;
    if (spec.move === "teleport" && b.idx > 0 && b.idx % 2 === 0 && !b.jt) {
      // Jump somewhere else; the destination is marked for the whole jump.
      b.jt = true;
      b.tx = clamp(this.w * (0.2 + this.rand() * 0.6), spec.hw, this.w - spec.hw);
      b.ty = Math.max(130, this.h * (0.16 + this.rand() * 0.14));
      b.tp = 0.85;
      this.marks.push({ kind: "tele", x: b.tx, y: b.ty, t: 0, dur: 0.85, gap: 0, gw: 0, owner: e });
      return;
    }
    b.jt = false;
    const list = b.rot[b.phase];
    b.next = list[b.idx % list.length];
    b.idx++;
    b.chargeMax = b.charge = this.spec.m === 1 ? 0.9 : Math.max(0.45, 0.75 - 0.015 * (this.spec.m - 1));
  }

  private serpentTrail(e: Enemy) {
    const b = e.boss!;
    b.trail.unshift({ x: e.x, y: e.y });
    if (b.trail.length > 600) b.trail.length = 600;
    const gap = 30;
    let si = 0;
    let acc = 0;
    for (let i = 1; i < b.trail.length && si < b.segs.length; i++) {
      acc += Math.hypot(b.trail[i].x - b.trail[i - 1].x, b.trail[i].y - b.trail[i - 1].y);
      while (acc >= gap * (si + 1) && si < b.segs.length) {
        b.segs[si].x = b.trail[i].x;
        b.segs[si].y = b.trail[i].y;
        si++;
      }
    }
    for (; si < b.segs.length; si++) {
      const last = b.trail[b.trail.length - 1];
      b.segs[si].x = last.x;
      b.segs[si].y = last.y - gap * (si + 1);
    }
  }

  /** Muzzle points for the boss (two "guns"). */
  private guns(e: Enemy): [number, number][] {
    const s = e.boss!.spec;
    return [
      [e.x - s.hw * 0.62, e.y + s.hh * 0.6],
      [e.x + s.hw * 0.62, e.y + s.hh * 0.6],
    ];
  }

  private startPattern(e: Enemy, p: Pattern): number {
    const b = e.boss!;
    const ph = b.phase;
    const k = this.diff.k;
    switch (p) {
      case "fan": {
        this.fan(e);
        return ph >= 1 ? 0.9 : 0.6;
      }
      case "ring": {
        this.ring(e, 0);
        return ph >= 2 ? 0.9 : 0.6;
      }
      case "burst":
        return (4 + 2 * ph) * 0.15 + 0.2;
      case "spiral":
        b.dir = -b.dir;
        return 2.6;
      case "sweep":
        return ph >= 2 ? 3.0 : 1.7;
      case "laser": {
        const n = 1 + (ph >= 2 ? 1 : 0) + (k > 0.6 ? 1 : 0);
        const xs = [this.px];
        for (let i = 1; i < n; i++) {
          const side = this.rand() < 0.5 ? -1 : 1;
          let x = this.px + side * (95 + this.rand() * 60) * i;
          if (x < 20 || x > this.w - 20) x = this.px - side * (95 + this.rand() * 60) * i;
          xs.push(x);
        }
        const warn = this.spec.m <= 3 ? 1.25 : Math.max(0.85, 1.15 - 0.01 * this.spec.m);
        for (const x of xs) this.laser(x, e.y + b.spec.hh * 0.6, e, { warn, dur: 0.65, w: 20, color: b.spec.color });
        return warn + 0.8;
      }
      case "wall":
        this.wallMark(e, e.y + b.spec.hh);
        if (ph >= 2) b.shots = 1;
        return ph >= 2 ? 2.4 : 1.2;
      case "wisps": {
        const n = 2 + ph;
        for (let i = 0; i < n; i++) {
          const w = this.spawn("wisp", e.x + (i - (n - 1) / 2) * 26, e.y + b.spec.hh * 0.5);
          w.a = Math.PI / 2 + (i - (n - 1) / 2) * 0.7;
        }
        return 0.7;
      }
      case "summon": {
        const n = Math.max(0, Math.min(2 + ph, 7 - this.counted()));
        for (let i = 0; i < n; i++) {
          const kind = b.spec.summon === "wisp" ? "drone" : b.spec.summon;
          const x = kind === "diver" || kind === "splitter" ? e.x + (i - (n - 1) / 2) * 50 : undefined;
          const s = this.spawn(kind, x, kind === "diver" || kind === "splitter" ? e.y : undefined);
          if (kind === "diver") s.targetY = e.y + 60 + i * 20;
        }
        return 0.8;
      }
      case "mines": {
        const n = 2 + ph;
        for (let i = 0; i < n; i++) this.spawn("mine", clamp(e.x + (i - (n - 1) / 2) * 70, 20, this.w - 20), e.y + 10);
        return 0.7;
      }
      case "rain":
        return 2.0;
      case "cross":
        return 2.2;
    }
    return 1;
  }

  private fan(e: Enemy) {
    const b = e.boss!;
    const n = 5 + Math.round(4 * this.diff.k) + b.phase;
    const base = this.spec.m <= 2 ? Math.PI / 2 : this.aim(e.x, e.y);
    for (let i = 0; i < n; i++) this.shot(e.x, e.y + b.spec.hh * 0.6, base + (i - (n - 1) / 2) * 0.17, this.diff.bullet * 0.9);
  }

  private ring(e: Enemy, off: number) {
    const b = e.boss!;
    const n = 10 + Math.round(10 * this.diff.k) + 2 * b.phase;
    const o = off + this.rand() * TAU;
    for (let i = 0; i < n; i++) this.shot(e.x, e.y, o + (i / n) * TAU, this.diff.bullet * 0.7, { r: 6, kind: "big", color: b.spec.color });
  }

  private runPattern(e: Enemy, dt: number) {
    const b = e.boss!;
    const d = this.diff;
    const bs = d.bullet;
    const ph = b.phase;
    b.emitT -= dt;
    switch (b.pat) {
      case "fan":
        if (ph >= 1 && b.shots === 0 && b.patT > 0.4) {
          b.shots = 1;
          this.fan(e);
        }
        break;
      case "ring":
        if (ph >= 2 && b.shots === 0 && b.patT > 0.45) {
          b.shots = 1;
          this.ring(e, Math.PI / 12);
        }
        break;
      case "burst":
        if (b.emitT <= 0 && b.shots < 4 + 2 * ph) {
          b.emitT = 0.15;
          b.shots++;
          b.side = -b.side;
          const [gx, gy] = this.guns(e)[b.side > 0 ? 1 : 0];
          const a = this.aim(gx, gy);
          this.shot(gx, gy, a, bs);
          if (d.k > 0.3 || ph >= 2) {
            this.shot(gx, gy, a - 0.14, bs);
            this.shot(gx, gy, a + 0.14, bs);
          }
        }
        break;
      case "spiral": {
        b.spin += 2.0 * b.dir * dt;
        if (b.emitT <= 0) {
          b.emitT = 0.12 / (0.8 + 0.4 * d.k);
          const arms = 2 + (ph >= 1 ? 1 : 0) + (d.k > 0.5 ? 1 : 0);
          for (let i = 0; i < arms; i++) this.shot(e.x, e.y, b.spin + (i / arms) * TAU, bs * 0.62, { color: b.spec.accent === "#f0abfc" ? "#f472b6" : "#ff5aa0" });
        }
        break;
      }
      case "sweep": {
        if (b.emitT <= 0) {
          b.emitT = 0.075;
          const span = ph >= 2 ? 3.0 : 1.7;
          let u = b.patT / (span / (ph >= 2 ? 2 : 1));
          if (ph >= 2) u = u <= 1 ? u : 2 - u;
          const a = Math.PI * (0.18 + 0.64 * clamp(u, 0, 1));
          this.shot(e.x, e.y + b.spec.hh * 0.5, a, bs * 0.85);
          if (ph >= 2) this.shot(e.x, e.y + b.spec.hh * 0.5, Math.PI - a, bs * 0.85);
        }
        break;
      }
      case "wall":
        if (b.shots === 1 && b.patT > 1.2) {
          b.shots = 2;
          this.wallMark(e, e.y + b.spec.hh);
        }
        break;
      case "rain":
        if (b.emitT <= 0) {
          b.emitT = 0.16 / (0.8 + 0.5 * d.k);
          let x = 16 + this.rand() * (this.w - 32);
          let y = e.y + b.spec.hh * 0.5;
          if (b.segs.length) {
            const s = b.segs[Math.floor(this.rand() * b.segs.length)];
            x = s.x;
            y = s.y + 10;
          }
          this.shot(x, y, Math.PI / 2, Math.max(80, bs * 0.6), { r: 6, color: b.spec.color });
        }
        break;
      case "cross":
        if (b.emitT <= 0) {
          b.emitT = 0.2;
          b.spin += 0.17 * b.dir;
          const n = ph >= 2 ? 6 : 4;
          for (let i = 0; i < n; i++) this.shot(e.x, e.y, b.spin + (i / n) * TAU, bs * 0.75, { color: "#5ff5df" });
        }
        break;
      default:
        break;
    }
  }

  // ── Telegraph marks, lasers, bullets, drops ──────────────────────────────

  private stepMarks(dt: number) {
    this.src = "wall";
    for (const m of this.marks) {
      m.t += dt;
      if (m.owner && m.owner.hp <= 0) {
        m.t = 999;
        continue;
      }
      if (m.t < m.dur) continue;
      if (m.kind === "meteor") {
        const e = this.make("meteor", m.x, -30);
        e.vy = 470;
        e.hp = e.max = 1e9;
        this.enemies.push(e);
      } else if (m.kind === "wall") this.fireWall(m);
    }
    this.marks = this.marks.filter((m) => m.t < m.dur);
  }

  private stepLasers(dt: number) {
    for (const l of this.lasers) {
      if (l.owner && (l.owner.hp <= 0 || (l.owner.kind === "boss" && l.owner.inv > 0 && l.warn > 0))) {
        l.dur = 0;
        l.warn = 0;
        continue;
      }
      if (l.owner && l.owner.kind === "lancer") {
        l.x = l.owner.x;
        l.y = l.owner.y + l.owner.r;
      }
      if (l.warn > 0) {
        const before = l.warn;
        l.warn -= dt;
        if (before > 0 && l.warn <= 0) this.events.push({ t: "laser" });
        continue;
      }
      l.dur -= dt;
      if (!l.done && this.py > l.y && Math.abs(this.px - l.x) < l.w / 2 + PLAYER_R - 2) {
        l.done = true;
        this.hurt(l.dmg, l.owner ? "laser:" + l.owner.kind : "bolt");
      }
    }
    this.lasers = this.lasers.filter((l) => l.dur > 0);
  }

  private hitTest(e: Enemy, x: number, y: number, r: number): boolean {
    if (e.kind === "boss") {
      const b = e.boss!;
      if (b.spec.move === "serpent") {
        if (Math.hypot(x - e.x, y - e.y) < 26 + r) return true;
        for (const s of b.segs) if (Math.hypot(x - s.x, y - s.y) < 20 + r) return true;
        return false;
      }
      return Math.abs(x - e.x) < b.spec.hw + r && Math.abs(y - e.y) < b.spec.hh + r;
    }
    return Math.abs(x - e.x) < e.r + r && Math.abs(y - e.y) < e.r + r;
  }

  private stepBullets(dt: number) {
    for (const b of this.bullets) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.enemy) {
        if (this.state === "play" && Math.hypot(b.x - this.px, b.y - this.py) < b.r + PLAYER_R - 1) {
          b.y = -9999;
          this.hurt(b.dmg, "bullet:" + b.src);
        }
        continue;
      }
      for (const e of this.enemies) {
        if (e.hp <= 0 || e.kind === "meteor") continue;
        if (!this.hitTest(e, b.x, b.y, b.r)) continue;
        if (e.cloak > 0.5) continue;
        const bx = b.x;
        const by = b.y;
        b.y = -9999;
        if (e.inv > 0) {
          this.events.push({ t: "block", x: bx, y: by });
          break;
        }
        // Shield bearers block shots that hit the middle of their front plate.
        if (e.kind === "shield" && b.vy < 0 && Math.abs(bx - e.x) < e.r * 0.55 && by > e.y) {
          this.events.push({ t: "block", x: bx, y: e.y + e.r });
          break;
        }
        this.damage(e, b.dmg);
        break;
      }
    }
    this.bullets = this.bullets.filter((b) => b.y > -40 && b.y < this.h + 40 && b.x > -40 && b.x < this.w + 40);
  }

  private stepDrops(dt: number, vacuum: boolean) {
    const mag = vacuum ? 9999 : this.stats.magnet;
    for (const d of this.drops) {
      d.t += dt;
      const dx = this.px - d.x;
      const dy = this.py - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < mag) {
        const sp = vacuum ? 700 : 520;
        d.x += (dx / dist) * sp * dt;
        d.y += (dy / dist) * sp * dt;
      } else d.y += d.vy * dt;
      if (dist < 24) {
        d.y = this.h + 999;
        this.collect(d);
      }
    }
    this.drops = this.drops.filter((d) => d.y < this.h + 30);
  }

  private collect(d: Drop) {
    const luck = this.stats.luck;
    if (d.kind === "coin") {
      this.coins += d.value;
      this.events.push({ t: "coin" });
      return;
    }
    if (d.kind === "spread") this.spreadT = 8 * luck;
    else if (d.kind === "shield") this.shieldT = 5 * luck;
    else if (d.kind === "heal") this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.35);
    else {
      for (const b of this.bullets) if (b.enemy) b.y = -9999;
      for (const e of this.enemies) {
        if (e.hp <= 0 || e.y < 0 || e.kind === "meteor") continue;
        if (e.kind === "boss") {
          if (e.inv <= 0) this.damage(e, e.max * 0.04);
        } else this.damage(e, Math.max(40 * this.diff.hp, e.max * 0.4));
      }
      this.events.push({ t: "nova" });
    }
    this.events.push({ t: "pickup", kind: d.kind, x: this.px, y: this.py });
  }
}
