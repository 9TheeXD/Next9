// "Sudoku" — the classic number puzzle with large, high-contrast digits, notes, hints and no
// failing. Working memory and logic stay busy, which crowds out the craving; it suits working-age
// and older players who already know and like the game.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeSprite, roundRectPath, clamp, FONT_DISPLAY, FONT_BODY, rng } from "./engine/fx";
import { Button, drawCard } from "./engine/ui";
import { pentatonic } from "./engine/audio";

const DIFFICULTY = [
  { label: "ง่าย", keep: 42 },
  { label: "ปานกลาง", keep: 33 },
  { label: "ยาก", keep: 27 },
];

/** Fills a 9×9 grid with a random valid solution. */
function solve(grid: number[], rand: () => number, count = false, limit = 2): number {
  const idx = grid.indexOf(0);
  if (idx < 0) return 1;
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  const used = new Set<number>();
  for (let i = 0; i < 9; i++) {
    used.add(grid[r * 9 + i]);
    used.add(grid[i * 9 + c]);
    const br = Math.floor(r / 3) * 3 + Math.floor(i / 3);
    const bc = Math.floor(c / 3) * 3 + (i % 3);
    used.add(grid[br * 9 + bc]);
  }
  const options = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n));
  if (!count) {
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
  }
  let found = 0;
  for (const n of options) {
    grid[idx] = n;
    const f = solve(grid, rand, count, limit - found);
    if (f && !count) return 1;
    found += f;
    if (found >= limit) break;
  }
  grid[idx] = 0;
  return found;
}

function generate(keep: number, rand: () => number) {
  const solution = new Array(81).fill(0);
  solve(solution, rand);
  const puzzle = solution.slice();
  const order = Array.from({ length: 81 }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let filled = 81;
  for (const i of order) {
    if (filled <= keep) break;
    const v = puzzle[i];
    puzzle[i] = 0;
    // Keep the removal only if the puzzle still has exactly one solution
    if (solve(puzzle.slice(), rand, true, 2) !== 1) puzzle[i] = v;
    else filled--;
  }
  return { puzzle, solution };
}

export const sudokuGame: GameDefinition = {
  id: "sudoku",
  title: "ซูโดกุ",
  tagline: "เติมเลข 1–9 ไม่ให้ซ้ำในแถว คอลัมน์ และช่อง 3×3",
  why: "ใช้ความคิดและความจำตลอดเวลา สมองจึงไม่ว่างให้ความอยาก ตัวเลขใหญ่ อ่านง่าย มีคำใบ้ ไม่มีแพ้",
  category: "brain",
  minutes: "5–15 นาที",
  palette: ["#f4ead5", "#2563eb"],
  create: (env) => new SudokuGame(env),
};

type State = "intro" | "play" | "win";

class SudokuGame implements GameInstance {
  private w = 0;
  private h = 0;
  private cell = 36;
  private gx = 0;
  private gy = 0;
  private padY = 0;
  private puzzle: number[] = new Array(81).fill(0);
  private solution: number[] = new Array(81).fill(0);
  private values: number[] = new Array(81).fill(0);
  private notes: Set<number>[] = Array.from({ length: 81 }, () => new Set());
  private sel = -1;
  private notesMode = false;
  private hints = 3;
  private mistakes = 0;
  private elapsed = 0;
  private diff = 0;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private flash: { i: number; t: number }[] = [];
  private bg: HTMLCanvasElement | null = null;
  private particles = new Particles();
  private floaters = new Floaters();
  private diffBtns = DIFFICULTY.map((d, i) => new Button(d.label, i === 0 ? "#2563eb" : "#ffffff", i === 0 ? "solid" : "ghost"));
  private againBtn = new Button("เกมใหม่", "#2563eb");
  private rand = rng(Date.now() % 97531);

  constructor(private env: GameEnv) {
    this.diff = clamp(parseInt(env.store.get("diff") || "0", 10) || 0, 0, 2);
  }

  private start(diff: number) {
    this.diff = diff;
    this.env.store.set("diff", String(diff));
    const { puzzle, solution } = generate(DIFFICULTY[diff].keep, this.rand);
    this.puzzle = puzzle;
    this.solution = solution;
    this.values = puzzle.slice();
    this.notes = Array.from({ length: 81 }, () => new Set());
    this.sel = puzzle.indexOf(0);
    this.hints = 3;
    this.mistakes = 0;
    this.elapsed = 0;
    this.notesMode = false;
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  private cellCenter(i: number) {
    return { x: this.gx + ((i % 9) + 0.5) * this.cell, y: this.gy + (Math.floor(i / 9) + 0.5) * this.cell };
  }

  private enter(n: number) {
    const i = this.sel;
    if (i < 0 || this.puzzle[i] || this.state !== "play") return;
    if (this.notesMode) {
      if (this.values[i]) return;
      const s = this.notes[i];
      if (s.has(n)) s.delete(n);
      else s.add(n);
      this.env.sfx.tone({ freq: 700, dur: 0.04, vol: 0.04 });
      return;
    }
    if (this.values[i] === n) {
      this.values[i] = 0;
      return;
    }
    this.values[i] = n;
    this.notes[i].clear();
    if (n !== this.solution[i]) {
      this.mistakes++;
      this.env.sfx.tone({ freq: 220, dur: 0.15, vol: 0.06, type: "triangle" });
      return;
    }
    // Clear this number from notes in the same row, column and box
    const r = Math.floor(i / 9);
    const c = i % 9;
    for (let k = 0; k < 81; k++) {
      const kr = Math.floor(k / 9);
      const kc = k % 9;
      if (kr === r || kc === c || (Math.floor(kr / 3) === Math.floor(r / 3) && Math.floor(kc / 3) === Math.floor(c / 3))) this.notes[k].delete(n);
    }
    this.env.sfx.tone({ freq: pentatonic(n - 1, 330), dur: 0.15, vol: 0.07 });
    this.celebrateUnits(i);
    if (this.values.every((v, k) => v === this.solution[k])) this.win();
  }

  /** Flash any row, column or box this move completed. */
  private celebrateUnits(i: number) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const units: number[][] = [
      Array.from({ length: 9 }, (_, k) => r * 9 + k),
      Array.from({ length: 9 }, (_, k) => k * 9 + c),
      Array.from({ length: 9 }, (_, k) => (Math.floor(r / 3) * 3 + Math.floor(k / 3)) * 9 + Math.floor(c / 3) * 3 + (k % 3)),
    ];
    let done = 0;
    for (const u of units) {
      if (u.every((k) => this.values[k] === this.solution[k])) {
        done++;
        u.forEach((k, j) => this.flash.push({ i: k, t: -j * 0.03 }));
      }
    }
    if (done) {
      this.env.sfx.chime(pentatonic(5 + done * 2, 330), 0.09);
      const p = this.cellCenter(i);
      this.floaters.add(done > 1 ? "เยี่ยม!" : "ครบแล้ว!", p.x, p.y - 20, "#1d4ed8", 18, 0.9);
    }
  }

  private hint() {
    if (this.hints <= 0 || this.state !== "play") return;
    let i = this.sel;
    if (i < 0 || this.puzzle[i] || this.values[i] === this.solution[i]) {
      i = this.values.findIndex((v, k) => v !== this.solution[k]);
      if (i < 0) return;
    }
    this.hints--;
    this.sel = i;
    const was = this.notesMode;
    this.notesMode = false;
    this.values[i] = 0;
    this.enter(this.solution[i]);
    this.notesMode = was;
  }

  private win() {
    this.state = "win";
    this.stateT = 0;
    [0, 2, 4, 7, 9, 11].forEach((s, i) => this.env.sfx.chime(pentatonic(s + 3), 0.1, i * 0.08));
    for (let k = 0; k < 81; k++) this.flash.push({ i: k, t: -((k % 9) + Math.floor(k / 9)) * 0.03 });
    const mins = Math.max(1, Math.round(this.elapsed / 60));
    const key = `wins_${this.diff}`;
    const wins = (parseInt(this.env.store.get(key) || "0", 10) || 0) + 1;
    this.env.store.set(key, String(wins));
    this.env.emit({
      type: "end",
      score: wins,
      best: wins,
      summary: `ซูโดกุ${DIFFICULTY[this.diff].label} สำเร็จใน ${mins} นาที`,
      stats: { seconds: Math.round(this.elapsed), mistakes: this.mistakes, difficulty: this.diff },
    });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 70;
    const padH = Math.min(190, h * 0.3);
    this.cell = Math.floor(clamp(Math.min((w - 20) / 9, (h - top - padH - 10) / 9), 26, 64));
    this.gx = Math.round((w - this.cell * 9) / 2);
    this.gy = top;
    this.padY = this.gy + this.cell * 9 + 14;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#fbf6ea");
      g.addColorStop(1, "#efe3c8");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const r = rng(2);
      for (let i = 0; i < 2500; i++) {
        c.fillStyle = `rgba(120,90,40,${r() * 0.05})`;
        c.fillRect(r() * w, r() * h, 1, 1);
      }
    });
  }

  private padLayout() {
    const top = this.padY;
    const bw = Math.min(this.w - 20, this.cell * 9 + 10);
    const x0 = (this.w - bw) / 2;
    const numW = bw / 9;
    const numH = Math.min(58, numW * 1.25);
    const toolY = top + numH + 10;
    const toolW = (bw - 16) / 3;
    return { x0, bw, numW, numH, toolY, toolW, toolH: 44, top };
  }

  pointer(p: PointerInfo) {
    if (this.state !== "play") {
      const btns = this.state === "intro" ? this.diffBtns : [this.againBtn];
      for (const [k, b] of btns.entries()) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.3) {
            if (this.state === "intro") this.start(k);
            else this.state = "intro";
            this.stateT = 0;
          }
          b.pressed = false;
        }
      }
      return;
    }
    if (p.type !== "down") return;
    // Grid
    const c = Math.floor((p.x - this.gx) / this.cell);
    const r = Math.floor((p.y - this.gy) / this.cell);
    if (c >= 0 && c < 9 && r >= 0 && r < 9) {
      this.sel = r * 9 + c;
      this.env.sfx.tone({ freq: 880, dur: 0.03, vol: 0.03 });
      return;
    }
    const L = this.padLayout();
    if (p.y >= L.top && p.y <= L.top + L.numH && p.x >= L.x0 && p.x <= L.x0 + L.bw) {
      const n = Math.floor((p.x - L.x0) / L.numW) + 1;
      this.enter(clamp(n, 1, 9));
      return;
    }
    if (p.y >= L.toolY && p.y <= L.toolY + L.toolH) {
      const k = Math.floor((p.x - L.x0) / (L.toolW + 8));
      if (k === 0 && this.sel >= 0 && !this.puzzle[this.sel]) {
        this.values[this.sel] = 0;
        this.notes[this.sel].clear();
      } else if (k === 1) this.notesMode = !this.notesMode;
      else if (k === 2) this.hint();
    }
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (this.state !== "play") {
      if (code === "Enter" && this.stateT > 0.5) this.start(this.diff);
      return code === "Enter";
    }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (m) {
      this.enter(parseInt(m[1], 10));
      return true;
    }
    const s = this.sel < 0 ? 0 : this.sel;
    if (code === "ArrowLeft") this.sel = s % 9 ? s - 1 : s;
    else if (code === "ArrowRight") this.sel = s % 9 < 8 ? s + 1 : s;
    else if (code === "ArrowUp") this.sel = s >= 9 ? s - 9 : s;
    else if (code === "ArrowDown") this.sel = s < 72 ? s + 9 : s;
    else if ((code === "Backspace" || code === "Delete") && !this.puzzle[s]) {
      this.values[s] = 0;
      this.notes[s].clear();
    } else if (code === "KeyN") this.notesMode = !this.notesMode;
    else if (code === "KeyH") this.hint();
    else return false;
    return true;
  }

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    if (this.state === "play") this.elapsed += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    for (const b of [...this.diffBtns, this.againBtn]) b.update(dt);
    for (const f of this.flash) f.t += dt;
    this.flash = this.flash.filter((f) => f.t < 0.6);
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    const C = this.cell;
    const ink = "#1e293b";

    // HUD
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `700 15px ${FONT_DISPLAY}`;
    ctx.fillStyle = ink;
    ctx.fillText(`ซูโดกุ · ${DIFFICULTY[this.diff].label}`, this.gx, 16);
    ctx.font = `500 13px ${FONT_BODY}`;
    ctx.fillStyle = "#64748b";
    ctx.fillText(`ผิด ${this.mistakes} ครั้ง · คำใบ้ ${this.hints}`, this.gx, 40);
    ctx.textAlign = "right";
    const s = Math.floor(this.elapsed);
    ctx.font = `700 20px ${FONT_DISPLAY}`;
    ctx.fillStyle = ink;
    ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, this.gx + C * 9, 20);

    // Grid
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(80,60,20,0.18)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    roundRectPath(ctx, this.gx - 3, this.gy - 3, C * 9 + 6, C * 9 + 6, 10);
    ctx.fill();
    ctx.shadowColor = "transparent";
    const sel = this.sel;
    const sr = Math.floor(sel / 9);
    const sc = sel % 9;
    const selVal = sel >= 0 ? this.values[sel] : 0;
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      const x = this.gx + c * C;
      const y = this.gy + r * C;
      let fill = "";
      if (sel >= 0 && (r === sr || c === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)))) fill = "#eef3ff";
      if (selVal && this.values[i] === selVal) fill = "#c9d9ff";
      if (i === sel) fill = "#a9c3ff";
      if (this.values[i] && !this.puzzle[i] && this.values[i] !== this.solution[i]) fill = "#ffe0e0";
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, C, C);
      }
    }
    for (const f of this.flash) {
      if (f.t < 0) continue;
      const k = f.t / 0.6;
      const r = Math.floor(f.i / 9);
      const c = f.i % 9;
      ctx.fillStyle = `rgba(255,214,90,${0.7 * (1 - k)})`;
      ctx.fillRect(this.gx + c * C, this.gy + r * C, C, C);
    }
    // Lines
    for (let k = 0; k <= 9; k++) {
      const thick = k % 3 === 0;
      ctx.strokeStyle = thick ? ink : "rgba(30,41,59,0.22)";
      ctx.lineWidth = thick ? 2.2 : 1;
      ctx.beginPath();
      ctx.moveTo(this.gx + k * C, this.gy);
      ctx.lineTo(this.gx + k * C, this.gy + 9 * C);
      ctx.moveTo(this.gx, this.gy + k * C);
      ctx.lineTo(this.gx + 9 * C, this.gy + k * C);
      ctx.stroke();
    }
    // Digits
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 81; i++) {
      const { x, y } = this.cellCenter(i);
      const v = this.values[i];
      if (v) {
        const given = !!this.puzzle[i];
        const wrong = !given && v !== this.solution[i];
        ctx.font = `${given ? 700 : 600} ${Math.round(C * 0.58)}px ${FONT_DISPLAY}`;
        ctx.fillStyle = given ? ink : wrong ? "#dc2626" : "#2563eb";
        ctx.fillText(String(v), x, y + 1);
      } else if (this.notes[i].size) {
        ctx.font = `500 ${Math.round(C * 0.24)}px ${FONT_BODY}`;
        ctx.fillStyle = "#64748b";
        for (const n of this.notes[i]) {
          const nx = x + (((n - 1) % 3) - 1) * C * 0.3;
          const ny = y + (Math.floor((n - 1) / 3) - 1) * C * 0.3;
          ctx.fillText(String(n), nx, ny);
        }
      }
    }

    // Number pad and tools
    if (this.state === "play") {
      const L = this.padLayout();
      for (let n = 1; n <= 9; n++) {
        const left = 9 - this.values.filter((v, k) => v === n && v === this.solution[k]).length;
        const x = L.x0 + (n - 1) * L.numW;
        ctx.fillStyle = left ? "#ffffff" : "rgba(255,255,255,0.4)";
        roundRectPath(ctx, x + 2, L.top, L.numW - 4, L.numH, 10);
        ctx.fill();
        ctx.strokeStyle = "rgba(30,41,59,0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = left ? (this.notesMode ? "#64748b" : "#2563eb") : "#cbd5e1";
        ctx.font = `700 ${Math.round(L.numH * 0.5)}px ${FONT_DISPLAY}`;
        ctx.fillText(String(n), x + L.numW / 2, L.top + L.numH * 0.45);
        ctx.font = `500 ${Math.round(L.numH * 0.18)}px ${FONT_BODY}`;
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(left ? String(left) : "✓", x + L.numW / 2, L.top + L.numH * 0.82);
      }
      const tools = ["ลบ", this.notesMode ? "จดโน้ต: เปิด" : "จดโน้ต", `คำใบ้ (${this.hints})`];
      tools.forEach((t, k) => {
        const x = L.x0 + k * (L.toolW + 8);
        const on = k === 1 && this.notesMode;
        ctx.fillStyle = on ? "#2563eb" : "#ffffff";
        roundRectPath(ctx, x, L.toolY, L.toolW, L.toolH, 22);
        ctx.fill();
        ctx.strokeStyle = "rgba(30,41,59,0.15)";
        ctx.stroke();
        ctx.fillStyle = on ? "#ffffff" : k === 2 && !this.hints ? "#cbd5e1" : ink;
        ctx.font = `600 15px ${FONT_DISPLAY}`;
        ctx.fillText(t, x + L.toolW / 2, L.toolY + L.toolH / 2 + 1);
      });
    }

    this.particles.render(ctx);
    this.floaters.render(ctx);

    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "ซูโดกุ",
        subtitle: "เลือกระดับความยาก",
        body: "เติมเลข 1–9 ให้ทุกแถว ทุกคอลัมน์ และทุกช่อง 3×3 มีเลขไม่ซ้ำกัน แตะช่องแล้วแตะตัวเลขด้านล่าง ใส่ผิดจะเห็นเป็นสีแดง ไม่มีแพ้",
        accent: "#2563eb",
        buttons: this.diffBtns,
        appear: this.stateT * 3,
        icon: (c) => {
          c.fillStyle = "#ffffff";
          roundRectPath(c, -30, -30, 60, 60, 8);
          c.fill();
          c.strokeStyle = "#1e293b";
          c.lineWidth = 2;
          c.stroke();
          c.lineWidth = 1;
          for (let k = 1; k < 3; k++) {
            c.beginPath();
            c.moveTo(-30 + k * 20, -30);
            c.lineTo(-30 + k * 20, 30);
            c.moveTo(-30, -30 + k * 20);
            c.lineTo(30, -30 + k * 20);
            c.stroke();
          }
          c.font = `700 14px ${FONT_DISPLAY}`;
          c.textAlign = "center";
          c.textBaseline = "middle";
          [[0, 0, "5"], [1, 1, "3"], [2, 0, "8"], [0, 2, "1"], [2, 2, "9"]].forEach(([x, y, n]) => {
            c.fillStyle = n === "3" ? "#2563eb" : "#1e293b";
            c.fillText(String(n), -20 + Number(x) * 20, -20 + Number(y) * 20 + 1);
          });
        },
      });
    } else if (this.state === "win") {
      const s2 = Math.floor(this.elapsed);
      drawCard(ctx, w, h, {
        title: "สำเร็จ!",
        subtitle: `ซูโดกุระดับ${DIFFICULTY[this.diff].label}`,
        bigValue: `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, "0")}`,
        bigLabel: "เวลาที่ใช้",
        chips: [`ผิด ${this.mistakes} ครั้ง`, `ใช้คำใบ้ ${3 - this.hints}`],
        accent: "#2563eb",
        buttons: [this.againBtn],
        appear: this.stateT * 2.5,
      });
    }
  }
}
