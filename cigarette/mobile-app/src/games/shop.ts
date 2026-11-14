// The coin shop: skins with live previews, boosters and the unlimited upgrades for the arcade games.
// Drawn on canvas like the games so the previews are the real in-game art. Opened from the game
// list; it is not a game itself and sends no game events.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, clamp, TAU, FONT_DISPLAY, FONT_BODY, roundRectPath, rgba } from "./engine/fx";
import { drawCoin, wrapText } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { wallet, ITEMS, UPGRADES, type ShopItem } from "./engine/economy";
import { drawBlockSkin, bladeColors, drawShip, snakeColor } from "./art/skins";
import { drawBoosterIcon } from "./engine/booster";

export const shopScreen: GameDefinition = {
  id: "shop",
  title: "ร้านค้าเหรียญ",
  tagline: "ใช้เหรียญซื้อสกิน ตัวช่วย และอัปเกรด",
  why: "",
  category: "calm",
  minutes: "",
  palette: ["#160f33", "#fbbf24"],
  create: (env) => new Shop(env),
};

type Tab = "skins" | "boosters" | "upgrades";
const TABS: { id: Tab; label: string }[] = [
  { id: "skins", label: "สกิน" },
  { id: "boosters", label: "ตัวช่วย" },
  { id: "upgrades", label: "อัปเกรด" },
];
const GAME_NAMES: Record<string, string> = {
  blockSkin: "ต่อบล็อก / สวนบล็อก",
  bladeSkin: "หั่นผลไม้",
  shipSkin: "ยานพิทักษ์ดาว",
  snakeSkin: "งูแสงล่าแต้ม",
  shooter: "ยานพิทักษ์ดาว",
  snake: "งูแสงล่าแต้ม",
  defense: "ปกป้องต้นไม้ลมหายใจ",
  blast: "สวนบล็อก 8×8",
  bubbles: "ยิงบับเบิล",
  merge: "รวมผลไม้",
  sudoku: "ซูโดกุ",
  tiles: "จับคู่สาม",
};

interface Row {
  kind: "header" | "item" | "upgrade";
  title?: string;
  item?: ShopItem;
  upId?: string;
  h: number;
}

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  act: () => void;
}

class Shop implements GameInstance {
  private w = 0;
  private h = 0;
  private time = 0;
  private tab: Tab = "skins";
  private scroll = 0;
  private maxScroll = 0;
  private drag: { id: number; y: number; s: number; moved: number } | null = null;
  private vel = 0;
  private hits: Hit[] = [];
  private particles = new Particles();
  private toast = "";
  private toastT = 0;
  private coinsShown = 0;

  constructor(private env: GameEnv) {
    this.coinsShown = wallet.coins();
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  private rows(): Row[] {
    const out: Row[] = [];
    if (this.tab === "skins") {
      for (const slot of ["blockSkin", "shipSkin", "snakeSkin", "bladeSkin"]) {
        out.push({ kind: "header", title: GAME_NAMES[slot], h: 40 });
        for (const it of ITEMS.filter((i) => i.slot === slot)) out.push({ kind: "item", item: it, h: 86 });
      }
    } else if (this.tab === "boosters") {
      let last = "";
      for (const it of ITEMS.filter((i) => i.kind === "booster")) {
        if (it.game !== last) {
          out.push({ kind: "header", title: GAME_NAMES[it.game || ""] || "", h: 40 });
          last = it.game || "";
        }
        out.push({ kind: "item", item: it, h: 86 });
      }
    } else {
      let last = "";
      for (const u of UPGRADES) {
        if (u.game !== last) {
          out.push({ kind: "header", title: GAME_NAMES[u.game] || u.game, h: 40 });
          last = u.game;
        }
        out.push({ kind: "upgrade", upId: u.id, h: 86 });
      }
    }
    return out;
  }

  pointer(p: PointerInfo) {
    if (p.type === "down") {
      this.drag = { id: p.id, y: p.y, s: this.scroll, moved: 0 };
      this.vel = 0;
    } else if (p.type === "move" && this.drag && this.drag.id === p.id) {
      const dy = p.y - this.drag.y;
      this.drag.moved = Math.max(this.drag.moved, Math.abs(dy));
      const ns = clamp(this.drag.s - dy, -40, this.maxScroll + 40);
      this.vel = (ns - this.scroll) * 60;
      this.scroll = ns;
    } else if ((p.type === "up" || p.type === "cancel") && this.drag && this.drag.id === p.id) {
      const tap = this.drag.moved < 8;
      this.drag = null;
      if (tap && p.type === "up") {
        const hit = this.hits.find((h) => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
        if (hit) hit.act();
      }
    }
  }

  private say(text: string) {
    this.toast = text;
    this.toastT = 1.8;
  }

  private buy(it: ShopItem, x: number, y: number) {
    if (it.kind === "skin" && wallet.owns(it.id)) {
      wallet.equip(it.id);
      this.env.sfx.tone({ freq: 660, dur: 0.06, vol: 0.05 });
      this.say(`ใช้ ${it.name} แล้ว`);
      return;
    }
    if (wallet.buy(it.id)) {
      this.env.sfx.chime(pentatonic(7), 0.1);
      this.env.sfx.chime(pentatonic(9), 0.08, 0.1);
      this.particles.burst(x, y, "#ffd76a", 26, { speed: 200, size: 3, gravity: 120 });
      this.say(it.kind === "skin" ? `ได้ ${it.name} แล้ว ใส่ให้เลย` : `ซื้อ ${it.name} แล้ว`);
    } else {
      this.env.sfx.tone({ freq: 180, dur: 0.12, vol: 0.06, type: "triangle" });
      this.say(`ยังขาดอีก ${(it.price - wallet.coins()).toLocaleString()} เหรียญ`);
    }
  }

  private upgrade(id: string, x: number, y: number) {
    const cost = wallet.upgradeCost(id);
    if (wallet.upgrade(id)) {
      this.env.sfx.chime(pentatonic(6 + (wallet.level(id) % 5)), 0.1);
      this.particles.burst(x, y, "#86efac", 22, { speed: 180, size: 3, gravity: 0 });
      this.say(`อัปเป็นขั้น ${wallet.level(id)} แล้ว`);
    } else {
      this.env.sfx.tone({ freq: 180, dur: 0.12, vol: 0.06, type: "triangle" });
      this.say(`ยังขาดอีก ${(cost - wallet.coins()).toLocaleString()} เหรียญ`);
    }
  }

  update(dt: number) {
    this.time += dt;
    this.particles.update(dt);
    this.toastT = Math.max(0, this.toastT - dt);
    if (!this.drag) {
      this.scroll += this.vel * dt;
      this.vel *= Math.pow(0.04, dt);
      if (this.scroll < 0) this.scroll += (0 - this.scroll) * Math.min(1, dt * 12);
      if (this.scroll > this.maxScroll) this.scroll += (this.maxScroll - this.scroll) * Math.min(1, dt * 12);
    }
    const c = wallet.coins();
    this.coinsShown += (c - this.coinsShown) * Math.min(1, dt * 8);
    if (Math.abs(c - this.coinsShown) < 0.5) this.coinsShown = c;
  }

  // ── Previews ─────────────────────────────────────────────────────────────

  private preview(c: CanvasRenderingContext2D, it: ShopItem, x: number, y: number, s: number) {
    c.save();
    c.translate(x, y);
    if (it.slot === "blockSkin") {
      const cols = ["#f472b6", "#60a5fa", "#4ade80", "#facc15"];
      const b = s * 0.42;
      cols.forEach((col, i) => {
        c.save();
        c.translate(-b + (i % 2) * b, -b + Math.floor(i / 2) * b);
        drawBlockSkin(c, b, col, it.id);
        c.restore();
      });
    } else if (it.slot === "shipSkin") {
      drawShip(c, s * 0.8, it.id, this.time);
    } else if (it.slot === "snakeSkin") {
      for (let i = 9; i >= 0; i--) {
        const a = this.time * 2 - i * 0.5;
        const px = Math.cos(a) * s * 0.28;
        const py = Math.sin(a * 2) * s * 0.12;
        c.fillStyle = snakeColor(it.id, i, this.time);
        c.beginPath();
        c.arc(px, py, s * 0.11, 0, TAU);
        c.fill();
      }
    } else if (it.slot === "bladeSkin") {
      c.lineCap = "round";
      const pts: [number, number][] = [];
      for (let i = 0; i < 14; i++) {
        const t = this.time * 2.2 - i * 0.05;
        pts.push([Math.cos(t * 2) * s * 0.36, Math.sin(t * 3) * s * 0.3]);
      }
      for (let i = 1; i < pts.length; i++) {
        const k = 1 - i / pts.length;
        const col = bladeColors(it.id, this.time, k);
        c.strokeStyle = col.outer;
        c.lineWidth = 10 * k + 2;
        c.beginPath();
        c.moveTo(pts[i - 1][0], pts[i - 1][1]);
        c.lineTo(pts[i][0], pts[i][1]);
        c.stroke();
        c.strokeStyle = col.core;
        c.lineWidth = 3.5 * k + 1;
        c.stroke();
      }
    } else drawBoosterIcon(c, it.id, s, this.time);
    c.restore();
  }

  private upgradeIcon(c: CanvasRenderingContext2D, id: string, x: number, y: number, s: number) {
    c.save();
    c.translate(x, y);
    const game = UPGRADES.find((u) => u.id === id)?.game;
    if (game === "shooter") {
      drawShip(c, s * 0.7, wallet.equipped("shipSkin"), this.time);
    } else if (game === "snake") {
      for (let i = 5; i >= 0; i--) {
        c.fillStyle = snakeColor(wallet.equipped("snakeSkin"), i, this.time);
        c.beginPath();
        c.arc(-s * 0.25 + i * s * 0.1, Math.sin(this.time * 3 + i) * 3, s * 0.12, 0, TAU);
        c.fill();
      }
    } else {
      c.fillStyle = "#22c55e";
      c.beginPath();
      c.arc(0, -s * 0.08, s * 0.24, 0, TAU);
      c.fill();
      c.fillStyle = "#78350f";
      c.fillRect(-s * 0.04, s * 0.1, s * 0.08, s * 0.2);
    }
    c.restore();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    const c = this.env.ctx;
    const { w, h } = this;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a1240");
    g.addColorStop(1, "#0d0a24");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    this.hits = [];

    // Balance header
    const headH = 118;
    c.fillStyle = "rgba(255,255,255,0.05)";
    roundRectPath(c, 12, 10, w - 24, 62, 18);
    c.fill();
    drawCoin(c, 44, 41, 16);
    c.font = `800 26px ${FONT_DISPLAY}`;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = "#ffd76a";
    c.fillText(Math.round(this.coinsShown).toLocaleString(), 68, 38);
    c.font = `500 11px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.65)";
    c.textAlign = "right";
    c.fillText("ผ่านช่วงอยาก +30 · วันไม่สูบ +50", w - 26, 32);
    c.fillText("ลดบุหรี่ได้ +15 · จบเกม +เหรียญ", w - 26, 50);

    // Tabs
    const tw = (w - 24) / 3;
    TABS.forEach((t, i) => {
      const x = 12 + i * tw;
      const on = this.tab === t.id;
      c.fillStyle = on ? "#f59e0b" : "rgba(255,255,255,0.07)";
      roundRectPath(c, x + 3, 80, tw - 6, 32, 16);
      c.fill();
      c.font = `700 14px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.fillStyle = on ? "#1e1b4b" : "rgba(255,255,255,0.85)";
      c.fillText(t.label, x + tw / 2, 97);
      this.hits.push({
        x: x + 3,
        y: 80,
        w: tw - 6,
        h: 32,
        act: () => {
          if (this.tab !== t.id) {
            this.tab = t.id;
            this.scroll = 0;
            this.vel = 0;
            this.env.sfx.tone({ freq: 600, dur: 0.05, vol: 0.04 });
          }
        },
      });
    });

    // List
    c.save();
    c.beginPath();
    c.rect(0, headH, w, h - headH);
    c.clip();
    let y = headH + 6 - this.scroll;
    const rows = this.rows();
    const total = rows.reduce((s, r) => s + r.h, 0) + 20;
    this.maxScroll = Math.max(0, total - (h - headH));
    const listHits: Hit[] = [];
    for (const row of rows) {
      if (y + row.h < headH - 10 || y > h + 10) {
        y += row.h;
        continue;
      }
      if (row.kind === "header") {
        c.font = `700 13px ${FONT_DISPLAY}`;
        c.textAlign = "left";
        c.fillStyle = "rgba(255,255,255,0.55)";
        c.fillText(row.title || "", 20, y + 24);
      } else {
        const x = 12;
        const cw = w - 24;
        const ch = row.h - 8;
        c.fillStyle = "rgba(255,255,255,0.06)";
        roundRectPath(c, x, y, cw, ch, 16);
        c.fill();
        const pv = { x: x + 40, y: y + ch / 2 };
        c.fillStyle = "rgba(0,0,0,0.25)";
        roundRectPath(c, x + 8, y + 8, 64, ch - 16, 12);
        c.fill();
        let title = "";
        let desc = "";
        let btnLabel = "";
        let btnColor = "#f59e0b";
        let enabled = true;
        let act: () => void = () => {};
        if (row.kind === "item" && row.item) {
          const it = row.item;
          this.preview(c, it, pv.x, pv.y, 60);
          title = it.name;
          desc = it.desc;
          if (it.kind === "skin") {
            const owned = wallet.owns(it.id);
            const on = wallet.equipped(it.slot!) === it.id;
            if (on) {
              btnLabel = "ใช้อยู่";
              btnColor = "#16a34a";
              enabled = false;
            } else if (owned) {
              btnLabel = "ใช้";
              btnColor = "#6366f1";
            } else {
              btnLabel = it.price.toLocaleString();
              enabled = wallet.coins() >= it.price;
            }
          } else {
            const have = wallet.boosters(it.id);
            desc = `${it.desc} · มี ${have}`;
            btnLabel = it.price.toLocaleString();
            enabled = wallet.coins() >= it.price;
          }
          const bx = x + cw - 90;
          if (!(it.kind === "skin" && wallet.equipped(it.slot!) === it.id)) act = () => this.buy(it, bx + 40, y + ch / 2);
        } else if (row.upId) {
          const u = UPGRADES.find((q) => q.id === row.upId)!;
          this.upgradeIcon(c, u.id, pv.x, pv.y, 60);
          const lvl = wallet.level(u.id);
          title = `${u.name}  ขั้น ${lvl}`;
          desc = u.desc;
          const cost = wallet.upgradeCost(u.id);
          btnLabel = cost.toLocaleString();
          enabled = wallet.coins() >= cost;
          const bx = x + cw - 90;
          act = () => this.upgrade(u.id, bx + 40, y + ch / 2);
        }
        c.textAlign = "left";
        c.textBaseline = "top";
        c.font = `700 15px ${FONT_DISPLAY}`;
        c.fillStyle = "#ffffff";
        c.fillText(title, x + 84, y + 12);
        c.font = `500 12px ${FONT_BODY}`;
        c.fillStyle = "rgba(255,255,255,0.65)";
        wrapText(c, desc, cw - 84 - 100)
          .slice(0, 2)
          .forEach((l, k) => c.fillText(l, x + 84, y + 36 + k * 16));
        // Button
        const bx = x + cw - 92;
        const by = y + ch / 2 - 18;
        c.globalAlpha = enabled ? 1 : 0.55;
        c.fillStyle = enabled ? btnColor : "rgba(255,255,255,0.12)";
        roundRectPath(c, bx, by, 82, 36, 18);
        c.fill();
        const isPrice = /^[\d,]+$/.test(btnLabel);
        c.font = `700 14px ${FONT_DISPLAY}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = enabled ? (btnColor === "#f59e0b" ? "#1e1b4b" : "#ffffff") : "rgba(255,255,255,0.8)";
        if (isPrice) {
          drawCoin(c, bx + 18, by + 18, 8);
          c.fillText(btnLabel, bx + 48, by + 19);
        } else c.fillText(btnLabel, bx + 41, by + 19);
        c.globalAlpha = 1;
        if (y + ch > headH) listHits.push({ x: bx - 6, y: Math.max(by, headH), w: 94, h: 36, act });
      }
      y += row.h;
    }
    c.restore();
    this.hits.push(...listHits);

    this.particles.render(c);
    if (this.toastT > 0) {
      c.globalAlpha = clamp(this.toastT * 2, 0, 1);
      c.font = `700 14px ${FONT_DISPLAY}`;
      const tw2 = c.measureText(this.toast).width + 40;
      c.fillStyle = "rgba(10,10,30,0.92)";
      roundRectPath(c, w / 2 - tw2 / 2, h - 70, tw2, 40, 20);
      c.fill();
      c.strokeStyle = rgba("#fbbf24", 0.6);
      c.stroke();
      c.fillStyle = "#ffffff";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(this.toast, w / 2, h - 50);
      c.globalAlpha = 1;
    }
  }
}
