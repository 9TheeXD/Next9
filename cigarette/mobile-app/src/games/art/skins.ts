// Looks the shop sells: block skins, blade trails, ships and snake patterns. Shared by the games
// and by the shop's previews.

import { TAU, shade, rgba, roundRectPath, glow } from "../engine/fx";

// ── Blocks ──────────────────────────────────────────────────────────────────

export function drawBlockSkin(c: CanvasRenderingContext2D, s: number, color: string, skin: string) {
  switch (skin) {
    case "block_neon": {
      c.fillStyle = "#0a0d24";
      roundRectPath(c, 1.5, 1.5, s - 3, s - 3, s * 0.16);
      c.fill();
      c.save();
      c.shadowColor = color;
      c.shadowBlur = s * 0.35;
      c.strokeStyle = shade(color, 0.25);
      c.lineWidth = Math.max(1.5, s * 0.09);
      roundRectPath(c, s * 0.1, s * 0.1, s * 0.8, s * 0.8, s * 0.14);
      c.stroke();
      c.restore();
      c.strokeStyle = rgba(color, 0.55);
      c.lineWidth = Math.max(1, s * 0.04);
      roundRectPath(c, s * 0.3, s * 0.3, s * 0.4, s * 0.4, s * 0.06);
      c.stroke();
      return;
    }
    case "block_candy": {
      const base = shade(color, 0.3);
      c.fillStyle = base;
      roundRectPath(c, 1, 1, s - 2, s - 2, s * 0.3);
      c.fill();
      c.save();
      roundRectPath(c, 1, 1, s - 2, s - 2, s * 0.3);
      c.clip();
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.lineWidth = s * 0.12;
      for (let k = -2; k < 4; k++) {
        c.beginPath();
        c.moveTo(k * s * 0.4, s + 2);
        c.lineTo(k * s * 0.4 + s, -2);
        c.stroke();
      }
      c.restore();
      c.strokeStyle = shade(color, -0.15);
      c.lineWidth = Math.max(1, s * 0.06);
      roundRectPath(c, 1.5, 1.5, s - 3, s - 3, s * 0.3);
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.7)";
      c.beginPath();
      c.ellipse(s * 0.33, s * 0.25, s * 0.17, s * 0.08, -0.4, 0, TAU);
      c.fill();
      return;
    }
    case "block_pixel": {
      const p = Math.max(1, Math.round(s / 8));
      c.fillStyle = color;
      c.fillRect(0, 0, s, s);
      c.fillStyle = shade(color, 0.4);
      c.fillRect(0, 0, s, p);
      c.fillRect(0, 0, p, s);
      c.fillStyle = shade(color, -0.4);
      c.fillRect(0, s - p, s, p);
      c.fillRect(s - p, 0, p, s);
      c.fillStyle = "rgba(255,255,255,0.75)";
      c.fillRect(p * 2, p * 2, p * 2, p);
      c.fillRect(p * 2, p * 2, p, p * 2);
      c.strokeStyle = "rgba(0,0,0,0.6)";
      c.lineWidth = 1;
      c.strokeRect(0.5, 0.5, s - 1, s - 1);
      return;
    }
    case "block_gold": {
      const g = c.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, "#fff1a8");
      g.addColorStop(0.35, "#f6c445");
      g.addColorStop(0.7, "#c98a0b");
      g.addColorStop(1, "#8a5a00");
      c.fillStyle = g;
      roundRectPath(c, 1, 1, s - 2, s - 2, s * 0.18);
      c.fill();
      c.strokeStyle = "#6b4300";
      c.lineWidth = Math.max(1, s * 0.05);
      c.stroke();
      // Gem in the block's colour
      c.save();
      c.translate(s / 2, s / 2);
      const gg = c.createLinearGradient(-s * 0.2, -s * 0.2, s * 0.2, s * 0.2);
      gg.addColorStop(0, shade(color, 0.5));
      gg.addColorStop(1, shade(color, -0.2));
      c.fillStyle = gg;
      c.beginPath();
      c.moveTo(0, -s * 0.22);
      c.lineTo(s * 0.2, 0);
      c.lineTo(0, s * 0.22);
      c.lineTo(-s * 0.2, 0);
      c.closePath();
      c.fill();
      c.restore();
      c.fillStyle = "rgba(255,255,255,0.65)";
      c.beginPath();
      c.ellipse(s * 0.3, s * 0.22, s * 0.14, s * 0.06, -0.5, 0, TAU);
      c.fill();
      return;
    }
    default:
      drawClassicBlock(c, s, color);
  }
}

export function drawClassicBlock(ctx: CanvasRenderingContext2D, s: number, color: string) {
  const r = s * 0.2;
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  roundRectPath(ctx, 1, 1, s - 2, s - 2, r);
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.strokeStyle = rgba("#ffffff", 0.45);
  ctx.beginPath();
  ctx.moveTo(2 + r, 2.5);
  ctx.lineTo(s - 2 - r, 2.5);
  ctx.moveTo(2.5, 2 + r);
  ctx.lineTo(2.5, s - 2 - r);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.moveTo(2 + r, s - 2.5);
  ctx.lineTo(s - 2 - r, s - 2.5);
  ctx.moveTo(s - 2.5, 2 + r);
  ctx.lineTo(s - 2.5, s - 2 - r);
  ctx.stroke();
  const inset = s * 0.22;
  const fg = ctx.createLinearGradient(inset, inset, s - inset, s - inset);
  fg.addColorStop(0, rgba("#ffffff", 0.28));
  fg.addColorStop(1, rgba("#ffffff", 0.02));
  ctx.fillStyle = fg;
  roundRectPath(ctx, inset, inset, s - inset * 2, s - inset * 2, r * 0.6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(s * 0.32, s * 0.24, s * 0.16, s * 0.07, -0.5, 0, TAU);
  ctx.fill();
}

// ── Blade trails ────────────────────────────────────────────────────────────

/** Outer glow and core colours of the blade trail at time t (seconds), k = 0..1 along the trail. */
export function bladeColors(skin: string, t: number, k: number): { outer: string; core: string; spark?: string } {
  switch (skin) {
    case "blade_fire":
      return { outer: `rgba(255,${120 + Math.round(80 * k)},40,${0.45 * k})`, core: `rgba(255,240,180,${0.95 * k})`, spark: "#ffb347" };
    case "blade_ice":
      return { outer: `rgba(120,220,255,${0.45 * k})`, core: `rgba(235,252,255,${0.95 * k})`, spark: "#c8f4ff" };
    case "blade_rainbow": {
      const hue = (t * 240 + k * 160) % 360;
      return { outer: `hsla(${hue},95%,60%,${0.5 * k})`, core: `hsla(${hue},100%,88%,${0.95 * k})`, spark: `hsl(${hue},95%,65%)` };
    }
    default:
      return { outer: `rgba(200,240,255,${0.35 * k})`, core: `rgba(255,255,255,${0.95 * k})` };
  }
}

// ── Ships ───────────────────────────────────────────────────────────────────

const SHIP_COLORS: Record<string, [string, string, string]> = {
  ship_falcon: ["#4fa8ff", "#e8f2ff", "#9be7ff"],
  ship_phoenix: ["#ff6a3d", "#ffd6a0", "#ffdd57"],
  ship_viper: ["#21c27a", "#d9ffe9", "#7dffb8"],
  ship_nova: ["#f6c445", "#fff4c2", "#ffffff"],
};

/** Player ship pointing up, centred on (0, 0), about `size` tall. */
export function drawShip(c: CanvasRenderingContext2D, size: number, skin: string, t = 0) {
  const [main, light, cockpit] = SHIP_COLORS[skin] || SHIP_COLORS.ship_falcon;
  const s = size / 2;
  if (skin === "ship_nova") glow(c, 0, 0, s * 2.2, "#ffe58a", 0.35 + 0.1 * Math.sin(t * 4));
  // Wings
  const wing = skin === "ship_phoenix" ? 1.15 : skin === "ship_viper" ? 0.8 : 1;
  const wg = c.createLinearGradient(-s, 0, s, 0);
  wg.addColorStop(0, shade(main, -0.35));
  wg.addColorStop(0.5, main);
  wg.addColorStop(1, shade(main, -0.35));
  c.fillStyle = wg;
  c.beginPath();
  c.moveTo(0, -s * 0.2);
  c.lineTo(s * wing, s * 0.55);
  c.lineTo(s * wing * 0.85, s * 0.75);
  c.lineTo(s * 0.25, s * 0.5);
  c.lineTo(-s * 0.25, s * 0.5);
  c.lineTo(-s * wing * 0.85, s * 0.75);
  c.lineTo(-s * wing, s * 0.55);
  c.closePath();
  c.fill();
  if (skin === "ship_phoenix") {
    c.fillStyle = "#ffcf57";
    for (const sx of [-1, 1]) {
      c.beginPath();
      c.moveTo(sx * s * 0.4, s * 0.3);
      c.lineTo(sx * s * 1.25, s * 0.2);
      c.lineTo(sx * s * 0.9, s * 0.55);
      c.closePath();
      c.fill();
    }
  }
  // Fuselage
  const fg = c.createLinearGradient(-s * 0.3, 0, s * 0.3, 0);
  fg.addColorStop(0, shade(light, -0.25));
  fg.addColorStop(0.5, light);
  fg.addColorStop(1, shade(light, -0.3));
  c.fillStyle = fg;
  c.beginPath();
  c.moveTo(0, -s);
  c.quadraticCurveTo(s * 0.32, -s * 0.4, s * 0.28, s * 0.7);
  c.lineTo(-s * 0.28, s * 0.7);
  c.quadraticCurveTo(-s * 0.32, -s * 0.4, 0, -s);
  c.closePath();
  c.fill();
  c.strokeStyle = shade(main, -0.4);
  c.lineWidth = Math.max(1, s * 0.05);
  c.stroke();
  // Stripe
  c.fillStyle = main;
  c.fillRect(-s * 0.06, -s * 0.55, s * 0.12, s * 1.1);
  // Cockpit
  const cg = c.createLinearGradient(0, -s * 0.6, 0, -s * 0.1);
  cg.addColorStop(0, "#ffffff");
  cg.addColorStop(1, cockpit);
  c.fillStyle = cg;
  c.beginPath();
  c.ellipse(0, -s * 0.35, s * 0.13, s * 0.25, 0, 0, TAU);
  c.fill();
  // Guns
  c.fillStyle = shade(main, -0.5);
  c.fillRect(-s * 0.72, s * 0.25, s * 0.08, s * 0.35);
  c.fillRect(s * 0.64, s * 0.25, s * 0.08, s * 0.35);
}

export function shipFlame(skin: string): string {
  return skin === "ship_phoenix" ? "#ff8a3d" : skin === "ship_viper" ? "#5dffb0" : skin === "ship_nova" ? "#fff2a8" : "#7cc8ff";
}

// ── Snakes ──────────────────────────────────────────────────────────────────

export function snakeColor(skin: string, i: number, t = 0): string {
  switch (skin) {
    case "snake_tiger":
      return i % 6 < 2 ? "#2b1d14" : i % 6 < 4 ? "#ff8a1f" : "#ffa94d";
    case "snake_galaxy": {
      const k = (Math.sin(i * 0.25) + 1) / 2;
      return `hsl(${250 + k * 40},70%,${38 + k * 18}%)`;
    }
    case "snake_rainbow":
      return `hsl(${(i * 14 + t * 60) % 360},90%,60%)`;
    default:
      return i % 4 < 2 ? "#5eead4" : "#2dd4bf";
  }
}
