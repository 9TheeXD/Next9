// "Four Corners Party" — up to four people around one phone or tablet, each owning a corner.
// Empty seats are filled by bots. Six quick mini-games, played free-for-all, two-versus-two
// (bottom vs top) or all together against the game. Laughing with others is one of the best ways
// to ride out a craving, and nobody can smoke while both hands are busy tapping.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, clamp, TAU, FONT_DISPLAY, FONT_BODY, rng, glow, roundRectPath, rgba, ease } from "./engine/fx";
import { SetupMenu } from "./engine/menu";
import { DuelOver } from "./engine/duel";
import { pentatonic } from "./engine/audio";

export const partyGame: GameDefinition = {
  id: "party",
  title: "ปาร์ตี้ 4 มุม",
  tagline: "1–4 คนเครื่องเดียว แข่ง แบ่งทีม หรือร่วมมือ",
  why: "หัวเราะไปกับคนรอบตัว มือไม่ว่างเลยสักวินาที ช่วงที่อยากบุหรี่จะผ่านไปพร้อมเสียงเฮ",
  category: "party",
  minutes: "3–10 นาที",
  palette: ["#1e1b4b", "#f59e0b"],
  create: (env) => new PartyGame(env),
};

type Mode = "ffa" | "team" | "coop";
type Phase = "menu" | "intro" | "count" | "play" | "result" | "final";

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308"];
const SEAT_NAMES = ["น้ำเงิน", "แดง", "เขียว", "เหลือง"];
/** Seats: 0 bottom-left, 1 bottom-right, 2 top-right, 3 top-left. Teams: bottom (0,1) vs top (2,3). */
const teamOf = (i: number) => (i < 2 ? 0 : 1);
const TEAM_NAMES = ["ทีมล่าง", "ทีมบน"];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Mini-game base ─────────────────────────────────────────────────────────

abstract class Mini {
  abstract name: string;
  abstract howTo: string;
  modes: Mode[] = ["ffa", "team", "coop"];
  done = false;
  t = 0;
  raw = [0, 0, 0, 0];
  /** For the result line, e.g. "แตะ 52 ครั้ง". */
  unit = "แต้ม";
  constructor(protected P: PartyGame) {}
  abstract icon(c: CanvasRenderingContext2D, s: number): void;
  start() {}
  abstract update(dt: number): void;
  tap(_seat: number) {}
  abstract renderArena(c: CanvasRenderingContext2D, a: Rect): void;
  renderSeat(_c: CanvasRenderingContext2D, _i: number, _w: number, _h: number) {}
  /** Co-op result 0–3 stars. */
  stars() {
    return 0;
  }
  /** Override when the winner is not simply the highest raw score (e.g. tug of war). */
  teamWinner(): number | null {
    const a = this.raw[0] + this.raw[1];
    const b = this.raw[2] + this.raw[3];
    return a === b ? null : a > b ? 0 : 1;
  }
  get skill() {
    return [0.45, 0.7, 0.92][this.P.level] ?? 0.7;
  }
  /** Taps per second a bot manages in mashing games. */
  botRate() {
    return 4 + this.skill * 6;
  }
}

// 1 ─ Rocket mash ───────────────────────────────────────────────────────────

class RocketMash extends Mini {
  name = "จรวดแตะรัว";
  howTo = "แตะมุมของตัวเองให้เร็วที่สุด จรวดใครพุ่งสูงสุดชนะ";
  unit = "ครั้ง";
  private botT = [0, 0, 0, 0];
  private flame = [0, 0, 0, 0];
  dur = 6;
  icon(c: CanvasRenderingContext2D, s: number) {
    drawRocket(c, 0, 0, s, "#f97316", 1);
  }
  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < 4; i++) {
      this.flame[i] = Math.max(0, this.flame[i] - dt * 5);
      if (this.P.isBot(i)) {
        this.botT[i] -= dt;
        if (this.botT[i] <= 0) {
          this.botT[i] = (1 / this.botRate()) * (0.75 + Math.random() * 0.5);
          this.tap(i);
        }
      }
    }
    if (this.t >= this.dur) this.done = true;
  }
  tap(i: number) {
    if (this.t >= this.dur) return;
    this.raw[i]++;
    this.flame[i] = 1;
    if (!this.P.isBot(i)) this.P.env.sfx.tone({ freq: 300 + this.raw[i] * 6, dur: 0.03, vol: 0.03, type: "square" });
  }
  stars() {
    const total = this.raw.reduce((s, v) => s + v, 0);
    return total >= 190 ? 3 : total >= 150 ? 2 : total >= 110 ? 1 : 0;
  }
  renderArena(c: CanvasRenderingContext2D, a: Rect) {
    const max = Math.max(30, ...this.raw);
    const lw = a.w / 4;
    for (let i = 0; i < 4; i++) {
      const k = this.raw[i] / max;
      const x = a.x + lw * i + lw / 2;
      c.fillStyle = "rgba(255,255,255,0.05)";
      roundRectPath(c, x - lw * 0.32, a.y + 10, lw * 0.64, a.h - 20, 12);
      c.fill();
      const top = a.y + a.h - 30 - (a.h - 70) * k;
      const g = c.createLinearGradient(0, top, 0, a.y + a.h);
      g.addColorStop(0, rgba(COLORS[i], 0.8));
      g.addColorStop(1, rgba(COLORS[i], 0.05));
      c.fillStyle = g;
      c.fillRect(x - lw * 0.08, top + 20, lw * 0.16, a.y + a.h - 10 - top - 20);
      drawRocket(c, x, top, Math.min(lw * 0.5, 40), COLORS[i], this.flame[i]);
    }
    if (this.P.mode === "coop") {
      const total = this.raw.reduce((s, v) => s + v, 0);
      this.P.arenaText(c, `รวม ${total} ครั้ง`, 18, "#ffffff", a.h * 0.42);
    }
  }
  renderSeat(c: CanvasRenderingContext2D, i: number, w: number, h: number) {
    c.font = `800 ${Math.round(h * 0.34)}px ${FONT_DISPLAY}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#ffffff";
    c.fillText(`${this.raw[i]}`, w / 2, h * 0.58);
    if (this.t < this.dur) {
      c.font = `600 12px ${FONT_BODY}`;
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.fillText(`เหลือ ${Math.max(0, this.dur - this.t).toFixed(1)} วิ`, w / 2, h * 0.86);
    }
  }
}

function drawRocket(c: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, flame: number) {
  c.save();
  c.translate(x, y);
  if (flame > 0) {
    const fl = s * (0.4 + flame * 0.5);
    const g = c.createLinearGradient(0, s * 0.45, 0, s * 0.45 + fl);
    g.addColorStop(0, "#fde68a");
    g.addColorStop(1, "rgba(249,115,22,0)");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-s * 0.16, s * 0.42);
    c.lineTo(0, s * 0.42 + fl);
    c.lineTo(s * 0.16, s * 0.42);
    c.fill();
  }
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-s * 0.3, s * 0.45);
  c.lineTo(-s * 0.18, s * 0.15);
  c.lineTo(s * 0.18, s * 0.15);
  c.lineTo(s * 0.3, s * 0.45);
  c.closePath();
  c.fill();
  const g = c.createLinearGradient(-s * 0.2, 0, s * 0.2, 0);
  g.addColorStop(0, "#e2e8f0");
  g.addColorStop(0.5, "#ffffff");
  g.addColorStop(1, "#94a3b8");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, -s * 0.5);
  c.quadraticCurveTo(s * 0.26, -s * 0.15, s * 0.18, s * 0.42);
  c.lineTo(-s * 0.18, s * 0.42);
  c.quadraticCurveTo(-s * 0.26, -s * 0.15, 0, -s * 0.5);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  c.arc(0, -s * 0.05, s * 0.09, 0, TAU);
  c.fill();
  c.restore();
}

// 2 ─ Quick draw ────────────────────────────────────────────────────────────

class QuickDraw extends Mini {
  name = "ไฟเขียวไวสุด";
  howTo = "รอให้ไฟเปลี่ยนเป็นสีเขียวแล้วแตะทันที ถ้าแตะตอนไฟแดงจะโดนพักรอบนั้น";
  unit = "รอบ";
  private round = 0;
  private sub: "wait" | "go" | "show" = "wait";
  private wait = 0;
  private goAt = 0;
  private times: (number | null)[] = [null, null, null, null];
  private foul = [false, false, false, false];
  private botAt = [0, 0, 0, 0];
  private winner = -1;
  private coopOk = 0;
  private rounds = 3;
  icon(c: CanvasRenderingContext2D, s: number) {
    c.fillStyle = "#1f2937";
    roundRectPath(c, -s * 0.22, -s * 0.48, s * 0.44, s * 0.96, s * 0.2);
    c.fill();
    c.fillStyle = "#ef4444";
    c.beginPath();
    c.arc(0, -s * 0.22, s * 0.15, 0, TAU);
    c.fill();
    c.fillStyle = "#22c55e";
    c.beginPath();
    c.arc(0, s * 0.22, s * 0.15, 0, TAU);
    c.fill();
  }
  start() {
    this.nextRound();
  }
  private nextRound() {
    this.sub = "wait";
    this.wait = 1.3 + Math.random() * 2.4;
    this.times = [null, null, null, null];
    this.foul = [false, false, false, false];
    this.winner = -1;
    for (let i = 0; i < 4; i++) this.botAt[i] = 0.55 - this.skill * 0.32 + Math.random() * 0.18;
  }
  update(dt: number) {
    this.t += dt;
    if (this.sub === "wait") {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.sub = "go";
        this.goAt = this.t;
        this.P.env.sfx.tone({ freq: 880, dur: 0.15, vol: 0.08, type: "square" });
      }
    } else if (this.sub === "go") {
      const since = this.t - this.goAt;
      for (let i = 0; i < 4; i++) if (this.P.isBot(i) && this.times[i] === null && since >= this.botAt[i]) this.tap(i);
      const allIn = [0, 1, 2, 3].every((i) => this.times[i] !== null || this.foul[i]);
      if (since > 1.6 || allIn || (this.P.mode !== "coop" && this.winner >= 0 && since > this.winnerTime() + 0.5)) this.finishRound();
    } else {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.round++;
        if (this.round >= this.rounds) this.done = true;
        else this.nextRound();
      }
    }
  }
  private winnerTime() {
    return this.winner >= 0 ? this.times[this.winner]! : 0;
  }
  private finishRound() {
    this.sub = "show";
    this.wait = 1.3;
    if (this.P.mode === "coop") {
      const ok = [0, 1, 2, 3].every((i) => !this.foul[i] && this.times[i] !== null && this.times[i]! < 0.75);
      if (ok) this.coopOk++;
      this.P.env.sfx.chime(pentatonic(ok ? 7 : 1), 0.08);
    } else if (this.winner >= 0) {
      this.raw[this.winner]++;
      this.P.burstAtSeat(this.winner);
    }
  }
  tap(i: number) {
    if (this.sub === "wait") {
      if (!this.foul[i]) {
        this.foul[i] = true;
        if (!this.P.isBot(i)) this.P.env.sfx.tone({ freq: 160, dur: 0.2, vol: 0.08, type: "sawtooth" });
      }
      return;
    }
    if (this.sub !== "go" || this.foul[i] || this.times[i] !== null) return;
    this.times[i] = this.t - this.goAt;
    if (this.winner < 0) {
      this.winner = i;
      this.P.env.sfx.chime(pentatonic(6), 0.1);
    }
  }
  stars() {
    return this.coopOk;
  }
  renderArena(c: CanvasRenderingContext2D, a: Rect) {
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const r = Math.min(a.w, a.h) * 0.28;
    const go = this.sub === "go" || (this.sub === "show" && this.winner >= 0);
    const col = go ? "#22c55e" : "#ef4444";
    glow(c, cx, cy, r * 2.2, col, 0.45);
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, go ? "#bbf7d0" : "#fecaca");
    g.addColorStop(1, col);
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.fill();
    const msg = this.sub === "wait" ? "รอ…" : this.sub === "go" ? "แตะ!" : this.P.mode === "coop" ? "" : this.winner >= 0 ? `${SEAT_NAMES[this.winner]} ไวสุด` : "ไม่มีใครทัน";
    if (msg) this.P.arenaText(c, msg, 22, "#ffffff", r + 26);
    c.font = `600 13px ${FONT_BODY}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(255,255,255,0.8)";
    c.fillText(`รอบ ${Math.min(this.round + 1, this.rounds)}/${this.rounds}`, cx, cy);
  }
  renderSeat(c: CanvasRenderingContext2D, i: number, w: number, h: number) {
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (this.foul[i]) {
      c.font = `800 ${Math.round(h * 0.2)}px ${FONT_DISPLAY}`;
      c.fillStyle = "#fca5a5";
      c.fillText("แตะเร็วไป!", w / 2, h * 0.6);
      return;
    }
    const t = this.times[i];
    c.font = `800 ${Math.round(h * 0.24)}px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(t !== null ? `${Math.round(t * 1000)} ms` : this.sub === "go" ? "แตะ!" : "รอไฟเขียว", w / 2, h * 0.6);
    if (this.P.mode !== "coop") {
      c.font = `600 12px ${FONT_BODY}`;
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.fillText(`ชนะ ${this.raw[i]} รอบ`, w / 2, h * 0.86);
    }
  }
}

// 3 ─ Tug of war ────────────────────────────────────────────────────────────

class Tug extends Mini {
  name = "ชักเย่อ";
  howTo = "แตะรัวๆ เพื่อดึงเชือกมาฝั่งตัวเอง";
  private pos = 0; // team / coop: -1 top … 1 bottom
  private knot = { x: 0, y: 0 }; // ffa: normalised, corners at (±1, ±1)
  private botT = [0, 0, 0, 0];
  private winnerTeam: number | null = null;
  private dur = 14;
  private pull = [0, 0, 0, 0];
  icon(c: CanvasRenderingContext2D, s: number) {
    c.strokeStyle = "#d6b38a";
    c.lineWidth = s * 0.1;
    c.beginPath();
    c.moveTo(-s * 0.5, 0);
    c.quadraticCurveTo(0, s * 0.12, s * 0.5, 0);
    c.stroke();
    c.fillStyle = "#ef4444";
    c.fillRect(-s * 0.05, -s * 0.2, s * 0.1, s * 0.3);
  }
  update(dt: number) {
    this.t += dt;
    for (let i = 0; i < 4; i++) {
      this.pull[i] = Math.max(0, this.pull[i] - dt * 4);
      if (this.P.isBot(i)) {
        this.botT[i] -= dt;
        if (this.botT[i] <= 0) {
          this.botT[i] = (1 / this.botRate()) * (0.75 + Math.random() * 0.5);
          this.tap(i);
        }
      }
    }
    if (this.P.mode === "coop") {
      // The smog monster pulls harder and harder
      this.pos -= dt * (0.06 + this.t * 0.008) * (1 + this.P.level * 0.2);
      if (this.pos >= 1) this.end(0);
      if (this.pos <= -1) this.end(1);
    }
    if (this.t >= this.dur && !this.done) {
      if (this.P.mode === "ffa") {
        const d = [0, 1, 2, 3].map((i) => this.distTo(i));
        this.raw = d.map((v) => -v);
        this.done = true;
      } else this.end(this.pos === 0 ? null : this.pos > 0 ? 0 : 1);
    }
  }
  private corner(i: number) {
    return [
      { x: -1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
    ][i];
  }
  private distTo(i: number) {
    const k = this.corner(i);
    return Math.hypot(this.knot.x - k.x, this.knot.y - k.y);
  }
  private end(team: number | null) {
    this.winnerTeam = team;
    this.done = true;
    this.raw = [0, 1, 2, 3].map((i) => (team === null ? 0 : teamOf(i) === team ? 1 : 0));
  }
  teamWinner() {
    return this.winnerTeam;
  }
  stars() {
    if (this.winnerTeam === 0) return this.t < 9 ? 3 : 2;
    return this.pos > -1 ? 1 : 0;
  }
  tap(i: number) {
    if (this.done) return;
    this.pull[i] = 1;
    if (!this.P.isBot(i)) this.P.env.sfx.tone({ freq: 200 + Math.random() * 60, dur: 0.04, vol: 0.04, type: "triangle" });
    if (this.P.mode === "ffa") {
      const k = this.corner(i);
      const d = Math.hypot(k.x - this.knot.x, k.y - this.knot.y) || 1;
      this.knot.x += ((k.x - this.knot.x) / d) * 0.018;
      this.knot.y += ((k.y - this.knot.y) / d) * 0.018;
      if (this.distTo(i) < 0.18) {
        this.raw = [0, 1, 2, 3].map((j) => (j === i ? 10 : -this.distTo(j)));
        this.done = true;
      }
      return;
    }
    if (this.P.mode === "coop") this.pos += 0.0055;
    else this.pos += teamOf(i) === 0 ? 0.02 : -0.02;
    if (this.P.mode === "team" && Math.abs(this.pos) >= 1) this.end(this.pos > 0 ? 0 : 1);
  }
  renderArena(c: CanvasRenderingContext2D, a: Rect) {
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    c.lineCap = "round";
    if (this.P.mode === "ffa") {
      const kx = cx + this.knot.x * a.w * 0.42;
      const ky = cy + this.knot.y * a.h * 0.42;
      for (let i = 0; i < 4; i++) {
        const k = this.corner(i);
        const ex = cx + k.x * a.w * 0.5;
        const ey = cy + k.y * a.h * 0.5;
        c.strokeStyle = rgba(COLORS[i], 0.9);
        c.lineWidth = 6 + this.pull[i] * 3;
        c.beginPath();
        c.moveTo(ex, ey);
        c.lineTo(kx, ky);
        c.stroke();
        c.fillStyle = rgba(COLORS[i], 0.3);
        c.beginPath();
        c.arc(cx + k.x * a.w * 0.42, cy + k.y * a.h * 0.42, 0.18 * a.w * 0.42, 0, TAU);
        c.fill();
      }
      glow(c, kx, ky, 34, "#ffffff", 0.5);
      c.fillStyle = "#f8fafc";
      c.beginPath();
      c.arc(kx, ky, 12, 0, TAU);
      c.fill();
      return;
    }
    // Vertical rope; centre line and goal lines
    const span = a.h * 0.38;
    const ky = cy + this.pos * span;
    c.strokeStyle = "rgba(255,255,255,0.25)";
    c.lineWidth = 2;
    c.setLineDash([8, 8]);
    for (const y of [cy - span, cy + span]) {
      c.beginPath();
      c.moveTo(a.x + 20, y);
      c.lineTo(a.x + a.w - 20, y);
      c.stroke();
    }
    c.setLineDash([]);
    c.strokeStyle = "#d6b38a";
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(cx, a.y);
    for (let y = a.y; y <= a.y + a.h; y += 12) c.lineTo(cx + Math.sin(y * 0.08 + this.t * 20) * (this.pull.some((p) => p > 0.5) ? 2 : 0.5), y);
    c.stroke();
    c.fillStyle = "#ef4444";
    roundRectPath(c, cx - 22, ky - 8, 44, 16, 6);
    c.fill();
    if (this.P.mode === "coop") {
      // Smog monster at the top
      const my = a.y + 30;
      for (let k = 0; k < 6; k++) {
        c.fillStyle = `rgba(110,110,125,${0.7 - k * 0.05})`;
        c.beginPath();
        c.arc(cx + Math.cos(k + this.t * 2) * 30, my + Math.sin(k * 2 + this.t * 3) * 8, 24 - k * 2, 0, TAU);
        c.fill();
      }
      c.fillStyle = "#fecaca";
      c.beginPath();
      c.arc(cx - 12, my - 2, 4, 0, TAU);
      c.arc(cx + 12, my - 2, 4, 0, TAU);
      c.fill();
      this.P.arenaText(c, `ดึงลงมาให้ถึงเส้น! ${Math.max(0, this.dur - this.t).toFixed(0)} วิ`, 15, "#ffffff", -span - 26, true);
    } else {
      c.font = `700 14px ${FONT_DISPLAY}`;
      c.textAlign = "left";
      c.textBaseline = "middle";
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.fillText(TEAM_NAMES[0], a.x + 20, cy + span + 16);
      c.save();
      c.translate(a.x + a.w - 20, cy - span - 16);
      c.rotate(Math.PI);
      c.fillText(TEAM_NAMES[1], 0, 0);
      c.restore();
    }
  }
  renderSeat(c: CanvasRenderingContext2D, i: number, w: number, h: number) {
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `800 ${Math.round(h * 0.22)}px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(this.pull[i] > 0.3 ? "ฮึบ!" : "ดึง!", w / 2, h * 0.58);
    c.font = `600 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText(`เหลือ ${Math.max(0, this.dur - this.t).toFixed(0)} วิ`, w / 2, h * 0.86);
  }
}

// 4 ─ Snap (same symbol twice) ──────────────────────────────────────────────

const SHAPES = ["circle", "square", "diamond", "triangle", "star", "ring"] as const;
const SNAP_COLORS = ["#f43f5e", "#22d3ee", "#a3e635", "#facc15"];

function drawShape(c: CanvasRenderingContext2D, shape: string, x: number, y: number, r: number, color: string) {
  c.save();
  c.translate(x, y);
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = r * 0.28;
  c.beginPath();
  switch (shape) {
    case "circle":
      c.arc(0, 0, r, 0, TAU);
      c.fill();
      break;
    case "square":
      roundRectPath(c, -r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.2);
      c.fill();
      break;
    case "diamond":
      c.moveTo(0, -r);
      c.lineTo(r, 0);
      c.lineTo(0, r);
      c.lineTo(-r, 0);
      c.closePath();
      c.fill();
      break;
    case "triangle":
      c.moveTo(0, -r);
      c.lineTo(r * 0.95, r * 0.7);
      c.lineTo(-r * 0.95, r * 0.7);
      c.closePath();
      c.fill();
      break;
    case "star":
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU - Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        if (k) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      break;
    case "ring":
      c.arc(0, 0, r * 0.8, 0, TAU);
      c.stroke();
      break;
  }
  c.restore();
}

class Snap extends Mini {
  name = "จับคู่เหมือน";
  howTo = "ถ้ารูปซ้ายกับขวาเหมือนกันทั้งรูปทรงและสี ให้แตะทันที! แตะผิดเสียแต้ม";
  private cards: { a: [number, number]; b: [number, number]; match: boolean }[] = [];
  private idx = -1;
  private cardT = 0;
  private interval = 1.15;
  private tapped = [false, false, false, false];
  private first = -1;
  private lock = [0, 0, 0, 0];
  private botPlan: (number | null)[] = [null, null, null, null];
  private hits = 0;
  private wrong = 0;
  private matches = 0;
  private flash = [0, 0, 0, 0];
  private rand = rng(Date.now() % 9973);
  icon(c: CanvasRenderingContext2D, s: number) {
    drawShape(c, "star", -s * 0.25, 0, s * 0.22, "#facc15");
    drawShape(c, "star", s * 0.25, 0, s * 0.22, "#facc15");
  }
  start() {
    for (let i = 0; i < 16; i++) {
      const a: [number, number] = [Math.floor(this.rand() * SHAPES.length), Math.floor(this.rand() * 4)];
      const match = this.rand() < 0.36;
      let b: [number, number] = [a[0], a[1]];
      if (!match) {
        // Near misses (same shape or same colour) make it tricky
        if (this.rand() < 0.5) b = [a[0], (a[1] + 1 + Math.floor(this.rand() * 3)) % 4];
        else b = [(a[0] + 1 + Math.floor(this.rand() * 5)) % SHAPES.length, this.rand() < 0.6 ? a[1] : (a[1] + 1) % 4];
      }
      this.cards.push({ a, b, match });
    }
    this.next();
  }
  private next() {
    this.idx++;
    if (this.idx >= this.cards.length) {
      this.done = true;
      return;
    }
    this.cardT = 0;
    this.interval = Math.max(0.75, 1.15 - this.idx * 0.025);
    this.tapped = [false, false, false, false];
    this.first = -1;
    const card = this.cards[this.idx];
    if (card.match) this.matches++;
    for (let i = 0; i < 4; i++) {
      this.botPlan[i] = null;
      if (!this.P.isBot(i)) continue;
      if (card.match && Math.random() < 0.55 + this.skill * 0.45) this.botPlan[i] = 0.42 - this.skill * 0.15 + Math.random() * 0.3;
      else if (!card.match && Math.random() < (1 - this.skill) * 0.12) this.botPlan[i] = 0.3 + Math.random() * 0.4;
    }
  }
  update(dt: number) {
    this.t += dt;
    this.cardT += dt;
    for (let i = 0; i < 4; i++) {
      this.lock[i] = Math.max(0, this.lock[i] - dt);
      this.flash[i] = Math.max(0, this.flash[i] - dt * 3);
      const plan = this.botPlan[i];
      if (plan !== null && this.cardT >= plan) {
        this.botPlan[i] = null;
        this.tap(i);
      }
    }
    if (this.cardT >= this.interval) this.next();
  }
  tap(i: number) {
    if (this.done || this.idx < 0 || this.tapped[i] || this.lock[i] > 0) return;
    const card = this.cards[this.idx];
    this.tapped[i] = true;
    if (card.match) {
      const gain = this.first < 0 ? 2 : 1;
      if (this.first < 0) this.first = i;
      this.raw[i] += gain;
      this.hits++;
      this.flash[i] = 1;
      if (!this.P.isBot(i) || this.first === i) this.P.env.sfx.chime(pentatonic(gain === 2 ? 8 : 6), 0.06);
    } else {
      this.raw[i] -= 1;
      this.wrong++;
      this.lock[i] = 0.5;
      this.flash[i] = -1;
      this.P.env.sfx.tone({ freq: 150, dur: 0.15, vol: 0.06, type: "sawtooth" });
    }
  }
  stars() {
    const ratio = this.matches ? this.hits / (this.matches * 4) - this.wrong * 0.04 : 0;
    return ratio > 0.85 ? 3 : ratio > 0.65 ? 2 : ratio > 0.4 ? 1 : 0;
  }
  renderArena(c: CanvasRenderingContext2D, a: Rect) {
    if (this.idx < 0 || this.idx >= this.cards.length) return;
    const card = this.cards[this.idx];
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const r = Math.min(a.w * 0.17, a.h * 0.22);
    const pop = ease.outBack(clamp(this.cardT * 6, 0, 1));
    for (const [side, s] of [
      [-1, card.a],
      [1, card.b],
    ] as const) {
      const x = cx + side * a.w * 0.22;
      c.fillStyle = "rgba(255,255,255,0.08)";
      roundRectPath(c, x - r * 1.4, cy - r * 1.4, r * 2.8, r * 2.8, 18);
      c.fill();
      drawShape(c, SHAPES[s[0]], x, cy, r * pop, SNAP_COLORS[s[1]]);
    }
    // Timer bar
    const k = 1 - this.cardT / this.interval;
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.fillRect(cx - a.w * 0.3 * k, cy + r * 1.7, a.w * 0.6 * k, 3);
    c.fillRect(cx - a.w * 0.3 * k, cy - r * 1.7 - 3, a.w * 0.6 * k, 3);
  }
  renderSeat(c: CanvasRenderingContext2D, i: number, w: number, h: number) {
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `800 ${Math.round(h * 0.3)}px ${FONT_DISPLAY}`;
    c.fillStyle = this.flash[i] > 0 ? "#bbf7d0" : this.flash[i] < 0 ? "#fecaca" : "#ffffff";
    c.fillText(`${this.raw[i]}`, w / 2, h * 0.6);
    if (this.lock[i] > 0) {
      c.font = `600 12px ${FONT_BODY}`;
      c.fillStyle = "#fecaca";
      c.fillText("ผิด! -1", w / 2, h * 0.86);
    }
  }
}

// 5 ─ Guard the core ────────────────────────────────────────────────────────

class CoreGuard extends Mini {
  name = "เฝ้าต้นไม้กลางวง";
  howTo = "ก้อนควันพุ่งเข้าหาต้นไม้จากมุมของทุกคน แตะมุมตัวเองเพื่อยิงก้อนที่อยู่ฝั่งตัวเอง";
  private blobs: { x: number; y: number; seat: number; v: number; dead: boolean }[] = [];
  private spawnT = 0.6;
  private cd = [0, 0, 0, 0];
  private beams: { seat: number; x: number; y: number; t: number }[] = [];
  private botT = [0, 0, 0, 0];
  hp = 10;
  private dur = 20;
  unit = "แต้ม";
  icon(c: CanvasRenderingContext2D, s: number) {
    c.fillStyle = "#22c55e";
    c.beginPath();
    c.arc(0, -s * 0.1, s * 0.3, 0, TAU);
    c.fill();
    c.fillStyle = "#78350f";
    c.fillRect(-s * 0.06, s * 0.1, s * 0.12, s * 0.3);
  }
  private seatDir(i: number) {
    return [
      { x: -1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
    ][i];
  }
  update(dt: number) {
    this.t += dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.t < this.dur - 1.5) {
      this.spawnT = Math.max(0.28, (this.P.mode === "coop" ? 0.85 : 1.05) - this.t * 0.035);
      const seat = Math.floor(Math.random() * 4);
      const d = this.seatDir(seat);
      const ang = Math.atan2(d.y, d.x) + (Math.random() - 0.5) * 1.2;
      this.blobs.push({ x: Math.cos(ang) * 1.15, y: Math.sin(ang) * 1.15, seat, v: 0.25 + this.t * 0.015, dead: false });
    }
    for (const b of this.blobs) {
      const d = Math.hypot(b.x, b.y);
      b.x -= (b.x / d) * b.v * dt;
      b.y -= (b.y / d) * b.v * dt;
      if (d < 0.14 && !b.dead) {
        b.dead = true;
        this.hp = Math.max(0, this.hp - 1);
        this.raw[b.seat] -= 2;
        this.P.env.sfx.noise({ dur: 0.25, vol: 0.08, freq: 300, type: "lowpass" });
      }
    }
    for (let i = 0; i < 4; i++) {
      this.cd[i] = Math.max(0, this.cd[i] - dt);
      if (this.P.isBot(i)) {
        const mine = this.blobs.some((b) => !b.dead && b.seat === i && Math.hypot(b.x, b.y) < 1.05);
        if (mine) {
          this.botT[i] -= dt;
          if (this.botT[i] <= 0) {
            this.botT[i] = 0.55 - this.skill * 0.35 + Math.random() * 0.25;
            this.tap(i);
          }
        } else this.botT[i] = Math.max(this.botT[i], 0.2);
      }
    }
    this.blobs = this.blobs.filter((b) => !b.dead);
    for (const bm of this.beams) bm.t -= dt * 4;
    this.beams = this.beams.filter((b) => b.t > 0);
    if (this.t >= this.dur || this.hp <= 0) this.done = true;
  }
  tap(i: number) {
    if (this.cd[i] > 0 || this.done) return;
    const mine = this.blobs.filter((b) => !b.dead && b.seat === i && Math.hypot(b.x, b.y) < 1.1);
    if (!mine.length) {
      this.cd[i] = 0.35;
      return;
    }
    mine.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    const b = mine[0];
    b.dead = true;
    this.raw[i]++;
    this.cd[i] = 0.16;
    this.beams.push({ seat: i, x: b.x, y: b.y, t: 1 });
    if (!this.P.isBot(i)) this.P.env.sfx.tone({ freq: 900, glideTo: 400, dur: 0.08, vol: 0.05, type: "square" });
  }
  stars() {
    return this.hp >= 9 ? 3 : this.hp >= 6 ? 2 : this.hp >= 1 ? 1 : 0;
  }
  renderArena(c: CanvasRenderingContext2D, a: Rect) {
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const R = Math.min(a.w, a.h) * 0.48;
    // Quadrant tints
    for (let i = 0; i < 4; i++) {
      const d = this.seatDir(i);
      c.fillStyle = rgba(COLORS[i], 0.08);
      c.fillRect(d.x < 0 ? a.x : cx, d.y < 0 ? a.y : cy, a.w / 2, a.h / 2);
    }
    // Tree
    glow(c, cx, cy, R * 0.5, "#86efac", 0.3 + 0.2 * (this.hp / 10));
    c.fillStyle = "#78350f";
    c.fillRect(cx - 4, cy - 2, 8, 16);
    c.fillStyle = this.hp > 5 ? "#22c55e" : this.hp > 2 ? "#a3e635" : "#a8a29e";
    for (const [dx, dy, r] of [
      [0, -10, 14],
      [-10, -2, 10],
      [10, -2, 10],
    ])
      c.beginPath(), c.arc(cx + dx, cy + dy, r, 0, TAU), c.fill();
    // HP ring
    c.strokeStyle = "rgba(134,239,172,0.8)";
    c.lineWidth = 4;
    c.beginPath();
    c.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + TAU * (this.hp / 10));
    c.stroke();
    for (const b of this.blobs) {
      const x = cx + b.x * R;
      const y = cy + b.y * R;
      for (let k = 0; k < 3; k++) {
        c.fillStyle = `rgba(120,120,135,${0.85 - k * 0.15})`;
        c.beginPath();
        c.arc(x + Math.cos(k * 2.1 + this.t * 3) * 5, y + Math.sin(k * 2.1 + this.t * 3) * 4, 11 - k * 2, 0, TAU);
        c.fill();
      }
      c.strokeStyle = COLORS[b.seat];
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 14, 0, TAU);
      c.stroke();
    }
    for (const bm of this.beams) {
      const d = this.seatDir(bm.seat);
      c.strokeStyle = rgba(COLORS[bm.seat], bm.t);
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(cx + d.x * a.w * 0.5, cy + d.y * a.h * 0.5);
      c.lineTo(cx + bm.x * R, cy + bm.y * R);
      c.stroke();
      glow(c, cx + bm.x * R, cy + bm.y * R, 24, COLORS[bm.seat], bm.t);
    }
  }
  renderSeat(c: CanvasRenderingContext2D, i: number, w: number, h: number) {
    c.textAlign = "center";
    c.textBaseline = "middle";
    const coop = this.P.mode === "coop";
    c.font = `800 ${Math.round(h * (coop ? 0.17 : 0.26))}px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(coop ? `ต้นไม้ ${this.hp}/10` : `${this.raw[i]}`, w / 2, h * 0.58);
    c.font = `600 12px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText("แตะเพื่อยิง", w / 2, h * 0.86);
  }
}

// 6 ─ Hot potato ────────────────────────────────────────────────────────────

class HotPotato extends Mini {
  name = "ระเบิดเวลา";
  howTo = "ระเบิดอยู่ที่ใคร ให้แตะ 2 ครั้งเพื่อส่งต่อ ใครถือตอนระเบิดตูมเสียแต้ม";
  modes: Mode[] = ["ffa", "team"];
  private holder = 0;
  private taps = 0;
  private fuse = 0;
  private round = 0;
  private boom = 0;
  private lastBoom = -1;
  private botT = 0;
  private tick = 0;
  private fly = 0;
  private from = 0;
  icon(c: CanvasRenderingContext2D, s: number) {
    c.fillStyle = "#1f2937";
    c.beginPath();
    c.arc(0, s * 0.08, s * 0.32, 0, TAU);
    c.fill();
    c.strokeStyle = "#d6b38a";
    c.lineWidth = s * 0.06;
    c.beginPath();
    c.moveTo(s * 0.15, -s * 0.2);
    c.quadraticCurveTo(s * 0.3, -s * 0.45, s * 0.42, -s * 0.38);
    c.stroke();
    glow(c, s * 0.42, -s * 0.38, s * 0.15, "#fbbf24", 1);
  }
  start() {
    this.holder = Math.floor(Math.random() * 4);
    this.newRound();
  }
  private newRound() {
    this.fuse = 5 + Math.random() * 6;
    this.taps = 0;
    this.botT = this.reaction();
  }
  private reaction() {
    return 0.6 - this.skill * 0.35 + Math.random() * 0.4;
  }
  update(dt: number) {
    this.t += dt;
    this.fly = Math.max(0, this.fly - dt * 6);
    if (this.boom > 0) {
      this.boom -= dt;
      if (this.boom <= 0) {
        this.round++;
        if (this.round >= 3) this.done = true;
        else this.newRound();
      }
      return;
    }
    this.fuse -= dt;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = clamp(this.fuse * 0.12, 0.12, 0.5);
      this.P.env.sfx.tone({ freq: 1200, dur: 0.02, vol: 0.03, type: "square" });
    }
    if (this.P.isBot(this.holder)) {
      this.botT -= dt;
      if (this.botT <= 0) {
        this.botT = 0.12 + (1 - this.skill) * 0.2;
        this.tap(this.holder);
      }
    }
    if (this.fuse <= 0) {
      this.boom = 1.6;
      this.lastBoom = this.holder;
      for (let i = 0; i < 4; i++) this.raw[i] += i === this.holder ? -2 : 1;
      this.P.burstAtSeat(this.holder, "#f97316", 60);
      this.P.env.sfx.noise({ dur: 0.7, vol: 0.18, freq: 600, sweepTo: 60, type: "lowpass" });
    }
  }
  tap(i: number) {
    if (i !== this.holder || this.boom > 0) return;
    this.taps++;
    if (this.taps >= 2) {
      this.from = this.holder;
      this.holder = (this.holder + 1) % 4;
      this.taps = 0;
      this.fly = 1;
      this.botT = this.reaction();
      this.P.env.sfx.tone({ freq: 500, glideTo: 800, dur: 0.08, vol: 0.05, type: "triangle" });
    }
  }
  private seatPoint(i: number, a: Rect) {
    const d = [
      { x: -1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
    ][i];
    return { x: a.x + a.w / 2 + d.x * a.w * 0.3, y: a.y + a.h / 2 + d.y * a.h * 0.32 };
  }
  renderArena(c: CanvasRenderingContext2D, a: Rect) {
    const to = this.seatPoint(this.holder, a);
    const from = this.seatPoint(this.from, a);
    const k = ease.outCubic(1 - this.fly);
    const x = from.x + (to.x - from.x) * k;
    const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 40;
    if (this.boom > 0) {
      const r = (1.6 - this.boom) * 160;
      glow(c, x, y, r + 40, "#f97316", this.boom / 1.6);
      this.P.arenaText(c, `ตูม! ${SEAT_NAMES[this.lastBoom]} โดน`, 22, "#fdba74", 0);
      return;
    }
    const wob = Math.sin(this.t * (20 - this.fuse)) * 3;
    c.save();
    c.translate(x + wob, y);
    this.icon(c, 70);
    c.restore();
    c.font = `600 13px ${FONT_BODY}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.fillText(`รอบ ${this.round + 1}/3`, a.x + a.w / 2, a.y + a.h / 2);
  }
  renderSeat(c: CanvasRenderingContext2D, i: number, w: number, h: number) {
    c.textAlign = "center";
    c.textBaseline = "middle";
    const hold = i === this.holder && this.boom <= 0;
    c.font = `800 ${Math.round(h * (hold ? 0.24 : 0.2))}px ${FONT_DISPLAY}`;
    c.fillStyle = hold ? "#fdba74" : "#ffffff";
    c.fillText(hold ? (this.taps ? "อีกที!" : "ส่งเลย!") : `${this.raw[i]}`, w / 2, h * 0.6);
  }
}

// ── The party itself ────────────────────────────────────────────────────────

const MINIS: (new (p: PartyGame) => Mini)[] = [RocketMash, QuickDraw, Tug, Snap, CoreGuard, HotPotato];

class PartyGame implements GameInstance {
  w = 0;
  h = 0;
  phase: Phase = "menu";
  phaseT = 0;
  time = 0;
  mode: Mode = "ffa";
  level = 1;
  humans = [true, false, false, false];
  private menu: SetupMenu;
  private over: DuelOver;
  private rounds = 5;
  private roundNo = 0;
  private queue: (new (p: PartyGame) => Mini)[] = [];
  private mini: Mini | null = null;
  points = [0, 0, 0, 0];
  private gained = [0, 0, 0, 0];
  private stars = 0;
  private lastStars = 0;
  private resultText = "";
  private earned = 0;
  private particles = new Particles();
  private seatFlash = [0, 0, 0, 0];

  constructor(public env: GameEnv) {
    this.menu = new SetupMenu(env, {
      title: "ปาร์ตี้ 4 มุม",
      subtitle: "วางเครื่องกลางวง แต่ละคนจับคนละมุม",
      accent: "#f59e0b",
      rows: [
        {
          key: "humans",
          label: "คนเล่นจริง (ที่เหลือเป็นบอท)",
          choices: [
            { value: "1", label: "1 คน" },
            { value: "2", label: "2 คน" },
            { value: "3", label: "3 คน" },
            { value: "4", label: "4 คน" },
          ],
        },
        {
          key: "mode",
          label: "แบบการเล่น",
          choices: [
            { value: "ffa", label: "ต่างคนต่างแข่ง" },
            { value: "team", label: "ทีม 2:2" },
            { value: "coop", label: "ร่วมมือกัน" },
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
          when: (v) => v.humans !== "4",
        },
        {
          key: "rounds",
          label: "จำนวนเกม",
          choices: [
            { value: "4", label: "4 เกม" },
            { value: "6", label: "6 เกม" },
            { value: "10", label: "10 เกม" },
          ],
        },
      ],
      icon: (c, t) => {
        for (let i = 0; i < 4; i++) {
          c.fillStyle = COLORS[i];
          const a = (i / 4) * TAU + t;
          c.beginPath();
          c.arc(Math.cos(a) * 26, Math.sin(a) * 16, 10, 0, TAU);
          c.fill();
        }
      },
    });
    this.over = new DuelOver("#f59e0b");
  }

  isBot(i: number) {
    return !this.humans[i];
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  seatRect(i: number): Rect {
    const sh = Math.max(96, this.h * 0.19);
    const sw = this.w / 2 - 9;
    const x = i === 0 || i === 3 ? 6 : this.w / 2 + 3;
    const y = i < 2 ? this.h - sh - 6 : 6;
    return { x, y, w: sw, h: sh };
  }

  arena(): Rect {
    const sh = Math.max(96, this.h * 0.19);
    return { x: 6, y: sh + 14, w: this.w - 12, h: this.h - sh * 2 - 28 };
  }

  /** Text readable from both ends of the table: upright below the centre, flipped above. */
  arenaText(c: CanvasRenderingContext2D, text: string, size: number, color: string, offset: number, onlyTop = false) {
    const a = this.arena();
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    c.save();
    c.font = `800 ${size}px ${FONT_DISPLAY}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 5;
    c.strokeStyle = "rgba(0,0,0,0.55)";
    c.fillStyle = color;
    if (!onlyTop) {
      c.strokeText(text, cx, cy + Math.abs(offset));
      c.fillText(text, cx, cy + Math.abs(offset));
    }
    c.translate(cx, onlyTop ? cy + offset : cy - Math.abs(offset));
    if (!onlyTop) c.rotate(Math.PI);
    c.strokeText(text, 0, 0);
    c.fillText(text, 0, 0);
    c.restore();
  }

  burstAtSeat(i: number, color = COLORS[i], n = 24) {
    const r = this.seatRect(i);
    this.particles.burst(r.x + r.w / 2, r.y + r.h / 2, color, n, { speed: 220, size: 3, gravity: 0, life: 0.8 });
  }

  private start() {
    const v = this.menu.values;
    const n = +v.humans || 1;
    // Humans fill opposite corners first so two people face each other
    const order = [0, 2, 1, 3];
    this.humans = [false, false, false, false];
    for (let k = 0; k < n; k++) this.humans[order[k]] = true;
    this.mode = (v.mode as Mode) || "ffa";
    this.level = +v.level || 0;
    this.rounds = +v.rounds || 6;
    this.points = [0, 0, 0, 0];
    this.stars = 0;
    this.roundNo = 0;
    this.queue = [];
    this.nextMini();
    this.env.emit({ type: "start" });
  }

  private nextMini() {
    if (!this.queue.length) {
      const pool = MINIS.filter((M) => new M(this).modes.includes(this.mode));
      // Shuffle, avoiding the same game twice in a row
      const last = this.mini?.constructor;
      this.queue = pool.sort(() => Math.random() - 0.5);
      if (this.queue[0] === last && this.queue.length > 1) this.queue.push(this.queue.shift()!);
    }
    const M = this.queue.shift()!;
    this.mini = new M(this);
    this.phase = "intro";
    this.phaseT = 0;
  }

  private settle() {
    const m = this.mini!;
    this.gained = [0, 0, 0, 0];
    if (this.mode === "coop") {
      this.lastStars = m.stars();
      this.stars += this.lastStars;
      this.resultText = this.lastStars ? `ได้ ${this.lastStars} ดาว` : "พลาดไปนิด ไม่ได้ดาว";
      if (this.lastStars) [0, 3, 5].slice(0, this.lastStars).forEach((s, k) => this.env.sfx.chime(pentatonic(s + 4), 0.1, k * 0.12));
    } else if (this.mode === "team") {
      const win = m.teamWinner();
      if (win === null) this.resultText = "เสมอ!";
      else {
        for (let i = 0; i < 4; i++) if (teamOf(i) === win) this.gained[i] = 3;
        this.resultText = `${TEAM_NAMES[win]} ชนะ!`;
      }
    } else {
      const order = [0, 1, 2, 3].sort((a, b) => m.raw[b] - m.raw[a]);
      const prize = [4, 2, 1, 0];
      let place = 0;
      order.forEach((i, k) => {
        if (k > 0 && m.raw[i] < m.raw[order[k - 1]]) place = k;
        this.gained[i] = prize[place];
      });
      const top = order.filter((i) => m.raw[i] === m.raw[order[0]]);
      this.resultText = top.length > 1 ? "เสมอที่หนึ่ง!" : `${SEAT_NAMES[order[0]]} ชนะ!`;
    }
    for (let i = 0; i < 4; i++) {
      this.points[i] += this.gained[i];
      if (this.gained[i] >= 3) this.burstAtSeat(i);
    }
    this.roundNo++;
    this.phase = "result";
    this.phaseT = 0;
  }

  private finish() {
    this.phase = "final";
    this.phaseT = 0;
    this.over.t = 0;
    let summary: string;
    if (this.mode === "coop") {
      this.earned = 10 + this.stars * 6;
      summary = `ร่วมมือ ${this.rounds} เกม ได้ ${this.stars}/${this.rounds * 3} ดาว`;
    } else {
      const best = Math.max(...this.points);
      const humanBest = Math.max(...this.points.filter((_, i) => this.humans[i]));
      this.earned = 10 + this.rounds * 3 + (humanBest === best ? 25 : 0);
      summary = this.mode === "team" ? `ทีมล่าง ${this.points[0] + this.points[1]} – ${this.points[2] + this.points[3]} ทีมบน` : `${SEAT_NAMES[this.points.indexOf(best)]} ชนะด้วย ${best} แต้ม`;
    }
    [0, 2, 4, 7, 9].forEach((s, k) => this.env.sfx.chime(pentatonic(s + 3), 0.1, k * 0.1));
    this.env.emit({ type: "end", coins: this.earned, score: Math.max(...this.points, this.stars), best: 0, summary, stats: { humans: this.humans.filter(Boolean).length, rounds: this.rounds } });
  }

  // ── Input ────────────────────────────────────────────────────────────────

  private seatAt(x: number, y: number) {
    for (let i = 0; i < 4; i++) {
      const r = this.seatRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  pointer(p: PointerInfo) {
    if (this.phase === "menu") {
      if (this.menu.pointer(p)) this.start();
      return;
    }
    if (this.phase === "final") {
      const a = this.over.pointer(p.type, p.x, p.y);
      if (a === "again") this.start();
      if (a === "setup") {
        this.phase = "menu";
        this.menu.reset();
      }
      return;
    }
    if (p.type !== "down") return;
    const seat = this.seatAt(p.x, p.y);
    if (this.phase === "intro" && this.phaseT > 1.2) {
      this.phase = "count";
      this.phaseT = 0;
      return;
    }
    if (this.phase === "play" && seat >= 0 && this.humans[seat]) {
      this.seatFlash[seat] = 1;
      this.mini!.tap(seat);
    }
    // Corner menu button (centre of the arena edge) to leave
    const a = this.arena();
    if (Math.hypot(p.x - (a.x + a.w - 18), p.y - (a.y + a.h / 2)) < 18) {
      this.phase = "menu";
      this.menu.reset();
    }
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.phase === "menu" && this.menu.key(code)) {
      this.start();
      return true;
    }
    // Keyboard seats for testing on a computer: Z, M, P, Q
    const seat = { KeyZ: 0, KeyM: 1, KeyP: 2, KeyQ: 3 }[code as "KeyZ"];
    if (seat !== undefined && this.phase === "play" && this.humans[seat]) {
      this.seatFlash[seat] = 1;
      this.mini!.tap(seat);
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    this.particles.update(dt);
    for (let i = 0; i < 4; i++) this.seatFlash[i] = Math.max(0, this.seatFlash[i] - dt * 5);
    if (this.phase === "menu") this.menu.update(dt);
    if (this.phase === "final") this.over.update(dt);
    if (this.phase === "intro" && this.phaseT > 6) {
      this.phase = "count";
      this.phaseT = 0;
    }
    if (this.phase === "count" && this.phaseT >= 2.4) {
      this.phase = "play";
      this.phaseT = 0;
      this.mini!.start();
      this.env.sfx.tone({ freq: 784, dur: 0.2, vol: 0.08, type: "square" });
    }
    if (this.phase === "count") {
      const n = Math.floor(this.phaseT / 0.8);
      if (Math.floor((this.phaseT - dt) / 0.8) !== n && this.phaseT - dt >= 0) this.env.sfx.tone({ freq: 523, dur: 0.1, vol: 0.06, type: "square" });
    }
    if (this.phase === "play") {
      this.mini!.update(dt);
      if (this.mini!.done) this.settle();
    }
    if (this.phase === "result" && this.phaseT > 3) {
      if (this.roundNo >= this.rounds) this.finish();
      else this.nextMini();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private withSeat(c: CanvasRenderingContext2D, i: number, fn: (w: number, h: number) => void) {
    const r = this.seatRect(i);
    c.save();
    if (i >= 2) {
      c.translate(r.x + r.w, r.y + r.h);
      c.rotate(Math.PI);
    } else c.translate(r.x, r.y);
    fn(r.w, r.h);
    c.restore();
  }

  private renderSeat(c: CanvasRenderingContext2D, i: number) {
    this.withSeat(c, i, (w, h) => {
      const col = COLORS[i];
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba(col, 0.28 + this.seatFlash[i] * 0.3));
      g.addColorStop(1, rgba(col, 0.55 + this.seatFlash[i] * 0.3));
      c.fillStyle = g;
      roundRectPath(c, 0, 0, w, h, 18);
      c.fill();
      c.strokeStyle = rgba(col, 0.95);
      c.lineWidth = 2;
      c.stroke();
      c.textAlign = "left";
      c.textBaseline = "top";
      c.font = `700 13px ${FONT_DISPLAY}`;
      c.fillStyle = "#ffffff";
      const who = this.humans[i] ? SEAT_NAMES[i] : `บอท${SEAT_NAMES[i]}`;
      c.fillText(this.mode === "team" ? `${who} · ${TEAM_NAMES[teamOf(i)]}` : who, 12, 9);
      c.textAlign = "right";
      c.fillStyle = "#fde68a";
      if (this.mode !== "coop") c.fillText(`${this.points[i]} แต้ม`, w - 12, 9);
      if (this.phase === "play" && this.mini) this.mini.renderSeat(c, i, w, h);
      else {
        c.textAlign = "center";
        c.textBaseline = "middle";
        if (this.phase === "result" && this.mode !== "coop") {
          c.font = `800 ${Math.round(h * 0.28)}px ${FONT_DISPLAY}`;
          c.fillStyle = this.gained[i] ? "#fde68a" : "rgba(255,255,255,0.5)";
          c.fillText(this.gained[i] ? `+${this.gained[i]}` : "+0", w / 2, h * 0.58);
        } else if (this.phase === "intro" || this.phase === "count") {
          c.font = `700 ${Math.round(h * 0.17)}px ${FONT_DISPLAY}`;
          c.fillStyle = "rgba(255,255,255,0.85)";
          c.fillText(this.humans[i] ? "มุมของคุณ" : "บอทพร้อม", w / 2, h * 0.6);
        }
      }
    });
  }

  render() {
    const { ctx } = this.env;
    const { w, h } = this;
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, "#2e1065");
    g.addColorStop(1, "#0b0720");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (this.phase !== "menu" && this.mini) {
      const a = this.arena();
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      roundRectPath(ctx, a.x, a.y, a.w, a.h, 22);
      ctx.fill();
      for (let i = 0; i < 4; i++) this.renderSeat(ctx, i);
      const m = this.mini;
      if (this.phase === "play") m.renderArena(ctx, a);
      else if (this.phase === "intro" || this.phase === "count") {
        // Game card readable from both sides
        const cx = a.x + a.w / 2;
        const cy = a.y + a.h / 2;
        ctx.save();
        ctx.translate(cx, cy);
        glow(ctx, 0, 0, 70, "#f59e0b", 0.3);
        m.icon(ctx, 70);
        ctx.restore();
        if (this.phase === "intro") {
          this.arenaText(ctx, m.name, 24, "#fde68a", 62);
          this.howTo(ctx, m.howTo, a);
          const left = Math.max(0, 6 - this.phaseT);
          ctx.font = `600 11px ${FONT_BODY}`;
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`เกม ${this.roundNo + 1}/${this.rounds} · แตะเพื่อเริ่ม (${Math.ceil(left)})`, a.x + 12, cy);
        } else {
          const n = 3 - Math.floor(this.phaseT / 0.8);
          this.arenaText(ctx, n > 0 ? `${n}` : "เริ่ม!", 44, "#ffffff", 70);
        }
      } else if (this.phase === "result") {
        this.arenaText(ctx, this.resultText, 26, "#fde68a", 30);
        if (this.mode === "coop") this.drawStars(ctx, a.x + a.w / 2, a.y + a.h / 2, this.lastStars, 3);
        if (this.mode === "team") this.arenaText(ctx, `ทีมล่าง ${this.points[0] + this.points[1]} : ${this.points[2] + this.points[3]} ทีมบน`, 15, "#ffffff", 70);
      }
      if (this.mode === "coop" && this.phase !== "final") {
        ctx.font = `700 12px ${FONT_BODY}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#fde68a";
        ctx.fillText(`ดาวรวม ${this.stars}`, a.x + a.w - 12, a.y + 10);
      }
      // Leave button
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(a.x + a.w - 18, a.y + a.h / 2, 14, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x + a.w - 23, a.y + a.h / 2 - 5);
      ctx.lineTo(a.x + a.w - 13, a.y + a.h / 2 + 5);
      ctx.moveTo(a.x + a.w - 13, a.y + a.h / 2 - 5);
      ctx.lineTo(a.x + a.w - 23, a.y + a.h / 2 + 5);
      ctx.stroke();
    }
    this.particles.render(ctx);
    if (this.phase === "menu") this.menu.render(ctx, w, h);
    if (this.phase === "final") {
      const ranking = [0, 1, 2, 3].sort((a, b) => this.points[b] - this.points[a]);
      const title =
        this.mode === "coop"
          ? `ได้ ${this.stars} ดาว จาก ${this.rounds * 3}`
          : this.mode === "team"
            ? this.points[0] + this.points[1] === this.points[2] + this.points[3]
              ? "เสมอกัน!"
              : `${this.points[0] + this.points[1] > this.points[2] + this.points[3] ? TEAM_NAMES[0] : TEAM_NAMES[1]} ชนะ!`
            : `${SEAT_NAMES[ranking[0]]} ชนะ!`;
      this.over.render(ctx, w, h, {
        title,
        subtitle: this.mode === "coop" ? "เก่งมากที่ช่วยกัน" : ranking.map((i) => `${SEAT_NAMES[i]} ${this.points[i]}`).join(" · "),
        coins: this.earned,
        chips: [`${this.rounds} เกม`, this.mode === "ffa" ? "แข่งเดี่ยว" : this.mode === "team" ? "ทีม 2:2" : "ร่วมมือ"],
        accent: "#f59e0b",
      });
    }
  }

  private howTo(c: CanvasRenderingContext2D, text: string, a: Rect) {
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    c.save();
    c.font = `500 13px ${FONT_BODY}`;
    c.textAlign = "center";
    c.textBaseline = "top";
    c.fillStyle = "rgba(255,255,255,0.85)";
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const wd of words) {
      const t = line ? `${line} ${wd}` : wd;
      if (c.measureText(t).width > a.w - 60 && line) {
        lines.push(line);
        line = wd;
      } else line = t;
    }
    if (line) lines.push(line);
    for (const flip of [false, true]) {
      c.save();
      c.translate(cx, cy);
      if (flip) c.rotate(Math.PI);
      lines.forEach((l, k) => c.fillText(l, 0, 84 + k * 18));
      c.restore();
    }
    c.restore();
  }

  private drawStars(c: CanvasRenderingContext2D, x: number, y: number, n: number, max: number) {
    for (let k = 0; k < max; k++) drawShape(c, "star", x + (k - (max - 1) / 2) * 44, y, 18, k < n ? "#facc15" : "rgba(255,255,255,0.15)");
  }
}
