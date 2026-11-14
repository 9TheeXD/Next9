// Base class for two-player turn-based board games (connect four, othello, checkers…):
// setup menu, bot thinking delay, undo by snapshots, player bars, toolbar and the end card.
// A game only describes its board, its moves and its bot.

import type { GameEnv, GameInstance, PointerInfo } from "./types";
import { Particles, FONT_DISPLAY, FONT_BODY } from "./fx";
import { SetupMenu, OPPONENT_ROW, LEVEL_ROW, duelCoins, type MenuRow, type MenuConfig } from "./menu";
import { playerBar, DuelOver, IconButton, ICONS } from "./duel";

export type Side = 1 | 2;
export const LEVEL_NAMES = ["ง่าย", "กลาง", "ยาก", "โหด"];

export interface DuelConfig {
  title: string;
  subtitle: string;
  accent: string;
  colors: [string, string];
  sideNames: [string, string];
  extraRows?: MenuRow[];
  icon?: MenuConfig["icon"];
  /** Let the person pick which side to play against the bot. */
  pickSide?: boolean;
}

export abstract class TurnDuel<S> implements GameInstance {
  w = 0;
  h = 0;
  time = 0;
  state: "menu" | "play" | "over" = "menu";
  mode = "bot";
  level = 1;
  human: Side = 1;
  turn: Side = 1;
  winner: 0 | 1 | 2 | 3 = 0;
  reason = "";
  protected menu: SetupMenu;
  protected over: DuelOver;
  protected thinkT = -1;
  protected endT = -1;
  protected undoStack: { s: S; turn: Side }[] = [];
  protected particles = new Particles();
  protected earned = 0;
  protected score = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  protected btnUndo = new IconButton("ย้อน", ICONS.undo);
  protected btnRestart = new IconButton("เริ่มใหม่", ICONS.restart);
  protected btnMenu = new IconButton("เมนู", ICONS.menu);
  /** Board area chosen by layout(); bars and toolbar are placed around it. */
  protected board = { x: 0, y: 0, w: 0, h: 0 };
  private roundNo = 0;

  constructor(
    public env: GameEnv,
    public cfg: DuelConfig
  ) {
    const rows: MenuRow[] = [OPPONENT_ROW, LEVEL_ROW];
    if (cfg.pickSide)
      rows.push({
        key: "side",
        label: "คุณเล่นฝั่ง",
        choices: [
          { value: "1", label: `${cfg.sideNames[0]} (เริ่มก่อน)` },
          { value: "2", label: cfg.sideNames[1] },
        ],
        when: (v) => v.mode !== "friend",
      });
    rows.push(...(cfg.extraRows || []));
    this.menu = new SetupMenu(env, { title: cfg.title, subtitle: cfg.subtitle, accent: cfg.accent, rows, icon: cfg.icon });
    this.over = new DuelOver(cfg.accent);
  }

  // ── To implement ─────────────────────────────────────────────────────────
  abstract setup(values: Record<string, string>): void;
  abstract snapshot(): S;
  abstract restore(s: S): void;
  /** Make one bot move (call `this.commit` inside, or `applyBot`). */
  abstract botPlay(): void;
  abstract tapBoard(x: number, y: number): void;
  abstract renderBoard(c: CanvasRenderingContext2D): void;
  /** Size the board inside the space left between the bars. */
  abstract layoutBoard(x: number, y: number, w: number, h: number): void;
  /** Right-hand text on a player bar, e.g. piece count. */
  barText(_side: Side): string {
    return "";
  }
  /** Draw the side's piece as a swatch in the player bar. */
  swatch(c: CanvasRenderingContext2D, x: number, y: number, r: number, side: Side) {
    c.fillStyle = this.cfg.colors[side - 1];
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  // ── Flow ─────────────────────────────────────────────────────────────────

  isBotTurn() {
    return this.mode === "bot" && this.turn !== this.human && this.state === "play" && !this.winner;
  }

  protected startGame(fresh: boolean) {
    const v = this.menu.values;
    if (fresh) {
      this.mode = v.mode;
      this.level = +v.level || 0;
      this.human = v.side === "2" ? 2 : 1;
      this.score = { 1: 0, 2: 0, 3: 0 };
      this.roundNo = 0;
    } else if (this.mode === "bot" && !this.cfg.pickSide) this.human = this.human === 1 ? 2 : 1;
    this.roundNo++;
    if (this.mode === "friend") this.human = 1;
    this.turn = 1;
    this.winner = 0;
    this.reason = "";
    this.endT = -1;
    this.undoStack = [];
    this.setup(v);
    this.layout();
    this.state = "play";
    this.thinkT = this.isBotTurn() ? 0.6 : -1;
    this.env.emit({ type: "start" });
  }

  /** Save an undo point before changing the board. */
  protected beforeMove() {
    this.undoStack.push({ s: this.snapshot(), turn: this.turn });
  }

  /** Finish a move: hand over the turn (or keep it) and check for the end. */
  protected endMove(next: Side, result: 0 | 1 | 2 | 3 = 0, reason = "") {
    if (result) {
      this.winner = result;
      this.reason = reason;
      this.score[result]++;
      this.endT = 1.3;
      return;
    }
    this.turn = next;
    if (this.isBotTurn()) this.thinkT = 0.35 + Math.random() * 0.35;
  }

  protected undo() {
    if (this.winner || this.thinkT > 0 || !this.undoStack.length) return;
    // Vs the bot, go back to the person's previous turn
    do {
      const u = this.undoStack.pop()!;
      this.restore(u.s);
      this.turn = u.turn;
    } while (this.mode === "bot" && this.turn !== this.human && this.undoStack.length);
    if (this.isBotTurn()) this.thinkT = 0.4;
  }

  private finish() {
    this.state = "over";
    this.over.t = 0;
    const res: "win" | "lose" | "draw" = this.winner === 3 ? "draw" : this.mode === "friend" || this.winner === this.human ? "win" : "lose";
    this.earned = duelCoins(this.mode, this.level, res);
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: res === "win" ? 1 : 0,
      best: 0,
      summary: `${this.mode === "bot" ? `บอท${LEVEL_NAMES[this.level]}` : "เล่นกับเพื่อน"} · ${this.resultTitle()}${this.reason ? ` (${this.reason})` : ""}`,
      stats: { level: this.level, round: this.roundNo },
    });
  }

  resultTitle() {
    if (this.winner === 3) return "เสมอ";
    if (this.mode === "friend") return `${this.cfg.sideNames[this.winner - 1]}ชนะ!`;
    return this.winner === this.human ? "คุณชนะ!" : "บอทชนะ";
  }

  name(side: Side) {
    if (this.mode === "friend") return this.cfg.sideNames[side - 1];
    return side === this.human ? "คุณ" : `บอท ${LEVEL_NAMES[this.level]}`;
  }

  // ── GameInstance ─────────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.layout();
  }

  protected layout() {
    const top = 64;
    const bottom = 126;
    this.layoutBoard(10, top, this.w - 20, Math.max(100, this.h - top - bottom));
  }

  pointer(p: PointerInfo) {
    if (this.state === "menu") {
      if (this.menu.pointer(p)) this.startGame(true);
      return;
    }
    if (this.state === "over") {
      const a = this.over.pointer(p.type, p.x, p.y);
      if (a === "again") this.startGame(false);
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
      if (b === this.btnRestart) this.startGame(false);
      if (b === this.btnMenu) {
        this.state = "menu";
        this.menu.reset();
      }
      return;
    }
    if (p.type === "down" && !this.isBotTurn() && !this.winner && this.thinkT <= 0) this.tapBoard(p.x, p.y);
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.state === "menu" && this.menu.key(code)) {
      this.startGame(true);
      return true;
    }
    if (this.state === "play" && code === "Backspace") {
      this.undo();
      return true;
    }
    return false;
  }

  /** Per-frame animation hook. */
  tick(_dt: number) {}

  update(dt: number) {
    this.time += dt;
    this.particles.update(dt);
    this.tick(dt);
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
      if (this.thinkT <= 0 && this.isBotTurn()) this.botPlay();
    }
  }

  /** Background colour; games can override. */
  background(c: CanvasRenderingContext2D) {
    const g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, "#0f1226");
    g.addColorStop(1, "#1b1f45");
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);
  }

  render() {
    const c = this.env.ctx;
    const { w, h } = this;
    this.background(c);
    if (this.state !== "menu" || this.undoStack.length || this.winner) {
      this.renderBoard(c);
      const b = this.board;
      const half = (b.w - 10) / 2;
      for (const side of [1, 2] as Side[]) {
        playerBar(c, side === 1 ? b.x : b.x + half + 10, b.y - 52, half, {
          name: this.name(side),
          color: this.cfg.colors[side - 1],
          active: this.turn === side && !this.winner && this.state === "play",
          thinking: this.isBotTurn() && this.turn === side,
          right: this.barText(side),
          time: this.time,
          swatch: (cc, x, y, r) => this.swatch(cc, x, y, r, side),
        });
      }
      c.font = `600 12px ${FONT_BODY}`;
      c.textAlign = "center";
      c.textBaseline = "top";
      c.fillStyle = "rgba(255,255,255,0.55)";
      const tally = `${this.cfg.sideNames[0]} ${this.score[1]} – ${this.score[2]} ${this.cfg.sideNames[1]}${this.score[3] ? ` · เสมอ ${this.score[3]}` : ""}`;
      c.fillText(tally, w / 2, b.y + b.h + 10);
      const ty = Math.min(b.y + b.h + 62, h - 36);
      [this.btnUndo, this.btnRestart, this.btnMenu].forEach((bt, i) => {
        bt.place(w / 2 + (i - 1) * 84, ty, 20);
        bt.render(c, bt !== this.btnUndo || this.undoStack.length > 0);
      });
      if (this.winner && this.state === "play") {
        const t = this.resultTitle();
        c.font = `800 30px ${FONT_DISPLAY}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.lineWidth = 7;
        c.strokeStyle = "rgba(0,0,0,0.65)";
        c.strokeText(t, w / 2, b.y + b.h / 2);
        c.fillStyle = this.winner === 3 ? "#ffffff" : this.cfg.colors[this.winner - 1];
        c.fillText(t, w / 2, b.y + b.h / 2);
      }
    }
    this.particles.render(c);
    if (this.state === "menu") this.menu.render(c, w, h);
    if (this.state === "over")
      this.over.render(c, w, h, {
        title: this.resultTitle(),
        subtitle: this.reason || `${this.cfg.sideNames[0]} ${this.score[1]} – ${this.score[2]} ${this.cfg.sideNames[1]}`,
        coins: this.earned,
        chips: [this.mode === "bot" ? `บอท${LEVEL_NAMES[this.level]}` : "โหมดเพื่อน", `${this.cfg.sideNames[0]} ${this.score[1]} – ${this.score[2]} ${this.cfg.sideNames[1]}`],
        accent: this.cfg.accent,
      });
  }
}
