// Canvas UI: buttons, glass panels, wrapped Thai text, and the start / game-over cards every game uses.

import { FONT_BODY, FONT_DISPLAY, roundRectPath, rgba, shade, ease, clamp } from "./fx";

// Thai has no spaces between words; Intl.Segmenter splits it into words for line wrapping.
const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null = (() => {
  try {
    const S = (Intl as any).Segmenter;
    return S ? new S("th", { granularity: "word" }) : null;
  } catch {
    return null;
  }
})();

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = segmenter ? Array.from(segmenter.segment(para), (s) => s.segment) : Array.from(para);
    let line = "";
    for (const w of words) {
      const test = line + w;
      if (ctx.measureText(test).width > maxWidth && line.trim()) {
        out.push(line.trimEnd());
        line = w.trimStart();
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

export function fillTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

export class Button {
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  pressed = false;
  private pressT = 0;

  constructor(
    public label: string,
    public color: string,
    public variant: "solid" | "ghost" = "solid"
  ) {}

  place(cx: number, y: number, w: number, h = 52) {
    this.x = cx - w / 2;
    this.y = y;
    this.w = w;
    this.h = h;
    return this;
  }

  hit(px: number, py: number) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }

  update(dt: number) {
    this.pressT = clamp(this.pressT + (this.pressed ? dt : -dt) * 8, 0, 1);
  }

  render(ctx: CanvasRenderingContext2D) {
    const s = 1 - this.pressT * 0.05;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    const x = -this.w / 2;
    const y = -this.h / 2;
    const r = this.h / 2;
    if (this.variant === "solid") {
      ctx.shadowColor = rgba(this.color, 0.55);
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      const g = ctx.createLinearGradient(0, y, 0, y + this.h);
      g.addColorStop(0, shade(this.color, 0.22));
      g.addColorStop(1, shade(this.color, -0.12));
      ctx.fillStyle = g;
      roundRectPath(ctx, x, y, this.w, this.h, r);
      ctx.fill();
      ctx.shadowColor = "transparent";
      // Top sheen
      const sheen = ctx.createLinearGradient(0, y, 0, y + this.h * 0.55);
      sheen.addColorStop(0, "rgba(255,255,255,0.35)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      roundRectPath(ctx, x + 2, y + 2, this.w - 4, this.h * 0.55, r - 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      roundRectPath(ctx, x, y, this.w, this.h, r);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
    }
    ctx.font = `600 ${Math.round(this.h * 0.36)}px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.label, 0, 1);
    ctx.restore();
  }
}

export function glassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 22, alpha = 0.14) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `rgba(255,255,255,${alpha + 0.06})`);
  g.addColorStop(1, `rgba(255,255,255,${alpha * 0.5})`);
  ctx.fillStyle = g;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export interface CardOptions {
  title: string;
  subtitle?: string;
  body?: string;
  /** Big number shown in the middle (scores). */
  bigValue?: string;
  bigLabel?: string;
  /** Small chips under the big number, e.g. "สถิติ 1200". */
  chips?: string[];
  accent: string;
  buttons: Button[];
  /** 0..1 for the entrance animation. */
  appear: number;
  /** Optional icon drawn above the title, centred on (0,0), about 64px. */
  icon?: (ctx: CanvasRenderingContext2D) => void;
  /** Coins earned this round, shown as a gold badge. */
  coins?: number;
}

/** A gold coin with a leaf mark, centred on (x, y). */
export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#fff3b0");
  g.addColorStop(0.5, "#ffc93c");
  g.addColorStop(1, "#c98a0b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#a86b00";
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(168,107,0,0.5)";
  ctx.lineWidth = Math.max(0.8, r * 0.08);
  ctx.stroke();
  // Leaf
  ctx.fillStyle = "#a86b00";
  ctx.beginPath();
  ctx.moveTo(-r * 0.32, r * 0.3);
  ctx.quadraticCurveTo(-r * 0.3, -r * 0.4, r * 0.35, -r * 0.35);
  ctx.quadraticCurveTo(r * 0.3, r * 0.3, -r * 0.32, r * 0.3);
  ctx.fill();
  ctx.restore();
}

/** Centred card with title, text and buttons. Lays the buttons out and returns the card rect. */
export function drawCard(ctx: CanvasRenderingContext2D, w: number, h: number, o: CardOptions) {
  const a = ease.outCubic(clamp(o.appear, 0, 1));
  ctx.save();
  ctx.fillStyle = `rgba(6,8,28,${0.62 * a})`;
  ctx.fillRect(0, 0, w, h);

  const cw = Math.min(360, w - 40);
  const pad = 26;
  ctx.font = `500 15px ${FONT_BODY}`;
  const bodyLines = o.body ? wrapText(ctx, o.body, cw - pad * 2) : [];
  const iconH = o.icon ? 78 : 0;
  const bigH = o.bigValue ? 86 : 0;
  const chipsH = o.chips && o.chips.length ? 40 : 0;
  const coinsH = o.coins ? 40 : 0;
  const btnH = o.buttons.length * 62;
  const ch = pad + iconH + 40 + (o.subtitle ? 26 : 0) + bodyLines.length * 23 + (bodyLines.length ? 10 : 0) + bigH + chipsH + coinsH + btnH + pad - 10;
  const cx = w / 2;
  const cy = h / 2 + (1 - a) * 40;
  const x = cx - cw / 2;
  const y = cy - ch / 2;

  ctx.globalAlpha = a;
  // Solid dark base so the game behind the card does not make the text hard to read.
  ctx.fillStyle = "rgba(20,22,58,0.92)";
  roundRectPath(ctx, x, y, cw, ch, 26);
  ctx.fill();
  glassPanel(ctx, x, y, cw, ch, 26, 0.1);

  // Accent glow at the top of the card
  const tg = ctx.createRadialGradient(cx, y, 0, cx, y, cw * 0.6);
  tg.addColorStop(0, rgba(o.accent, 0.35));
  tg.addColorStop(1, rgba(o.accent, 0));
  ctx.fillStyle = tg;
  roundRectPath(ctx, x, y, cw, ch, 26);
  ctx.fill();

  let yy = y + pad;
  if (o.icon) {
    ctx.save();
    ctx.translate(cx, yy + 34);
    o.icon(ctx);
    ctx.restore();
    yy += iconH;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 26px ${FONT_DISPLAY}`;
  ctx.fillText(o.title, cx, yy);
  yy += 40;
  if (o.subtitle) {
    ctx.font = `500 15px ${FONT_DISPLAY}`;
    ctx.fillStyle = rgba("#ffffff", 0.7);
    ctx.fillText(o.subtitle, cx, yy);
    yy += 26;
  }
  if (bodyLines.length) {
    ctx.font = `500 15px ${FONT_BODY}`;
    ctx.fillStyle = "rgba(235,240,255,0.88)";
    bodyLines.forEach((l, i) => ctx.fillText(l, cx, yy + i * 23));
    yy += bodyLines.length * 23 + 10;
  }
  if (o.bigValue) {
    ctx.font = `800 52px ${FONT_DISPLAY}`;
    const g = ctx.createLinearGradient(0, yy, 0, yy + 56);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, shade(o.accent, 0.45));
    ctx.fillStyle = g;
    ctx.fillText(o.bigValue, cx, yy);
    if (o.bigLabel) {
      ctx.font = `500 13px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(o.bigLabel, cx, yy + 60);
    }
    yy += bigH;
  }
  if (o.chips && o.chips.length) {
    ctx.font = `600 13px ${FONT_DISPLAY}`;
    const widths = o.chips.map((c) => ctx.measureText(c).width + 24);
    const total = widths.reduce((s, v) => s + v, 0) + (widths.length - 1) * 8;
    let xx = cx - total / 2;
    o.chips.forEach((c, i) => {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRectPath(ctx, xx, yy, widths[i], 28, 14);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.textBaseline = "middle";
      ctx.fillText(c, xx + widths[i] / 2, yy + 14);
      ctx.textBaseline = "top";
      xx += widths[i] + 8;
    });
    yy += chipsH;
  }
  if (o.coins) {
    const label = `+${o.coins.toLocaleString()} เหรียญ`;
    ctx.font = `800 18px ${FONT_DISPLAY}`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 52;
    ctx.fillStyle = "rgba(255,201,60,0.18)";
    roundRectPath(ctx, cx - bw / 2, yy, bw, 32, 16);
    ctx.fill();
    drawCoin(ctx, cx - bw / 2 + 18, yy + 16, 11);
    ctx.fillStyle = "#ffd76a";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx - bw / 2 + 36, yy + 17);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    yy += coinsH;
  }
  o.buttons.forEach((b, i) => {
    b.place(cx, yy + i * 62, cw - pad * 2, 50);
    b.render(ctx);
  });
  ctx.restore();
  return { x, y, w: cw, h: ch };
}

/** Pill-shaped HUD stat: small label on top, value below. */
export function hudStat(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string, align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.font = `500 11px ${FONT_BODY}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(label, x, y);
  ctx.font = `700 22px ${FONT_DISPLAY}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(value, x, y + 14);
  ctx.restore();
}

export function bestScore(store: { get(k: string): string | null; set(k: string, v: string): void }, key: string, score: number) {
  const prev = parseInt(store.get(key) || "0", 10) || 0;
  const best = Math.max(prev, score);
  if (best !== prev) store.set(key, String(best));
  return { best, isNew: score > prev && score > 0 };
}
