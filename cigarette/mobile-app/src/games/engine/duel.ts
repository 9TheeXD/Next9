// Small pieces shared by the turn-based duel games (chess, XO, connect four, checkers, othello…):
// player name bars, the "bot is thinking" dots and the end-of-game card with two buttons.

import { Button, drawCard } from "./ui";
import { roundRectPath, rgba, FONT_BODY, FONT_DISPLAY, TAU } from "./fx";

/** A rounded bar with a colour swatch, a name and an optional right-hand text. */
export function playerBar(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  o: { name: string; color: string; active: boolean; right?: string; thinking?: boolean; time: number; swatch?: (c: CanvasRenderingContext2D, x: number, y: number, r: number) => void; flip?: boolean }
) {
  const h = 40;
  c.save();
  if (o.flip) {
    c.translate(x + w / 2, y + h / 2);
    c.rotate(Math.PI);
    c.translate(-(x + w / 2), -(y + h / 2));
  }
  c.fillStyle = o.active ? rgba(o.color, 0.22) : "rgba(255,255,255,0.06)";
  roundRectPath(c, x, y, w, h, 20);
  c.fill();
  if (o.active) {
    c.strokeStyle = rgba(o.color, 0.9);
    c.lineWidth = 2;
    c.stroke();
  }
  if (o.swatch) o.swatch(c, x + 22, y + h / 2, 11);
  else {
    c.fillStyle = o.color;
    c.beginPath();
    c.arc(x + 22, y + h / 2, 9, 0, TAU);
    c.fill();
  }
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = `700 15px ${FONT_DISPLAY}`;
  c.fillStyle = "#ffffff";
  c.fillText(o.name, x + 40, y + h / 2 + 1);
  if (o.thinking) {
    const tw = c.measureText(o.name).width;
    for (let i = 0; i < 3; i++) {
      c.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.max(0, Math.sin(o.time * 6 - i * 0.8))})`;
      c.beginPath();
      c.arc(x + 48 + tw + i * 9, y + h / 2 + 2, 2.6, 0, TAU);
      c.fill();
    }
  }
  if (o.right) {
    c.textAlign = "right";
    c.font = `600 13px ${FONT_BODY}`;
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.fillText(o.right, x + w - 14, y + h / 2 + 1);
  }
  c.restore();
  return h;
}

/** End card with "play again" and "settings" buttons. */
export class DuelOver {
  again = new Button("เล่นอีกครั้ง", "#6366f1");
  setup = new Button("เปลี่ยนการตั้งค่า", "#6366f1", "ghost");
  t = 0;

  constructor(accent: string) {
    this.again.color = accent;
  }

  update(dt: number) {
    this.t += dt;
    this.again.update(dt);
    this.setup.update(dt);
  }

  render(c: CanvasRenderingContext2D, w: number, h: number, o: { title: string; subtitle: string; coins?: number; chips?: string[]; accent: string }) {
    drawCard(c, w, h, { title: o.title, subtitle: o.subtitle, coins: o.coins, chips: o.chips, accent: o.accent, buttons: [this.again, this.setup], appear: this.t * 3 });
  }

  /** "again" | "setup" | null */
  pointer(type: string, x: number, y: number): "again" | "setup" | null {
    let out: "again" | "setup" | null = null;
    for (const [b, name] of [
      [this.again, "again"],
      [this.setup, "setup"],
    ] as const) {
      if (type === "down" && b.hit(x, y)) b.pressed = true;
      if (type === "up") {
        if (b.pressed && b.hit(x, y) && this.t > 0.4) out = name;
        b.pressed = false;
      }
    }
    return out;
  }
}

/** Small round icon button used in the bottom toolbars. */
export class IconButton {
  x = 0;
  y = 0;
  r = 22;
  pressed = false;
  constructor(
    public label: string,
    public icon: (c: CanvasRenderingContext2D) => void
  ) {}
  place(x: number, y: number, r = 22) {
    this.x = x;
    this.y = y;
    this.r = r;
  }
  hit(px: number, py: number) {
    return Math.hypot(px - this.x, py - this.y) <= this.r + 6;
  }
  render(c: CanvasRenderingContext2D, enabled = true) {
    c.save();
    c.globalAlpha = enabled ? 1 : 0.35;
    c.fillStyle = this.pressed ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)";
    c.beginPath();
    c.arc(this.x, this.y, this.r, 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.25)";
    c.lineWidth = 1;
    c.stroke();
    c.translate(this.x, this.y);
    c.strokeStyle = "#ffffff";
    c.fillStyle = "#ffffff";
    c.lineWidth = 2.4;
    c.lineCap = "round";
    c.lineJoin = "round";
    this.icon(c);
    c.restore();
    c.save();
    c.globalAlpha = enabled ? 0.75 : 0.3;
    c.font = `600 11px ${FONT_BODY}`;
    c.textAlign = "center";
    c.textBaseline = "top";
    c.fillStyle = "#ffffff";
    c.fillText(this.label, this.x, this.y + this.r + 4);
    c.restore();
  }
}

export const ICONS = {
  undo: (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.arc(1, 2, 8, Math.PI * 1.1, Math.PI * 2.4);
    c.stroke();
    c.beginPath();
    c.moveTo(-10, -5);
    c.lineTo(-7, 3);
    c.lineTo(1, 0);
    c.stroke();
  },
  bulb: (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.arc(0, -3, 7, Math.PI * 0.8, Math.PI * 2.2);
    c.lineTo(3, 6);
    c.lineTo(-3, 6);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(-3, 10);
    c.lineTo(3, 10);
    c.stroke();
  },
  menu: (c: CanvasRenderingContext2D) => {
    for (const y of [-6, 0, 6]) {
      c.beginPath();
      c.moveTo(-8, y);
      c.lineTo(8, y);
      c.stroke();
    }
  },
  restart: (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.arc(0, 0, 8, -Math.PI * 0.3, Math.PI * 1.5);
    c.stroke();
    c.beginPath();
    c.moveTo(4, -11);
    c.lineTo(7, -6);
    c.lineTo(1, -5);
    c.stroke();
  },
  flip: (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(-6, -9);
    c.lineTo(-6, 8);
    c.moveTo(-10, 4);
    c.lineTo(-6, 9);
    c.lineTo(-2, 4);
    c.moveTo(6, 9);
    c.lineTo(6, -8);
    c.moveTo(2, -4);
    c.lineTo(6, -9);
    c.lineTo(10, -4);
    c.stroke();
  },
};
