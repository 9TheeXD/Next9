// Neon Pulse levels: endless, generated from the level number (level 7 is always the same level 7).
// Ten levels make a world; every world adds one new idea and has its own look and music:
//   1 นีออนซันเซ็ต   spikes and blocks only, slow, short, lots of room (tutorial)
//   2 ถ้ำคริสตัล      jump pads, then jump rings (orbs)
//   3 สวนลอยฟ้า      glide wings through pillar gates
//   4 โรงงานจันทรา    gravity portals: runs upside down on the ceiling
//   5 ห้วงลึกเรืองแสง  monsters: crawlers, chompers, eye drones (upside down too)
//   6 ป้อมพายุ        speed portals and saws on rails, everything mixed
// After world 6 the six looks repeat with new colours while the mix keeps getting denser, capped.
// Every chunk starts and ends on the floor, right way up, as a cube, so chunks can be chained.

import { rng } from "../engine/fx";
import { AIR, CEIL, PAD_V, G, type Hint, type Kind, type Level, type Obj } from "./sim";

export const LEVELS_PER_WORLD = 10;
export const THEME_COUNT = 6;

export interface WorldInfo {
  name: string;
  /** What is new in this world, shown on the map. */
  feature: string;
}

export const WORLDS: WorldInfo[] = [
  { name: "นีออนซันเซ็ต", feature: "หนามและบล็อก" },
  { name: "ถ้ำคริสตัล", feature: "แท่นเด้งและวงแหวน" },
  { name: "สวนลอยฟ้า", feature: "ปีกร่อน" },
  { name: "โรงงานจันทรา", feature: "กลับหัว" },
  { name: "ห้วงลึกเรืองแสง", feature: "มอนสเตอร์" },
  { name: "ป้อมพายุ", feature: "ประตูความเร็ว ใบเลื่อย" },
];

export function worldOf(n: number) {
  return Math.floor((n - 1) / LEVELS_PER_WORLD);
}

export function worldName(w: number) {
  const base = WORLDS[w % THEME_COUNT].name;
  const cycle = Math.floor(w / THEME_COUNT);
  return cycle ? `${base} ${cycle + 1}` : base;
}

export function worldFeature(w: number) {
  return w < THEME_COUNT ? WORLDS[w].feature : "ทุกอย่างรวมกัน";
}

/** Running speed at the start of a level (units per second). */
export function baseSpeed(world: number, stage: number) {
  const base = [7.0, 7.5, 7.9, 8.2, 8.5, 8.8];
  const b = world < base.length ? base[world] : Math.min(10, 8.9 + (world - 5) * 0.15);
  return b + (stage / 9) * 0.5;
}

/** Seconds of clear floor before the finish gate. Generous early; only late levels cut it short. */
export function finishRunUp(world: number) {
  if (world <= 2) return 2.4;
  if (world <= 4) return 2.0;
  if (world <= 5) return 1.6;
  return Math.max(0.9, 1.6 - (world - 5) * 0.1);
}

type Chunk = "spikes" | "step" | "stairs" | "pit" | "ledge" | "pad" | "padUp" | "orb" | "glide" | "flip" | "crawler" | "chomper" | "droneLow" | "droneHigh" | "rail" | "speed";

/** Which chunks a level may use, with weights. */
function pool(world: number, stage: number): [Chunk, number][] {
  const w = world;
  const p: [Chunk, number][] = [["spikes", 3]];
  p.push(["step", w === 0 ? 2 : 1]);
  if (w > 0 || stage >= 3) p.push(["stairs", 1.2]);
  if (w > 0 || stage >= 6) p.push(["ledge", 1]);
  if (w > 0 || stage >= 7) p.push(["pit", 1]);
  if (w >= 1) p.push(["pad", w === 1 ? 2.5 : 1]);
  if (w >= 2 || (w === 1 && stage >= 2)) p.push(["padUp", w === 1 ? 1.5 : 0.8]);
  if (w >= 2 || (w === 1 && stage >= 4)) p.push(["orb", w === 1 ? 2.5 : 1]);
  if (w >= 2) p.push(["glide", w === 2 ? 3 : 1]);
  if (w >= 3) p.push(["flip", w === 3 ? 3.2 : w === 4 ? 1.6 : 1.1]);
  if (w >= 4) {
    p.push(["crawler", w === 4 ? 2 : 0.8]);
    if (w > 4 || stage >= 2) p.push(["chomper", w === 4 ? 1.8 : 0.8]);
    if (w > 4 || stage >= 4) p.push(["droneLow", w === 4 ? 1.5 : 0.7]);
    if (w > 4 || stage >= 6) p.push(["droneHigh", w === 4 ? 1 : 0.5]);
  }
  if (w >= 5) {
    p.push(["rail", w === 5 ? 2 : 0.8]);
    p.push(["speed", w === 5 ? 2.2 : 0.9]);
  }
  return p;
}

/** The chunk a world introduces, used heavily on its first level. */
const FEATURED: (Chunk | null)[] = [null, "pad", "glide", "flip", "crawler", "speed"];

const HINTS: Partial<Record<Chunk, string>> = {
  pad: "แท่นเหลือง: เหยียบแล้วเด้งสูง",
  padUp: "แท่นเด้งพาขึ้นที่สูงได้",
  orb: "วงแหวน: แตะตอนลอยผ่าน",
  glide: "ประตูปีก: กดค้างบินขึ้น ปล่อยร่อนลง",
  flip: "ประตูฟ้า: กลับหัววิ่งบนเพดาน",
  crawler: "ตัวคลาน: กระโดดข้ามให้พ้น",
  chomper: "ตัวงับ: โผล่จากพื้นเป็นจังหวะ",
  droneLow: "ตาโดรนบินต่ำ: อย่ากระโดดใส่",
  droneHigh: "ตาโดรนลอยสูง: ลอดใต้ได้",
  rail: "ใบเลื่อยขึ้นลง: ดูจังหวะก่อนกระโดด",
  speed: "ประตูลูกศร: วิ่งเร็วขึ้น",
};

export function buildLevel(n: number): Level {
  const world = worldOf(n);
  const stage = (n - 1) % LEVELS_PER_WORLD;
  const d = stage / 9; // 0..1 inside the world
  const late = world >= THEME_COUNT ? Math.min(1, (world - THEME_COUNT + 1) / 6) : 0; // 0..1 past world 6
  const r = rng(n * 7919 + 13);
  const speed0 = baseSpeed(world, stage);
  let s = speed0;
  const objs: Obj[] = [];
  const hints: Hint[] = [];
  let id = 0;
  let coins = 0;
  const add = (kind: Kind, x: number, y: number, w = 1, h = 1, extra: Partial<Obj> = {}) => {
    const o: Obj = { kind, x, y, w, h, id: id++, a: 0, p: 0, f: 0, v: 0, ...extra };
    objs.push(o);
    return o;
  };
  const coinMax = Math.min(7, 3 + world);
  const coin = (x: number, y: number, chance = 0.5) => {
    if (coins < coinMax && r() < chance) {
      add("coin", x, y, 0.7, 0.7);
      coins++;
    }
  };
  const J = () => s * AIR; // length of one ground jump at the current speed
  // Time since level start for x (moving hazards are phased against when the player gets there)
  const segs: { x: number; t: number; s: number }[] = [{ x: 0, t: 0, s }];
  const timeAt = (x: number) => {
    let seg = segs[0];
    for (const g of segs) if (g.x <= x) seg = g;
    return seg.t + (x - seg.x) / seg.s;
  };
  const setSpeed = (x: number, v: number) => {
    segs.push({ x, t: timeAt(x), s: v });
    s = v;
  };

  // Difficulty knobs
  const g = Math.min(world, THEME_COUNT) + d + late * 2; // grows through the first 60 levels, then slowly
  // Three spikes in a row only leave a fair window at high speed
  const maxSpikes = () => (s >= 10.5 && g >= 6 ? 3 : g >= 0.45 ? 2 : 1);
  const restSec = world === 0 ? 1.25 - 0.5 * d : Math.max(0.3, 0.72 - 0.07 * world - 0.15 * d - 0.1 * late);
  const levelSec = world === 0 ? 24 + 16 * d : Math.min(70, 36 + world * 2 + 14 * d + late * 8);

  const chunkFns: Record<Chunk, (x0: number, local: number) => number> = {
    spikes: (x0) => {
      let k = 1 + Math.floor(r() * maxSpikes());
      if (g < 0.2) k = 1;
      for (let i = 0; i < k; i++) add("spike", x0 + i, 0);
      coin(x0 + k / 2 - 0.35, 2.1, 0.3);
      return x0 + k;
    },
    step: (x0) => {
      const h = g >= 2 && r() < 0.4 ? 2 : 1;
      // Two-high needs a step in between
      if (h === 2) {
        add("block", x0, 0, Math.max(2.4, J() * 0.8), 1);
        x0 += Math.max(2.4, J() * 0.8);
      }
      const len = Math.max(3, J() * (1.1 + r() * 0.8));
      add("block", x0, 0, len, h);
      if (g >= 1.2 && r() < 0.5) add("spike", x0 + len + J() * 0.6 + 1.2, 0);
      return x0 + len + (g >= 1.2 ? J() * 0.6 + 2.2 : 0);
    },
    stairs: (x0) => {
      const ws = Math.max(2.6, J() * 1.05);
      for (let i = 0; i < 3; i++) add("block", x0 + i * ws, 0, ws, i + 1);
      coin(x0 + 3 * ws - 0.8, 4.6, 0.4);
      return x0 + 3 * ws + s * 0.3; // room to drop from the top step
    },
    ledge: (x0) => {
      const len = Math.max(6, J() * 2.4);
      add("block", x0, 0, len, 1);
      const k = g >= 2.5 && r() < 0.5 ? 2 : 1;
      const sx = x0 + Math.max(2.6, len * 0.45);
      for (let i = 0; i < k; i++) add("spike", sx + i, 1);
      coin(sx + k / 2 - 0.35, 3.1, 0.3);
      return x0 + len;
    },
    pit: (x0) => {
      const pw = Math.max(2.4, J() * 0.75);
      const k = Math.min(maxSpikes() + 1, 3);
      add("block", x0, 0, pw, 1);
      for (let i = 0; i < k; i++) add("spike", x0 + pw + i, 0);
      add("block", x0 + pw + k, 0, pw, 1);
      coin(x0 + pw + k / 2 - 0.35, 3.1, 0.4);
      return x0 + 2 * pw + k;
    },
    pad: (x0, local) => {
      add("pad", x0, 0, 1, 0.25);
      const reach = s * ((2 * PAD_V) / G);
      const k = Math.max(2, Math.min(Math.floor(reach - 2.7), 2 + Math.round(local * 2)));
      for (let i = 0; i < k; i++) add("spike", x0 + 1.6 + i, 0);
      coin(x0 + 1.6 + k / 2 - 0.35, 4.2, 0.45);
      return Math.max(x0 + 1.6 + k, x0 + reach + 0.3); // where the pad drops you
    },
    padUp: (x0) => {
      add("pad", x0, 0, 1, 0.25);
      const bx = x0 + Math.max(2.2, s * 0.32);
      const len = Math.max(4, J() * 1.5);
      add("block", bx, 0, len, 3);
      coin(bx + len * 0.5, 4.4, 0.35);
      return bx + len + s * 0.3;
    },
    orb: (x0, local) => {
      const reach = J() / 2 + s * 0.62;
      const k = Math.max(3, Math.min(Math.floor(reach) - 1, 3 + Math.round(local * 2.5)));
      for (let i = 0; i < k; i++) add("spike", x0 + i, 0);
      const ox = x0 + J() * 0.5 - 0.2;
      add("orb", ox, 1.75, 0.9, 0.9);
      coin(x0 + J() * 0.5 + s * 0.25, 4.0, 0.4);
      return Math.max(x0 + k, ox + s * 0.6 + 0.5); // where the ring jump lands
    },
    glide: (x0, local) => {
      add("glide", x0, 0, 1, CEIL);
      const n = 3 + Math.round(local * 3 + (g > 4 ? 1 : 0));
      const gap = Math.max(2.9, 4.3 - local * 0.9 - Math.max(0, g - 3) * 0.12);
      const sp = Math.max(3.6, (6.4 - local * 1.6 - Math.max(0, g - 3) * 0.25) * (s / 8));
      let c = 1.6 + gap / 2;
      let x = x0 + Math.max(5, s * 0.6);
      const lo = gap / 2 + 0.3;
      const hi = CEIL - gap / 2 - 0.3;
      for (let i = 0; i < n; i++) {
        const maxD = Math.min(2.6, 3.5 * (sp / s));
        c = Math.min(hi, Math.max(lo, c + (r() * 2 - 1) * maxD));
        if (c - gap / 2 > 0.05) add("block", x, 0, 1, c - gap / 2);
        if (c + gap / 2 < CEIL - 0.05) add("block", x, c + gap / 2, 1, CEIL - c - gap / 2);
        coin(x + 0.15, c - 0.35, 0.3);
        x += sp;
      }
      add("cube", x, 0, 1, CEIL);
      return x + s * 0.55;
    },
    flip: (x0, local) => {
      add("gravity", x0, 0, 1, CEIL);
      let x = x0 + Math.max(5.5, s * 0.75);
      const len = s * (2.4 + local * 2 + Math.min(2, g - 3) * 0.5);
      const end = x + len;
      const y = CEIL - 1;
      const monsters = world >= 4;
      while (x < end - 3) {
        const roll = r();
        if (monsters && roll < 0.22) {
          // Crawler walking on the ceiling
          const a = 1.2 + r() * 1.2;
          add("crawler", x, CEIL - 0.55, a + 0.9, 0.55, { a, f: (2 * 1.4) / a, p: r() * Math.PI * 2 });
          x += a + 1 + J() + 1;
        } else if (roll < 0.62) {
          const k = 1 + Math.floor(r() * Math.min(maxSpikes(), 2));
          for (let i = 0; i < k; i++) add("spikeDown", x + i, y);
          x += k + J() * 0.7 + 1.6;
        } else {
          // Hanging step: hop "down" onto its underside
          const bw = Math.max(3, J() * 1.15);
          add("block", x, y, bw, 1);
          if (g >= 4 && r() < 0.5) add("spikeDown", x + bw - 1.2, y - 1);
          x += bw + 1.8;
        }
      }
      x = Math.max(x, end);
      add("gravity", x, 0, 1, CEIL);
      return x + s * 0.8; // the fall back to the floor
    },
    crawler: (x0) => {
      const onBlock = g >= 4.6 && r() < 0.4;
      const a = 1.2 + r() * 1.6;
      const f = (2 * (1.2 + r() * 0.6)) / a;
      if (onBlock) {
        const len = a + 1 + J() * 1.8;
        add("block", x0, 0, len, 1);
        add("crawler", x0 + J() * 0.9, 1, a + 0.9, 0.55, { a, f, p: r() * Math.PI * 2 });
        return x0 + len;
      }
      add("crawler", x0, 0, a + 0.9, 0.55, { a, f, p: r() * Math.PI * 2 });
      return x0 + a + 1;
    },
    chomper: (x0) => {
      const k = g >= 5 && r() < 0.4 ? 2 : 1;
      for (let i = 0; i < k; i++) {
        const cx = x0 + i * (J() + 1.5);
        const f = (Math.PI * 2) / (1.5 + r() * 0.4);
        // Pops up (after its warning shake) just as the player gets there
        const c = 0.2 + r() * 0.15;
        add("chomper", cx, 0, 1, 1.5, { f, p: c * Math.PI * 2 - f * timeAt(cx) });
      }
      return x0 + (k - 1) * (J() + 1.5) + 1;
    },
    droneLow: (x0) => {
      // Jump the spike early, then run under the drone without jumping
      add("spike", x0, 0);
      const dx = x0 + 1 + J() * 0.55 + 1.4;
      add("drone", dx, 1.95, 1, 1, { a: 0.18, f: 2.2, p: r() * 6 });
      return dx + 1.2 + J() * 0.4;
    },
    droneHigh: (x0) => {
      const k = Math.min(2, maxSpikes());
      for (let i = 0; i < k; i++) add("spike", x0 + i, 0);
      add("drone", x0 + k / 2 - 0.5, 4.0, 1, 1, { a: 0.25, f: 1.8, p: r() * 6 });
      return x0 + k;
    },
    rail: (x0) => {
      const sx = x0;
      const a = 0.45 + r() * 0.35;
      const f = 2.4 + r() * 0.8;
      // Phased so the saw is at the bottom of its rail as the player arrives: it reads as a big
      // spike that you jump over, and it is the same on every attempt
      const tArr = timeAt(sx + 0.65 - 0.5);
      add("rail", sx, 1.25, 1.3, 1.3, { a, f, p: -Math.PI / 2 - f * tArr });
      return sx + 1.3;
    },
    speed: () => 0, // handled by the main loop
  };

  const runIn = s * (world === 0 ? 2.4 : 1.8);
  let x = runIn;
  const target = runIn + levelSec * speed0;
  const P = pool(world, stage);
  const total = P.reduce((a, [, w]) => a + w, 0);
  const choose = (): Chunk => {
    let k = r() * total;
    for (const [c, w] of P) if ((k -= w) <= 0) return c;
    return P[0][0];
  };
  const featured = world < FEATURED.length ? FEATURED[world] : null;
  const seen = new Set<Chunk>();
  let count = 0;
  let last: Chunk | null = null;
  let speedLeft = 0;
  let baseS = s;
  // Never less than half a jump plus a short reaction after the previous obstacle
  const rest = () => Math.max(s * restSec * (0.85 + r() * 0.4), J() * 0.55 + s * 0.2);

  while (x < target) {
    let c: Chunk;
    if (stage === 0 && featured && count % 2 === 1 && count < 9) c = featured;
    else if (world === 1 && stage === 4 && count % 2 === 1 && count < 9) c = "orb";
    else {
      c = choose();
      if (c === last && c !== "spikes" && r() < 0.7) c = choose();
    }
    if (speedLeft > 0 && (c === "glide" || c === "flip" || c === "speed")) c = "spikes";
    // Practice save point at the start of every second gap
    if (count > 0 && count % 2 === 0) add("check", x - rest() * 0.6, 0, 0.5, 1.5);

    if (c === "speed") {
      baseS = s;
      const fast = world < 7 || r() < 0.7;
      const v = fast ? Math.min(12.5, s * 1.3) : s * 0.8;
      add("speed", x, 0, 1, CEIL, { v });
      setSpeed(x - 0.5, v);
      if (!seen.has(c) && (stage === 0 || world >= 5)) hints.push({ x: x - 5, text: fast ? HINTS.speed! : "ประตูลูกศรถอย: ช้าลง" });
      seen.add(c);
      x += 2.5 + s * 0.4;
      speedLeft = 2 + Math.floor(r() * 2);
      count++;
      last = c;
      continue;
    }

    if (!seen.has(c) && HINTS[c] && ((world === worldIntro(c) && stage <= 4) || (c === "orb" && n === 15))) hints.push({ x: x - Math.max(6, s * 1.2), text: HINTS[c]! });
    seen.add(c);
    const end = chunkFns[c](x, d);
    x = end + rest();
    count++;
    last = c;
    if (speedLeft > 0 && --speedLeft === 0) {
      add("speed", x, 0, 1, CEIL, { v: baseS });
      setSpeed(x - 0.5, baseS);
      x += 2.5 + s * 0.4;
    }
  }
  if (speedLeft > 0) {
    add("speed", x, 0, 1, CEIL, { v: baseS });
    setSpeed(x - 0.5, baseS);
    x += 2;
  }
  const safeFrom = x;
  const length = x + s * finishRunUp(world);
  if (n === 1) hints.unshift({ x: runIn - 6, text: "แตะเพื่อกระโดดข้ามหนาม" });
  objs.sort((a, b) => a.x - b.x || a.id - b.id);
  return {
    n,
    world,
    stage,
    objs,
    length,
    speed: speed0,
    maxW: objs.reduce((m, o) => Math.max(m, o.w), 1),
    hints,
    coins,
    safeFrom,
  };
}

function worldIntro(c: Chunk): number {
  switch (c) {
    case "pad":
    case "padUp":
    case "orb":
      return 1;
    case "glide":
      return 2;
    case "flip":
      return 3;
    case "crawler":
    case "chomper":
    case "droneLow":
    case "droneHigh":
      return 4;
    case "rail":
    case "speed":
      return 5;
    default:
      return -1;
  }
}

/** Short list of what a level contains, for the map panel. */
export function levelTags(lv: Level): string[] {
  const has = (k: Kind) => lv.objs.some((o) => o.kind === k);
  const t: string[] = [];
  if (has("pad")) t.push("แท่นเด้ง");
  if (has("orb")) t.push("วงแหวน");
  if (has("glide")) t.push("ปีกร่อน");
  if (has("gravity")) t.push("กลับหัว");
  if (has("crawler") || has("chomper") || has("drone")) t.push("มอนสเตอร์");
  if (has("rail")) t.push("ใบเลื่อย");
  if (has("speed")) t.push("ความเร็ว");
  if (!t.length) t.push("หนาม", "บล็อก");
  return t;
}
