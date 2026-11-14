// XO (tic-tac-toe and its bigger cousins): 3×3 up to 11×11, line of 3–5 to win.
// Play a bot at four levels or a friend on the same device; the score carries across rounds.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, clamp, TAU, FONT_DISPLAY, FONT_BODY, ease, roundRectPath, glow } from "./engine/fx";
import { SetupMenu, OPPONENT_ROW, LEVEL_ROW, duelCoins } from "./engine/menu";
import { playerBar, DuelOver, IconButton, ICONS } from "./engine/duel";
import { pentatonic } from "./engine/audio";

export const xoGame: GameDefinition = {
  id: "xo",
  title: "XO หลายกระดาน",
  tagline: "3×3 ถึง 11×11 สู้บอทหรือเพื่อน",
  why: "เกมสั้น ตัดสินใจเร็ว ต้องคอยดักทางคู่แข่งตลอด เหมาะกับช่วงที่ความอยากพุ่งขึ้นมา 3–5 นาที",
  category: "duel",
  minutes: "1–10 นาที",
  palette: ["#0f172a", "#38bdf8"],
  create: (env) => new XoGame(env),
};

const X = 1;
const O = 2;
const COL = { 1: "#38bdf8", 2: "#fb7185" } as Record<number, string>;
const SIZES: Record<string, number> = { "3": 3, "5": 4, "7": 4, "9": 5, "11": 5 };
const LEVEL_NAMES = ["ง่าย", "กลาง", "ยาก", "โหด"];

type State = "menu" | "play" | "over";

class XoGame implements GameInstance {
  private w = 0;
  private h = 0;
  private n = 3;
  private need = 3;
  private cells: number[] = [];
  private placedAt: number[] = [];
  private turn = X;
  private first = X;
  private mode = "bot";
  private level = 1;
  private human = X;
  private state: State = "menu";
  private time = 0;
  private menu: SetupMenu;
  private over: DuelOver;
  private thinkT = -1;
  private winLine: number[] | null = null;
  private winner = 0; // 0 none, 1/2 player, 3 draw
  private endT = -1;
  private score = { 1: 0, 2: 0, draw: 0 } as { 1: number; 2: number; draw: number };
  private earned = 0;
  private lastMove = -1;
  private history: number[] = [];
  private particles = new Particles();
  private bs = 300;
  private bx = 0;
  private by = 0;
  private btnUndo = new IconButton("ย้อน", ICONS.undo);
  private btnRestart = new IconButton("เริ่มใหม่", ICONS.restart);
  private btnMenu = new IconButton("เมนู", ICONS.menu);

  constructor(private env: GameEnv) {
    this.menu = new SetupMenu(env, {
      title: "XO หลายกระดาน",
      subtitle: "เรียงให้ครบก่อนชนะ",
      accent: "#0ea5e9",
      rows: [
        OPPONENT_ROW,
        LEVEL_ROW,
        {
          key: "size",
          label: "ขนาดกระดาน",
          choices: [
            { value: "3", label: "3×3 · เรียง 3" },
            { value: "5", label: "5×5 · เรียง 4" },
            { value: "7", label: "7×7 · เรียง 4" },
            { value: "9", label: "9×9 · เรียง 5" },
            { value: "11", label: "11×11 · เรียง 5" },
          ],
        },
      ],
      icon: (c, t) => {
        c.lineCap = "round";
        c.lineWidth = 7;
        c.strokeStyle = COL[1];
        const k = clamp(t * 2, 0, 1);
        c.beginPath();
        c.moveTo(-40, -18);
        c.lineTo(-40 + 30 * k, -18 + 30 * k);
        c.moveTo(-10, -18);
        c.lineTo(-10 - 30 * k, -18 + 30 * k);
        c.stroke();
        c.strokeStyle = COL[2];
        c.beginPath();
        c.arc(25, -3, 15, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(t * 2 - 0.5, 0, 1));
        c.stroke();
      },
    });
    this.over = new DuelOver("#0ea5e9");
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.layout();
  }

  private layout() {
    const top = 70;
    const bottom = 130;
    this.bs = Math.floor(Math.min(this.w - 24, this.h - top - bottom));
    this.bx = Math.round((this.w - this.bs) / 2);
    this.by = Math.round(top + (this.h - top - bottom - this.bs) / 2);
  }

  private start(fresh: boolean) {
    const v = this.menu.values;
    if (fresh) {
      this.mode = v.mode;
      this.level = +v.level || 0;
      this.n = +v.size || 3;
      this.need = SIZES[v.size] || 3;
      this.score = { 1: 0, 2: 0, draw: 0 };
      this.first = X;
      this.human = X;
    } else {
      // Take turns starting; vs bot the human swaps between X and O
      this.first = this.first === X ? O : X;
      if (this.mode === "bot") this.human = this.human === X ? O : X;
    }
    this.cells = new Array(this.n * this.n).fill(0);
    this.placedAt = new Array(this.n * this.n).fill(-10);
    // Vs the bot X always opens and the human swaps sides each round; friends swap who starts
    this.turn = this.mode === "bot" ? X : this.first;
    this.winLine = null;
    this.winner = 0;
    this.endT = -1;
    this.lastMove = -1;
    this.history = [];
    this.state = "play";
    this.thinkT = this.botTurn() ? 0.5 : -1;
    this.env.emit({ type: "start" });
  }

  private botTurn() {
    return this.mode === "bot" && this.turn !== this.human && !this.winner;
  }

  private cellAt(x: number, y: number) {
    const cs = this.bs / this.n;
    const c = Math.floor((x - this.bx) / cs);
    const r = Math.floor((y - this.by) / cs);
    if (c < 0 || r < 0 || c >= this.n || r >= this.n) return -1;
    return r * this.n + c;
  }

  // ── Rules ────────────────────────────────────────────────────────────────

  private lineThrough(cells: number[], i: number): number[] | null {
    const n = this.n;
    const who = cells[i];
    const r0 = Math.floor(i / n);
    const c0 = i % n;
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]) {
      const line = [i];
      for (const sgn of [1, -1]) {
        let r = r0 + dr * sgn;
        let c = c0 + dc * sgn;
        while (r >= 0 && c >= 0 && r < n && c < n && cells[r * n + c] === who) {
          line.push(r * n + c);
          r += dr * sgn;
          c += dc * sgn;
        }
      }
      if (line.length >= this.need) return line;
    }
    return null;
  }

  private place(i: number) {
    if (this.cells[i] || this.winner) return;
    this.cells[i] = this.turn;
    this.placedAt[i] = this.time;
    this.lastMove = i;
    this.history.push(i);
    this.env.sfx.tone({ freq: this.turn === X ? 520 : 390, dur: 0.08, vol: 0.08, type: "triangle", glideTo: this.turn === X ? 620 : 330 });
    const line = this.lineThrough(this.cells, i);
    if (line) {
      this.winLine = line;
      this.winner = this.turn;
      this.score[this.turn as 1 | 2]++;
      this.endT = 1.4;
      [0, 2, 4, 7].forEach((s, k) => this.env.sfx.chime(pentatonic(s + 3), 0.1, k * 0.09));
      const cs = this.bs / this.n;
      for (const j of line) this.particles.burst(this.bx + (j % this.n + 0.5) * cs, this.by + (Math.floor(j / this.n) + 0.5) * cs, COL[this.turn], 10, { speed: 160, size: 3, gravity: 60 });
      return;
    }
    if (this.cells.every((c) => c)) {
      this.winner = 3;
      this.score.draw++;
      this.endT = 1.1;
      return;
    }
    this.turn = this.turn === X ? O : X;
    if (this.botTurn()) this.thinkT = 0.35 + Math.random() * 0.3;
  }

  // ── Bot ──────────────────────────────────────────────────────────────────

  private minimax(cells: number[], me: number, turn: number, depth: number, alpha: number, beta: number): number {
    let any = false;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) continue;
      any = true;
      cells[i] = turn;
      const won = this.lineThrough(cells, i);
      let sc: number;
      if (won) sc = turn === me ? 100 - depth : depth - 100;
      else sc = this.minimax(cells, me, turn === X ? O : X, depth + 1, alpha, beta);
      cells[i] = 0;
      if (turn === me) {
        if (sc > alpha) alpha = sc;
      } else if (sc < beta) beta = sc;
      if (alpha >= beta) break;
    }
    if (!any) return 0;
    return turn === me ? alpha : beta;
  }

  /** Strength of a line pattern of `count` stones with `open` free ends. */
  private patternScore(count: number, open: number) {
    const L = this.need;
    if (count >= L) return 1e7;
    if (open === 0) return 0;
    const gap = L - count;
    if (gap === 1) return open === 2 ? 5e5 : 6e4;
    if (gap === 2) return open === 2 ? 4e4 : 3e3;
    if (gap === 3) return open === 2 ? 1500 : 200;
    return open === 2 ? 60 : 10;
  }

  /** Heuristic value of putting `who` on empty cell i. */
  private cellValue(cells: number[], i: number, who: number) {
    const n = this.n;
    const r0 = Math.floor(i / n);
    const c0 = i % n;
    let total = 0;
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]) {
      let count = 1;
      let open = 0;
      let room = 1;
      for (const sgn of [1, -1]) {
        let r = r0 + dr * sgn;
        let c = c0 + dc * sgn;
        while (r >= 0 && c >= 0 && r < n && c < n && cells[r * n + c] === who) {
          count++;
          r += dr * sgn;
          c += dc * sgn;
        }
        if (r >= 0 && c >= 0 && r < n && c < n && cells[r * n + c] === 0) {
          open++;
          // How much free room in this direction (a line that cannot reach L is worthless)
          while (r >= 0 && c >= 0 && r < n && c < n && cells[r * n + c] !== (who === X ? O : X) && room + count < this.need + 2) {
            room++;
            r += dr * sgn;
            c += dc * sgn;
          }
        }
      }
      if (count + room - 1 < this.need) continue;
      total += this.patternScore(count, open);
    }
    // Small pull towards the centre
    const mid = (n - 1) / 2;
    total += (n - Math.abs(r0 - mid) - Math.abs(c0 - mid)) * 2;
    return total;
  }

  private candidates(cells: number[]) {
    const n = this.n;
    const out: number[] = [];
    const empty = cells.every((c) => !c);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) continue;
      if (empty) {
        out.push(i);
        continue;
      }
      const r0 = Math.floor(i / n);
      const c0 = i % n;
      let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r >= 0 && c >= 0 && r < n && c < n && cells[r * n + c]) {
            near = true;
            break;
          }
        }
      if (near) out.push(i);
    }
    return out;
  }

  private botMove(): number {
    const me = this.turn;
    const opp = me === X ? O : X;
    const cells = this.cells.slice();
    const empties = cells.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    const lv = this.level;
    const winNow = (who: number) => empties.find((i) => {
      cells[i] = who;
      const w = this.lineThrough(cells, i);
      cells[i] = 0;
      return !!w;
    });

    // Level 0: mostly random, but takes an obvious win half the time
    if (lv === 0) {
      const wn = winNow(me);
      if (wn !== undefined && Math.random() < 0.5) return wn;
      const bl = winNow(opp);
      if (bl !== undefined && Math.random() < 0.3) return bl;
      if (this.n > 3) {
        const cand = this.candidates(cells);
        return cand[Math.floor(Math.random() * cand.length)];
      }
      return empties[Math.floor(Math.random() * empties.length)];
    }

    const wn = winNow(me);
    if (wn !== undefined) return wn;
    const bl = winNow(opp);
    if (bl !== undefined && (lv >= 2 || Math.random() < 0.85)) return bl;

    if (this.n === 3) {
      if (lv === 1 && Math.random() < 0.5) return empties[Math.floor(Math.random() * empties.length)];
      if (lv === 2 && Math.random() < 0.12) return empties[Math.floor(Math.random() * empties.length)];
      let best = empties[0];
      let bestSc = -1e9;
      for (const i of empties) {
        cells[i] = me;
        const sc = this.minimax(cells, me, opp, 1, -1e9, 1e9) + Math.random() * 0.5;
        cells[i] = 0;
        if (sc > bestSc) {
          bestSc = sc;
          best = i;
        }
      }
      return best;
    }

    // Bigger boards: heuristic attack + defence, with lookahead at the top levels
    const defW = [0, 0.8, 0.95, 1.05][lv];
    const scored = this.candidates(cells).map((i) => ({ i, s: this.cellValue(cells, i, me) + defW * this.cellValue(cells, i, opp) }));
    scored.sort((a, b) => b.s - a.s);
    if (lv === 1) {
      const pool = scored.slice(0, 4);
      return pool[Math.floor(Math.random() * Math.min(pool.length, Math.random() < 0.6 ? 1 : 4))].i;
    }
    if (lv >= 2) {
      const top = scored.slice(0, lv === 3 ? 10 : 6);
      let best = top[0];
      let bestV = -Infinity;
      for (const c of top) {
        cells[c.i] = me;
        // What this move sets up for us next, minus the strongest attack it leaves the opponent
        let reply = 0;
        let follow = 0;
        for (const j of this.candidates(cells)) {
          const o = this.cellValue(cells, j, opp);
          const m = this.cellValue(cells, j, me);
          if (o > reply) reply = o;
          if (m > follow) follow = m;
        }
        cells[c.i] = 0;
        const v = c.s + 0.35 * follow - (lv === 3 ? 0.8 : 0.5) * reply + Math.random() * 5;
        if (v > bestV) {
          bestV = v;
          best = c;
        }
      }
      return best.i;
    }
    return scored[0].i;
  }

  // ── Input ────────────────────────────────────────────────────────────────

  pointer(p: PointerInfo) {
    if (this.state === "menu") {
      if (this.menu.pointer(p)) {
        this.start(true);
        this.layout();
      }
      return;
    }
    if (this.state === "over") {
      const a = this.over.pointer(p.type, p.x, p.y);
      if (a === "again") this.start(false);
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
      if (b === this.btnRestart) {
        this.first = this.first === X ? O : X; // start(false) flips it back
        if (this.mode === "bot") this.human = this.human === X ? O : X;
        this.start(false);
      }
      if (b === this.btnMenu) {
        this.state = "menu";
        this.menu.reset();
      }
      return;
    }
    if (p.type !== "down" || this.botTurn() || this.winner) return;
    const i = this.cellAt(p.x, p.y);
    if (i >= 0 && !this.cells[i]) this.place(i);
  }

  private undo() {
    if (this.winner || this.thinkT > 0) return;
    const n = this.mode === "bot" ? 2 : 1;
    for (let k = 0; k < n && this.history.length; k++) {
      const i = this.history.pop()!;
      this.cells[i] = 0;
      this.turn = this.turn === X ? O : X;
    }
    // Never leave it on the bot's turn after undoing
    if (this.botTurn()) this.thinkT = 0.4;
    this.lastMove = this.history.length ? this.history[this.history.length - 1] : -1;
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.state === "menu" && this.menu.key(code)) {
      this.start(true);
      this.layout();
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.time += dt;
    this.particles.update(dt);
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
      if (this.thinkT <= 0 && this.botTurn()) this.place(this.botMove());
    }
  }

  private finish() {
    this.state = "over";
    this.over.t = 0;
    const res: "win" | "lose" | "draw" = this.winner === 3 ? "draw" : this.mode === "friend" || this.winner === this.human ? "win" : "lose";
    // Small boards pay less: a 3×3 round lasts seconds
    const mult = this.n === 3 ? 0.4 : this.n <= 5 ? 0.7 : 1;
    this.earned = Math.max(3, Math.round(duelCoins(this.mode, this.level, res) * mult));
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: res === "win" ? 1 : 0,
      best: 0,
      summary: `XO ${this.n}×${this.n} · ${this.title()}`,
      stats: { size: this.n, level: this.level },
    });
  }

  private title() {
    if (this.winner === 3) return "เสมอ";
    if (this.mode === "friend") return `${this.winner === X ? "X" : "O"} ชนะ!`;
    return this.winner === this.human ? "คุณชนะ!" : "บอทชนะ";
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private drawMark(c: CanvasRenderingContext2D, who: number, x: number, y: number, s: number, k: number, alpha = 1) {
    c.save();
    c.globalAlpha = alpha;
    c.lineCap = "round";
    c.lineWidth = Math.max(3, s * 0.12);
    c.shadowColor = COL[who];
    c.shadowBlur = s * 0.25;
    c.strokeStyle = COL[who];
    const r = s * 0.3;
    if (who === X) {
      const k1 = clamp(k * 2, 0, 1);
      const k2 = clamp(k * 2 - 1, 0, 1);
      c.beginPath();
      c.moveTo(x - r, y - r);
      c.lineTo(x - r + 2 * r * k1, y - r + 2 * r * k1);
      if (k2 > 0) {
        c.moveTo(x + r, y - r);
        c.lineTo(x + r - 2 * r * k2, y - r + 2 * r * k2);
      }
      c.stroke();
    } else {
      c.beginPath();
      c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1));
      c.stroke();
    }
    c.restore();
  }

  render() {
    const { ctx } = this.env;
    const { w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b1022");
    g.addColorStop(1, "#141a3a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (this.state !== "menu" || this.cells.length) {
      const { bx, by, bs, n } = this;
      const cs = bs / n;
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      roundRectPath(ctx, bx - 6, by - 6, bs + 12, bs + 12, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,255,0.28)";
      ctx.lineWidth = n <= 5 ? 3 : 1.5;
      ctx.lineCap = "round";
      for (let i = 1; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(bx + i * cs, by + 6);
        ctx.lineTo(bx + i * cs, by + bs - 6);
        ctx.moveTo(bx + 6, by + i * cs);
        ctx.lineTo(bx + bs - 6, by + i * cs);
        ctx.stroke();
      }
      if (this.lastMove >= 0 && !this.winner) {
        const lx = bx + (this.lastMove % n) * cs;
        const ly = by + Math.floor(this.lastMove / n) * cs;
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(lx + 2, ly + 2, cs - 4, cs - 4);
      }
      for (let i = 0; i < this.cells.length; i++) {
        const who = this.cells[i];
        if (!who) continue;
        const k = (this.time - this.placedAt[i]) / 0.28;
        const dim = this.winLine && !this.winLine.includes(i) ? 0.35 : 1;
        this.drawMark(ctx, who, bx + (i % n + 0.5) * cs, by + (Math.floor(i / n) + 0.5) * cs, cs, ease.outCubic(clamp(k, 0, 1)), dim);
      }
      if (this.winLine) {
        const pts = this.winLine.map((i) => ({ x: bx + (i % n + 0.5) * cs, y: by + (Math.floor(i / n) + 0.5) * cs }));
        pts.sort((a, b) => a.x - b.x || a.y - b.y);
        const a = pts[0];
        const b = pts[pts.length - 1];
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = COL[this.winner];
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(4, cs * 0.12);
        ctx.shadowColor = COL[this.winner];
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
        glow(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, cs * 2, COL[this.winner], 0.25);
      }

      // Score + players
      const name = (who: number) => (this.mode === "friend" ? `ผู้เล่น ${who === X ? "X" : "O"}` : who === this.human ? "คุณ" : `บอท ${LEVEL_NAMES[this.level]}`);
      const half = (bs - 10) / 2;
      for (const who of [X, O]) {
        playerBar(ctx, who === X ? bx : bx + half + 10, by - 56, half, {
          name: name(who),
          color: COL[who],
          active: this.turn === who && !this.winner,
          thinking: this.botTurn() && this.turn === who,
          right: `${this.score[who as 1 | 2]}`,
          time: this.time,
          swatch: (c, x, y, r) => this.drawMark(c, who, x, y, r * 2.4, 1),
        });
      }
      ctx.font = `600 12px ${FONT_BODY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(`${n}×${n} · เรียง ${this.need} ชนะ · เสมอ ${this.score.draw}`, w / 2, by + bs + 12);

      const ty = Math.min(by + bs + 66, h - 36);
      [this.btnUndo, this.btnRestart, this.btnMenu].forEach((b, i) => {
        b.place(w / 2 + (i - 1) * 84, ty, 20);
        b.render(ctx, b !== this.btnUndo || this.history.length > 0);
      });
      if (this.winner && this.state === "play") {
        ctx.font = `800 30px ${FONT_DISPLAY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        const t = this.title();
        ctx.strokeText(t, w / 2, by + bs / 2);
        ctx.fillStyle = this.winner === 3 ? "#ffffff" : COL[this.winner];
        ctx.fillText(t, w / 2, by + bs / 2);
      }
    }
    this.particles.render(ctx);
    if (this.state === "menu") this.menu.render(ctx, w, h);
    if (this.state === "over")
      this.over.render(ctx, w, h, {
        title: this.title(),
        subtitle: `${this.mode === "friend" ? "X" : "คุณ"} ${this.mode === "friend" ? this.score[1] : this.score[this.human as 1 | 2]} – ${this.mode === "friend" ? this.score[2] : this.score[(this.human === X ? O : X) as 1 | 2]} ${this.mode === "friend" ? "O" : "บอท"} · เสมอ ${this.score.draw}`,
        coins: this.earned,
        chips: [`${this.n}×${this.n}`, this.mode === "bot" ? `บอท${LEVEL_NAMES[this.level]}` : "โหมดเพื่อน"],
        accent: "#0ea5e9",
      });
  }
}
