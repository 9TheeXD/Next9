// Neon Pulse physics. Pure functions over plain data (no canvas, no audio), so the game and the
// offline level solver step exactly the same rules. Units: 1 = one player cube; y grows upwards,
// the floor is y = 0 and the ceiling of flipped / glide sections is y = CEIL.

export const G = 80; // gravity, units/s²
export const JUMP = 18.6; // jump speed, units/s
export const PAD_V = JUMP * 1.5;
export const ORB_V = JUMP * 1.05;
export const CEIL = 8;
export const SUB = 1 / 240; // physics sub-step
export const BUF = 0.12; // a tap counts for this long (press slightly before landing still jumps)
export const AIR = (2 * JUMP) / G; // time in the air for one ground jump

export type Kind =
  | "block"
  | "spike"
  | "spikeDown"
  | "pad"
  | "orb"
  | "gravity"
  | "glide"
  | "cube"
  | "speed"
  | "coin"
  | "saw"
  | "rail"
  | "drone"
  | "crawler"
  | "chomper"
  | "check";

export interface Obj {
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  id: number;
  /** Motion amplitude (rail, drone: vertical units; crawler: patrol length). */
  a: number;
  /** Motion phase in radians at t = 0. */
  p: number;
  /** Motion speed in radians per second. */
  f: number;
  /** Speed portals: the new running speed. Pads on the ceiling: -1. */
  v: number;
}

export interface Hint {
  x: number;
  text: string;
}

export interface Level {
  n: number;
  world: number; // 0-based world index (10 levels each, endless)
  stage: number; // 0..9 inside the world
  objs: Obj[]; // sorted by x
  length: number; // the finish line
  speed: number; // starting speed
  maxW: number; // widest object, for the broad-phase search
  hints: Hint[];
  coins: number; // collectible coins in the level
  safeFrom: number; // x after which nothing can hurt (finish run-up)
}

export interface Run {
  px: number;
  py: number;
  vy: number;
  grav: number; // 1 normal, -1 upside down
  glide: boolean;
  onGround: boolean;
  rot: number;
  hasCeil: boolean;
  held: boolean;
  buf: number;
  speed: number;
  t: number; // seconds since the run started (drives moving hazards)
  used: Uint8Array; // per object: pad/orb/portal/coin/check consumed
  state: 0 | 1 | 2; // 0 running, 1 dead, 2 finished
}

export type SimEvent = "jump" | "pad" | "orb" | "flip" | "glide" | "cube" | "speed" | "coin" | "check" | "die" | "done";

export function newRun(lv: Level): Run {
  return {
    px: 0,
    py: 0,
    vy: 0,
    grav: 1,
    glide: false,
    onGround: true,
    rot: 0,
    hasCeil: false,
    held: false,
    buf: 0,
    speed: lv.speed,
    t: 0,
    used: new Uint8Array(lv.objs.length),
    state: 0,
  };
}

export function cloneRun(r: Run): Run {
  return { ...r, used: r.used.slice() };
}

export function setHeld(r: Run, down: boolean) {
  if (down && !r.held) r.buf = BUF;
  r.held = down;
}

// ── Moving hazards: position as a function of the run clock ───────────────

export function droneY(o: Obj, t: number) {
  return o.y + o.a * Math.sin(o.f * t + o.p);
}

export function railY(o: Obj, t: number) {
  return o.y + o.a * Math.sin(o.f * t + o.p);
}

/** Crawler centre x: walks back and forth over [o.x, o.x + o.a]. */
export function crawlerX(o: Obj, t: number) {
  return o.x + 0.45 + o.a * (0.5 - 0.5 * Math.cos(o.f * t + o.p));
}

/** Chomper: 0 hidden .. 1 fully up, plus a 0..1 warning shake before it rises. */
export function chomper(o: Obj, t: number): { up: number; warn: number } {
  const c = ((((o.f * t + o.p) / (Math.PI * 2)) % 1) + 1) % 1;
  // 0..0.12 rise, 0.12..0.42 up, 0.42..0.52 sink, 0.52..0.78 hidden, 0.78..1 warning
  let up = 0;
  if (c < 0.12) up = c / 0.12;
  else if (c < 0.42) up = 1;
  else if (c < 0.52) up = 1 - (c - 0.42) / 0.1;
  const warn = c > 0.78 ? (c - 0.78) / 0.22 : 0;
  return { up, warn };
}

const CHOMP_H = 1.5;

/** Distance from point to the player's (slightly inset) box. */
function boxDist(r: Run, cx: number, cy: number, inset: number) {
  const dx = Math.max(r.px + inset - cx, 0, cx - (r.px + 1 - inset));
  const dy = Math.max(r.py + inset - cy, 0, cy - (r.py + 1 - inset));
  return Math.hypot(dx, dy);
}

function lowerBound(objs: Obj[], x: number) {
  let lo = 0;
  let hi = objs.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (objs[m].x < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function overlap(r: Run, o: Obj, pad = 0) {
  return r.px + 1 - pad > o.x && r.px + pad < o.x + o.w && r.py + 1 - pad > o.y && r.py + pad < o.y + o.h;
}

/** One physics sub-step. `ev` hears about things worth a sound or an effect. */
export function step(r: Run, lv: Level, dt: number, ev?: (e: SimEvent, o?: Obj) => void) {
  if (r.state !== 0) return;
  const prevY = r.py;
  r.t += dt;
  r.px += r.speed * dt;
  r.buf = Math.max(0, r.buf - dt);

  if (r.glide) {
    const lift = r.held ? 1 : -1;
    r.vy += lift * 70 * dt * r.grav;
    if (r.vy > 11) r.vy = 11;
    else if (r.vy < -11) r.vy = -11;
    r.rot = -Math.atan2(r.vy, r.speed);
  } else {
    r.vy -= G * r.grav * dt;
    if (r.vy > 30) r.vy = 30;
    else if (r.vy < -30) r.vy = -30;
    if (r.onGround && (r.held || r.buf > 0)) {
      r.vy = JUMP * r.grav;
      r.onGround = false;
      r.buf = 0;
      ev?.("jump");
    }
  }
  r.py += r.vy * dt;
  let grounded = false;

  if (r.py <= 0) {
    r.py = 0;
    if (r.vy < 0) r.vy = 0;
    grounded = r.grav === 1;
  }
  if (r.hasCeil && r.py + 1 >= CEIL) {
    r.py = CEIL - 1;
    if (r.vy > 0) r.vy = 0;
    grounded = r.grav === -1;
  }

  const objs = lv.objs;
  const used = r.used;
  for (let i = lowerBound(objs, r.px - 1.2 - lv.maxW); i < objs.length; i++) {
    const o = objs[i];
    if (o.x > r.px + 2) break;
    if (o.x + o.w < r.px - 0.2) continue;
    switch (o.kind) {
      case "block": {
        if (!overlap(r, o)) break;
        const top = o.y + o.h;
        if (r.grav === 1 && prevY >= top - 0.25 && r.vy <= 0) {
          r.py = top;
          r.vy = 0;
          grounded = true;
        } else if (r.grav === -1 && prevY + 1 <= o.y + 0.25 && r.vy >= 0) {
          r.py = o.y - 1;
          r.vy = 0;
          grounded = true;
        } else if (r.glide && r.grav === 1 && prevY + 1 <= o.y + 0.25 && r.vy >= 0) {
          // Gliding into a ceiling slab from below: slide along it
          r.py = o.y - 1;
          r.vy = 0;
        } else return die(r, ev);
        break;
      }
      case "spike":
        if (r.px + 0.85 > o.x + 0.3 && r.px + 0.15 < o.x + 0.7 && r.py + 0.1 < o.y + 0.6 && r.py + 1 > o.y) return die(r, ev);
        break;
      case "spikeDown":
        if (r.px + 0.85 > o.x + 0.3 && r.px + 0.15 < o.x + 0.7 && r.py + 0.9 > o.y + 0.4 && r.py < o.y + 1) return die(r, ev);
        break;
      case "saw":
        if (boxDist(r, o.x + o.w / 2, o.y + o.h / 2, 0.12) < o.w * 0.42) return die(r, ev);
        break;
      case "rail":
        if (boxDist(r, o.x + o.w / 2, railY(o, r.t), 0.12) < o.w * 0.42) return die(r, ev);
        break;
      case "drone":
        if (boxDist(r, o.x + 0.5, droneY(o, r.t), 0.15) < 0.4) return die(r, ev);
        break;
      case "crawler": {
        const cx = crawlerX(o, r.t);
        if (r.px + 0.85 > cx - 0.38 && r.px + 0.15 < cx + 0.38 && r.py + 0.1 < o.y + 0.55 && r.py + 1 > o.y) return die(r, ev);
        break;
      }
      case "chomper": {
        const { up } = chomper(o, r.t);
        const top = o.y + CHOMP_H * up - 0.15;
        if (up > 0.1 && r.px + 0.85 > o.x + 0.15 && r.px + 0.15 < o.x + 0.85 && r.py + 0.1 < top && r.py + 1 > o.y) return die(r, ev);
        break;
      }
      case "pad":
        if (!used[i] && !r.glide && overlap(r, o, -0.1)) {
          used[i] = 1;
          r.vy = PAD_V * r.grav;
          r.onGround = false;
          grounded = false;
          ev?.("pad", o);
        }
        break;
      case "orb":
        if (!used[i] && !r.glide && (r.buf > 0 || r.held) && overlap(r, o, -0.35)) {
          used[i] = 1;
          r.buf = 0;
          r.vy = ORB_V * r.grav;
          grounded = false;
          ev?.("orb", o);
        }
        break;
      case "gravity":
        if (!used[i] && r.px + 0.5 > o.x) {
          used[i] = 1;
          r.grav = -r.grav;
          r.hasCeil = r.grav === -1 || r.glide;
          r.vy *= 0.3;
          grounded = false;
          ev?.("flip", o);
        }
        break;
      case "glide":
        if (!used[i] && r.px + 0.5 > o.x) {
          used[i] = 1;
          r.glide = true;
          r.hasCeil = true;
          ev?.("glide", o);
        }
        break;
      case "cube":
        if (!used[i] && r.px + 0.5 > o.x) {
          used[i] = 1;
          r.glide = false;
          r.hasCeil = r.grav === -1;
          r.rot = 0;
          ev?.("cube", o);
        }
        break;
      case "speed":
        if (!used[i] && r.px + 0.5 > o.x) {
          used[i] = 1;
          r.speed = o.v;
          ev?.("speed", o);
        }
        break;
      case "coin":
        if (!used[i] && overlap(r, o, -0.12)) {
          used[i] = 1;
          ev?.("coin", o);
        }
        break;
      case "check":
        if (!used[i] && r.px > o.x && r.px < o.x + 4 && !r.glide && r.grav === 1 && grounded) {
          used[i] = 1;
          ev?.("check", o);
        }
        break;
    }
  }

  r.onGround = grounded;
  if (!r.glide) {
    if (grounded) {
      const q = Math.round(r.rot / (Math.PI / 2)) * (Math.PI / 2);
      r.rot += (q - r.rot) * Math.min(1, dt * 30);
    } else r.rot += dt * 7.2 * r.grav;
  }
  if (r.px >= lv.length) {
    r.state = 2;
    ev?.("done");
  }
}

function die(r: Run, ev?: (e: SimEvent, o?: Obj) => void) {
  r.state = 1;
  ev?.("die");
}

/** Advance one 60 Hz frame (4 sub-steps), as the solver does. */
export function frame(r: Run, lv: Level) {
  for (let k = 0; k < 4 && r.state === 0; k++) step(r, lv, SUB);
}
