// Chess against a bot (four levels) or with a friend on the same device.
// Full rules, move hints, undo, and a gentle hint button that suggests a good move.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, clamp, TAU, FONT_DISPLAY, FONT_BODY, ease, roundRectPath } from "./engine/fx";
import { SetupMenu, OPPONENT_ROW, LEVEL_ROW, duelCoins } from "./engine/menu";
import { playerBar, DuelOver, IconButton, ICONS } from "./engine/duel";
import { pentatonic } from "./engine/audio";
import { Chess, K, Q, R, B, N, type Move } from "./logic/chessRules";
import { pieceSprite, drawPiece } from "./art/chessPieces";

export const chessGame: GameDefinition = {
  id: "chess",
  title: "หมากรุกสากล",
  tagline: "สู้บอท 4 ระดับ หรือนั่งเล่นกับเพื่อน",
  why: "หมากรุกต้องคิดล่วงหน้าหลายตา สมองส่วนวางแผนทำงานเต็มที่ ความอยากจึงแทรกเข้ามาได้ยาก",
  category: "duel",
  minutes: "5–20 นาที",
  palette: ["#2a1d12", "#e9c46a"],
  create: (env) => new ChessGame(env),
};

type State = "menu" | "play" | "over";
const LEVEL_NAMES = ["ง่าย", "กลาง", "ยาก", "โหด"];

class ChessGame implements GameInstance {
  private w = 0;
  private h = 0;
  private sq = 40;
  private bx = 0;
  private by = 0;
  private game = new Chess();
  private state: State = "menu";
  private time = 0;
  private menu: SetupMenu;
  private over: DuelOver;
  private flipped = false;
  private human = 1; // colour the person plays vs the bot
  private mode = "bot";
  private level = 1;
  private selected = -1;
  private targets: Move[] = [];
  private promo: Move[] | null = null;
  private anim: { m: Move; t: number } | null = null;
  private thinkT = -1;
  private hint: Move | null = null;
  private result: { winner: number; reason: string } | null = null;
  private earned = 0;
  private particles = new Particles();
  private btnUndo = new IconButton("ย้อน", ICONS.undo);
  private btnHint = new IconButton("ใบ้", ICONS.bulb);
  private btnFlip = new IconButton("หมุน", ICONS.flip);
  private btnMenu = new IconButton("เมนู", ICONS.menu);
  private moveList: string[] = [];

  constructor(private env: GameEnv) {
    this.menu = new SetupMenu(env, {
      title: "หมากรุกสากล",
      subtitle: "เลือกคู่แข่งแล้วเริ่มกันเลย",
      accent: "#d4a73c",
      rows: [
        OPPONENT_ROW,
        LEVEL_ROW,
        {
          key: "color",
          label: "คุณเล่นฝั่ง",
          choices: [
            { value: "w", label: "ขาว (เดินก่อน)" },
            { value: "b", label: "ดำ" },
            { value: "r", label: "สุ่ม" },
          ],
          when: (v) => v.mode !== "friend",
        },
      ],
      icon: (c) => {
        c.save();
        c.translate(-30, -36);
        c.scale(0.6, 0.6);
        drawPiece(c, K, true);
        c.restore();
        c.save();
        c.translate(-2, -32);
        c.scale(0.55, 0.55);
        drawPiece(c, N, false);
        c.restore();
      },
    });
    this.over = new DuelOver("#d4a73c");
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 58;
    const bottom = 120;
    this.sq = Math.floor(Math.min((w - 16) / 8, (h - top - bottom) / 8));
    this.bx = Math.round((w - this.sq * 8) / 2);
    this.by = Math.round(top + (h - top - bottom - this.sq * 8) / 2);
  }

  private start() {
    const v = this.menu.values;
    this.mode = v.mode;
    this.level = +v.level || 0;
    this.human = v.color === "b" ? -1 : v.color === "r" ? (Math.random() < 0.5 ? 1 : -1) : 1;
    if (this.mode === "friend") this.human = 1;
    this.flipped = this.human === -1;
    this.game.reset();
    this.selected = -1;
    this.targets = [];
    this.promo = null;
    this.anim = null;
    this.hint = null;
    this.result = null;
    this.moveList = [];
    this.state = "play";
    this.thinkT = this.botTurn() ? 0.5 : -1;
    this.env.emit({ type: "start" });
  }

  private botTurn() {
    return this.mode === "bot" && this.game.side !== this.human && !this.result;
  }

  // Board coordinates
  private sqAt(x: number, y: number) {
    const f = Math.floor((x - this.bx) / this.sq);
    const r = Math.floor((y - this.by) / this.sq);
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return this.flipped ? (7 - r) * 8 + (7 - f) : r * 8 + f;
  }

  private sqPos(s: number) {
    let f = s & 7;
    let r = s >> 3;
    if (this.flipped) {
      f = 7 - f;
      r = 7 - r;
    }
    return { x: this.bx + f * this.sq, y: this.by + r * this.sq };
  }

  private doMove(m: Move) {
    this.moveList.push(this.game.san(m));
    this.game.play(m);
    this.anim = { m, t: 0 };
    this.selected = -1;
    this.targets = [];
    this.hint = null;
    const check = this.game.inCheck();
    if (m.captured) this.env.sfx.noise({ dur: 0.12, vol: 0.09, freq: 900, type: "bandpass" });
    this.env.sfx.tone({ freq: m.captured ? 180 : 240, dur: 0.07, vol: 0.12, type: "triangle" });
    if (check) this.env.sfx.chime(pentatonic(8), 0.08);
    this.result = this.game.result();
    if (this.result) this.finishSoon();
    else if (this.botTurn()) this.thinkT = 0.45;
  }

  private finishTimer = -1;
  private finishSoon() {
    this.finishTimer = 0.9;
  }

  private finish() {
    const r = this.result!;
    this.state = "over";
    this.over.t = 0;
    const res: "win" | "lose" | "draw" = r.winner === 0 ? "draw" : this.mode === "friend" ? "win" : r.winner === this.human ? "win" : "lose";
    this.earned = duelCoins(this.mode, this.level, res);
    if (res === "win" && this.mode === "bot") {
      const k = this.game.kingSquare(-this.human);
      const p = this.sqPos(k);
      this.particles.burst(p.x + this.sq / 2, p.y + this.sq / 2, "#ffd76a", 50, { speed: 260, size: 3, gravity: 120 });
    }
    this.env.emit({
      type: "end",
      coins: this.earned,
      score: res === "win" ? 1 : 0,
      best: 0,
      summary: `${this.mode === "bot" ? `บอทระดับ${LEVEL_NAMES[this.level]}` : "เล่นกับเพื่อน"} · ${this.resultTitle()} (${r.reason})`,
      stats: { moves: this.game.history.length, level: this.level },
    });
  }

  private resultTitle() {
    const r = this.result!;
    if (r.winner === 0) return "เสมอ";
    if (this.mode === "friend") return r.winner === 1 ? "ขาวชนะ" : "ดำชนะ";
    return r.winner === this.human ? "คุณชนะ!" : "บอทชนะ";
  }

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
    const btns = [this.btnUndo, this.btnHint, this.btnFlip, this.btnMenu];
    if (p.type === "down") for (const b of btns) b.pressed = b.hit(p.x, p.y);
    if (p.type === "up") {
      const b = btns.find((x) => x.pressed && x.hit(p.x, p.y));
      for (const x of btns) x.pressed = false;
      if (b === this.btnUndo) this.undo();
      if (b === this.btnHint && !this.botTurn() && !this.result) {
        this.hint = this.game.bestMove(2);
        this.env.sfx.chime(pentatonic(6), 0.07);
      }
      if (b === this.btnFlip) this.flipped = !this.flipped;
      if (b === this.btnMenu) {
        this.state = "menu";
        this.menu.reset();
      }
      if (b) return;
    }
    if (p.type !== "down" || this.result || this.botTurn() || this.anim) return;

    if (this.promo) {
      const kinds = [Q, R, B, N];
      const box = this.promoBox();
      kinds.forEach((k, i) => {
        if (p.x >= box.x + i * box.s && p.x < box.x + (i + 1) * box.s && p.y >= box.y && p.y < box.y + box.s) {
          const m = this.promo!.find((x) => x.promo === k)!;
          this.promo = null;
          this.doMove(m);
        }
      });
      this.promo = null;
      return;
    }

    const s = this.sqAt(p.x, p.y);
    if (s < 0) {
      this.selected = -1;
      this.targets = [];
      return;
    }
    const hit = this.targets.filter((m) => m.to === s);
    if (hit.length) {
      if (hit.length > 1) this.promo = hit;
      else this.doMove(hit[0]);
      return;
    }
    const pc = this.game.board[s];
    if (pc && Math.sign(pc) === this.game.side) {
      this.selected = s;
      this.targets = this.game.moves().filter((m) => m.from === s);
      this.env.sfx.tone({ freq: 520, dur: 0.04, vol: 0.04 });
    } else {
      this.selected = -1;
      this.targets = [];
    }
  }

  private undo() {
    if (this.anim || this.thinkT > 0) return;
    const n = this.mode === "bot" ? (this.game.side === this.human ? 2 : 1) : 1;
    for (let i = 0; i < n && this.game.history.length; i++) {
      this.game.undo();
      this.moveList.pop();
    }
    this.result = null;
    this.finishTimer = -1;
    this.selected = -1;
    this.targets = [];
    this.hint = null;
    if (this.botTurn()) this.thinkT = 0.45;
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.state === "menu" && this.menu.key(code)) {
      this.start();
      return true;
    }
    if (this.state === "play" && code === "Backspace") {
      this.undo();
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.time += dt;
    this.particles.update(dt);
    if (this.state === "menu") this.menu.update(dt);
    if (this.state === "over") this.over.update(dt);
    if (this.anim) {
      this.anim.t += dt / 0.18;
      if (this.anim.t >= 1) this.anim = null;
    }
    if (this.state !== "play") return;
    if (this.finishTimer > 0) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.finish();
      return;
    }
    if (this.thinkT > 0 && !this.anim) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        const m = this.game.bestMove(this.level);
        if (m) this.doMove(m);
      }
    }
  }

  private promoBox() {
    const s = this.sq * 1.1;
    return { x: this.w / 2 - s * 2, y: this.by + this.sq * 4 - s / 2, s };
  }

  render() {
    const { ctx } = this.env;
    const { w, h, sq, bx, by } = this;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1b1410");
    bg.addColorStop(1, "#2c2016");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Frame
    ctx.fillStyle = "#4a3221";
    roundRectPath(ctx, bx - 8, by - 8, sq * 8 + 16, sq * 8 + 16, 10);
    ctx.fill();
    // Squares with a subtle wood grain
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const light = (r + f) % 2 === 0;
        const g = ctx.createLinearGradient(bx + f * sq, by + r * sq, bx + (f + 1) * sq, by + (r + 1) * sq);
        g.addColorStop(0, light ? "#f3dfb8" : "#b07a4f");
        g.addColorStop(1, light ? "#e6cb98" : "#9a6640");
        ctx.fillStyle = g;
        ctx.fillRect(bx + f * sq, by + r * sq, sq, sq);
      }
    }
    // Coordinates
    ctx.font = `600 ${Math.max(9, sq * 0.2)}px ${FONT_BODY}`;
    for (let i = 0; i < 8; i++) {
      const file = this.flipped ? 7 - i : i;
      const rank = this.flipped ? i + 1 : 8 - i;
      ctx.fillStyle = i % 2 === 0 ? "#9a6640" : "#f3dfb8";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`${rank}`, bx + 2, by + i * sq + 2);
      ctx.fillStyle = i % 2 === 1 ? "#9a6640" : "#f3dfb8";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText("abcdefgh"[file], bx + (i + 1) * sq - 2, by + 8 * sq - 1);
    }

    const hl = (s: number, color: string) => {
      const p = this.sqPos(s);
      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, sq, sq);
    };
    const last = this.game.history[this.game.history.length - 1];
    if (last) {
      hl(last.move.from, "rgba(255,214,90,0.35)");
      hl(last.move.to, "rgba(255,214,90,0.45)");
    }
    if (this.selected >= 0) hl(this.selected, "rgba(99,200,255,0.45)");
    if (this.hint) {
      hl(this.hint.from, "rgba(120,255,160,0.4)");
      hl(this.hint.to, "rgba(120,255,160,0.55)");
    }
    if (this.game.inCheck()) {
      const p = this.sqPos(this.game.kingSquare(this.game.side));
      const g = ctx.createRadialGradient(p.x + sq / 2, p.y + sq / 2, 2, p.x + sq / 2, p.y + sq / 2, sq * 0.7);
      g.addColorStop(0, "rgba(255,40,40,0.9)");
      g.addColorStop(1, "rgba(255,40,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(p.x, p.y, sq, sq);
    }

    // Pieces
    const animTo = this.anim ? this.anim.m.to : -1;
    for (let s = 0; s < 64; s++) {
      const pc = this.game.board[s];
      if (!pc || s === animTo) continue;
      const p = this.sqPos(s);
      ctx.drawImage(pieceSprite(Math.abs(pc), pc > 0, sq), p.x, p.y, sq, sq);
    }
    if (this.anim) {
      const m = this.anim.m;
      const a = this.sqPos(m.from);
      const b = this.sqPos(m.to);
      const k = ease.outCubic(clamp(this.anim.t, 0, 1));
      const pc = this.game.board[m.to];
      ctx.drawImage(pieceSprite(Math.abs(pc), pc > 0, sq), a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * sq * 0.15, sq, sq);
    }
    // Move targets
    for (const m of this.targets) {
      const p = this.sqPos(m.to);
      if (this.game.board[m.to] || m.flag === "ep") {
        ctx.strokeStyle = "rgba(20,30,60,0.45)";
        ctx.lineWidth = sq * 0.08;
        ctx.beginPath();
        ctx.arc(p.x + sq / 2, p.y + sq / 2, sq * 0.44, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(20,30,60,0.3)";
        ctx.beginPath();
        ctx.arc(p.x + sq / 2, p.y + sq / 2, sq * 0.15, 0, TAU);
        ctx.fill();
      }
    }

    // Bars
    const topSide = this.flipped ? 1 : -1;
    const name = (side: number) => (this.mode === "friend" ? (side === 1 ? "ฝั่งขาว" : "ฝั่งดำ") : side === this.human ? "คุณ" : `บอท (${LEVEL_NAMES[this.level]})`);
    const capturedBy = (side: number) => {
      let v = 0;
      for (const u of this.game.history) if (u.move.captured && Math.sign(u.move.piece) === side) v += [0, 1, 3, 3, 5, 9, 0][Math.abs(u.move.captured)];
      return v;
    };
    const bar = (side: number, y: number) => {
      const diff = capturedBy(side) - capturedBy(-side);
      playerBar(ctx, bx, y, sq * 8, {
        name: name(side),
        color: side === 1 ? "#f8f1e0" : "#64748b",
        active: this.game.side === side && this.state === "play" && !this.result,
        thinking: this.botTurn() && this.game.side === side,
        right: diff > 0 ? `+${diff}` : "",
        time: this.time,
        swatch: (c, x, y2, r) => {
          c.save();
          c.translate(x - r, y2 - r);
          c.scale((r * 2) / 100, (r * 2) / 100);
          drawPiece(c, K, side === 1);
          c.restore();
        },
      });
    };
    bar(topSide, by - 8 - 46);
    bar(-topSide, by + sq * 8 + 14);

    // Toolbar
    const ty = by + sq * 8 + 14 + 40 + 34;
    const tools = [this.btnUndo, this.btnHint, this.btnFlip, this.btnMenu];
    tools.forEach((b, i) => {
      b.place(w / 2 + (i - 1.5) * 76, Math.min(ty, h - 34), 20);
      b.render(ctx, b !== this.btnUndo || this.game.history.length > 0);
    });
    if (this.moveList.length) {
      ctx.font = `500 12px ${FONT_BODY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      const n = this.moveList.length;
      const lastMoves = this.moveList.slice(-6).map((m, i) => {
        const idx = n - Math.min(6, n) + i;
        return idx % 2 === 0 ? `${idx / 2 + 1}. ${m}` : m;
      });
      ctx.fillText(lastMoves.join("  "), w / 2, by - 8 - 50);
    }

    if (this.promo) {
      const box = this.promoBox();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx, by, sq * 8, sq * 8);
      ctx.fillStyle = "rgba(30,24,20,0.96)";
      roundRectPath(ctx, box.x - 8, box.y - 30, box.s * 4 + 16, box.s + 40, 14);
      ctx.fill();
      ctx.font = `700 14px ${FONT_DISPLAY}`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("เลื่อนขั้นเบี้ยเป็น", w / 2, box.y - 24);
      [Q, R, B, N].forEach((k, i) => ctx.drawImage(pieceSprite(k, this.game.side === 1, box.s), box.x + i * box.s, box.y, box.s, box.s));
    }
    this.particles.render(ctx);

    if (this.result && this.state === "play" && this.finishTimer > 0) {
      ctx.font = `800 26px ${FONT_DISPLAY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(this.result.reason, w / 2, by + sq * 4);
      ctx.fillStyle = "#ffd76a";
      ctx.fillText(this.result.reason, w / 2, by + sq * 4);
    }
    if (this.state === "menu") this.menu.render(ctx, w, h);
    if (this.state === "over" && this.result)
      this.over.render(ctx, w, h, {
        title: this.resultTitle(),
        subtitle: `${this.result.reason} · ${Math.ceil(this.game.history.length / 2)} ตา`,
        coins: this.earned,
        chips: this.mode === "bot" ? [`บอท${LEVEL_NAMES[this.level]}`] : ["โหมดเพื่อน"],
        accent: "#d4a73c",
      });
  }
}
