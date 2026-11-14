// Small, complete chess rules engine: legal move generation (castling, en passant, promotion),
// check / mate / stalemate, draws by fifty moves, repetition and bare kings, and an alpha-beta
// search with piece-square tables for the bot. Square 0 = a8, 63 = h1.

export const EMPTY = 0;
export const P = 1;
export const N = 2;
export const B = 3;
export const R = 4;
export const Q = 5;
export const K = 6;

export interface Move {
  from: number;
  to: number;
  piece: number; // signed
  captured: number; // signed, 0 if none
  promo: number; // unsigned kind, 0 if none
  flag: "" | "ep" | "castleK" | "castleQ" | "double";
}

interface Undo {
  move: Move;
  castling: number;
  ep: number;
  half: number;
  hash: string;
}

const KNIGHT = [-17, -15, -10, -6, 6, 10, 15, 17];
const KING_D = [-9, -8, -7, -1, 1, 7, 8, 9];
const DIAG = [-9, -7, 7, 9];
const ORTHO = [-8, -1, 1, 8];

const fileOf = (s: number) => s & 7;
const rankOf = (s: number) => s >> 3;

/** Step from s by d staying on the board without wrapping around a file edge. */
function step(s: number, d: number): number {
  const t = s + d;
  if (t < 0 || t > 63) return -1;
  if (Math.abs(fileOf(t) - fileOf(s)) > 2) return -1;
  return t;
}

export class Chess {
  board = new Int8Array(64);
  /** 1 = white to move, -1 = black. */
  side = 1;
  /** bits: 1 white O-O, 2 white O-O-O, 4 black O-O, 8 black O-O-O */
  castling = 15;
  ep = -1;
  half = 0;
  history: Undo[] = [];
  private seen = new Map<string, number>();

  constructor() {
    this.reset();
  }

  reset() {
    const back = [R, N, B, Q, K, B, N, R];
    this.board.fill(0);
    for (let f = 0; f < 8; f++) {
      this.board[f] = -back[f];
      this.board[8 + f] = -P;
      this.board[48 + f] = P;
      this.board[56 + f] = back[f];
    }
    this.side = 1;
    this.castling = 15;
    this.ep = -1;
    this.half = 0;
    this.history = [];
    this.seen.clear();
    this.seen.set(this.key(), 1);
  }

  /** Load a FEN position (used by tests and puzzles). */
  loadFen(fen: string) {
    const [pos, side, cast, ep] = fen.split(" ");
    this.reset();
    this.board.fill(0);
    let s = 0;
    for (const ch of pos) {
      if (ch === "/") continue;
      if (/\d/.test(ch)) s += +ch;
      else {
        const kind = "pnbrqk".indexOf(ch.toLowerCase()) + 1;
        this.board[s++] = ch === ch.toUpperCase() ? kind : -kind;
      }
    }
    this.side = side === "b" ? -1 : 1;
    this.castling = (cast.includes("K") ? 1 : 0) | (cast.includes("Q") ? 2 : 0) | (cast.includes("k") ? 4 : 0) | (cast.includes("q") ? 8 : 0);
    this.ep = ep && ep !== "-" ? "abcdefgh".indexOf(ep[0]) + (8 - +ep[1]) * 8 : -1;
    this.seen.clear();
    this.seen.set(this.key(), 1);
  }

  private key() {
    return this.board.join(",") + this.side + this.castling + this.ep;
  }

  kingSquare(side: number) {
    return this.board.indexOf(K * side);
  }

  /** Is square s attacked by pieces of colour `by`? */
  attacked(s: number, by: number): boolean {
    const b = this.board;
    // Pawns
    const pd = by === 1 ? [7, 9] : [-7, -9];
    for (const d of pd) {
      const t = step(s, d);
      if (t >= 0 && b[t] === P * by) return true;
    }
    for (const d of KNIGHT) {
      const t = step(s, d);
      if (t >= 0 && b[t] === N * by) return true;
    }
    for (const d of KING_D) {
      const t = step(s, d);
      if (t >= 0 && b[t] === K * by) return true;
    }
    for (const d of DIAG) {
      let t = s;
      for (;;) {
        t = step(t, d);
        if (t < 0) break;
        if (b[t]) {
          if (b[t] === B * by || b[t] === Q * by) return true;
          break;
        }
      }
    }
    for (const d of ORTHO) {
      let t = s;
      for (;;) {
        t = step(t, d);
        if (t < 0) break;
        if (b[t]) {
          if (b[t] === R * by || b[t] === Q * by) return true;
          break;
        }
      }
    }
    return false;
  }

  inCheck(side = this.side) {
    return this.attacked(this.kingSquare(side), -side);
  }

  private pseudo(capturesOnly = false): Move[] {
    const b = this.board;
    const me = this.side;
    const out: Move[] = [];
    const add = (from: number, to: number, flag: Move["flag"] = "") => {
      const piece = b[from];
      const captured = flag === "ep" ? -P * me : b[to];
      if (capturesOnly && !captured && !(Math.abs(piece) === P && (rankOf(to) === 0 || rankOf(to) === 7))) return;
      if (Math.abs(piece) === P && (rankOf(to) === 0 || rankOf(to) === 7)) {
        for (const promo of [Q, N, R, B]) out.push({ from, to, piece, captured, promo, flag });
      } else out.push({ from, to, piece, captured, promo: 0, flag });
    };
    for (let s = 0; s < 64; s++) {
      const pc = b[s];
      if (!pc || Math.sign(pc) !== me) continue;
      const kind = Math.abs(pc);
      if (kind === P) {
        const fwd = me === 1 ? -8 : 8;
        const t = s + fwd;
        if (t >= 0 && t < 64 && !b[t]) {
          add(s, t);
          const startRank = me === 1 ? 6 : 1;
          if (rankOf(s) === startRank && !b[t + fwd]) add(s, t + fwd, "double");
        }
        for (const d of me === 1 ? [-9, -7] : [7, 9]) {
          const c = step(s, d);
          if (c < 0) continue;
          if (b[c] && Math.sign(b[c]) === -me) add(s, c);
          else if (c === this.ep) add(s, c, "ep");
        }
      } else if (kind === N || kind === K) {
        for (const d of kind === N ? KNIGHT : KING_D) {
          const t = step(s, d);
          if (t < 0) continue;
          if (!b[t] || Math.sign(b[t]) === -me) add(s, t);
        }
        if (kind === K && !capturesOnly) {
          const home = me === 1 ? 60 : 4;
          if (s === home && !this.attacked(home, -me)) {
            const kBit = me === 1 ? 1 : 4;
            const qBit = me === 1 ? 2 : 8;
            if (this.castling & kBit && !b[home + 1] && !b[home + 2] && b[home + 3] === R * me && !this.attacked(home + 1, -me) && !this.attacked(home + 2, -me)) add(s, home + 2, "castleK");
            if (this.castling & qBit && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === R * me && !this.attacked(home - 1, -me) && !this.attacked(home - 2, -me)) add(s, home - 2, "castleQ");
          }
        }
      } else {
        const dirs = kind === B ? DIAG : kind === R ? ORTHO : [...DIAG, ...ORTHO];
        for (const d of dirs) {
          let t = s;
          for (;;) {
            t = step(t, d);
            if (t < 0) break;
            if (!b[t]) add(s, t);
            else {
              if (Math.sign(b[t]) === -me) add(s, t);
              break;
            }
          }
        }
      }
    }
    return out;
  }

  make(m: Move) {
    const b = this.board;
    this.history.push({ move: m, castling: this.castling, ep: this.ep, half: this.half, hash: "" });
    const me = Math.sign(m.piece);
    b[m.to] = m.promo ? m.promo * me : m.piece;
    b[m.from] = 0;
    if (m.flag === "ep") b[m.to + (me === 1 ? 8 : -8)] = 0;
    if (m.flag === "castleK") {
      b[m.to - 1] = b[m.to + 1];
      b[m.to + 1] = 0;
    }
    if (m.flag === "castleQ") {
      b[m.to + 1] = b[m.to - 2];
      b[m.to - 2] = 0;
    }
    this.ep = m.flag === "double" ? (m.from + m.to) / 2 : -1;
    // Castling rights
    const touch = (s: number) => {
      if (s === 60) this.castling &= ~3;
      if (s === 4) this.castling &= ~12;
      if (s === 63) this.castling &= ~1;
      if (s === 56) this.castling &= ~2;
      if (s === 7) this.castling &= ~4;
      if (s === 0) this.castling &= ~8;
    };
    touch(m.from);
    touch(m.to);
    this.half = Math.abs(m.piece) === P || m.captured ? 0 : this.half + 1;
    this.side = -this.side;
  }

  unmake() {
    const u = this.history.pop();
    if (!u) return;
    const m = u.move;
    const b = this.board;
    const me = Math.sign(m.piece);
    b[m.from] = m.piece;
    b[m.to] = m.flag === "ep" ? 0 : m.captured;
    if (m.flag === "ep") b[m.to + (me === 1 ? 8 : -8)] = m.captured;
    if (m.flag === "castleK") {
      b[m.to + 1] = b[m.to - 1];
      b[m.to - 1] = 0;
    }
    if (m.flag === "castleQ") {
      b[m.to - 2] = b[m.to + 1];
      b[m.to + 1] = 0;
    }
    this.castling = u.castling;
    this.ep = u.ep;
    this.half = u.half;
    this.side = -this.side;
  }

  moves(capturesOnly = false): Move[] {
    const legal: Move[] = [];
    const me = this.side;
    for (const m of this.pseudo(capturesOnly)) {
      this.make(m);
      if (!this.attacked(this.kingSquare(me), -me)) legal.push(m);
      this.unmake();
    }
    return legal;
  }

  /** Play a move for real (keeps the repetition table). */
  play(m: Move) {
    this.make(m);
    const k = this.key();
    this.history[this.history.length - 1].hash = k;
    this.seen.set(k, (this.seen.get(k) || 0) + 1);
  }

  undo() {
    const last = this.history[this.history.length - 1];
    if (!last) return;
    const k = last.hash;
    if (k) this.seen.set(k, Math.max(0, (this.seen.get(k) || 1) - 1));
    this.unmake();
  }

  private insufficient() {
    const rest: number[] = [];
    for (const pc of this.board) if (pc && Math.abs(pc) !== K) rest.push(Math.abs(pc));
    return rest.length === 0 || (rest.length === 1 && (rest[0] === N || rest[0] === B));
  }

  /** null while the game goes on. */
  result(): null | { winner: number; reason: string } {
    const legal = this.moves();
    if (!legal.length) {
      if (this.inCheck()) return { winner: -this.side, reason: "รุกจน" };
      return { winner: 0, reason: "อับ (ไม่มีตาเดิน)" };
    }
    if (this.half >= 100) return { winner: 0, reason: "เดิน 50 ตาไม่มีกินหรือเดินเบี้ย" };
    if ((this.seen.get(this.key()) || 0) >= 3) return { winner: 0, reason: "ตำแหน่งซ้ำ 3 ครั้ง" };
    if (this.insufficient()) return { winner: 0, reason: "หมากไม่พอรุกจน" };
    return null;
  }

  // ── Bot ──────────────────────────────────────────────────────────────────

  private evaluate(): number {
    let score = 0;
    const b = this.board;
    let minor = 0;
    for (let s = 0; s < 64; s++) {
      const pc = b[s];
      if (!pc) continue;
      const kind = Math.abs(pc);
      if (kind !== P && kind !== K) minor++;
      const sq = pc > 0 ? s : (7 - rankOf(s)) * 8 + fileOf(s);
      score += Math.sign(pc) * (VALUE[kind] + PST[kind][sq]);
    }
    // Endgame: push the king to the centre
    if (minor <= 4) {
      for (const side of [1, -1]) {
        const k = this.kingSquare(side);
        const f = fileOf(k);
        const r = rankOf(k);
        score += side * (14 - (Math.abs(3.5 - f) + Math.abs(3.5 - r)) * 4);
      }
    }
    return score * this.side;
  }

  private nodes = 0;
  private deadline = 0;
  private stop = false;

  private order(ms: Move[]) {
    return ms.sort((a, b) => (b.captured ? VALUE[Math.abs(b.captured)] * 10 - VALUE[Math.abs(b.piece)] : 0) + b.promo * 100 - ((a.captured ? VALUE[Math.abs(a.captured)] * 10 - VALUE[Math.abs(a.piece)] : 0) + a.promo * 100));
  }

  private quiesce(alpha: number, beta: number, depth: number): number {
    const stand = this.evaluate();
    if (stand >= beta) return beta;
    if (alpha < stand) alpha = stand;
    if (depth <= 0) return alpha;
    for (const m of this.order(this.moves(true))) {
      this.make(m);
      const sc = -this.quiesce(-beta, -alpha, depth - 1);
      this.unmake();
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  private search(depth: number, alpha: number, beta: number, ply: number): number {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    if (depth <= 0) return this.quiesce(alpha, beta, 4);
    const ms = this.order(this.moves());
    if (!ms.length) return this.inCheck() ? -100000 + ply : 0;
    if (this.half >= 100) return 0;
    for (const m of ms) {
      this.make(m);
      const sc = -this.search(depth - 1, -beta, -alpha, ply + 1);
      this.unmake();
      if (this.stop) return 0;
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  /**
   * Pick a move. level 0..3. Lower levels search shallower and add noise so they blunder like
   * a beginner; the top level searches as deep as the time budget allows.
   */
  bestMove(level: number): Move | null {
    const root = this.moves();
    if (!root.length) return null;
    const maxDepth = [1, 2, 3, 5][level] ?? 2;
    const budget = [150, 400, 900, 1600][level] ?? 500;
    const noise = [140, 50, 12, 0][level] ?? 0;
    this.deadline = performance.now() + budget;
    this.stop = false;
    this.nodes = 0;
    let best: { m: Move; s: number }[] = root.map((m) => ({ m, s: 0 }));
    for (let d = 1; d <= maxDepth; d++) {
      const scored: { m: Move; s: number }[] = [];
      for (const { m } of best) {
        this.make(m);
        const s = -this.search(d - 1, -1e9, 1e9, 1);
        this.unmake();
        if (this.stop) break;
        scored.push({ m, s });
      }
      if (this.stop && scored.length < best.length) {
        // Keep the completed part of this iteration on top of the previous order
        if (scored.length) {
          scored.sort((a, b) => b.s - a.s);
          const rest = best.filter((x) => !scored.some((y) => y.m === x.m));
          if (scored[0].s > (best[0]?.s ?? -1e9)) best = [...scored, ...rest];
        }
        break;
      }
      best = scored.sort((a, b) => b.s - a.s);
      if (best[0].s > 90000) break;
    }
    if (noise) {
      const jitter = best.map((x) => ({ m: x.m, s: x.s + (Math.random() - 0.5) * 2 * noise }));
      jitter.sort((a, b) => b.s - a.s);
      return jitter[0].m;
    }
    return best[0].m;
  }

  /** Algebraic-ish name for the move list, e.g. "Nf3", "exd5", "O-O", "e8=Q". */
  san(m: Move): string {
    if (m.flag === "castleK") return "O-O";
    if (m.flag === "castleQ") return "O-O-O";
    const files = "abcdefgh";
    const sq = (s: number) => files[fileOf(s)] + (8 - rankOf(s));
    const kind = Math.abs(m.piece);
    const letter = ["", "", "N", "B", "R", "Q", "K"][kind];
    const cap = m.captured ? "x" : "";
    const from = kind === P && cap ? files[fileOf(m.from)] : "";
    return `${letter}${from}${cap}${sq(m.to)}${m.promo ? "=" + ["", "", "N", "B", "R", "Q"][m.promo] : ""}`;
  }
}

const VALUE = [0, 100, 320, 330, 500, 900, 20000];

// Piece-square tables from white's point of view, index 0 = a8.
const PST: number[][] = [
  [],
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
];
