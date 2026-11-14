// Thai checkers ("หมากฮอส"): eight men each on the two nearest rows. Men step diagonally forward
// and capture forward; reaching the far row makes a king ("ฮอส") that flies along diagonals and
// must land right behind the piece it captures. Captures are compulsory and can chain.

import type { GameDefinition, GameEnv } from "./engine/types";
import { TurnDuel, type Side } from "./engine/turnduel";
import { clamp, roundRectPath, TAU, ease, FONT_DISPLAY } from "./engine/fx";
import { pentatonic } from "./engine/audio";

export const checkersGame: GameDefinition = {
  id: "checkers",
  title: "หมากฮอส",
  tagline: "หมากฮอสแบบไทย สู้บอทหรือเพื่อน",
  why: "เกมกระดานที่คนไทยคุ้นเคย ต้องคอยดูว่าตัวไหนจะโดนกิน ใจจดจ่อทั้งตา",
  category: "duel",
  minutes: "5–15 นาที",
  palette: ["#7c2d12", "#fde68a"],
  create: (env) => new Checkers(env),
};

interface Mv {
  from: number;
  path: number[];
  caps: number[];
  promote: boolean;
}

/** Pieces: 1 / 2 men, 3 / 4 kings of side 1 / 2. */
const sideOf = (p: number) => (p === 1 || p === 3 ? 1 : p === 2 || p === 4 ? 2 : 0);
const isKing = (p: number) => p >= 3;

function gen(cells: number[], side: number): Mv[] {
  const caps: Mv[] = [];
  const quiet: Mv[] = [];
  const fwd = side === 1 ? -1 : 1;
  const lastRow = side === 1 ? 0 : 7;
  for (let i = 0; i < 64; i++) {
    const p = cells[i];
    if (sideOf(p) !== side) continue;
    const r0 = i >> 3;
    const c0 = i & 7;
    if (!isKing(p)) {
      // Captures (forward only), chained
      const dfs = (r: number, c: number, path: number[], taken: number[]) => {
        let ext = false;
        for (const dc of [-1, 1]) {
          const mr = r + fwd;
          const mc = c + dc;
          const lr = r + 2 * fwd;
          const lc = c + 2 * dc;
          if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
          const mid = mr * 8 + mc;
          const land = lr * 8 + lc;
          if (sideOf(cells[mid]) === 3 - side && !taken.includes(mid) && (cells[land] === 0 || land === i)) {
            ext = true;
            if (lr === lastRow) caps.push({ from: i, path: [...path, land], caps: [...taken, mid], promote: true });
            else dfs(lr, lc, [...path, land], [...taken, mid]);
          }
        }
        if (!ext && taken.length) caps.push({ from: i, path, caps: taken, promote: false });
      };
      dfs(r0, c0, [], []);
      for (const dc of [-1, 1]) {
        const r = r0 + fwd;
        const c = c0 + dc;
        if (r < 0 || r > 7 || c < 0 || c > 7) continue;
        if (!cells[r * 8 + c]) quiet.push({ from: i, path: [r * 8 + c], caps: [], promote: r === lastRow });
      }
    } else {
      const dfs = (r: number, c: number, path: number[], taken: number[]) => {
        let ext = false;
        for (const [dr, dc] of [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ]) {
          let rr = r + dr;
          let cc = c + dc;
          while (rr >= 0 && rr <= 7 && cc >= 0 && cc <= 7 && (cells[rr * 8 + cc] === 0 || rr * 8 + cc === i)) {
            rr += dr;
            cc += dc;
          }
          if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
          const mid = rr * 8 + cc;
          const lr = rr + dr;
          const lc = cc + dc;
          if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
          const land = lr * 8 + lc;
          if (sideOf(cells[mid]) === 3 - side && !taken.includes(mid) && (cells[land] === 0 || land === i)) {
            ext = true;
            dfs(lr, lc, [...path, land], [...taken, mid]);
          }
        }
        if (!ext && taken.length) caps.push({ from: i, path, caps: taken, promote: false });
      };
      dfs(r0, c0, [], []);
      for (const [dr, dc] of [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]) {
        let r = r0 + dr;
        let c = c0 + dc;
        while (r >= 0 && r <= 7 && c >= 0 && c <= 7 && !cells[r * 8 + c]) {
          quiet.push({ from: i, path: [r * 8 + c], caps: [], promote: false });
          r += dr;
          c += dc;
        }
      }
    }
  }
  return caps.length ? caps : quiet;
}

function apply(cells: number[], m: Mv) {
  const p = cells[m.from];
  cells[m.from] = 0;
  for (const c of m.caps) cells[c] = 0;
  const to = m.path[m.path.length - 1];
  cells[to] = m.promote ? (sideOf(p) === 1 ? 3 : 4) : p;
}

interface St {
  cells: number[];
  quiet: number;
}

class Checkers extends TurnDuel<St> {
  private cells: number[] = [];
  private quiet = 0;
  private sel = -1;
  private targets: Mv[] = [];
  private anim: { m: Mv; piece: number; t: number; capsCells: number[] } | null = null;
  private cs = 40;
  private lastMove: Mv | null = null;

  constructor(env: GameEnv) {
    super(env, {
      title: "หมากฮอส",
      subtitle: "กติกาไทย บังคับกิน กินต่อได้",
      accent: "#c2410c",
      colors: ["#f8fafc", "#dc2626"],
      sideNames: ["ขาว", "แดง"],
      pickSide: true,
      icon: (c) => {
        this.man(c, -20, -4, 16, 1, false);
        this.man(c, 20, -4, 16, 2, true);
      },
    });
  }

  setup() {
    this.cells = new Array(64).fill(0);
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0) continue;
        if (r <= 1) this.cells[r * 8 + c] = 2;
        if (r >= 6) this.cells[r * 8 + c] = 1;
      }
    this.quiet = 0;
    this.sel = -1;
    this.targets = [];
    this.anim = null;
    this.lastMove = null;
  }
  snapshot(): St {
    return { cells: this.cells.slice(), quiet: this.quiet };
  }
  restore(s: St) {
    this.cells = s.cells.slice();
    this.quiet = s.quiet;
    this.sel = -1;
    this.targets = [];
    this.anim = null;
    this.lastMove = null;
  }
  layoutBoard(x: number, y: number, w: number, h: number) {
    this.cs = Math.floor(Math.min(w, h - 10) / 8);
    const s = this.cs * 8;
    this.board = { x: x + (w - s) / 2, y: y + (h - s) / 2, w: s, h: s };
  }

  private flipView() {
    return this.mode === "bot" && this.human === 2;
  }

  private pos(i: number) {
    let r = i >> 3;
    let c = i & 7;
    if (this.flipView()) {
      r = 7 - r;
      c = 7 - c;
    }
    return { x: this.board.x + (c + 0.5) * this.cs, y: this.board.y + (r + 0.5) * this.cs };
  }

  private doMove(m: Mv) {
    this.beforeMove();
    const piece = this.cells[m.from];
    const capsCells = m.caps.map((c) => this.cells[c]);
    apply(this.cells, m);
    this.anim = { m, piece, t: 0, capsCells };
    this.lastMove = m;
    this.sel = -1;
    this.targets = [];
    this.quiet = m.caps.length || m.promote ? 0 : this.quiet + 1;
    m.path.forEach((_, k) => this.env.sfx.tone({ freq: 220 + k * 40, dur: 0.06, vol: 0.08, type: "triangle", delay: k * 0.16 }));
    if (m.caps.length) this.env.sfx.noise({ dur: 0.12, vol: 0.06, freq: 900, type: "bandpass", delay: 0.1 });
    if (m.promote) this.env.sfx.chime(pentatonic(8), 0.1, m.path.length * 0.16);
    const side = this.turn;
    const opp: Side = side === 1 ? 2 : 1;
    if (!gen(this.cells, opp).length) {
      const none = !this.cells.some((p) => sideOf(p) === opp);
      return this.endMove(opp, side, none ? "กินหมดกระดาน" : "อีกฝ่ายไม่มีตาเดิน");
    }
    if (this.quiet >= 60) return this.endMove(opp, 3, "เดิน 60 ตาไม่มีใครกิน");
    this.endMove(opp);
  }

  tapBoard(x: number, y: number) {
    if (this.anim) return;
    const b = this.board;
    let c = Math.floor((x - b.x) / this.cs);
    let r = Math.floor((y - b.y) / this.cs);
    if (c < 0 || r < 0 || c > 7 || r > 7) return;
    if (this.flipView()) {
      c = 7 - c;
      r = 7 - r;
    }
    const i = r * 8 + c;
    const hit = this.targets.find((m) => m.path[m.path.length - 1] === i);
    if (hit) return this.doMove(hit);
    const all = gen(this.cells, this.turn);
    const mine = all.filter((m) => m.from === i);
    if (mine.length) {
      this.sel = i;
      this.targets = mine;
      this.env.sfx.tone({ freq: 520, dur: 0.04, vol: 0.04 });
    } else {
      if (sideOf(this.cells[i]) === this.turn && all.some((m) => m.caps.length)) {
        this.note = "ต้องกินก่อน! (บังคับกิน)";
        this.noteT = 1.6;
      }
      this.sel = -1;
      this.targets = [];
    }
  }
  private note = "";
  private noteT = 0;

  // ── Bot ──────────────────────────────────────────────────────────────────

  private evaluate(cells: number[], me: number) {
    let s = 0;
    for (let i = 0; i < 64; i++) {
      const p = cells[i];
      if (!p) continue;
      const side = sideOf(p);
      const r = i >> 3;
      const c = i & 7;
      let v = isKing(p) ? 320 : 100 + (side === 1 ? 7 - r : r) * 5;
      if (c >= 2 && c <= 5) v += 4;
      s += side === me ? v : -v;
    }
    return s;
  }

  private deadline = 0;
  private search(cells: number[], side: number, depth: number, alpha: number, beta: number): number {
    const ms = gen(cells, side);
    if (!ms.length) return -100000 - depth;
    if (depth <= 0 || performance.now() > this.deadline) {
      // Do not stop in the middle of a capture exchange
      if (!ms[0].caps.length || depth < -4) return this.evaluate(cells, side);
    }
    for (const m of ms) {
      const copy = cells.slice();
      apply(copy, m);
      const sc = -this.search(copy, 3 - side, depth - 1, -beta, -alpha);
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return alpha;
  }

  botPlay() {
    const me = this.turn;
    const ms = gen(this.cells, me);
    if (!ms.length) return;
    if (this.level === 0 && Math.random() < 0.7) return this.doMove(ms[Math.floor(Math.random() * ms.length)]);
    const depth = [2, 3, 5, 7][this.level];
    this.deadline = performance.now() + [100, 300, 700, 1300][this.level];
    let best = ms[0];
    let bestSc = -Infinity;
    for (const m of ms) {
      const copy = this.cells.slice();
      apply(copy, m);
      const sc = -this.search(copy, 3 - me, depth - 1, -Infinity, Infinity) + Math.random() * (this.level <= 1 ? 25 : 3);
      if (sc > bestSc) {
        bestSc = sc;
        best = m;
      }
    }
    this.doMove(best);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  tick(dt: number) {
    if (this.anim) {
      this.anim.t += dt / 0.16;
      if (this.anim.t >= this.anim.m.path.length) this.anim = null;
    }
    this.noteT = Math.max(0, this.noteT - dt);
  }

  swatch(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: Side) {
    this.man(c, x, y, r, side, false);
  }

  private man(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: number, king: boolean) {
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath();
    c.ellipse(x, y + r * 0.2, r, r * 0.9, 0, 0, TAU);
    c.fill();
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    if (side === 1) {
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#d6d3d1");
    } else {
      g.addColorStop(0, "#f87171");
      g.addColorStop(1, "#991b1b");
    }
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.strokeStyle = side === 1 ? "#a8a29e" : "#7f1d1d";
    c.lineWidth = r * 0.1;
    c.beginPath();
    c.arc(x, y, r * 0.7, 0, TAU);
    c.stroke();
    if (king) {
      // Crown
      c.fillStyle = "#facc15";
      c.beginPath();
      c.moveTo(x - r * 0.45, y + r * 0.25);
      c.lineTo(x - r * 0.5, y - r * 0.3);
      c.lineTo(x - r * 0.22, y - r * 0.05);
      c.lineTo(x, y - r * 0.42);
      c.lineTo(x + r * 0.22, y - r * 0.05);
      c.lineTo(x + r * 0.5, y - r * 0.3);
      c.lineTo(x + r * 0.45, y + r * 0.25);
      c.closePath();
      c.fill();
    }
  }

  renderBoard(c: CanvasRenderingContext2D) {
    const b = this.board;
    const cs = this.cs;
    c.fillStyle = "#3b2414";
    roundRectPath(c, b.x - 10, b.y - 10, b.w + 20, b.h + 20, 12);
    c.fill();
    for (let r = 0; r < 8; r++)
      for (let col = 0; col < 8; col++) {
        c.fillStyle = (r + col) % 2 ? "#7c4a2a" : "#e9d5b0";
        c.fillRect(b.x + col * cs, b.y + r * cs, cs, cs);
      }
    if (this.lastMove) {
      for (const sq of [this.lastMove.from, ...this.lastMove.path]) {
        const p = this.pos(sq);
        c.fillStyle = "rgba(250,204,21,0.25)";
        c.fillRect(p.x - cs / 2, p.y - cs / 2, cs, cs);
      }
    }
    // Pieces that can move (hint when a capture is forced)
    const movable = this.state === "play" && !this.winner && !this.isBotTurn() && !this.anim ? gen(this.cells, this.turn) : [];
    const forced = movable.length && movable[0].caps.length;
    if (forced)
      for (const m of movable) {
        const p = this.pos(m.from);
        c.strokeStyle = `rgba(250,204,21,${0.5 + 0.4 * Math.sin(this.time * 6)})`;
        c.lineWidth = 3;
        c.strokeRect(p.x - cs / 2 + 2, p.y - cs / 2 + 2, cs - 4, cs - 4);
      }
    if (this.sel >= 0) {
      const p = this.pos(this.sel);
      c.fillStyle = "rgba(56,189,248,0.4)";
      c.fillRect(p.x - cs / 2, p.y - cs / 2, cs, cs);
    }

    const anim = this.anim;
    const animTo = anim ? anim.m.path[anim.m.path.length - 1] : -1;
    for (let i = 0; i < 64; i++) {
      const p = this.cells[i];
      if (!p || i === animTo) continue;
      const q = this.pos(i);
      this.man(c, q.x, q.y, cs * 0.38, sideOf(p), isKing(p));
    }
    if (anim) {
      // Captured pieces fade as the hopping piece passes them
      anim.m.caps.forEach((sq, k) => {
        if (anim.t < k + 0.5) {
          const q = this.pos(sq);
          this.man(c, q.x, q.y, cs * 0.38, sideOf(anim.capsCells[k]), isKing(anim.capsCells[k]));
        }
      });
      const hop = Math.min(Math.floor(anim.t), anim.m.path.length - 1);
      const k = ease.inOutSine(clamp(anim.t - hop, 0, 1));
      const a = this.pos(hop === 0 ? anim.m.from : anim.m.path[hop - 1]);
      const bb = this.pos(anim.m.path[hop]);
      const done = anim.t >= anim.m.path.length - 0.001;
      const piece = done || !anim.m.promote ? this.cells[animTo] : anim.piece;
      this.man(c, a.x + (bb.x - a.x) * k, a.y + (bb.y - a.y) * k - Math.sin(k * Math.PI) * cs * 0.25, cs * 0.38, sideOf(piece), isKing(piece));
    }
    for (const m of this.targets) {
      const q = this.pos(m.path[m.path.length - 1]);
      c.fillStyle = m.caps.length ? "rgba(239,68,68,0.6)" : "rgba(34,197,94,0.6)";
      c.beginPath();
      c.arc(q.x, q.y, cs * 0.16, 0, TAU);
      c.fill();
      if (m.path.length > 1)
        for (const s of m.path.slice(0, -1)) {
          const qq = this.pos(s);
          c.beginPath();
          c.arc(qq.x, qq.y, cs * 0.08, 0, TAU);
          c.fill();
        }
    }
    if (this.noteT > 0) {
      c.font = `700 15px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.globalAlpha = clamp(this.noteT, 0, 1);
      c.fillStyle = "rgba(0,0,0,0.7)";
      roundRectPath(c, b.x + b.w / 2 - 110, b.y + b.h / 2 - 20, 220, 40, 20);
      c.fill();
      c.fillStyle = "#fde68a";
      c.fillText(this.note, b.x + b.w / 2, b.y + b.h / 2);
      c.globalAlpha = 1;
    }
  }

  barText(side: Side) {
    const n = this.cells.filter((p) => sideOf(p) === side).length;
    return `${n} ตัว`;
  }
}
