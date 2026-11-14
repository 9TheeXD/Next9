// Canvas setup screen shared by the games you can play against a bot or with friends on one device:
// rows of segmented choices (opponent, difficulty, board size, players…) and a start button.
// Choices are remembered per game in the game's small store.

import type { GameEnv, PointerInfo } from "./types";
import { Button, wrapText } from "./ui";
import { clamp, ease, roundRectPath, rgba, FONT_BODY, FONT_DISPLAY, glow } from "./fx";

export interface MenuChoice {
  value: string;
  label: string;
}

export interface MenuRow {
  key: string;
  label: string;
  choices: MenuChoice[];
  /** Hide the row unless this returns true for the current values. */
  when?: (v: Record<string, string>) => boolean;
}

export interface MenuConfig {
  title: string;
  subtitle?: string;
  body?: string;
  accent: string;
  rows: MenuRow[];
  startLabel?: string;
  /** Optional small art drawn above the title, centred on (0,0), about 70px tall. */
  icon?: (ctx: CanvasRenderingContext2D, t: number) => void;
}

interface Hit {
  x: number;
  y: number;
  w: number;
  h: number;
  row: string;
  value: string;
}

export class SetupMenu {
  values: Record<string, string> = {};
  private hits: Hit[] = [];
  private start: Button;
  private t = 0;
  private pressed: Hit | null = null;
  /** Text shown under the start button, e.g. the last result. */
  note = "";

  constructor(
    private env: GameEnv,
    public cfg: MenuConfig
  ) {
    this.start = new Button(cfg.startLabel || "เริ่มเล่น", cfg.accent);
    let saved: Record<string, string> = {};
    try {
      saved = JSON.parse(env.store.get("setup") || "{}");
    } catch {
      saved = {};
    }
    for (const r of cfg.rows) {
      const s = saved[r.key];
      this.values[r.key] = r.choices.some((c) => c.value === s) ? s : r.choices[0].value;
    }
  }

  /** Call when the menu is shown again so it animates in. */
  reset() {
    this.t = 0;
  }

  update(dt: number) {
    this.t += dt;
    this.start.update(dt);
  }

  /** Returns true when the player pressed start. */
  pointer(p: PointerInfo): boolean {
    if (p.type === "down") {
      if (this.start.hit(p.x, p.y)) this.start.pressed = true;
      this.pressed = this.hits.find((h) => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) || null;
      return false;
    }
    if (p.type === "up" || p.type === "cancel") {
      let go = false;
      if (p.type === "up" && this.start.pressed && this.start.hit(p.x, p.y) && this.t > 0.3) go = true;
      this.start.pressed = false;
      const h = this.pressed;
      this.pressed = null;
      if (p.type === "up" && h && p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
        if (this.values[h.row] !== h.value) {
          this.values[h.row] = h.value;
          this.env.sfx.tone({ freq: 660, dur: 0.05, vol: 0.04 });
        }
      }
      if (go) {
        this.env.store.set("setup", JSON.stringify(this.values));
        this.env.sfx.tone({ freq: 523, dur: 0.12, vol: 0.06, glideTo: 784 });
      }
      return go;
    }
    return false;
  }

  key(code: string): boolean {
    if ((code === "Enter" || code === "Space") && this.t > 0.4) {
      this.env.store.set("setup", JSON.stringify(this.values));
      return true;
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cfg = this.cfg;
    const a = ease.outCubic(clamp(this.t * 3, 0, 1));
    const rows = cfg.rows.filter((r) => !r.when || r.when(this.values));
    const cw = Math.min(380, w - 28);
    const pad = 22;
    ctx.save();
    ctx.fillStyle = `rgba(6,8,28,${0.6 * a})`;
    ctx.fillRect(0, 0, w, h);

    // Measure
    ctx.font = `500 14px ${FONT_BODY}`;
    const body = cfg.body ? wrapText(ctx, cfg.body, cw - pad * 2) : [];
    const pillH = 36;
    const rowLayouts = rows.map((r) => {
      // Wrap pills onto several lines when they do not fit
      ctx.font = `600 14px ${FONT_DISPLAY}`;
      const inner = cw - pad * 2;
      const lines: MenuChoice[][] = [[]];
      let used = 0;
      if (r.choices.length <= 4) return { r, lines: [r.choices] };
      for (const c of r.choices) {
        const need = Math.max(56, ctx.measureText(c.label).width + 26);
        const line = lines[lines.length - 1];
        if (line.length && used + need > inner + 0.5) {
          lines.push([c]);
          used = need + 6;
        } else {
          line.push(c);
          used += need + 6;
        }
      }
      return { r, lines };
    });
    const iconH = cfg.icon ? 74 : 0;
    const rowsH = rowLayouts.reduce((s, l) => s + 22 + l.lines.length * (pillH + 6) + 8, 0);
    const ch = pad + iconH + 36 + (cfg.subtitle ? 24 : 0) + body.length * 21 + (body.length ? 10 : 0) + rowsH + 62 + (this.note ? 24 : 0) + pad - 6;
    const x = w / 2 - cw / 2;
    const y = Math.max(10, h / 2 - ch / 2) + (1 - a) * 30;
    ctx.globalAlpha = a;

    ctx.fillStyle = "rgba(20,22,58,0.94)";
    roundRectPath(ctx, x, y, cw, ch, 24);
    ctx.fill();
    ctx.strokeStyle = rgba(cfg.accent, 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    let yy = y + pad;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (cfg.icon) {
      ctx.save();
      ctx.translate(w / 2, yy + 34);
      glow(ctx, 0, 0, 50, cfg.accent, 0.35);
      cfg.icon(ctx, this.t);
      ctx.restore();
      yy += iconH;
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 25px ${FONT_DISPLAY}`;
    ctx.fillText(cfg.title, w / 2, yy);
    yy += 36;
    if (cfg.subtitle) {
      ctx.font = `500 14px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(cfg.subtitle, w / 2, yy);
      yy += 24;
    }
    if (body.length) {
      ctx.font = `500 14px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (const line of body) {
        ctx.fillText(line, w / 2, yy);
        yy += 21;
      }
      yy += 10;
    }

    this.hits = [];
    for (const { r, lines } of rowLayouts) {
      ctx.textAlign = "left";
      ctx.font = `700 13px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(r.label, x + pad, yy);
      yy += 22;
      for (const line of lines) {
        const inner = cw - pad * 2;
        ctx.font = `600 14px ${FONT_DISPLAY}`;
        const widths = line.map((c) => (r.choices.length <= 4 ? (inner - 6 * (line.length - 1)) / line.length : Math.max(56, ctx.measureText(c.label).width + 26)));
        const total = widths.reduce((s, v) => s + v, 0) + 6 * (line.length - 1);
        let px = x + pad + (r.choices.length <= 4 ? 0 : (inner - total) / 2);
        line.forEach((c, i) => {
          const on = this.values[r.key] === c.value;
          const pw = widths[i];
          ctx.fillStyle = on ? cfg.accent : "rgba(255,255,255,0.08)";
          roundRectPath(ctx, px, yy, pw, pillH, pillH / 2);
          ctx.fill();
          if (!on) {
            ctx.strokeStyle = "rgba(255,255,255,0.18)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.85)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(c.label, px + pw / 2, yy + pillH / 2 + 1);
          ctx.textBaseline = "top";
          this.hits.push({ x: px, y: yy, w: pw, h: pillH, row: r.key, value: c.value });
          px += pw + 6;
        });
        yy += pillH + 6;
      }
      yy += 8;
    }
    yy += 6;
    this.start.place(w / 2, yy, cw - pad * 2, 50);
    this.start.render(ctx);
    yy += 56;
    if (this.note) {
      ctx.textAlign = "center";
      ctx.font = `600 13px ${FONT_BODY}`;
      ctx.fillStyle = "#ffd76a";
      ctx.fillText(this.note, w / 2, yy);
    }
    ctx.restore();
  }
}

/** Standard rows reused by the duel games. */
export const OPPONENT_ROW: MenuRow = {
  key: "mode",
  label: "เล่นกับ",
  choices: [
    { value: "bot", label: "บอท" },
    { value: "friend", label: "เพื่อน (เครื่องเดียว)" },
  ],
};

export const LEVEL_ROW: MenuRow = {
  key: "level",
  label: "ความยากของบอท",
  choices: [
    { value: "0", label: "ง่าย" },
    { value: "1", label: "กลาง" },
    { value: "2", label: "ยาก" },
    { value: "3", label: "โหด" },
  ],
  when: (v) => v.mode !== "friend",
};

/** Coins for finishing a duel: more for beating a harder bot, a little for friendly games. */
export function duelCoins(mode: string, level: number, result: "win" | "lose" | "draw") {
  if (mode === "friend") return 10;
  const win = [20, 40, 80, 150][level] ?? 20;
  return result === "win" ? win : result === "draw" ? Math.round(win / 2) : 5;
}
