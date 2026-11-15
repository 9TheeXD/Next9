// Neon Pulse world map: one world per page (swipe or arrows), its ten levels on a winding path over
// the world's own scenery. Locked levels show a padlock; played ones show their best % as a ring.

import type { PointerInfo } from "../engine/types";
import { TAU, clamp, ease, glow, roundRectPath, FONT_BODY, FONT_DISPLAY } from "../engine/fx";
import { Button, drawCoin } from "../engine/ui";
import { Backdrop, themeFor, hsl, type Theme } from "./art";
import { LEVELS_PER_WORLD, worldFeature, worldName, worldOf } from "./levels";

export interface MapHost {
  unlocked(): number;
  best(n: number): number; // 0..100
  coins(n: number): { got: number; total: number };
  tags(n: number): string[];
  practice(): boolean;
  setPractice(v: boolean): void;
  play(n: number): void;
  click(): void;
}

export class WorldMap {
  world = 0;
  selected = 1;
  private slide = 0; // -1..1 page slide animation
  private t = 0;
  private hits: { x: number; y: number; w: number; h: number; act: () => void }[] = [];
  private down: { x: number; y: number; t: number } | null = null;
  private dragX = 0;
  private startBtn = new Button("เริ่มวิ่ง", "#db2777");
  private bg = new Backdrop();

  constructor(private host: MapHost) {}

  /** Open on a level (default: the highest unlocked one). */
  focus(n: number) {
    this.selected = n;
    this.world = worldOf(n);
    this.slide = 0;
  }

  maxWorld() {
    return Math.max(5, worldOf(this.host.unlocked()) + 1);
  }

  private goWorld(w: number) {
    w = clamp(w, 0, this.maxWorld());
    if (w === this.world) return;
    this.slide = w > this.world ? 1 : -1;
    this.world = w;
    const first = w * LEVELS_PER_WORLD + 1;
    const unl = this.host.unlocked();
    this.selected = clamp(unl, first, first + LEVELS_PER_WORLD - 1);
    if (unl < first) this.selected = first;
    this.host.click();
  }

  update(dt: number) {
    this.t += dt;
    this.slide *= Math.pow(0.0005, dt);
    if (Math.abs(this.slide) < 0.002) this.slide = 0;
    this.startBtn.update(dt);
  }

  pointer(p: PointerInfo) {
    if (p.type === "down") {
      this.down = { x: p.x, y: p.y, t: p.t };
      this.dragX = 0;
      if (this.startBtn.hit(p.x, p.y)) this.startBtn.pressed = true;
      return;
    }
    if (p.type === "move" && this.down) {
      this.dragX = p.x - this.down.x;
      return;
    }
    if (p.type === "up" || p.type === "cancel") {
      const d = this.down;
      this.down = null;
      const dx = this.dragX;
      this.dragX = 0;
      const wasPressed = this.startBtn.pressed;
      this.startBtn.pressed = false;
      if (!d || p.type === "cancel") return;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(p.y - d.y)) {
        this.goWorld(this.world + (dx < 0 ? 1 : -1));
        return;
      }
      if (wasPressed && this.startBtn.hit(p.x, p.y)) {
        if (this.selected <= this.host.unlocked()) this.host.play(this.selected);
        else this.focus(this.host.unlocked()); // locked world: jump back to the newest open level
        return;
      }
      for (const h of this.hits) if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h.act();
    }
  }

  key(code: string) {
    if (code === "ArrowLeft") this.select(this.selected - 1);
    else if (code === "ArrowRight") this.select(this.selected + 1);
    else if (code === "PageUp") this.goWorld(this.world - 1);
    else if (code === "PageDown") this.goWorld(this.world + 1);
    else if (code === "Enter" || code === "Space") {
      if (this.selected <= this.host.unlocked()) this.host.play(this.selected);
    } else return false;
    return true;
  }

  private select(n: number) {
    n = clamp(n, 1, this.host.unlocked());
    if (worldOf(n) !== this.world) {
      this.slide = worldOf(n) > this.world ? 1 : -1;
      this.world = worldOf(n);
    }
    this.selected = n;
    this.host.click();
  }

  render(c: CanvasRenderingContext2D, w: number, h: number) {
    const th = themeFor(this.world);
    const t = this.t;
    const gy = h * 0.9;
    this.bg.render(c, th, w, h, t * 1.6, 30, gy, t, 0, false);
    this.bg.floor(c, th, w, h, t * 1.6, 30, gy, 0);
    // legibility veil
    const veil = c.createLinearGradient(0, 0, 0, h);
    veil.addColorStop(0, "rgba(6,4,20,0.72)");
    veil.addColorStop(0.45, "rgba(6,4,20,0.25)");
    veil.addColorStop(1, "rgba(6,4,20,0.75)");
    c.fillStyle = veil;
    c.fillRect(0, 0, w, h);

    this.hits = [];
    const cw = Math.min(w, 440);
    const x0 = (w - cw) / 2;
    const unl = this.host.unlocked();
    const first = this.world * LEVELS_PER_WORLD + 1;
    const worldLocked = first > unl;

    // ── Header
    c.textAlign = "center";
    c.textBaseline = "top";
    c.font = `700 12px ${FONT_DISPLAY}`;
    c.fillStyle = hsl(th.player, 100, 75);
    c.fillText(`พัลส์นีออน · โลก ${this.world + 1}`, w / 2, 14);
    c.font = `800 25px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.shadowColor = hsl(th.hue, 100, 60);
    c.shadowBlur = 14;
    c.fillText(worldName(this.world), w / 2, 32);
    c.shadowBlur = 0;
    c.font = `500 13px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.fillText(this.world === 0 ? "เริ่มต้นง่ายๆ: หนามและบล็อก" : `ใหม่: ${worldFeature(this.world)}`, w / 2, 66);
    const arrow = (ax: number, dir: number, on: boolean) => {
      c.globalAlpha = on ? 1 : 0.25;
      c.fillStyle = "rgba(255,255,255,0.14)";
      c.beginPath();
      c.arc(ax, 50, 22, 0, TAU);
      c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.moveTo(ax + dir * 7, 50);
      c.lineTo(ax - dir * 5, 41);
      c.lineTo(ax - dir * 5, 59);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
      if (on) this.hits.push({ x: ax - 26, y: 24, w: 52, h: 52, act: () => this.goWorld(this.world + dir) });
    };
    arrow(x0 + 30, -1, this.world > 0);
    arrow(x0 + cw - 30, 1, this.world < this.maxWorld());
    // page dots
    const nW = this.maxWorld() + 1;
    const dotsW = Math.min(cw - 120, nW * 14);
    const step = nW > 1 ? dotsW / (nW - 1) : 0;
    for (let i = 0; i < nW; i++) {
      const dx = w / 2 - dotsW / 2 + i * step;
      const locked = i * LEVELS_PER_WORLD + 1 > unl;
      c.fillStyle = i === this.world ? hsl(themeFor(i).player, 100, 70) : locked ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)";
      c.beginPath();
      c.arc(dx, 92, i === this.world ? 4.5 : 3, 0, TAU);
      c.fill();
    }

    // ── Path with ten nodes
    const panelH = 222;
    const top = 112;
    const bottom = h - panelH - 18;
    const rowH = (bottom - top) / 4;
    const nr = clamp(rowH * 0.3, 18, 27);
    const off = this.slide * cw * 0.6 + this.dragX * 0.5;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < LEVELS_PER_WORLD; i++) {
      const row = Math.floor(i / 3);
      let col = i % 3;
      if (row % 2 === 1) col = 2 - col;
      const x = i === 9 ? x0 + cw * 0.5 : x0 + cw * (0.2 + col * 0.3);
      const y = top + rowH * (row + 0.5) + (i === 9 ? 4 : 0);
      pts.push({ x: x + off, y });
    }
    // road
    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";
    const road = () => {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (Math.abs(a.y - b.y) > 1) {
          const side = a.x > x0 + cw / 2 + off ? 1 : -1;
          const bx = side > 0 ? Math.max(a.x, b.x) + rowH * 0.45 : Math.min(a.x, b.x) - rowH * 0.45;
          c.bezierCurveTo(bx, a.y, bx, b.y, b.x, b.y);
        } else c.lineTo(b.x, b.y);
      }
    };
    road();
    c.strokeStyle = "rgba(0,0,0,0.35)";
    c.lineWidth = 16;
    c.stroke();
    road();
    c.strokeStyle = hsl(th.hue, 60, worldLocked ? 25 : 40, 0.9);
    c.lineWidth = 10;
    c.stroke();
    road();
    c.setLineDash([2, 12]);
    c.lineDashOffset = -t * 20;
    c.strokeStyle = worldLocked ? "rgba(255,255,255,0.25)" : hsl(th.player, 100, 80, 0.9);
    c.lineWidth = 4;
    c.stroke();
    c.setLineDash([]);
    c.restore();

    for (let i = 0; i < LEVELS_PER_WORLD; i++) {
      const n = first + i;
      const p = pts[i];
      const boss = i === 9;
      this.node(c, th, n, p.x, p.y, boss ? nr * 1.22 : nr, n === this.selected && n <= unl, n <= unl, n === unl);
      if (n <= unl) this.hits.push({ x: p.x - nr - 6, y: p.y - nr - 6, w: nr * 2 + 12, h: nr * 2 + 12, act: () => this.select(n) });
    }

    // ── Panel
    this.panel(c, th, x0 + 12, h - panelH - 10, cw - 24, panelH, worldLocked, first);
  }

  private node(c: CanvasRenderingContext2D, th: Theme, n: number, x: number, y: number, r: number, sel: boolean, open: boolean, current: boolean) {
    const t = this.t;
    const best = open ? this.host.best(n) : 0;
    const done = best >= 100;
    if (sel) {
      glow(c, x, y, r * 2.4, hsl(th.player, 100, 60), 0.45);
      c.strokeStyle = hsl(th.player, 100, 75, 0.6 + 0.3 * Math.sin(t * 5));
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, r + 9 + Math.sin(t * 5) * 1.5, 0, TAU);
      c.stroke();
    }
    // disc
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    if (open) {
      g.addColorStop(0, hsl(th.hue, 80, 70));
      g.addColorStop(1, hsl(th.hue, 70, 28));
    } else {
      g.addColorStop(0, "#4b5563");
      g.addColorStop(1, "#1f2937");
    }
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.strokeStyle = open ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.2)";
    c.lineWidth = 2;
    c.stroke();
    // best % ring
    if (open && best > 0) {
      c.strokeStyle = done ? "#fde047" : hsl(th.player, 100, 65);
      c.lineWidth = 4;
      c.lineCap = "round";
      c.beginPath();
      c.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + (TAU * best) / 100);
      c.stroke();
      c.lineCap = "butt";
    }
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (open) {
      c.fillStyle = "#ffffff";
      c.font = `800 ${Math.round(r * 0.72)}px ${FONT_DISPLAY}`;
      c.fillText(`${n}`, x, y + 1);
    } else {
      // padlock
      c.fillStyle = "rgba(255,255,255,0.55)";
      roundRectPath(c, x - r * 0.3, y - r * 0.05, r * 0.6, r * 0.45, 3);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(x, y - r * 0.05, r * 0.2, Math.PI, 0);
      c.stroke();
    }
    if (done) {
      // star badge
      const bx = x + r * 0.75;
      const by = y - r * 0.75;
      c.fillStyle = "#fde047";
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? 3.5 : 8;
        c.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
    }
    if (current) {
      // little cube hopping on the current level
      const hop = Math.abs(Math.sin(t * 4)) * 8;
      const s = 14;
      c.save();
      c.translate(x, y - r - 14 - hop);
      c.rotate(Math.sin(t * 4) * 0.3);
      c.fillStyle = hsl(th.player, 100, 62);
      roundRectPath(c, -s / 2, -s / 2, s, s, 3);
      c.fill();
      c.strokeStyle = "#ffffff";
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
    }
  }

  private panel(c: CanvasRenderingContext2D, th: Theme, x: number, y: number, w: number, h: number, locked: boolean, first: number) {
    c.fillStyle = "rgba(14,10,36,0.9)";
    roundRectPath(c, x, y, w, h, 22);
    c.fill();
    c.strokeStyle = hsl(th.hue, 90, 70, 0.45);
    c.lineWidth = 1.5;
    c.stroke();
    const cx = x + w / 2;
    c.textAlign = "left";
    c.textBaseline = "top";
    if (locked) {
      c.textAlign = "center";
      c.font = `800 22px ${FONT_DISPLAY}`;
      c.fillStyle = "#ffffff";
      c.fillText("ยังล็อกอยู่", cx, y + 30);
      c.font = `500 14px ${FONT_BODY}`;
      c.fillStyle = "rgba(255,255,255,0.75)";
      c.fillText(`ผ่านด่าน ${first - 1} เพื่อเปิดโลกนี้`, cx, y + 66);
      c.fillText(`มีอะไรใหม่: ${worldFeature(this.world)}`, cx, y + 90);
      this.startBtn.label = "ไปด่านล่าสุด";
      this.startBtn.place(cx, y + h - 66, w - 36, 52);
      this.startBtn.render(c);
      return;
    }
    const n = this.selected;
    const best = this.host.best(n);
    c.font = `800 24px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffffff";
    c.fillText(`ด่าน ${n}`, x + 18, y + 14);
    c.font = `600 13px ${FONT_BODY}`;
    c.fillStyle = best >= 100 ? "#86efac" : best > 0 ? "#fde68a" : hsl(th.player, 100, 75);
    c.fillText(best >= 100 ? "ผ่านแล้ว" : best > 0 ? `ไปได้ไกลสุด ${Math.floor(best)}%` : "ด่านใหม่", x + 18, y + 48);
    // coins found
    const cn = this.host.coins(n);
    c.textAlign = "right";
    c.font = `700 15px ${FONT_DISPLAY}`;
    c.fillStyle = "#ffd76a";
    c.fillText(`${cn.got}/${cn.total}`, x + w - 18, y + 20);
    const tw = c.measureText(`${cn.got}/${cn.total}`).width;
    drawCoin(c, x + w - 30 - tw, y + 30, 9);
    // tags
    c.textAlign = "left";
    c.font = `600 12px ${FONT_DISPLAY}`;
    let tx = x + 18;
    for (const tag of this.host.tags(n).slice(0, 4)) {
      const tw2 = c.measureText(tag).width + 18;
      if (tx + tw2 > x + w - 14) break;
      c.fillStyle = "rgba(255,255,255,0.1)";
      roundRectPath(c, tx, y + 72, tw2, 24, 12);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.88)";
      c.textBaseline = "middle";
      c.fillText(tag, tx + 9, y + 85);
      c.textBaseline = "top";
      tx += tw2 + 6;
    }
    // mode pills
    const py = y + 106;
    const pw = (w - 44) / 2;
    [false, true].forEach((pr, i) => {
      const on = this.host.practice() === pr;
      const px = x + 18 + i * (pw + 8);
      c.fillStyle = on ? hsl(th.hue, 70, 45) : "rgba(255,255,255,0.08)";
      roundRectPath(c, px, py, pw, 40, 20);
      c.fill();
      if (on) {
        c.strokeStyle = "rgba(255,255,255,0.5)";
        c.lineWidth = 1;
        c.stroke();
      }
      c.fillStyle = "#ffffff";
      c.font = `600 14px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(pr ? "ฝึก (มีจุดเซฟ)" : "ปกติ", px + pw / 2, py + 21);
      c.textBaseline = "top";
      this.hits.push({ x: px, y: py - 4, w: pw, h: 48, act: () => this.host.setPractice(pr) });
    });
    this.startBtn.label = this.host.practice() ? "เริ่มฝึก" : "เริ่มวิ่ง";
    this.startBtn.color = ["#db2777", "#0891b2", "#16a34a", "#ea580c", "#7c3aed", "#ca8a04"][th.style];
    this.startBtn.place(cx, y + h - 66, w - 36, 52);
    const a = ease.outCubic(clamp(this.t * 2, 0, 1));
    c.globalAlpha = a;
    this.startBtn.render(c);
    c.globalAlpha = 1;
  }
}
