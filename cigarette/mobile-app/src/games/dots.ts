// Dots and boxes ("จุดต่อกล่อง") for 2–4 players around one device; any seat can be a bot.
// Draw one line per turn; close a box to claim it and go again.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, TAU, FONT_DISPLAY, glow, rgba, clamp, makeSprite } from "./engine/fx";
import { renderScale } from "./engine/quality";
import { SetupMenu } from "./engine/menu";
import { playerBar, DuelOver, IconButton, ICONS } from "./engine/duel";
import { pentatonic } from "./engine/audio";

export const dotsGame: GameDefinition = {
  id: "dots",
  title: "จุดต่อกล่อง",
  tagline: "2–4 คน ลากเส้นปิดกล่องให้ได้มากที่สุด",
  why: "เกมดินสอกับกระดาษที่เล่นกันได้ทั้งบ้าน ต้องระวังไม่เปิดทางให้คนอื่น ใจจดจ่อทุกตา",
  category: "party",
  minutes: "3–8 นาที",
  palette: ["#0c4a6e", "#fbbf24"],
  create: (env) => new Dots(env),
};

// ── Board helpers and bot (pure, so they can be simulated outside the canvas) ─────────────────
// Edge id: horizontal edges first ((n+1) rows × n), then vertical (n rows × (n+1)).

/** Edge ids around box (r, c): top, bottom, left, right. */
export function dotsBoxEdges(n: number, r: number, c: number) {
  const h = (n + 1) * n;
  return [r * n + c, (r + 1) * n + c, h + r * (n + 1) + c, h + r * (n + 1) + c + 1];
}

/** Boxes touching an edge. */
export function dotsEdgeBoxes(n: number, e: number): [number, number][] {
  const h = (n + 1) * n;
  const out: [number, number][] = [];
  if (e < h) {
    const r = Math.floor(e / n);
    const c = e % n;
    if (r > 0) out.push([r - 1, c]);
    if (r < n) out.push([r, c]);
  } else {
    const k = e - h;
    const r = Math.floor(k / (n + 1));
    const c = k % (n + 1);
    if (c > 0) out.push([r, c - 1]);
    if (c < n) out.push([r, c]);
  }
  return out;
}

function sidesOf(n: number, edges: number[], r: number, c: number) {
  let s = 0;
  for (const e of dotsBoxEdges(n, r, c)) if (edges[e]) s++;
  return s;
}

/** How many boxes the next player could grab in a row after edge e is drawn. */
function giveaway(n: number, src: number[], e: number) {
  const edges = src.slice();
  edges[e] = 9;
  let taken = 0;
  for (;;) {
    let found = -1;
    for (let r = 0; r < n && found < 0; r++)
      for (let c = 0; c < n; c++) {
        if (sidesOf(n, edges, r, c) === 3) {
          found = dotsBoxEdges(n, r, c).find((x) => !edges[x])!;
          break;
        }
      }
    if (found < 0) break;
    edges[found] = 9;
    for (const [r, c] of dotsEdgeBoxes(n, found)) if (sidesOf(n, edges, r, c) === 4) taken++;
  }
  return taken;
}

/**
 * Picks the bot's edge. Levels:
 * 0 ง่าย  — skips an open box about 40% of the time, often draws a third side for no reason,
 *           never counts chains. A careful beginner should win most games.
 * 1 กลาง  — always takes open boxes, plays safe lines while there are any, then picks at random.
 * 2 เก่ง  — as กลาง, but when every line gives something away it gives away the shortest chain.
 */
export function dotsBotMove(n: number, edges: number[], level: number, rand: () => number = Math.random): number {
  const pick = (a: number[]) => a[Math.floor(rand() * a.length)];
  const free: number[] = [];
  for (let i = 0; i < edges.length; i++) if (!edges[i]) free.push(i);
  const isCapture = (e: number) => dotsEdgeBoxes(n, e).some(([r, c]) => sidesOf(n, edges, r, c) === 3);
  const isSafe = (e: number) => dotsEdgeBoxes(n, e).every(([r, c]) => sidesOf(n, edges, r, c) < 2);
  const completes = free.filter(isCapture);
  if (level <= 0) {
    if (completes.length && rand() < 0.6) return pick(completes);
    const rest = free.filter((e) => !isCapture(e));
    if (!rest.length) return pick(free);
    const safe = rest.filter(isSafe);
    const opens = rest.filter((e) => !isSafe(e)); // draws a third side somewhere
    if (opens.length && (!safe.length || rand() < 0.4)) return pick(opens);
    return pick(safe.length ? safe : rest);
  }
  if (completes.length) return pick(completes);
  const safe = free.filter(isSafe);
  if (safe.length) return pick(safe);
  if (level === 1) return pick(free);
  let best = free[0];
  let bestG = Infinity;
  for (const e of free) {
    const g = giveaway(n, edges, e) + rand() * 0.1;
    if (g < bestG) {
      bestG = g;
      best = e;
    }
  }
  return best;
}

const COLORS = ["#38bdf8", "#f87171", "#4ade80", "#facc15"];
const NAMES = ["ฟ้า", "แดง", "เขียว", "เหลือง"];
const LV = ["ง่าย", "กลาง", "เก่ง"];

/** Edge id: horizontal edges first (n+1 rows × n), then vertical (n rows × n+1). */
class Dots implements GameInstance {
  private w = 0;
  private h = 0;
  private n = 4;
  private edges: number[] = []; // 0 empty, else player+1
  private boxes: number[] = [];
  private lastEdge = -1;
  private players = 2;
  private humans = [true, false, false, false];
  private level = 1;
  private turn = 0;
  private score = [0, 0, 0, 0];
  private state: "menu" | "play" | "over" = "menu";
  private time = 0;
  private menu: SetupMenu;
  private over: DuelOver;
  private thinkT = -1;
  private endT = -1;
  private particles = new Particles();
  private earned = 0;
  private boxT: number[] = [];
  private gx = 0;
  private gy = 0;
  private gs = 40;
  private history: { edges: number[]; boxes: number[]; turn: number; score: number[] }[] = [];
  private btnUndo = new IconButton("ย้อน", ICONS.undo);
  private btnRestart = new IconButton("เริ่มใหม่", ICONS.restart);
  private btnMenu = new IconButton("เมนู", ICONS.menu);

  constructor(private env: GameEnv) {
    this.menu = new SetupMenu(env, {
      title: "จุดต่อกล่อง",
      subtitle: "ปิดกล่องได้ เล่นต่ออีกตา",
      accent: "#0284c7",
      rows: [
        {
          key: "players",
          label: "จำนวนผู้เล่น",
          choices: [
            { value: "2", label: "2 คน" },
            { value: "3", label: "3 คน" },
            { value: "4", label: "4 คน" },
          ],
        },
        {
          key: "humans",
          label: "คนจริงกี่คน (ที่เหลือเป็นบอท)",
          choices: [
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
          ],
        },
        {
          key: "level",
          label: "ฝีมือบอท",
          choices: [
            { value: "0", label: "ง่าย" },
            { value: "1", label: "กลาง" },
            { value: "2", label: "เก่ง" },
          ],
        },
        {
          key: "size",
          label: "ขนาดกระดาน",
          choices: [
            { value: "3", label: "3×3 กล่อง" },
            { value: "4", label: "4×4" },
            { value: "5", label: "5×5" },
            { value: "6", label: "6×6" },
          ],
        },
      ],
      icon: (c) => {
        c.strokeStyle = "#38bdf8";
        c.lineWidth = 4;
        c.strokeRect(-20, -24, 40, 40);
        c.fillStyle = "rgba(56,189,248,0.35)";
        c.fillRect(-20, -24, 40, 40);
        c.fillStyle = "#ffffff";
        for (const [x, y] of [
          [-20, -24],
          [20, -24],
          [-20, 16],
          [20, 16],
        ]) {
          c.beginPath();
          c.arc(x, y, 4, 0, TAU);
          c.fill();
        }
      },
    });
    this.over = new DuelOver("#0284c7");
  }

  private get hCount() {
    return (this.n + 1) * this.n;
  }

  /** Boxes touching an edge. */
  private edgeBoxes(e: number): [number, number][] {
    return dotsEdgeBoxes(this.n, e);
  }

  private sides(edges: number[], r: number, c: number) {
    return sidesOf(this.n, edges, r, c);
  }

  private start() {
    const v = this.menu.values;
    this.players = +v.players || 2;
    const nh = clamp(+v.humans || 1, 1, this.players);
    this.humans = [0, 1, 2, 3].map((i) => i < nh);
    this.level = +v.level || 0;
    this.n = +v.size || 4;
    this.edges = new Array(this.hCount * 2).fill(0);
    this.boxes = new Array(this.n * this.n).fill(0);
    this.boxT = new Array(this.n * this.n).fill(0);
    this.score = [0, 0, 0, 0];
    this.turn = 0;
    this.lastEdge = -1;
    this.history = [];
    this.endT = -1;
    this.state = "play";
    this.layout();
    this.thinkT = this.humans[0] ? -1 : 0.6;
    this.env.emit({ type: "start" });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.layout();
  }

  private layout() {
    const top = this.players > 2 ? 110 : 66;
    const bottom = 120;
    const size = Math.min(this.w - 50, this.h - top - bottom);
    this.gs = size / this.n;
    this.gx = (this.w - size) / 2;
    this.gy = top + (this.h - top - bottom - size) / 2;
  }

  private edgePts(e: number) {
    const n = this.n;
    if (e < this.hCount) {
      const r = Math.floor(e / n);
      const c = e % n;
      return [this.gx + c * this.gs, this.gy + r * this.gs, this.gx + (c + 1) * this.gs, this.gy + r * this.gs];
    }
    const k = e - this.hCount;
    const r = Math.floor(k / (n + 1));
    const c = k % (n + 1);
    return [this.gx + c * this.gs, this.gy + r * this.gs, this.gx + c * this.gs, this.gy + (r + 1) * this.gs];
  }

  private play(e: number) {
    if (this.edges[e]) return;
    this.history.push({ edges: this.edges.slice(), boxes: this.boxes.slice(), turn: this.turn, score: this.score.slice() });
    this.edges[e] = this.turn + 1;
    this.lastEdge = e;
    let closed = 0;
    for (const [r, c] of this.edgeBoxes(e)) {
      if (this.sides(this.edges, r, c) === 4) {
        this.boxes[r * this.n + c] = this.turn + 1;
        this.boxT[r * this.n + c] = 0;
        this.score[this.turn]++;
        closed++;
        this.particles.burst(this.gx + (c + 0.5) * this.gs, this.gy + (r + 0.5) * this.gs, COLORS[this.turn], 16, { speed: 160, size: 3, gravity: 0 });
      }
    }
    if (closed) this.env.sfx.chime(pentatonic(4 + this.score[this.turn] % 6), 0.09);
    else this.env.sfx.tone({ freq: 420, dur: 0.05, vol: 0.05, type: "triangle" });
    if (this.boxes.every((b) => b)) {
      this.endT = 1.4;
      return;
    }
    if (!closed) this.turn = (this.turn + 1) % this.players;
    if (!this.humans[this.turn]) this.thinkT = closed ? 0.3 : 0.5 + Math.random() * 0.3;
  }

  // ── Bot ──────────────────────────────────────────────────────────────────

  private botPlay() {
    this.play(dotsBotMove(this.n, this.edges, this.level));
  }

  // ── Input ────────────────────────────────────────────────────────────────

  pointer(p: PointerInfo) {
    if (this.state === "menu") {
      if (this.menu.pointer(p)) this.start();
      return;
    }
    if (this.state === "over") {
      const a = this.over.pointer(p.type, p.x, p.y);
      if (a === "again") this.start();
      if (a === "setup") {
        this.state = "menu";
        this.menu.reset();
      }
      return;
    }
    const btns = [this.btnUndo, this.btnRestart, this.btnMenu];
    if (p.type === "down") for (const b of btns) b.pressed = b.hit(p.x, p.y);
    if (p.type === "up") {
      const b = btns.find((x) => x.pressed && x.hit(p.x, p.y));
      for (const x of btns) x.pressed = false;
      if (b === this.btnUndo) this.undo();
      if (b === this.btnRestart) this.start();
      if (b === this.btnMenu) {
        this.state = "menu";
        this.menu.reset();
      }
      return;
    }
    if (p.type !== "down" || !this.humans[this.turn] || this.endT > 0) return;
    // Nearest free edge to the tap
    let best = -1;
    let bestD = this.gs * 0.4;
    for (let e = 0; e < this.edges.length; e++) {
      if (this.edges[e]) continue;
      const [x1, y1, x2, y2] = this.edgePts(e);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const d = x1 === x2 ? Math.max(Math.abs(p.x - mx), Math.abs(p.y - my) - this.gs * 0.4) : Math.max(Math.abs(p.y - my), Math.abs(p.x - mx) - this.gs * 0.4);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best >= 0) this.play(best);
  }

  private undo() {
    if (this.endT > 0) return;
    // Step back to the last human turn
    while (this.history.length) {
      const h = this.history.pop()!;
      this.edges = h.edges;
      this.boxes = h.boxes;
      this.turn = h.turn;
      this.score = h.score;
      if (this.humans[this.turn]) break;
    }
    this.lastEdge = -1;
    this.thinkT = this.humans[this.turn] ? -1 : 0.5;
  }

  key(code: string, down: boolean) {
    if (down && this.state === "menu" && this.menu.key(code)) {
      this.start();
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.time += dt;
    this.particles.update(dt);
    for (let i = 0; i < this.boxT.length; i++) this.boxT[i] += dt;
    if (this.state === "menu") this.menu.update(dt);
    if (this.state === "over") this.over.update(dt);
    if (this.state !== "play") return;
    if (this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.finish();
      return;
    }
    if (this.thinkT > 0) {
      this.thinkT -= dt;
      if (this.thinkT <= 0 && !this.humans[this.turn]) this.botPlay();
    }
  }

  private winners() {
    const best = Math.max(...this.score.slice(0, this.players));
    return [0, 1, 2, 3].filter((i) => i < this.players && this.score[i] === best);
  }

  private finish() {
    this.state = "over";
    this.over.t = 0;
    const win = this.winners();
    const humanWon = win.some((i) => this.humans[i]);
    const allHuman = this.humans.slice(0, this.players).every(Boolean);
    this.earned = allHuman ? 6 : humanWon ? Math.min(50, 10 + this.level * 10 + this.n) : 3;
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: Math.max(...this.score),
      best: 0,
      summary: `จุดต่อกล่อง ${this.n}×${this.n} · ${win.map((i) => NAMES[i]).join(", ")} ชนะ`,
      stats: { players: this.players, size: this.n },
    });
  }

  private bgSpr: HTMLCanvasElement | null = null;
  private bgKey = "";

  render() {
    const c = this.env.ctx;
    const { w, h } = this;
    const showBoard = this.state !== "menu" || this.history.length > 0;
    // Background gradient and the paper grid lines: one cached layer.
    const bkey = `${w}x${h}@${renderScale()}|${showBoard ? this.gx : "-"}`;
    if (!this.bgSpr || this.bgKey !== bkey) {
      this.bgKey = bkey;
      this.bgSpr = makeSprite(w, h, renderScale(), (cc) => {
        const g = cc.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#0b1530");
        g.addColorStop(1, "#122347");
        cc.fillStyle = g;
        cc.fillRect(0, 0, w, h);
        if (!showBoard) return;
        // Paper grid feel
        cc.strokeStyle = "rgba(148,180,255,0.06)";
        cc.lineWidth = 1;
        for (let x = (this.gx % 20) - 20; x < w; x += 20) {
          cc.beginPath();
          cc.moveTo(x, 0);
          cc.lineTo(x, h);
          cc.stroke();
        }
      });
    }
    c.drawImage(this.bgSpr, 0, 0, w, h);
    if (showBoard) {
      // Boxes
      for (let i = 0; i < this.boxes.length; i++) {
        const o = this.boxes[i];
        if (!o) continue;
        const r = Math.floor(i / this.n);
        const col = i % this.n;
        const k = clamp(this.boxT[i] * 4, 0, 1);
        const x = this.gx + col * this.gs;
        const y = this.gy + r * this.gs;
        c.fillStyle = rgba(COLORS[o - 1], 0.3 * k);
        c.fillRect(x + 3, y + 3, this.gs - 6, this.gs - 6);
        c.font = `800 ${Math.round(this.gs * 0.2 * k)}px ${FONT_DISPLAY}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = COLORS[o - 1];
        c.fillText(NAMES[o - 1], x + this.gs / 2, y + this.gs / 2);
      }
      // Edges
      c.lineCap = "round";
      for (let e = 0; e < this.edges.length; e++) {
        const [x1, y1, x2, y2] = this.edgePts(e);
        const o = this.edges[e];
        c.strokeStyle = o ? COLORS[o - 1] : "rgba(255,255,255,0.07)";
        c.lineWidth = o ? 6 : 3;
        if (e === this.lastEdge) {
          c.shadowColor = COLORS[o - 1];
          c.shadowBlur = 14;
        }
        c.beginPath();
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
        c.shadowBlur = 0;
      }
      c.fillStyle = "#f8fafc";
      for (let r = 0; r <= this.n; r++)
        for (let col = 0; col <= this.n; col++) {
          c.beginPath();
          c.arc(this.gx + col * this.gs, this.gy + r * this.gs, 5, 0, TAU);
          c.fill();
        }
      // Player bars (two rows when 3–4 players)
      const bw = (w - 30) / 2;
      for (let i = 0; i < this.players; i++) {
        const x = 10 + (i % 2) * (bw + 10);
        const y = 12 + Math.floor(i / 2) * 46;
        playerBar(c, x, y, bw, {
          name: this.humans[i] ? NAMES[i] : `บอท${NAMES[i]} (${LV[this.level]})`,
          color: COLORS[i],
          active: this.turn === i && this.state === "play" && this.endT < 0,
          thinking: !this.humans[i] && this.turn === i && this.state === "play",
          right: `${this.score[i]}`,
          time: this.time,
        });
      }
      const ty = Math.min(this.gy + this.n * this.gs + 64, h - 36);
      [this.btnUndo, this.btnRestart, this.btnMenu].forEach((b, i) => {
        b.place(w / 2 + (i - 1) * 84, ty, 20);
        b.render(c, b !== this.btnUndo || this.history.length > 0);
      });
      if (this.humans[this.turn] && this.state === "play" && this.endT < 0) {
        glow(c, w / 2, this.gy + this.n * this.gs + 22, 40, COLORS[this.turn], 0.2);
        c.font = `700 13px ${FONT_DISPLAY}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = COLORS[this.turn];
        c.fillText(`ตา${NAMES[this.turn]} · แตะระหว่างจุดเพื่อลากเส้น`, w / 2, this.gy + this.n * this.gs + 22);
      }
    }
    this.particles.render(c);
    if (this.state === "menu") this.menu.render(c, w, h);
    if (this.state === "over") {
      const win = this.winners();
      this.over.render(c, w, h, {
        title: win.length > 1 ? "เสมอกัน!" : `${NAMES[win[0]]}ชนะ!`,
        subtitle: [0, 1, 2, 3]
          .slice(0, this.players)
          .map((i) => `${NAMES[i]} ${this.score[i]}`)
          .join(" · "),
        coins: this.earned,
        chips: [`${this.n}×${this.n}`, `${this.players} ผู้เล่น`],
        accent: "#0284c7",
      });
    }
  }
}
