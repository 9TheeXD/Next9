// Static data for "ปกป้องต้นไม้": towers, enemies, trail layouts, seasons and the map list.
// No canvas or DOM here so the balance simulation can import it from node.

export const GW = 9;
export const GH = 15;

// ── Towers ────────────────────────────────────────────────────────────────

export type TowerKind = "leaf" | "fan" | "lens" | "cloud" | "frost" | "poison" | "mortar" | "sniper" | "buff" | "bank" | "barrier";

export interface TowerSpec {
  name: string;
  desc: string;
  /** In-run gold to build. */
  cost: number;
  color: string;
  range: number;
  /** Seconds between shots (0 = continuous beam or aura). */
  rate: number;
  dmg: number;
  /** Ignores armour (light, poison, hawk). */
  pierce: boolean;
  /** Can hit flying enemies. */
  air: boolean;
  /** Permanent unlock (coins) via UPGRADES id; empty for the free starters. */
  up: string;
}

export const TOWERS: Record<TowerKind, TowerSpec> = {
  leaf: { name: "ใบไม้พิทักษ์", desc: "ยิงเร็ว เป้าเดียว", cost: 50, color: "#4ade80", range: 2.4, rate: 0.45, dmg: 14, pierce: false, air: true, up: "" },
  fan: { name: "สายลม", desc: "พัดรอบตัว ทำให้ช้าลง", cost: 70, color: "#7dd3fc", range: 1.9, rate: 1.0, dmg: 6, pierce: false, air: true, up: "" },
  lens: { name: "แว่นแสงอาทิตย์", desc: "ลำแสงไกล ทะลุเกราะ", cost: 110, color: "#fbbf24", range: 3.3, rate: 0, dmg: 34, pierce: true, air: true, up: "" },
  cloud: { name: "เมฆฝน", desc: "ฝนตกเป็นวง โดนหลายตัว", cost: 120, color: "#a78bfa", range: 2.6, rate: 1.4, dmg: 26, pierce: false, air: true, up: "" },
  frost: { name: "ผลึกน้ำแข็ง", desc: "รอบตัวช้าลงและเปราะ โดนแรงขึ้น", cost: 80, color: "#93c5fd", range: 2.1, rate: 0, dmg: 0, pierce: true, air: true, up: "td_t_frost" },
  poison: { name: "เห็ดพิษ", desc: "พิษกัดต่อเนื่อง ทะลุเกราะและโล่ หยุดการรักษา", cost: 90, color: "#a3e635", range: 2.3, rate: 1.1, dmg: 12, pierce: true, air: true, up: "td_t_poison" },
  mortar: { name: "ปืนลูกสน", desc: "ยิงไกล ระเบิดวงกว้าง ยิงตัวบินไม่ได้", cost: 130, color: "#f97316", range: 3.7, rate: 2.4, dmg: 55, pierce: false, air: false, up: "td_t_mortar" },
  sniper: { name: "เหยี่ยวหนาม", desc: "ไกลมาก แรงมาก ทะลุเกราะ ตัวบินโดนหนัก", cost: 150, color: "#f43f5e", range: 4.8, rate: 2.0, dmg: 120, pierce: true, air: true, up: "td_t_sniper" },
  buff: { name: "ดอกไม้ปลุกพลัง", desc: "ป้อมรอบๆ แรงขึ้นและยิงไกลขึ้น", cost: 120, color: "#f472b6", range: 2.2, rate: 0, dmg: 0, pierce: false, air: false, up: "td_t_buff" },
  bank: { name: "รังผึ้งทองคำ", desc: "ได้ทองระหว่างคลื่นและเมื่อผ่านคลื่น", cost: 100, color: "#facc15", range: 0, rate: 0, dmg: 0, pierce: false, air: false, up: "td_t_bank" },
  barrier: { name: "รั้วหนาม", desc: "วางบนทาง ขวางศัตรูจนกว่าจะพัง", cost: 60, color: "#d6a35c", range: 0, rate: 0, dmg: 8, pierce: false, air: false, up: "td_t_barrier" },
};

export const ALL_TOWERS: TowerKind[] = ["leaf", "fan", "lens", "cloud", "frost", "poison", "barrier", "mortar", "sniper", "buff", "bank"];
export const STARTER_TOWERS: TowerKind[] = ["leaf", "fan", "lens", "cloud"];
export const LOADOUT_SLOTS = 5;
export const MAX_LVL = 5;

// ── Enemies ───────────────────────────────────────────────────────────────

export type EnemyKind = "puff" | "mini" | "runner" | "brute" | "splitter" | "jumper" | "healer" | "shell" | "flyer" | "shield" | "boss";

export interface EnemySpec {
  name: string;
  desc: string;
  hp: number;
  speed: number;
  gold: number;
  harm: number;
  r: number;
  /** Share of normal (non-piercing) damage blocked. */
  armor?: number;
  fly?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  puff: { name: "ควันฟุ้ง", desc: "ควันธรรมดา เดินตามทาง", hp: 40, speed: 1.0, gold: 6, harm: 1, r: 0.3 },
  mini: { name: "ควันจิ๋ว", desc: "ก้อนเล็ก วิ่งไว", hp: 22, speed: 1.3, gold: 3, harm: 1, r: 0.2 },
  runner: { name: "ควันวิ่ง", desc: "วิ่งเร็วมากแต่เปราะ", hp: 26, speed: 1.85, gold: 6, harm: 1, r: 0.25 },
  brute: { name: "ควันยักษ์", desc: "ช้าแต่อึดมาก ทำต้นไม้เจ็บ 3", hp: 170, speed: 0.6, gold: 14, harm: 3, r: 0.4 },
  splitter: { name: "ควันแตกตัว", desc: "ถูกปัดเป่าแล้วแตกเป็นควันจิ๋วสองก้อน", hp: 75, speed: 0.9, gold: 8, harm: 2, r: 0.34 },
  jumper: { name: "กบควัน", desc: "กระโดดข้ามทางเป็นช่วงๆ และกระโดดข้ามรั้ว", hp: 60, speed: 0.85, gold: 8, harm: 1, r: 0.3 },
  healer: { name: "หมอกพยาบาล", desc: "รักษาพวกรอบตัว ใช้เห็ดพิษหยุดการรักษาได้", hp: 90, speed: 0.75, gold: 12, harm: 2, r: 0.33 },
  shell: { name: "ควันเกราะ", desc: "เกราะกันใบไม้ ลม เมฆ ลูกสน ใช้แสง พิษ หรือเหยี่ยว", hp: 130, speed: 0.7, gold: 12, harm: 2, r: 0.36, armor: 0.65 },
  flyer: { name: "ค้างคาวเขม่า", desc: "บินข้ามรั้ว ปืนลูกสนยิงไม่โดน", hp: 48, speed: 1.25, gold: 8, harm: 1, r: 0.28, fly: true },
  shield: { name: "ควันโล่", desc: "แจกโล่ให้พวกรอบตัว พิษทะลุโล่ได้", hp: 110, speed: 0.7, gold: 14, harm: 2, r: 0.36 },
  boss: { name: "ราชาควัน", desc: "บอสท้ายด่าน อึดมาก", hp: 1400, speed: 0.42, gold: 120, harm: 10, r: 0.62 },
};

// ── Trails ────────────────────────────────────────────────────────────────

export type Pt = [number, number];
export interface Layout {
  name: string;
  routes: Pt[][];
  tree: Pt;
  /** split: spawns rotate between routes; switch: each wave uses one route, in turn. */
  mode: "split" | "switch";
  /** Enemy HP factor: layouts that split the enemies or give few good pads are made a little softer. */
  hp: number;
}

const shared = (head: Pt[], tail: Pt[]): Pt[] => [...head, ...tail];

const twinTail: Pt[] = [[4.5, 4.5], [4.5, 7.5], [7.5, 7.5], [7.5, 11], [4.5, 11], [4.5, 13.4]];
const tripleTail: Pt[] = [[4.5, 4], [4.5, 6.8], [1.6, 6.8], [1.6, 10.4], [7.4, 10.4], [7.4, 12.6], [4.5, 12.6], [4.5, 13.4]];

export const LAYOUTS: Record<string, Layout> = {
  meadow: {
    name: "ทางคดเคี้ยว",
    routes: [[[1, -1], [1, 3], [7, 3], [7, 6], [2, 6], [2, 9], [7, 9], [7, 12], [4.5, 12], [4.5, 13.4]]],
    tree: [4.5, 14],
    mode: "split",
    hp: 1,
  },
  snake: {
    name: "งูเลื้อย",
    routes: [[[7.5, -1], [7.5, 2], [1.5, 2], [1.5, 5], [7.5, 5], [7.5, 8], [1.5, 8], [1.5, 11], [4.5, 11], [4.5, 13.4]]],
    tree: [4.5, 14],
    mode: "split",
    hp: 1,
  },
  fork: {
    name: "ทางแยกสลับ",
    routes: [
      [[4.5, -1], [4.5, 1.5], [1.4, 1.5], [1.4, 5], [3.2, 5], [3.2, 8], [1.4, 8], [1.4, 11], [4.5, 11], [4.5, 13.4]],
      [[4.5, -1], [4.5, 1.5], [7.6, 1.5], [7.6, 5], [5.8, 5], [5.8, 8], [7.6, 8], [7.6, 11], [4.5, 11], [4.5, 13.4]],
    ],
    tree: [4.5, 14],
    mode: "switch",
    hp: 0.85,
  },
  twin: {
    name: "สองประตู",
    routes: [shared([[1.2, -1], [1.2, 4.5]], twinTail), shared([[7.8, -1], [7.8, 4.5]], twinTail)],
    tree: [4.5, 14],
    mode: "split",
    hp: 0.88,
  },
  spiral: {
    name: "ก้นหอย",
    routes: [[[-1, 1.3], [7.7, 1.3], [7.7, 12.7], [1.3, 12.7], [1.3, 4.3], [4.8, 4.3], [4.8, 8.6]]],
    tree: [4.8, 9.3],
    mode: "split",
    hp: 1,
  },
  river: {
    name: "สองฝั่งน้ำ",
    routes: [
      [[-1, 2], [3, 2], [3, 6], [1.2, 6], [1.2, 10.5], [4.5, 10.5], [4.5, 13.4]],
      [[10, 4], [6.2, 4], [6.2, 8], [7.8, 8], [7.8, 10.5], [4.5, 10.5], [4.5, 13.4]],
    ],
    tree: [4.5, 14],
    mode: "split",
    hp: 0.75,
  },
  zig: {
    name: "ซิกแซก",
    routes: [[[1, -1], [1, 11], [3.3, 11], [3.3, 2], [5.7, 2], [5.7, 11], [7.9, 11], [7.9, 13.2], [7.1, 13.2]]],
    tree: [6.5, 14],
    mode: "split",
    hp: 1.05,
  },
  triple: {
    name: "สามทิศ",
    routes: [
      shared([[1, -1], [1, 4]], tripleTail),
      shared([[8, -1], [8, 4]], tripleTail),
      [[-1, 8.6], [1.6, 8.6], [1.6, 10.4], [7.4, 10.4], [7.4, 12.6], [4.5, 12.6], [4.5, 13.4]],
    ],
    tree: [4.5, 14],
    mode: "split",
    hp: 0.8,
  },
};

export function mirrored(l: Layout): Layout {
  const m = (p: Pt): Pt => [GW - p[0], p[1]];
  return { ...l, routes: l.routes.map((r) => r.map(m)), tree: m(l.tree) };
}

// ── Seasons and tree growth ──────────────────────────────────────────────

export type Season = "spring" | "rainy" | "autumn" | "winter";
export const SEASONS: Season[] = ["spring", "rainy", "autumn", "winter"];
export const SEASON_NAME: Record<Season, string> = { spring: "ฤดูใบไม้ผลิ", rainy: "ฤดูฝน", autumn: "ฤดูใบไม้ร่วง", winter: "ฤดูหนาว" };
export const SEASON_COLOR: Record<Season, string> = { spring: "#4ade80", rainy: "#38bdf8", autumn: "#fb923c", winter: "#c7d2fe" };
export const TREE_TIER_NAME = ["ต้นกล้า", "ต้นอ่อน", "ต้นไม้หนุ่ม", "ต้นไม้ใหญ่", "ต้นไม้ยักษ์"];

// ── Maps ──────────────────────────────────────────────────────────────────

export interface MapSpec {
  n: number;
  layout: string;
  mirror: boolean;
  waves: number;
  /** Enemy HP multiplier at the first wave. */
  hp: number;
  season: Season;
  /** 0..4, how big the tree is. */
  tier: number;
  /** Enemy introduced on this map (shown on the loadout screen and as a banner). */
  intro?: EnemyKind;
  pool: EnemyKind[];
  /** Tower recommended for this map's new threat. */
  tip?: TowerKind;
}

const INTRO: [number, EnemyKind][] = [
  [1, "puff"], [2, "runner"], [3, "brute"], [4, "splitter"], [5, "jumper"], [6, "healer"], [7, "shell"], [9, "flyer"], [10, "shield"],
];
const TIPS: Partial<Record<number, TowerKind>> = { 5: "frost", 6: "poison", 7: "lens", 8: "barrier", 9: "sniper", 10: "poison", 12: "mortar", 14: "buff" };

const PLAN: [string, boolean][] = [
  ["meadow", false], ["snake", false], ["meadow", true], ["fork", false],
  ["snake", true], ["twin", false], ["spiral", false], ["zig", false],
  ["river", false], ["fork", false], ["twin", true], ["triple", false],
  ["spiral", true], ["river", true], ["zig", true], ["triple", true],
  ["twin", false], ["snake", false], ["spiral", false], ["triple", false],
];

export const MAP_COUNT = PLAN.length;

export const MAPS: MapSpec[] = PLAN.map(([layout, mirror], i) => {
  const n = i + 1;
  const pool = INTRO.filter(([m]) => m <= n).map(([, k]) => k);
  return {
    n,
    layout,
    mirror,
    waves: n === 1 ? 5 : n <= 4 ? 6 : n <= 8 ? 7 : n <= 12 ? 8 : n <= 16 ? 9 : 10,
    hp: (n === 1 ? 0.45 : 0.55 * Math.pow(1.155, n - 1)) * LAYOUTS[layout].hp,
    season: SEASONS[i % 4],
    tier: Math.min(4, Math.floor(i / 4)),
    intro: INTRO.find(([m]) => m === n)?.[1],
    pool,
    tip: TIPS[n],
  };
});

export function layoutFor(spec: { layout: string; mirror: boolean }): Layout {
  const l = LAYOUTS[spec.layout];
  return spec.mirror ? mirrored(l) : l;
}

// ── Waves ─────────────────────────────────────────────────────────────────

export interface WavePlan {
  list: EnemyKind[];
  hp: number;
  boss: boolean;
}

const WEIGHT: Record<EnemyKind, number> = {
  puff: 4, mini: 0, runner: 2.2, brute: 1.1, splitter: 1.1, jumper: 1.3, healer: 0.8, shell: 1.1, flyer: 1.3, shield: 0.8, boss: 0,
};

const INTRO_AT: Partial<Record<EnemyKind, number>> = { jumper: 5, healer: 6, shell: 7, flyer: 9, shield: 10 };

function pick(pool: EnemyKind[], r: () => number, favour?: EnemyKind, mapN = 0): EnemyKind {
  // Special enemies get more common on the maps after they were introduced.
  const ws = pool.map((k) => WEIGHT[k] * (k === favour ? 2.2 : 1) * (INTRO_AT[k] ? 1 + 0.15 * Math.max(0, mapN - INTRO_AT[k]!) : 1));
  let x = r() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    x -= ws[i];
    if (x <= 0) return pool[i];
  }
  return pool[0];
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wave w (1-based) of map m; same every time so a map can be learnt. */
export function mapWave(m: MapSpec, w: number): WavePlan {
  const r = seeded(m.n * 1009 + w * 31);
  const count = Math.round(4 + w * 1.5 + m.n * 0.25);
  const list: EnemyKind[] = [];
  // New enemy kinds show up from the second wave, a few at first so the player can see them.
  const pool = m.intro && w === 1 && m.n > 1 ? m.pool.filter((k) => k !== m.intro) : m.pool;
  for (let i = 0; i < count; i++) list.push(pick(pool, r, w >= 2 ? m.intro : undefined, m.n));
  const boss = w === m.waves;
  if (boss) list.push("boss");
  else if (w === m.waves - 1 && m.pool.includes("brute")) list.push("brute", "brute");
  return { list, hp: m.hp * Math.pow(1.15, w - 1), boss };
}

/** Endless mode: the old open-ended wave curve with every enemy kind phased in. */
export function endlessWave(w: number, r: () => number): WavePlan {
  const pool: EnemyKind[] = ["puff"];
  const gates: [number, EnemyKind][] = [[3, "runner"], [5, "brute"], [7, "splitter"], [9, "jumper"], [11, "healer"], [13, "shell"], [15, "flyer"], [17, "shield"]];
  for (const [g, k] of gates) if (w >= g) pool.push(k);
  const list: EnemyKind[] = [];
  const count = Math.round(6 + w * 1.6);
  for (let i = 0; i < count; i++) list.push(pick(pool, r));
  const boss = w % 10 === 0;
  if (boss) list.push("boss");
  else if (w % 5 === 0) list.push("brute", "brute");
  return { list, hp: Math.pow(1.13, w - 1) * (1 + w * 0.02), boss };
}

/** Coins for a finished map (kept inside the shared 60-coin round cap). */
export function mapCoins(n: number, won: boolean, stars: number, wavesCleared: number, kills: number) {
  if (won) return Math.min(60, 10 + 2 * n + 5 * stars);
  return Math.min(25, 3 + 2 * wavesCleared + Math.floor(kills / 15));
}
export function endlessCoins(survived: number, kills: number) {
  return Math.min(60, 5 + survived * 2 + Math.floor(kills / 10));
}
