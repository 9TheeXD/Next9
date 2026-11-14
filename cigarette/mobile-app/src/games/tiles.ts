// "Triple Tiles" — tap free tiles to move them to the tray; three of a kind clear. Calm, no timer,
// big tiles and clear "can't take this one yet" shading, so it is easy for older players too.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeSprite, roundRectPath, clamp, ease, FONT_DISPLAY, FONT_BODY, rng } from "./engine/fx";
import { Button, drawCard, glassPanel } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { drawFruit } from "./art/fruits";

const TRAY = 7;

interface Tile {
  id: number;
  kind: number;
  layer: number;
  gx: number; // grid position in tile units (can be .5)
  gy: number;
  state: "board" | "flying" | "tray" | "gone";
  fly: number;
  fromX: number;
  fromY: number;
}

const LEVELS = [
  { tiles: 30, kinds: 5, layers: 2 },
  { tiles: 45, kinds: 7, layers: 3 },
  { tiles: 60, kinds: 8, layers: 3 },
  { tiles: 75, kinds: 9, layers: 4 },
  { tiles: 90, kinds: 10, layers: 4 },
];

export const tilesGame: GameDefinition = {
  id: "tiles",
  title: "จับคู่สามกระเบื้อง",
  tagline: "แตะกระเบื้องลงถาด ครบ 3 ชิ้นเหมือนกันจะหายไป",
  why: "ต้องมองหากระเบื้องที่หยิบได้และจำว่าอะไรอยู่ในถาด ใจจดจ่อแบบไม่ต้องรีบ เหมาะทุกวัย",
  category: "puzzle",
  minutes: "3–5 นาที/ด่าน",
  palette: ["#0f4c45", "#ffd36e"],
  create: (env) => new TilesGame(env),
};

type State = "intro" | "play" | "win" | "lose";

class TilesGame implements GameInstance {
  private w = 0;
  private h = 0;
  private tile = 48;
  private ox = 0;
  private oy = 0;
  private trayY = 0;
  private tiles: Tile[] = [];
  private tray: Tile[] = [];
  private history: Tile[] = [];
  private level = 0;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private undos = 3;
  private shuffles = 2;
  private cleared = 0;
  private faces: HTMLCanvasElement[] = [];
  private bg: HTMLCanvasElement | null = null;
  private particles = new Particles();
  private floaters = new Floaters();
  private startBtn = new Button("เริ่มด่าน 1", "#e0a526");
  private nextBtn = new Button("ด่านต่อไป", "#e0a526");
  private retryBtn = new Button("ลองด่านนี้ใหม่", "#e0a526");
  private undoBtn = new Button("ย้อน", "#ffffff", "ghost");
  private shuffleBtn = new Button("สลับ", "#ffffff", "ghost");
  private rand = rng(Date.now() % 55555);
  private bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  constructor(private env: GameEnv) {
    this.level = Math.min(LEVELS.length - 1, parseInt(env.store.get("level") || "0", 10) || 0);
    this.startBtn.label = `เริ่มด่าน ${this.level + 1}`;
    this.build();
  }

  private build() {
    const L = LEVELS[this.level];
    const positions: { gx: number; gy: number; layer: number }[] = [];
    const cols = 7;
    const rows = 8;
    for (let layer = 0; layer < L.layers; layer++) {
      const off = layer % 2 === 1 ? 0.5 : 0;
      const c = cols - (layer % 2 === 1 ? 1 : 0);
      const r = rows - (layer % 2 === 1 ? 1 : 0);
      const shrink = Math.floor(layer / 2);
      for (let y = shrink; y < r - shrink; y++)
        for (let x = shrink; x < c - shrink; x++) {
          // Symmetric left/right pattern looks tidy
          const mx = Math.min(x, c - 1 - x);
          const keep = ((mx * 7 + y * 3 + layer * 5 + this.level) % 5) !== 0;
          if (keep) positions.push({ gx: x + off, gy: y + off, layer });
        }
    }
    // Spread the tiles over the layers (more at the bottom), and only put an upper tile where it
    // rests on a tile below, so the stack looks real and upper tiles block lower ones.
    const target = L.tiles - (L.tiles % 3);
    const weights = Array.from({ length: L.layers }, (_, i) => L.layers - i + 1);
    const wsum = weights.reduce((a, b) => a + b, 0);
    const chosen: { gx: number; gy: number; layer: number }[] = [];
    for (let layer = 0; layer < L.layers; layer++) {
      // Prefer positions near the middle (with some randomness) so the pile is compact
      const pool = positions
        .filter((p) => p.layer === layer)
        .map((p) => ({ p, k: Math.hypot(p.gx - 3, (p.gy - 3.5) * 0.9) + this.rand() * 2.2 }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.p);
      const quota = layer === L.layers - 1 ? target - chosen.length : Math.round((target * weights[layer]) / wsum);
      let taken = 0;
      for (const p of pool) {
        if (taken >= quota) break;
        const supported = layer === 0 || chosen.some((q) => q.layer === layer - 1 && Math.abs(q.gx - p.gx) < 1 && Math.abs(q.gy - p.gy) < 1);
        if (!supported) continue;
        chosen.push(p);
        taken++;
      }
    }
    while (chosen.length % 3 !== 0) chosen.pop();
    const count = chosen.length;
    const kinds: number[] = [];
    for (let i = 0; i < count / 3; i++) {
      const k = i % L.kinds;
      kinds.push(k, k, k);
    }
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    this.tiles = chosen.map((p, i) => ({ id: i, kind: kinds[i], layer: p.layer, gx: p.gx, gy: p.gy, state: "board", fly: 0, fromX: 0, fromY: 0 }));
    this.tray = [];
    this.history = [];
    this.undos = 3;
    this.shuffles = 2;
    this.cleared = 0;
    this.bounds = {
      minX: Math.min(...this.tiles.map((t) => t.gx)),
      maxX: Math.max(...this.tiles.map((t) => t.gx)) + 1,
      minY: Math.min(...this.tiles.map((t) => t.gy)),
      maxY: Math.max(...this.tiles.map((t) => t.gy)) + 1,
    };
    if (this.w) this.resize(this.w, this.h);
  }

  private blocked(t: Tile) {
    for (const o of this.tiles) {
      if (o.state !== "board" || o.layer <= t.layer) continue;
      if (Math.abs(o.gx - t.gx) < 1 && Math.abs(o.gy - t.gy) < 1) return true;
    }
    return false;
  }

  private tilePos(t: Tile) {
    const th = this.tile * 1.1;
    return { x: this.ox + (t.gx - this.bounds.minX) * this.tile - t.layer * 3, y: this.oy + (t.gy - this.bounds.minY) * th - t.layer * 5 };
  }

  private slotPos(i: number) {
    const sw = this.slotW();
    const total = sw * TRAY;
    return { x: (this.w - total) / 2 + i * sw + (sw - this.tile * 0.86) / 2, y: this.trayY + 10 };
  }

  private slotW() {
    return Math.min(this.tile * 0.98, (this.w - 28) / TRAY);
  }

  private take(t: Tile) {
    const { x, y } = this.tilePos(t);
    t.fromX = x;
    t.fromY = y;
    t.state = "flying";
    t.fly = 0;
    // Group with the same kind already in the tray
    let at = this.tray.length;
    for (let i = this.tray.length - 1; i >= 0; i--) {
      if (this.tray[i].kind === t.kind) {
        at = i + 1;
        break;
      }
    }
    this.tray.splice(at, 0, t);
    this.history.push(t);
    this.env.sfx.tone({ freq: 520 + t.kind * 20, dur: 0.08, vol: 0.06, type: "triangle" });
  }

  private resolveTray() {
    const counts = new Map<number, Tile[]>();
    for (const t of this.tray) {
      if (t.state !== "tray") continue;
      const list = counts.get(t.kind) || [];
      list.push(t);
      counts.set(t.kind, list);
    }
    for (const [, list] of counts) {
      if (list.length >= 3) {
        const trio = list.slice(0, 3);
        for (const t of trio) {
          const i = this.tray.indexOf(t);
          const p = this.slotPos(i);
          this.particles.burst(p.x + this.tile * 0.43, p.y + this.tile * 0.45, "#ffe9a8", 10, { speed: 160, size: 3, gravity: 60, life: 0.7 });
          t.state = "gone";
        }
        this.tray = this.tray.filter((t) => t.state !== "gone");
        this.history = this.history.filter((t) => t.state !== "gone");
        this.cleared += 3;
        this.env.sfx.chime(pentatonic(4 + (this.cleared / 3) % 6), 0.12);
        this.floaters.add("ครบสาม!", this.w / 2, this.trayY - 16, "#fff3b0", 20, 0.9);
        this.env.emit({ type: "score", score: this.cleared });
      }
    }
    if (this.tiles.every((t) => t.state === "gone")) {
      this.state = "win";
      this.stateT = 0;
      [0, 2, 4, 7, 9].forEach((s, i) => this.env.sfx.chime(pentatonic(s + 5), 0.1, i * 0.09));
      const passed = this.level + 1;
      if (this.level < LEVELS.length - 1) this.env.store.set("level", String(this.level + 1));
      this.env.emit({ type: "end", score: passed, best: passed, summary: `ผ่านด่าน ${passed}`, stats: { level: passed } });
    } else if (this.tray.filter((t) => t.state === "tray").length >= TRAY) {
      this.state = "lose";
      this.stateT = 0;
      this.env.sfx.tone({ freq: 300, dur: 0.5, vol: 0.08, glideTo: 180 });
      this.env.emit({ type: "end", score: this.cleared / 3, best: this.level + 1, summary: `ด่าน ${this.level + 1}: เก็บได้ ${this.cleared / 3} ชุด`, stats: { level: this.level + 1 } });
    }
  }

  private undo() {
    if (this.undos <= 0 || this.state !== "play") return;
    const t = this.history.pop();
    if (!t || t.state !== "tray") return;
    this.undos--;
    this.tray = this.tray.filter((x) => x !== t);
    t.state = "board";
    this.env.sfx.tone({ freq: 400, dur: 0.1, vol: 0.06, glideTo: 300 });
  }

  private shuffle() {
    if (this.shuffles <= 0 || this.state !== "play") return;
    this.shuffles--;
    const onBoard = this.tiles.filter((t) => t.state === "board");
    const kinds = onBoard.map((t) => t.kind);
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    onBoard.forEach((t, i) => (t.kind = kinds[i]));
    this.env.sfx.noise({ dur: 0.35, vol: 0.08, freq: 1500, sweepTo: 400 });
    this.floaters.add("สลับแล้ว", this.w / 2, this.h / 2, "#ffffff", 24);
  }

  private start(level: number) {
    this.level = Math.min(level, LEVELS.length - 1);
    this.build();
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const top = 70;
    const trayH = 120;
    const bw = this.bounds.maxX - this.bounds.minX;
    const bh = this.bounds.maxY - this.bounds.minY;
    this.tile = Math.floor(clamp(Math.min((w - 30) / (bw + 0.2), (h - top - trayH - 16) / (bh * 1.1 + 0.3)), 30, 78));
    this.ox = Math.round((w - bw * this.tile) / 2) + 6;
    this.oy = Math.round(top + (h - top - trayH - bh * this.tile * 1.1) / 2) + 6;
    this.trayY = h - trayH + 8;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const s = this.tile * 0.86;
    this.faces = Array.from({ length: 11 }, (_, k) =>
      makeSprite(s, s * 1.12, dpr, (c) => {
        // Ivory tile with a thick base edge
        c.fillStyle = "#c79a4d";
        roundRectPath(c, 0, s * 0.12, s, s, s * 0.16);
        c.fill();
        const g = c.createLinearGradient(0, 0, 0, s);
        g.addColorStop(0, "#fffdf4");
        g.addColorStop(1, "#f1e6c8");
        c.fillStyle = g;
        roundRectPath(c, 0, 0, s, s, s * 0.16);
        c.fill();
        c.strokeStyle = "rgba(160,120,60,0.45)";
        c.lineWidth = 1.2;
        c.stroke();
        c.save();
        c.translate(s / 2, s / 2 + s * 0.03);
        drawFruit(c, k, s * 0.3, false);
        c.restore();
      })
    );
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0c3b37");
      g.addColorStop(0.6, "#145e54");
      g.addColorStop(1, "#0b2f33");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Soft bamboo stalks at the edges
      const r = rng(4);
      for (let i = 0; i < 8; i++) {
        const left = i % 2 === 0;
        const x = left ? r() * w * 0.12 : w - r() * w * 0.12;
        c.strokeStyle = `rgba(120,200,150,${0.08 + r() * 0.08})`;
        c.lineWidth = 6 + r() * 8;
        c.beginPath();
        c.moveTo(x, h);
        c.lineTo(x + (r() - 0.5) * 30, 0);
        c.stroke();
      }
      const rg = c.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, w * 0.8);
      rg.addColorStop(0, "rgba(255,240,200,0.12)");
      rg.addColorStop(1, "rgba(255,240,200,0)");
      c.fillStyle = rg;
      c.fillRect(0, 0, w, h);
    });
  }

  pointer(p: PointerInfo) {
    if (this.state !== "play") {
      const btns = this.state === "intro" ? [this.startBtn] : this.state === "win" ? [this.nextBtn] : [this.retryBtn];
      for (const b of btns) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.3) this.start(this.state === "win" ? this.level + 1 : this.level);
          b.pressed = false;
        }
      }
      return;
    }
    if (p.type === "down") {
      for (const b of [this.undoBtn, this.shuffleBtn]) if (b.hit(p.x, p.y)) b.pressed = true;
    }
    if (p.type !== "up") return;
    if (this.undoBtn.pressed || this.shuffleBtn.pressed) {
      if (this.undoBtn.pressed && this.undoBtn.hit(p.x, p.y)) this.undo();
      if (this.shuffleBtn.pressed && this.shuffleBtn.hit(p.x, p.y)) this.shuffle();
      this.undoBtn.pressed = this.shuffleBtn.pressed = false;
      return;
    }
    if (this.tray.filter((t) => t.state !== "gone").length >= TRAY) return;
    // Topmost free tile under the finger
    const s = this.tile * 0.86;
    const hits = this.tiles
      .filter((t) => t.state === "board")
      .filter((t) => {
        const { x, y } = this.tilePos(t);
        return p.x >= x && p.x <= x + s && p.y >= y && p.y <= y + s * 1.12;
      })
      .sort((a, b) => b.layer - a.layer);
    const t = hits[0];
    if (!t) return;
    if (this.blocked(t)) {
      this.env.sfx.tone({ freq: 180, dur: 0.06, vol: 0.04, type: "triangle" });
      return;
    }
    this.take(t);
  }

  key(code: string, down: boolean) {
    if (!down) return false;
    if (code === "KeyZ") {
      this.undo();
      return true;
    }
    if ((code === "Enter" || code === "Space") && this.state !== "play" && this.stateT > 0.5) {
      this.start(this.state === "win" ? this.level + 1 : this.level);
      return true;
    }
    return false;
  }

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    for (const b of [this.startBtn, this.nextBtn, this.retryBtn, this.undoBtn, this.shuffleBtn]) b.update(dt);
    let landed = false;
    for (const t of this.tiles) {
      if (t.state !== "flying") continue;
      t.fly += dt / 0.22;
      if (t.fly >= 1) {
        t.state = "tray";
        landed = true;
      }
    }
    if (landed && this.state === "play") this.resolveTray();
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    const s = this.tile * 0.86;

    // HUD
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `600 12px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(`ด่าน ${this.level + 1}`, 16, 12);
    const left = this.tiles.filter((t) => t.state === "board").length;
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`เหลือ ${left} ชิ้น`, 16, 28);
    this.undoBtn.label = `ย้อน ${this.undos}`;
    this.shuffleBtn.label = `สลับ ${this.shuffles}`;
    this.undoBtn.place(w - 150, 16, 76, 38);
    this.shuffleBtn.place(w - 60, 16, 76, 38);
    if (this.state === "play") {
      ctx.globalAlpha = this.undos ? 1 : 0.4;
      this.undoBtn.render(ctx);
      ctx.globalAlpha = this.shuffles ? 1 : 0.4;
      this.shuffleBtn.render(ctx);
      ctx.globalAlpha = 1;
    }

    // Board tiles, lower layers first
    const board = this.tiles.filter((t) => t.state === "board").sort((a, b) => a.layer - b.layer || a.gy - b.gy || a.gx - b.gx);
    for (const t of board) {
      const { x, y } = this.tilePos(t);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(this.faces[t.kind], x, y, s, s * 1.12);
      ctx.restore();
      if (this.blocked(t)) {
        ctx.fillStyle = "rgba(10,30,30,0.5)";
        roundRectPath(ctx, x, y, s, s * 1.12, s * 0.16);
        ctx.fill();
      }
    }

    // Tray
    const sw = this.slotW();
    const tw = sw * TRAY + 16;
    glassPanel(ctx, (w - tw) / 2, this.trayY, tw, s * 1.12 + 22, 16, 0.12);
    for (let i = 0; i < TRAY; i++) {
      const p = this.slotPos(i);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      roundRectPath(ctx, p.x, p.y, s, s * 1.12, s * 0.16);
      ctx.fill();
    }
    const filled = this.tray.filter((t) => t.state !== "gone").length;
    if (filled >= TRAY - 2 && this.state === "play") {
      ctx.strokeStyle = `rgba(255,120,120,${0.4 + 0.4 * Math.sin(this.time * 8)})`;
      ctx.lineWidth = 2;
      roundRectPath(ctx, (w - tw) / 2, this.trayY, tw, s * 1.12 + 22, 16);
      ctx.stroke();
    }
    this.tray.forEach((t, i) => {
      if (t.state === "gone") return;
      const to = this.slotPos(i);
      let x = to.x;
      let y = to.y;
      if (t.state === "flying") {
        const k = ease.outCubic(clamp(t.fly, 0, 1));
        x = t.fromX + (to.x - t.fromX) * k;
        y = t.fromY + (to.y - t.fromY) * k - Math.sin(k * Math.PI) * 30;
      }
      ctx.drawImage(this.faces[t.kind], x, y, s, s * 1.12);
    });

    this.particles.render(ctx);
    this.floaters.render(ctx);

    const iconFn = (c: CanvasRenderingContext2D) => {
      [[-36, 0, 4], [0, -6, 1], [36, 0, 7]].forEach(([x, y, k]) => {
        const f = this.faces[k];
        if (f) c.drawImage(f, x - 22, y - 24, 44, 49);
      });
    };
    if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "จับคู่สามกระเบื้อง",
        subtitle: "ไม่มีจับเวลา ค่อยๆ เล่นได้",
        body: "แตะกระเบื้องที่สว่าง (ไม่มีชิ้นอื่นทับ) เพื่อย้ายลงถาด ครบ 3 ชิ้นเหมือนกันจะหายไป ถาดมี 7 ช่อง อย่าให้เต็ม",
        accent: "#e0a526",
        buttons: [this.startBtn],
        appear: this.stateT * 3,
        icon: iconFn,
      });
    } else if (this.state === "win") {
      drawCard(ctx, w, h, {
        title: `ผ่านด่าน ${this.level + 1}!`,
        subtitle: "เก่งมาก ใจเย็นและแม่นยำ",
        accent: "#e0a526",
        buttons: [this.nextBtn],
        appear: this.stateT * 2.5,
        icon: iconFn,
      });
    } else if (this.state === "lose") {
      drawCard(ctx, w, h, {
        title: "ถาดเต็มแล้ว",
        subtitle: "ไม่เป็นไร ลองใหม่ได้ ใช้ปุ่มย้อนและสลับช่วยได้นะ",
        bigValue: `${this.cleared / 3}`,
        bigLabel: "ชุดที่เก็บได้",
        accent: "#e0a526",
        buttons: [this.retryBtn],
        appear: this.stateT * 2.5,
      });
    }
  }
}
