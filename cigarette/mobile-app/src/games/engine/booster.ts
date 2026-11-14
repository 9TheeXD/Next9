// Booster buttons shown inside games, and the icons shared with the shop. A booster is used from
// the player's stock, or bought on the spot with coins when the stock is empty.

import { TAU, FONT_DISPLAY, roundRectPath, glow } from "./fx";
import { drawCoin } from "./ui";
import { wallet, ITEMS } from "./economy";

/** Vector icons for boosters (no emoji), centred on (0,0), about s wide. */
export function drawBoosterIcon(c: CanvasRenderingContext2D, id: string, s: number, time = 0) {
  const r = s * 0.36;
  c.lineCap = "round";
  c.lineJoin = "round";
  switch (id) {
    case "boost_hammer":
      c.save();
      c.rotate(-0.6);
      c.fillStyle = "#a16207";
      c.fillRect(-r * 0.12, -r * 0.2, r * 0.24, r * 1.2);
      c.fillStyle = "#94a3b8";
      roundRectPath(c, -r * 0.6, -r * 0.6, r * 1.2, r * 0.5, r * 0.1);
      c.fill();
      c.restore();
      break;
    case "boost_reroll":
      c.strokeStyle = "#a78bfa";
      c.lineWidth = r * 0.22;
      c.beginPath();
      c.arc(0, 0, r * 0.75, 0.3, Math.PI * 1.7);
      c.stroke();
      c.fillStyle = "#a78bfa";
      c.beginPath();
      c.moveTo(r * 0.95, -r * 0.55);
      c.lineTo(r * 0.85, r * 0.15);
      c.lineTo(r * 0.3, -r * 0.3);
      c.fill();
      break;
    case "boost_rainbow":
    case "boost_bomb": {
      const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      if (id === "boost_rainbow") {
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.4, `hsl(${(time * 120) % 360},90%,65%)`);
        g.addColorStop(1, `hsl(${(time * 120 + 180) % 360},90%,50%)`);
      } else {
        g.addColorStop(0, "#6b7280");
        g.addColorStop(1, "#111827");
      }
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, r, 0, TAU);
      c.fill();
      if (id === "boost_bomb") {
        c.strokeStyle = "#d6b38a";
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(r * 0.5, -r * 0.7);
        c.quadraticCurveTo(r * 0.9, -r * 1.2, r * 1.1, -r * 1.0);
        c.stroke();
        glow(c, r * 1.1, -r * 1.0, r * 0.5, "#fbbf24", 0.8 + 0.2 * Math.sin(time * 12));
      }
      break;
    }
    case "boost_shake":
      c.strokeStyle = "#7dd3fc";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-r * 0.7, -r * 0.6);
      c.lineTo(-r * 0.55, r * 0.7);
      c.lineTo(r * 0.55, r * 0.7);
      c.lineTo(r * 0.7, -r * 0.6);
      c.stroke();
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx * r * 1.0, -r * 0.2);
        c.lineTo(sx * r * 1.2, 0);
        c.lineTo(sx * r * 1.0, r * 0.2);
        c.stroke();
      }
      c.fillStyle = "#fb7185";
      c.beginPath();
      c.arc(-r * 0.15, r * 0.35, r * 0.25, 0, TAU);
      c.arc(r * 0.25, r * 0.2, r * 0.2, 0, TAU);
      c.fill();
      break;
    case "boost_pick":
      c.fillStyle = "#fca5a5";
      c.beginPath();
      c.arc(0, r * 0.2, r * 0.5, 0, TAU);
      c.fill();
      c.strokeStyle = "#ffffff";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, -r * 0.9);
      c.lineTo(0, -r * 0.3);
      c.moveTo(-r * 0.25, -r * 0.6);
      c.lineTo(0, -r * 0.9);
      c.lineTo(r * 0.25, -r * 0.6);
      c.stroke();
      break;
    case "boost_hint":
      c.strokeStyle = "#fde68a";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, -r * 0.2, r * 0.55, Math.PI * 0.8, Math.PI * 2.2);
      c.lineTo(r * 0.22, r * 0.55);
      c.lineTo(-r * 0.22, r * 0.55);
      c.closePath();
      c.stroke();
      glow(c, 0, -r * 0.2, r, "#fde68a", 0.4);
      break;
    case "boost_slot":
      for (let k = 0; k < 4; k++) {
        c.fillStyle = k === 3 ? "#86efac" : "rgba(255,255,255,0.25)";
        roundRectPath(c, -r * 1.1 + k * r * 0.58, -r * 0.3, r * 0.5, r * 0.6, 4);
        c.fill();
      }
      break;
  }
}


export class BoosterButton {
  x = 0;
  y = 0;
  r = 22;
  /** Highlight ring, e.g. while the hammer is armed. */
  active = false;
  private flash = 0;
  constructor(public id: string) {}

  place(x: number, y: number, r = 22) {
    this.x = x;
    this.y = y;
    this.r = r;
  }

  hit(px: number, py: number) {
    return Math.hypot(px - this.x, py - this.y) <= this.r + 6;
  }

  /** Price of one use when buying on the spot. */
  unitPrice() {
    const it = ITEMS.find((i) => i.id === this.id);
    return it ? Math.ceil(it.price / (it.pack || 1)) : 0;
  }

  /** Can the player use one now (in stock or affordable)? */
  available() {
    return wallet.boosters(this.id) > 0 || wallet.coins() >= this.unitPrice();
  }

  /** Spend one; returns false (and flashes) when neither stock nor coins allow it. */
  consume(): boolean {
    const ok = wallet.useOrBuy(this.id);
    if (!ok) this.flash = 1;
    return ok;
  }

  update(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 2);
  }

  render(c: CanvasRenderingContext2D, time: number) {
    const stock = wallet.boosters(this.id);
    const can = this.available();
    c.save();
    c.globalAlpha = can ? 1 : 0.5;
    c.fillStyle = this.flash > 0 ? `rgba(248,113,113,${0.4 + this.flash * 0.4})` : "rgba(15,20,48,0.6)";
    c.beginPath();
    c.arc(this.x, this.y, this.r, 0, TAU);
    c.fill();
    c.strokeStyle = this.active ? "#fde68a" : "rgba(255,255,255,0.3)";
    c.lineWidth = this.active ? 3 : 1.2;
    c.stroke();
    if (this.active) glow(c, this.x, this.y, this.r * 1.8, "#fde68a", 0.35 + 0.15 * Math.sin(time * 8));
    c.translate(this.x, this.y);
    drawBoosterIcon(c, this.id, this.r * 1.5, time);
    c.restore();
    // Badge: stock count, or the coin price when out of stock
    c.save();
    const label = stock > 0 ? `${stock}` : `${this.unitPrice()}`;
    c.font = `700 10px ${FONT_DISPLAY}`;
    const bw = Math.max(18, c.measureText(label).width + (stock > 0 ? 10 : 22));
    const bx = this.x + this.r * 0.55;
    const by = this.y - this.r - 4;
    c.fillStyle = stock > 0 ? "#22c55e" : "#1f2937";
    roundRectPath(c, bx - bw / 2, by, bw, 16, 8);
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.5)";
    c.lineWidth = 1;
    c.stroke();
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = stock > 0 ? "#ffffff" : "#ffd76a";
    if (stock > 0) c.fillText(label, bx, by + 8.5);
    else {
      drawCoin(c, bx - bw / 2 + 9, by + 8, 5);
      c.fillText(label, bx + 5, by + 8.5);
    }
    c.restore();
  }
}
