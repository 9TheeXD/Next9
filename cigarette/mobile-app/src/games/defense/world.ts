// Simulation for "ปกป้องต้นไม้": trail, towers, enemies, waves, gold and lives, all in grid units.
// No canvas here: the game draws it and turns the events into sound and particles, and the balance
// simulation drives it from node.

import {
  TOWERS, ENEMIES, MAX_LVL, GW, mapWave, endlessWave,
  type TowerKind, type EnemyKind, type Layout, type MapSpec, type Pt, type WavePlan,
} from "./data";

export interface Route {
  pts: Pt[];
  seg: number[];
  len: number;
}

export interface Tower {
  kind: TowerKind;
  pad: number;
  lvl: number;
  spent: number;
  cd: number;
  aim: number;
  target: Enemy | null;
  flash: number;
  buff: number;
  bankT: number;
}

export interface Barrier {
  x: number;
  y: number;
  angle: number;
  lvl: number;
  hp: number;
  maxHp: number;
  spent: number;
  /** Distance along each route where the fence stands (null when the route does not pass here). */
  ds: (number | null)[];
  flash: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  route: number;
  d: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  armor: number;
  fly: boolean;
  shield: number;
  shieldMax: number;
  slowT: number;
  frost: number;
  brittle: number;
  poisonDps: number;
  poisonT: number;
  jumpCd: number;
  jumpT: number;
  jumpDur: number;
  jumpV: number;
  abilityCd: number;
  summonCd: number;
  gold: number;
  harm: number;
  r: number;
  wob: number;
  hit: number;
  blocked: boolean;
  dead: boolean;
}

export interface Shot {
  kind: TowerKind;
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  target: Enemy | null;
  dmg: number;
  speed: number;
  splash: number;
  t: number;
  dur: number;
  done: boolean;
}

export type WorldEvent =
  | { type: "kill"; x: number; y: number; kind: EnemyKind; gold: number }
  | { type: "leak"; harm: number }
  | { type: "fire"; kind: TowerKind; x: number; y: number }
  | { type: "ring"; x: number; y: number; r: number; color: string }
  | { type: "splash"; kind: TowerKind; x: number; y: number; r: number }
  | { type: "beam"; x: number; y: number; tx: number; ty: number }
  | { type: "heal"; x: number; y: number }
  | { type: "shield"; x: number; y: number }
  | { type: "shieldBreak"; x: number; y: number }
  | { type: "jump"; x: number; y: number }
  | { type: "summon"; x: number; y: number }
  | { type: "bank"; x: number; y: number; gold: number }
  | { type: "barrierHit"; x: number; y: number }
  | { type: "barrierBreak"; x: number; y: number }
  | { type: "wave"; wave: number; boss: boolean; intro: EnemyKind | null }
  | { type: "clear"; wave: number; bonus: number }
  | { type: "win" }
  | { type: "lose" };

export interface WorldOptions {
  layout: Layout;
  /** null = endless mode. */
  map: MapSpec | null;
  /** Multiplier from the td_power upgrade. */
  power: number;
  /** Permanent level of each tower (0 = locked, 1 = unlocked, more = stronger). */
  perm: Partial<Record<TowerKind, number>>;
  goldBonus: number;
  livesBonus: number;
  seed: number;
}

export const BREAK = 15;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRoute(pts: Pt[]): Route {
  const seg: number[] = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(l);
    len += l;
  }
  return { pts, seg, len };
}

export function routeAt(r: Route, d: number): { x: number; y: number; a: number } {
  let rest = Math.max(0, d);
  for (let i = 0; i < r.seg.length; i++) {
    if (rest <= r.seg[i]) {
      const k = rest / r.seg[i];
      const a = r.pts[i];
      const b = r.pts[i + 1];
      return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    rest -= r.seg[i];
  }
  const n = r.pts.length;
  const a = r.pts[n - 2];
  const b = r.pts[n - 1];
  return { x: b[0], y: b[1], a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** Closest point of a route to (x, y): distance along the route and distance away from it. */
export function project(r: Route, x: number, y: number): { d: number; dist: number } {
  let best = { d: 0, dist: Infinity };
  let acc = 0;
  for (let i = 0; i < r.seg.length; i++) {
    const a = r.pts[i];
    const b = r.pts[i + 1];
    const L = r.seg[i];
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (L * L))) : 0;
    const px = a[0] + (b[0] - a[0]) * t;
    const py = a[1] + (b[1] - a[1]) * t;
    const dist = Math.hypot(px - x, py - y);
    if (dist < best.dist) best = { d: acc + t * L, dist };
    acc += L;
  }
  return best;
}

/** Stone pads beside the trail, chosen so they cover as much trail as possible and do not crowd. */
export function makePads(routes: Route[], tree: Pt): Pt[] {
  const samples: Pt[] = [];
  const seen = new Set<string>();
  for (const r of routes) {
    for (let d = 0; d <= r.len; d += 0.25) {
      const p = routeAt(r, d);
      if (p.x < -0.2 || p.x > GW + 0.2 || p.y < -0.2) continue;
      const key = `${Math.round(p.x * 8)},${Math.round(p.y * 8)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      samples.push([p.x, p.y]);
    }
  }
  const cands: { p: Pt; score: number }[] = [];
  for (let y = 0.6; y <= 14.5; y += 0.5) {
    for (let x = 0.6; x <= GW - 0.6 + 1e-6; x += 0.5) {
      let near = Infinity;
      for (const r of routes) near = Math.min(near, project(r, x, y).dist);
      if (near < 0.9 || near > 2.0) continue;
      if (Math.hypot(x - tree[0], y - (tree[1] - 0.9)) < 1.7) continue;
      let score = 0;
      for (const s of samples) if (Math.hypot(s[0] - x, s[1] - y) <= 2.4) score++;
      cands.push({ p: [x, y], score });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.p[1] - b.p[1] || a.p[0] - b.p[0]);
  const out: Pt[] = [];
  for (const c of cands) {
    if (out.length >= 16) break;
    if (out.some((o) => Math.hypot(o[0] - c.p[0], o[1] - c.p[1]) < 1.3)) continue;
    out.push(c.p);
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export class World {
  routes: Route[];
  pads: Pt[];
  tree: Pt;
  towers: (Tower | null)[];
  barriers: Barrier[] = [];
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  events: WorldEvent[] = [];
  gold: number;
  lives: number;
  maxLives: number;
  wave = 0;
  nWaves: number;
  waveActive = false;
  toSpawn: { kind: EnemyKind; route: number }[] = [];
  spawnT = 0;
  /** Seconds until the next wave starts by itself; -1 before the first wave (waits for a tap). */
  breakT = -1;
  kills = 0;
  result: "" | "win" | "lose" = "";
  time = 0;
  /** Level used for enemy abilities and barrier wear: the map number, or grows with endless waves. */
  level: number;
  private plan: WavePlan | null = null;
  private rand: () => number;
  private nextId = 1;

  constructor(public o: WorldOptions) {
    this.routes = o.layout.routes.map(makeRoute);
    this.tree = o.layout.tree;
    this.pads = makePads(this.routes, this.tree);
    this.towers = this.pads.map(() => null);
    this.rand = rng(o.seed);
    const n = o.map ? o.map.n : 1;
    this.level = n;
    this.nWaves = o.map ? o.map.waves : Infinity;
    this.gold = 150 + 20 * (n - 1) + o.goldBonus;
    this.maxLives = 20 + o.livesBonus;
    this.lives = this.maxLives;
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  permMul(kind: TowerKind) {
    return 1 + 0.08 * Math.max(0, (this.o.perm[kind] || 0) - 1);
  }

  stat(t: Tower) {
    const s = TOWERS[t.kind];
    const k = t.lvl - 1;
    const pm = this.permMul(t.kind);
    return {
      range: (s.range + k * 0.18) * (t.buff > 0 ? 1.1 : 1),
      rate: s.rate * Math.pow(0.9, k),
      dmg: s.dmg * Math.pow(1.5, k) * this.o.power * pm * (1 + t.buff),
      slow: t.kind === "fan" ? 1.2 + t.lvl * 0.1 : t.kind === "frost" ? Math.min(0.65, (0.36 + 0.06 * k) * pm) : 0,
      brittle: t.kind === "frost" ? (0.2 + 0.05 * k) * pm : 0,
      splash: t.kind === "cloud" ? 1.0 + k * 0.12 : t.kind === "mortar" ? 1.15 + k * 0.1 : 0,
      aura: t.kind === "buff" ? (0.3 + 0.08 * k) * pm : 0,
      bank: t.kind === "bank" ? Math.round((22 + 14 * k) * pm) : 0,
    };
  }

  upgradeCost(kind: TowerKind, lvl: number) {
    return Math.round(TOWERS[kind].cost * 0.75 * lvl);
  }

  barrierMax(lvl: number) {
    return 220 * Math.pow(1.6, lvl - 1) * this.permMul("barrier") * (1 + 0.1 * (this.level - 1));
  }

  /** Which routes the next wave will use (all of them unless the layout switches route per wave). */
  nextRoutes(): number[] {
    if (this.o.layout.mode === "switch" && this.routes.length > 1) return [this.wave % this.routes.length];
    return this.routes.map((_, i) => i);
  }

  // ── Building ────────────────────────────────────────────────────────────

  build(pad: number, kind: TowerKind): boolean {
    const spec = TOWERS[kind];
    if (this.towers[pad] || this.gold < spec.cost || kind === "barrier") return false;
    this.gold -= spec.cost;
    this.towers[pad] = { kind, pad, lvl: 1, spent: spec.cost, cd: 0, aim: -Math.PI / 2, target: null, flash: 1, buff: 0, bankT: 0 };
    this.refreshBuffs();
    return true;
  }

  upgrade(pad: number): boolean {
    const t = this.towers[pad];
    if (!t || t.lvl >= MAX_LVL) return false;
    const c = this.upgradeCost(t.kind, t.lvl);
    if (this.gold < c) return false;
    this.gold -= c;
    t.spent += c;
    t.lvl++;
    t.flash = 1;
    this.refreshBuffs();
    return true;
  }

  sell(pad: number): number {
    const t = this.towers[pad];
    if (!t) return 0;
    const v = Math.round(t.spent * 0.7);
    this.gold += v;
    this.towers[pad] = null;
    this.refreshBuffs();
    return v;
  }

  /** Where a fence would go for a tap at (x, y), or null if the spot is not usable. */
  barrierSpot(x: number, y: number): { x: number; y: number; angle: number; ds: (number | null)[] } | null {
    let best: { r: number; d: number; dist: number } | null = null;
    this.routes.forEach((r, i) => {
      const p = project(r, x, y);
      if (!best || p.dist < best.dist) best = { r: i, d: p.d, dist: p.dist };
    });
    const b = best as { r: number; d: number; dist: number } | null;
    if (!b || b.dist > 0.75) return null;
    const route = this.routes[b.r];
    if (b.d < 1.6 || b.d > route.len - 1.4) return null;
    const at = routeAt(route, b.d);
    if (at.x < 0.2 || at.x > GW - 0.2 || at.y < 0.3) return null;
    if (this.barriers.some((q) => Math.hypot(q.x - at.x, q.y - at.y) < 1)) return null;
    const ds = this.routes.map((r) => {
      const p = project(r, at.x, at.y);
      return p.dist < 0.12 ? p.d : null;
    });
    return { x: at.x, y: at.y, angle: at.a, ds };
  }

  placeBarrier(x: number, y: number): Barrier | null {
    const spec = TOWERS.barrier;
    if (this.gold < spec.cost) return null;
    const spot = this.barrierSpot(x, y);
    if (!spot) return null;
    this.gold -= spec.cost;
    const hp = this.barrierMax(1);
    const b: Barrier = { ...spot, lvl: 1, hp, maxHp: hp, spent: spec.cost, flash: 1 };
    this.barriers.push(b);
    return b;
  }

  upgradeBarrier(b: Barrier): boolean {
    if (b.lvl >= MAX_LVL) return false;
    const c = this.upgradeCost("barrier", b.lvl);
    if (this.gold < c) return false;
    this.gold -= c;
    b.spent += c;
    b.lvl++;
    b.maxHp = this.barrierMax(b.lvl);
    b.hp = b.maxHp;
    b.flash = 1;
    return true;
  }

  sellBarrier(b: Barrier): number {
    const v = Math.round(b.spent * 0.7 * (0.3 + 0.7 * b.hp / b.maxHp));
    this.gold += v;
    this.barriers = this.barriers.filter((q) => q !== b);
    return v;
  }

  private refreshBuffs() {
    for (const t of this.towers) if (t) t.buff = 0;
    this.towers.forEach((b, i) => {
      if (!b || b.kind !== "buff") return;
      const st = this.stat(b);
      const [bx, by] = this.pads[i];
      this.towers.forEach((t, j) => {
        if (!t || j === i || t.kind === "buff" || t.kind === "bank") return;
        if (Math.hypot(this.pads[j][0] - bx, this.pads[j][1] - by) <= st.range + 0.01) t.buff = Math.max(t.buff, st.aura);
      });
    });
  }

  // ── Waves ───────────────────────────────────────────────────────────────

  nextWave(): number {
    if (this.waveActive || this.result || this.wave >= this.nWaves) return 0;
    let bonus = 0;
    if (this.breakT > 0) {
      bonus = Math.round(this.breakT * 1.5);
      this.gold += bonus;
    }
    const routes = this.nextRoutes();
    this.wave++;
    this.waveActive = true;
    const w = this.wave;
    const plan = this.o.map ? mapWave(this.o.map, w) : endlessWave(w, this.rand);
    if (!this.o.map) this.level = Math.max(1, Math.floor(w / 2));
    this.plan = plan;
    this.toSpawn = plan.list.map((kind, i) => ({ kind, route: routes[i % routes.length] }));
    this.spawnT = 0;
    this.breakT = 0;
    const m = this.o.map;
    const intro = m && m.intro && m.n > 1 && w === 2 ? m.intro : null;
    this.events.push({ type: "wave", wave: w, boss: plan.boss, intro });
    return bonus;
  }

  private spawn(kind: EnemyKind, route: number, d = 0, hpMul = 1) {
    const b = ENEMIES[kind];
    const plan = this.plan;
    const hpScale = (plan ? plan.hp : 1) * hpMul;
    const m = this.o.map;
    const speedUp = m ? 1 + Math.min(0.3, m.n * 0.012) : 1 + Math.min(0.4, this.wave * 0.008);
    const hp = b.hp * hpScale;
    const L = this.level;
    const boss = kind === "boss";
    const e: Enemy = {
      id: this.nextId++,
      kind,
      route,
      d,
      x: 0,
      y: 0,
      hp,
      maxHp: hp,
      speed: b.speed * speedUp,
      armor: boss ? (L >= 11 ? 0.4 : 0) : b.armor || 0,
      fly: !!b.fly,
      shield: kind === "shield" ? hp * 0.6 : 0,
      shieldMax: kind === "shield" ? hp * 0.6 : 0,
      slowT: 0,
      frost: 0,
      brittle: 0,
      poisonDps: 0,
      poisonT: 0,
      jumpCd: 1.2 + this.rand() * 1.4,
      jumpT: 0,
      jumpDur: 0,
      jumpV: 0,
      abilityCd: 1 + this.rand() * 1.5,
      summonCd: 4,
      gold: m ? Math.round(b.gold * (1 + 0.07 * (m.n - 1))) : b.gold + Math.floor(this.wave / 4),
      harm: b.harm,
      r: b.r,
      wob: this.rand() * Math.PI * 2,
      hit: 0,
      blocked: false,
      dead: false,
    };
    const p = routeAt(this.routes[route], d);
    e.x = p.x;
    e.y = p.y;
    this.enemies.push(e);
    return e;
  }

  // ── Damage ──────────────────────────────────────────────────────────────

  damage(e: Enemy, amt: number, type: "phys" | "pierce" | "poison") {
    if (e.dead || amt <= 0) return;
    let d = amt * (1 + e.brittle);
    if (type === "phys" && e.armor) d *= 1 - e.armor;
    if (type !== "poison" && e.shield > 0) {
      const a = Math.min(e.shield, d);
      e.shield -= a;
      d -= a;
      if (e.shield <= 0.01) {
        e.shield = 0;
        this.events.push({ type: "shieldBreak", x: e.x, y: e.y });
      }
    }
    e.hp -= d;
    if (type !== "poison") e.hit = 0.08;
    if (e.hp <= 0) this.kill(e);
  }

  private kill(e: Enemy) {
    e.dead = true;
    this.kills++;
    this.gold += e.gold;
    this.events.push({ type: "kill", x: e.x, y: e.y, kind: e.kind, gold: e.gold });
    if (e.kind === "splitter") {
      this.spawn("mini", e.route, e.d + 0.15, 1);
      this.spawn("mini", e.route, Math.max(0, e.d - 0.15), 1);
    }
  }

  // ── Step ────────────────────────────────────────────────────────────────

  step(dt: number) {
    if (this.result) return;
    this.time += dt;
    this.stepWaves(dt);
    this.stepAuras();
    this.stepEnemies(dt);
    this.stepTowers(dt);
    this.stepShots(dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.shots = this.shots.filter((s) => !s.done);
    for (const b of this.barriers) b.flash = Math.max(0, b.flash - dt * 3);
    if (this.lives <= 0 && !this.result) {
      this.lives = 0;
      this.result = "lose";
      this.events.push({ type: "lose" });
    }
  }

  private stepWaves(dt: number) {
    if (this.waveActive) {
      this.spawnT -= dt;
      if (this.toSpawn.length && this.spawnT <= 0) {
        const s = this.toSpawn.shift()!;
        this.spawn(s.kind, s.route);
        const lvl = this.o.map ? this.o.map.n : this.wave;
        this.spawnT = s.kind === "boss" ? 2 : Math.max(0.32, 0.95 - 0.02 * (lvl + this.wave));
      }
      if (!this.toSpawn.length && !this.enemies.length) {
        this.waveActive = false;
        let bonus = 20 + this.wave * 3 + (this.o.map ? this.o.map.n * 2 : 0);
        this.towers.forEach((t) => {
          if (t && t.kind === "bank") {
            const g = this.stat(t).bank;
            bonus += g;
            const p = this.pads[t.pad];
            this.events.push({ type: "bank", x: p[0], y: p[1], gold: g });
          }
        });
        this.gold += bonus;
        this.events.push({ type: "clear", wave: this.wave, bonus });
        if (this.wave >= this.nWaves) {
          this.result = "win";
          this.events.push({ type: "win" });
        } else this.breakT = BREAK;
      }
    } else if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) {
        this.breakT = 0;
        this.nextWave();
      }
    }
  }

  private stepAuras() {
    for (const e of this.enemies) {
      e.frost = 0;
      e.brittle = 0;
    }
    this.towers.forEach((t, i) => {
      if (!t || t.kind !== "frost") return;
      const st = this.stat(t);
      const [px, py] = this.pads[i];
      for (const e of this.enemies) {
        if (Math.hypot(e.x - px, e.y - py) > st.range) continue;
        e.frost = Math.max(e.frost, st.slow);
        e.brittle = Math.max(e.brittle, st.brittle);
      }
    });
  }

  private nextBarrier(e: Enemy): { b: Barrier; d: number } | null {
    let best: { b: Barrier; d: number } | null = null;
    for (const b of this.barriers) {
      const d = b.ds[e.route];
      if (d == null || d < e.d - 0.05) continue;
      if (!best || d < best.d) best = { b, d };
    }
    return best;
  }

  private startJump(e: Enemy, dist: number, dur: number) {
    e.jumpT = dur;
    e.jumpDur = dur;
    e.jumpV = dist / dur;
    e.jumpCd = 2.8;
    this.events.push({ type: "jump", x: e.x, y: e.y });
  }

  private stepEnemies(dt: number) {
    const wear = 9;
    const spawnQueue: [EnemyKind, number, number][] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.hit = Math.max(0, e.hit - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      e.blocked = false;
      const slow = Math.max(0.25, (e.slowT > 0 ? 0.5 : 1) * (1 - e.frost));
      const route = this.routes[e.route];
      if (e.jumpT > 0) {
        e.jumpT -= dt;
        e.d += e.jumpV * dt;
      } else {
        const move = e.speed * slow * dt;
        const nb = e.fly ? null : this.nextBarrier(e);
        if (e.kind === "jumper") e.jumpCd -= dt * slow;
        if (nb && e.d + move >= nb.d - 0.32) {
          if (e.kind === "jumper") this.startJump(e, nb.d + 0.7 - e.d, 0.5);
          else {
            e.d = Math.max(e.d, nb.d - 0.32);
            e.blocked = true;
            nb.b.hp -= e.harm * wear * dt;
            nb.b.flash = Math.max(nb.b.flash, 0.4);
            const thorns = TOWERS.barrier.dmg * Math.pow(1.5, nb.b.lvl - 1) * this.o.power * this.permMul("barrier");
            this.damage(e, thorns * dt, "phys");
            if (nb.b.hp <= 0) {
              this.barriers = this.barriers.filter((q) => q !== nb.b);
              this.events.push({ type: "barrierBreak", x: nb.b.x, y: nb.b.y });
            }
          }
        } else if (e.kind === "jumper" && e.jumpCd <= 0 && e.d < route.len - 2.4) this.startJump(e, 1.8, 0.55);
        else e.d += move;
      }
      if (e.dead) continue;
      if (e.d >= route.len) {
        e.dead = true;
        this.lives -= e.harm;
        this.events.push({ type: "leak", harm: e.harm });
        continue;
      }
      const p = routeAt(route, e.d);
      e.x = p.x;
      e.y = p.y;

      // Abilities
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        this.damage(e, e.poisonDps * dt, "poison");
        if (e.poisonT <= 0) e.poisonDps = 0;
        if (e.dead) continue;
      }
      const L = this.level;
      if (e.kind === "healer") {
        e.abilityCd -= dt;
        if (e.abilityCd <= 0) {
          e.abilityCd = 2.2;
          let any = false;
          for (const o of this.enemies) {
            if (o === e || o.dead || o.poisonT > 0 || o.hp >= o.maxHp) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) > 1.5) continue;
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.12);
            this.events.push({ type: "heal", x: o.x, y: o.y });
            any = true;
          }
          if (any) this.events.push({ type: "ring", x: e.x, y: e.y, r: 1.5, color: "#5eead4" });
        }
      }
      if (e.kind === "shield" || (e.kind === "boss" && L >= 16)) {
        e.abilityCd -= dt;
        if (e.abilityCd <= 0) {
          e.abilityCd = 4;
          for (const o of this.enemies) {
            if (o === e || o.dead || o.shield > 0) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) > 1.6) continue;
            o.shieldMax = o.maxHp * 0.35;
            o.shield = o.shieldMax;
            this.events.push({ type: "shield", x: o.x, y: o.y });
          }
          this.events.push({ type: "ring", x: e.x, y: e.y, r: 1.6, color: "#67e8f9" });
        }
      }
      if (e.kind === "boss" && L >= 6) {
        e.summonCd -= dt;
        if (e.summonCd <= 0) {
          e.summonCd = 6;
          spawnQueue.push(["mini", e.route, Math.max(0, e.d - 0.4)], ["mini", e.route, e.d + 0.3]);
          this.events.push({ type: "summon", x: e.x, y: e.y });
        }
      }
    }
    for (const [k, r, d] of spawnQueue) this.spawn(k, r, d, 1.5);
  }

  private progress(e: Enemy) {
    return this.routes[e.route].len - e.d;
  }

  private stepTowers(dt: number) {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      if (!t) continue;
      t.flash = Math.max(0, t.flash - dt * 4);
      const spec = TOWERS[t.kind];
      const [px, py] = this.pads[i];
      if (t.kind === "bank") {
        if (this.waveActive) {
          t.bankT += dt;
          if (t.bankT >= 5) {
            t.bankT = 0;
            const g = Math.round((2 + t.lvl) * this.permMul("bank"));
            this.gold += g;
            t.flash = 1;
            this.events.push({ type: "bank", x: px, y: py, gold: g });
          }
        }
        continue;
      }
      if (t.kind === "buff" || t.kind === "frost") continue;
      const st = this.stat(t);
      const inRange: Enemy[] = [];
      for (const e of this.enemies) {
        if (e.dead || (e.fly && !spec.air)) continue;
        if (Math.hypot(e.x - px, e.y - py) <= st.range) inRange.push(e);
      }
      if (t.kind === "lens") {
        let target: Enemy | null = null;
        for (const e of inRange) if (!target || e.hp + e.shield > target.hp + target.shield) target = e;
        t.target = target;
        if (target) {
          t.aim = Math.atan2(target.y - py, target.x - px) + Math.PI / 2;
          this.damage(target, st.dmg * dt, "pierce");
        }
        continue;
      }
      t.cd -= dt;
      let lead: Enemy | null = null;
      if (t.kind === "sniper") {
        for (const e of inRange) if (!lead || e.hp + e.shield > lead.hp + lead.shield) lead = e;
      } else {
        for (const e of inRange) if (!lead || this.progress(e) < this.progress(lead)) lead = e;
      }
      if (lead && t.kind !== "fan") t.aim = Math.atan2(lead.y - py, lead.x - px);
      if (t.cd > 0 || !lead) continue;
      t.cd = st.rate;
      t.flash = 1;
      if (t.kind === "fan") {
        for (const e of inRange) {
          e.slowT = st.slow;
          this.damage(e, st.dmg, "phys");
        }
        this.events.push({ type: "ring", x: px, y: py, r: st.range, color: spec.color });
        this.events.push({ type: "fire", kind: t.kind, x: px, y: py });
      } else if (t.kind === "sniper") {
        this.events.push({ type: "beam", x: px, y: py - 0.35, tx: lead.x, ty: lead.y });
        this.damage(lead, st.dmg * (lead.fly ? 1.5 : 1), "pierce");
        this.events.push({ type: "fire", kind: t.kind, x: px, y: py });
      } else if (t.kind === "mortar") {
        const dur = 0.9;
        const slow = Math.max(0.25, (lead.slowT > 0 ? 0.5 : 1) * (1 - lead.frost));
        const ahead = lead.blocked ? 0 : lead.speed * slow * dur;
        const aim = routeAt(this.routes[lead.route], lead.d + ahead);
        this.shots.push({ kind: "mortar", x: px, y: py, sx: px, sy: py - 0.2, tx: aim.x, ty: aim.y, target: null, dmg: st.dmg, speed: 0, splash: st.splash, t: 0, dur, done: false });
        this.events.push({ type: "fire", kind: t.kind, x: px, y: py });
      } else {
        const speed = t.kind === "leaf" ? 9 : t.kind === "poison" ? 6.5 : 5;
        this.shots.push({ kind: t.kind, x: px, y: py - 0.15, sx: px, sy: py, tx: lead.x, ty: lead.y, target: lead, dmg: st.dmg, speed, splash: st.splash, t: 0, dur: 0, done: false });
        this.events.push({ type: "fire", kind: t.kind, x: px, y: py });
      }
    }
  }

  private stepShots(dt: number) {
    for (const s of this.shots) {
      if (s.kind === "mortar") {
        s.t += dt;
        const k = Math.min(1, s.t / s.dur);
        s.x = s.sx + (s.tx - s.sx) * k;
        s.y = s.sy + (s.ty - s.sy) * k;
        if (k >= 1) {
          s.done = true;
          for (const e of this.enemies) {
            if (e.dead || e.fly || e.jumpT > 0) continue;
            if (Math.hypot(e.x - s.tx, e.y - s.ty) <= s.splash) this.damage(e, s.dmg, "phys");
          }
          this.events.push({ type: "splash", kind: "mortar", x: s.tx, y: s.ty, r: s.splash });
        }
        continue;
      }
      if (s.target && !s.target.dead) {
        s.tx = s.target.x;
        s.ty = s.target.y;
      } else s.target = null;
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      const step = s.speed * dt;
      if (d > step + 0.08) {
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
        continue;
      }
      s.done = true;
      if (s.kind === "cloud") {
        for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - s.tx, e.y - s.ty) <= s.splash) this.damage(e, s.dmg, "phys");
        this.events.push({ type: "splash", kind: "cloud", x: s.tx, y: s.ty, r: s.splash });
      } else if (s.target) {
        if (s.kind === "poison") {
          const e = s.target;
          this.damage(e, s.dmg * 0.4, "pierce");
          e.poisonDps = Math.min(s.dmg * 3, e.poisonDps + s.dmg);
          e.poisonT = 4;
          this.events.push({ type: "splash", kind: "poison", x: s.tx, y: s.ty, r: 0.3 });
        } else {
          this.damage(s.target, s.dmg, "phys");
          this.events.push({ type: "splash", kind: "leaf", x: s.tx, y: s.ty, r: 0.2 });
        }
      }
    }
  }
}
