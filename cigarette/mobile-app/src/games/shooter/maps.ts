// Map (sector) definitions for "ยานพิทักษ์ดาว": themes, the enemy roster each map introduces, boss
// designs and the difficulty curve. Pure data and maths (no DOM), so the simulation can import it.

import { rng } from "../engine/fx";

export type EnemyKind =
  | "drone"
  | "zig"
  | "gunner"
  | "diver"
  | "darter"
  | "tank"
  | "splitter"
  | "mini"
  | "shield"
  | "layer"
  | "mine"
  | "chaser"
  | "lancer"
  | "carrier"
  | "caster"
  | "wisp"
  | "spinner"
  | "cloaker"
  | "weaver"
  | "rock"
  | "meteor"
  | "boss";

export interface EnemyMeta {
  name: string;
  hp: number;
  r: number;
  color: string;
  score: number;
  /** First map it appears in (0 = helper spawned by something else). */
  intro: number;
  /** Shown the first time it appears in a run. */
  hint?: string;
  /** Counted for clearing a wave. */
  counts: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyMeta> = {
  drone: { name: "โดรน", hp: 20, r: 15, color: "#ff5a7a", score: 10, intro: 1, counts: true },
  zig: { name: "ส่ายไปมา", hp: 18, r: 14, color: "#ffc93c", score: 12, intro: 1, counts: true },
  gunner: { name: "มือปืน", hp: 34, r: 17, color: "#b06cff", score: 20, intro: 1, hint: "หลบกระสุนสีชมพู ยานถูกยิงจะเสียพลัง", counts: true },
  diver: { name: "พุ่งชน", hp: 24, r: 14, color: "#ff8a3d", score: 18, intro: 2, hint: "เห็นเส้นประ = กำลังจะพุ่ง หลบออกจากเส้น", counts: true },
  darter: { name: "ซิกแซก", hp: 20, r: 13, color: "#ffe066", score: 16, intro: 3, hint: "ซิกแซกเร็ว แต่ไม่ยิง", counts: true },
  tank: { name: "รถถังอวกาศ", hp: 80, r: 22, color: "#3ddc84", score: 35, intro: 3, hint: "ตัวอึด ยิงสามทาง", counts: true },
  splitter: { name: "แตกตัว", hp: 40, r: 18, color: "#ff6bd6", score: 24, intro: 4, hint: "ยิงแตกแล้วจะแยกเป็นตัวเล็ก", counts: true },
  mini: { name: "ตัวเล็ก", hp: 8, r: 9, color: "#ff9ae6", score: 5, intro: 0, counts: false },
  shield: { name: "ถือโล่", hp: 60, r: 19, color: "#5ac8ff", score: 30, intro: 5, hint: "มีโล่ด้านหน้า! ยิงที่ขอบข้างตัว", counts: true },
  layer: { name: "วางทุ่นระเบิด", hp: 46, r: 18, color: "#ffa94d", score: 28, intro: 6, hint: "ทุ่นกะพริบจะระเบิดเป็นวง ยิงทิ้งได้", counts: true },
  mine: { name: "ทุ่นระเบิด", hp: 10, r: 10, color: "#ff7043", score: 6, intro: 0, counts: false },
  chaser: { name: "ไล่ล่า", hp: 14, r: 13, color: "#ff3b3b", score: 22, intro: 7, hint: "ตัวแดงไล่ตามยาน ยิงทิ้งก่อนถึงตัว", counts: true },
  lancer: { name: "ปืนเลเซอร์", hp: 44, r: 17, color: "#ff4d8d", score: 30, intro: 8, hint: "เส้นแดงกะพริบ = เลเซอร์กำลังมา", counts: true },
  carrier: { name: "เรือป้อมปืน", hp: 150, r: 26, color: "#7aa2ff", score: 50, intro: 9, hint: "ป้อมเรืองแสง = กำลังจะยิงชุด", counts: true },
  caster: { name: "นักเวทลูกไฟ", hp: 50, r: 17, color: "#c084fc", score: 32, intro: 10, hint: "ลูกไฟตามติดตัว ยิงทำลายได้", counts: true },
  wisp: { name: "ลูกไฟตามตัว", hp: 6, r: 9, color: "#e9a8ff", score: 4, intro: 0, counts: false },
  spinner: { name: "กังหันกระสุน", hp: 70, r: 20, color: "#2dd4bf", score: 40, intro: 11, hint: "ยิงเป็นวงก้นหอย หาช่องว่างระหว่างแขน", counts: true },
  cloaker: { name: "ล่องหน", hp: 40, r: 16, color: "#94a3b8", score: 36, intro: 12, hint: "ล่องหนแล้วยิงไม่โดน รอให้โผล่ก่อน", counts: true },
  weaver: { name: "ทอกำแพง", hp: 64, r: 19, color: "#fbbf24", score: 42, intro: 13, hint: "กำแพงกระสุนมีช่องเสมอ ดูช่องที่เรืองแสง", counts: true },
  rock: { name: "อุกกาบาต", hp: 60, r: 22, color: "#a1866f", score: 8, intro: 0, counts: false },
  meteor: { name: "ดาวตก", hp: 999, r: 14, color: "#ff8a3d", score: 0, intro: 0, counts: false },
  boss: { name: "บอส", hp: 600, r: 52, color: "#ff3d6e", score: 500, intro: 0, counts: true },
};

/** Kinds that can be in a map's wave roster, in the order they are introduced. */
export const ROSTER_KINDS: EnemyKind[] = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].intro > 0);

// ── Themes ──────────────────────────────────────────────────────────────────

export type Hazard = "rocks" | "meteors" | "bolts";
export type Feature = "ringed" | "moon" | "belt" | "ice" | "sun" | "aurora" | "hole" | "storm";

export interface Theme {
  name: string;
  /** Sky gradient top → bottom. */
  sky: [string, string, string];
  /** Nebula cloud colours. */
  neb: string[];
  /** Main accent (map node, HUD). */
  color: string;
  star: string;
  feature: Feature;
  hazard?: Hazard;
}

export const THEMES: Theme[] = [
  { name: "ลานฝึกบิน", sky: ["#03041a", "#0a0f33", "#140a2e"], neb: ["#3b2bd1", "#1c6fd8", "#4f7cff"], color: "#4fa8ff", star: "#c8d7ff", feature: "ringed" },
  { name: "เนบิวลาชมพู", sky: ["#14031c", "#2a0a33", "#1a0626"], neb: ["#d6338a", "#8b3dff", "#ff6fb5"], color: "#ff6fb5", star: "#ffd6ef", feature: "moon" },
  { name: "แถบดาวเคราะห์น้อย", sky: ["#100a05", "#22150b", "#120c08"], neb: ["#b8742a", "#7a4a1f", "#d99a4e"], color: "#f0a14a", star: "#ffe8c7", feature: "belt", hazard: "rocks" },
  { name: "ทะเลน้ำแข็ง", sky: ["#021220", "#062a3d", "#0a1a30"], neb: ["#1fb6d6", "#5ee6ff", "#2f6bd8"], color: "#5ee6ff", star: "#dff9ff", feature: "ice" },
  { name: "ดาวแดงเดือด", sky: ["#1a0303", "#330a06", "#1c0508"], neb: ["#ff4d2e", "#b3122e", "#ff9a3d"], color: "#ff6a3d", star: "#ffd2c2", feature: "sun", hazard: "meteors" },
  { name: "ป่าแสงมรกต", sky: ["#021410", "#06291f", "#04161a"], neb: ["#1ed68a", "#0fa3a3", "#7cf5c4"], color: "#3ddc97", star: "#d8ffee", feature: "aurora" },
  { name: "ขอบหลุมดำ", sky: ["#07020f", "#150628", "#05020c"], neb: ["#7b2cff", "#3a1aa8", "#c45cff"], color: "#b47cff", star: "#e6d8ff", feature: "hole" },
  { name: "พายุไอออน", sky: ["#020a1a", "#0a1640", "#071029"], neb: ["#2ad4ff", "#4b55ff", "#00ffd5"], color: "#36e0ff", star: "#e0f7ff", feature: "storm", hazard: "bolts" },
];

// ── Bosses ──────────────────────────────────────────────────────────────────

export type Pattern = "fan" | "ring" | "burst" | "spiral" | "sweep" | "laser" | "wall" | "wisps" | "summon" | "mines" | "rain" | "cross";
export type BossMove = "sway" | "hover" | "teleport" | "serpent" | "fortress";

export interface BossSpec {
  id: number;
  name: string;
  color: string;
  accent: string;
  /** Base HP before map scaling. */
  hp: number;
  /** Half width and half height of the hit box. */
  hw: number;
  hh: number;
  move: BossMove;
  /** Attack rotation for each of the three phases (HP above 2/3, above 1/3, below). */
  phases: Pattern[][];
  summon: EnemyKind;
}

export const BOSSES: BossSpec[] = [
  { id: 0, name: "ยามเฝ้าประตู", color: "#ff3d6e", accent: "#ffd166", hp: 520, hw: 50, hh: 34, move: "sway", summon: "drone",
    phases: [["fan", "ring"], ["fan", "burst", "ring"], ["ring", "fan", "rain", "burst"]] },
  { id: 1, name: "ปูเหล็กยักษ์", color: "#ff7a3d", accent: "#ffe08a", hp: 700, hw: 62, hh: 30, move: "hover", summon: "diver",
    phases: [["burst", "fan"], ["sweep", "burst"], ["sweep", "summon", "burst", "fan"]] },
  { id: 2, name: "ดวงตาเนบิวลา", color: "#d946ef", accent: "#f0abfc", hp: 760, hw: 46, hh: 46, move: "sway", summon: "wisp",
    phases: [["spiral", "burst"], ["laser", "spiral"], ["wisps", "laser", "spiral"]] },
  { id: 3, name: "ราชินีรัง", color: "#ff6bd6", accent: "#ffd1f3", hp: 820, hw: 54, hh: 38, move: "hover", summon: "splitter",
    phases: [["summon", "wall"], ["wall", "burst", "summon"], ["wall", "fan", "summon", "ring"]] },
  { id: 4, name: "ป้อมดาวหมุน", color: "#2dd4bf", accent: "#a7f3d0", hp: 900, hw: 50, hh: 50, move: "fortress", summon: "drone",
    phases: [["spiral", "ring"], ["cross", "spiral"], ["cross", "spiral", "burst", "ring"]] },
  { id: 5, name: "งูอวกาศ", color: "#84cc16", accent: "#ecfccb", hp: 950, hw: 26, hh: 26, move: "serpent", summon: "drone",
    phases: [["rain", "burst"], ["rain", "fan", "sweep"], ["rain", "ring", "burst", "wisps"]] },
  { id: 6, name: "ราชินีเงา", color: "#94a3b8", accent: "#e2e8f0", hp: 980, hw: 40, hh: 40, move: "teleport", summon: "cloaker",
    phases: [["burst", "mines"], ["burst", "laser", "mines"], ["burst", "laser", "wisps", "fan"]] },
  { id: 7, name: "เรือรบไททัน", color: "#60a5fa", accent: "#fde68a", hp: 1150, hw: 92, hh: 34, move: "sway", summon: "chaser",
    phases: [["burst", "wall"], ["laser", "wall", "fan"], ["laser", "spiral", "wall", "sweep"]] },
];

// ── Difficulty ──────────────────────────────────────────────────────────────

export interface Diff {
  /** Enemy HP multiplier. */
  hp: number;
  /** Enemy damage multiplier (bullets and contact). */
  dmg: number;
  /** Enemy bullet speed in px/s. */
  bullet: number;
  /** Enemy fire-rate multiplier (higher = shoots more often). */
  fire: number;
  /** Enemy movement-speed multiplier. */
  move: number;
  /** Seconds between spawns. */
  gap: number;
  maxAlive: number;
  /** 0..1, used for pattern density. */
  k: number;
  /** Elite chance per spawn. */
  elite: number;
}

export function difficulty(m: number): Diff {
  const d = m - 1;
  return {
    // Stats grow fast early, then slower: later maps get harder mostly through new patterns
    // and denser fire, so upgrades keep up without endless grinding.
    hp: (m === 1 ? 0.8 : 1) * Math.pow(1.09, Math.min(d, 11)) * Math.pow(1.045, Math.max(0, d - 11)),
    dmg: 0.7 + 0.055 * Math.min(d, 11) + 0.03 * Math.max(0, d - 11),
    bullet: 170 * Math.min(1.85, 0.72 + 0.05 * d),
    fire: Math.min(2, 0.6 + 0.07 * d),
    move: Math.min(1.6, 0.7 + 0.04 * d),
    gap: Math.max(0.32, 1.35 - 0.055 * d),
    maxAlive: Math.min(14, 4 + Math.ceil(m * 0.6)),
    k: Math.min(1, d / 20),
    elite: m < 10 ? 0 : Math.min(0.3, 0.05 + 0.02 * (m - 10)),
  };
}

export function waveCount(m: number, wave: number) {
  if (m === 1) return 4 + wave;
  return Math.min(28, Math.round(3 + wave * 1.1 + (m - 1) * 0.45));
}

// ── Map spec ────────────────────────────────────────────────────────────────

export interface MapSpec {
  m: number;
  name: string;
  theme: Theme;
  /** Hue rotation applied to theme colours on later cycles. */
  cycle: number;
  waves: number;
  roster: { kind: EnemyKind; w: number }[];
  /** Kinds that are new on this map (shown on the map card). */
  fresh: EnemyKind[];
  boss: BossSpec;
  /** Extra patterns mixed into the boss phases on later cycles. */
  remix: Pattern[];
  hazards: Hazard[];
  diff: Diff;
  seed: number;
}

const ROMAN = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function mapName(m: number) {
  const t = THEMES[(m - 1) % THEMES.length];
  const cycle = Math.floor((m - 1) / THEMES.length);
  if (cycle === 0) return t.name;
  return `${t.name} ${ROMAN[cycle] || cycle + 1}`;
}

export function mapSpec(m: number): MapSpec {
  const seed = m * 7919 + 13;
  const r = rng(seed);
  const cycle = Math.floor((m - 1) / THEMES.length);
  const theme = THEMES[(m - 1) % THEMES.length];
  const fresh = ROSTER_KINDS.filter((k) => ENEMIES[k].intro === m);
  let roster: { kind: EnemyKind; w: number }[] = [];
  if (m === 1) {
    roster = [
      { kind: "drone", w: 3 },
      { kind: "zig", w: 2 },
      { kind: "gunner", w: 1 },
    ];
  } else if (m <= 13) {
    // The new arrivals are the stars of the map; recent ones and basic fodder fill the waves.
    for (const k of ROSTER_KINDS) {
      const intro = ENEMIES[k].intro;
      if (intro > m) continue;
      if (intro === m) roster.push({ kind: k, w: 3 });
      else if (intro >= m - 3) roster.push({ kind: k, w: 1.6 });
      else if (k === "drone" || k === "zig" || k === "gunner") roster.push({ kind: k, w: 1.2 });
      else if (r() < 0.35) roster.push({ kind: k, w: 0.8 });
    }
  } else {
    // Every later map draws its own mix of five or six kinds, so no two maps play alike.
    const pool = ROSTER_KINDS.filter((k) => k !== "drone");
    const pick: EnemyKind[] = [];
    while (pick.length < 5 + (r() < 0.5 ? 1 : 0)) {
      const k = pool[Math.floor(r() * pool.length)];
      if (!pick.includes(k)) pick.push(k);
    }
    // Heavy hitters come less often than light ones, so no mix is far harder than another.
    const threat: Partial<Record<EnemyKind, number>> = { carrier: 1.9, tank: 1.5, spinner: 1.5, weaver: 1.4, lancer: 1.3, cloaker: 1.3, caster: 1.3, shield: 1.2, gunner: 1.2, layer: 1.2 };
    roster = [{ kind: "drone", w: 1 }, ...pick.map((k, i) => ({ kind: k, w: (i < 2 ? 2 : 1.3) / (threat[k] ?? 1) }))];
  }
  const hazards: Hazard[] = [];
  if (theme.hazard) hazards.push(theme.hazard);
  if (m >= 21) {
    const extra: Hazard[] = ["rocks", "meteors", "bolts"];
    const hz = extra[Math.floor(r() * 3)];
    if (!hazards.includes(hz) && r() < 0.7) hazards.push(hz);
  }
  const boss = BOSSES[(m - 1) % BOSSES.length];
  const remix: Pattern[] = [];
  if (m > BOSSES.length) {
    // Later cycles borrow attacks from other bosses, one more each cycle (up to three).
    const n = Math.min(3, Math.floor((m - 1) / BOSSES.length));
    for (let i = 0; i < n; i++) {
      const other = BOSSES[(boss.id + 3 + i * 2 + Math.floor(r() * 3)) % BOSSES.length];
      const p = other.phases[2][Math.floor(r() * other.phases[2].length)];
      if (!remix.includes(p) && p !== "summon") remix.push(p);
    }
  }
  return {
    m,
    name: mapName(m),
    theme,
    cycle,
    waves: m === 1 ? 4 : m < 7 ? 5 : 6,
    roster,
    fresh,
    boss,
    remix,
    hazards,
    diff: difficulty(m),
    seed,
  };
}

export function bossName(spec: MapSpec) {
  return spec.cycle > 0 ? `${spec.boss.name} ร่าง ${spec.cycle + 1}` : spec.boss.name;
}

/** Coin plan for one map run (the game caps the total at 60). */
export function coinPlan(m: number) {
  return {
    kills: 9 + Math.min(m, 12),
    boss: 4 + Math.min(Math.floor(m / 2), 6),
    clear: 8 + Math.min(m, 12),
  };
}

/** Rotates a #rrggbb colour's hue by `deg`, for later map cycles. */
export function hueShift(hex: string, deg: number): string {
  if (!deg) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255;
  let g = ((n >> 8) & 255) / 255;
  let b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const seg = Math.floor(h / 60);
  [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg] as [number, number, number];
  const to = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** The theme for a map, hue-shifted on later cycles so repeats look new. */
export function mapTheme(spec: MapSpec): Theme {
  // Moderate shifts that alternate direction (red → magenta, blue → violet …) stay pretty.
  const deg = spec.cycle === 0 ? 0 : (spec.cycle % 2 ? -1 : 1) * Math.min(90, 45 + spec.cycle * 10);
  if (!deg) return spec.theme;
  const t = spec.theme;
  return {
    ...t,
    // Keep the sky close to the original (a big shift makes muddy greens); recolour the clouds.
    sky: t.sky.map((c) => hueShift(c, deg * 0.5)) as [string, string, string],
    neb: t.neb.map((c) => hueShift(c, deg)),
    color: hueShift(t.color, deg),
    star: t.star,
  };
}
