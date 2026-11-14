// Procedural fruit art shared by the fruit games (merge, slice, tile match). Each fruit is drawn
// centred on (0, 0) inside a circle of radius r, so physics can treat every fruit as a circle.

import { TAU, shade, rgba } from "../engine/fx";

export interface FruitSpec {
  name: string;
  color: string;
  flesh: string;
}

/** Ordered small → large (the merge game climbs this list). */
export const FRUITS: FruitSpec[] = [
  { name: "เชอร์รี่", color: "#d6183f", flesh: "#ffb3c1" },
  { name: "สตรอว์เบอร์รี", color: "#f43f4f", flesh: "#ffd0d0" },
  { name: "องุ่น", color: "#8b5cf6", flesh: "#e4dcff" },
  { name: "มะนาว", color: "#facc15", flesh: "#fff7c2" },
  { name: "ส้ม", color: "#fb8c2b", flesh: "#ffd9a8" },
  { name: "แอปเปิล", color: "#e5322f", flesh: "#fff2cc" },
  { name: "ลูกแพร์", color: "#a6d63a", flesh: "#f6ffd9" },
  { name: "ลูกพีช", color: "#ff9db0", flesh: "#ffe6cc" },
  { name: "สับปะรด", color: "#f6b81c", flesh: "#fff08a" },
  { name: "เมลอน", color: "#7fdc8f", flesh: "#e2ffc4" },
  { name: "แตงโม", color: "#1f9d4c", flesh: "#ff5d73" },
];

function leaf(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  const g = c.createLinearGradient(0, -s * 0.3, s, s * 0.3);
  g.addColorStop(0, "#5fd35a");
  g.addColorStop(1, "#22893a");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(s * 0.5, -s * 0.42, s, 0);
  c.quadraticCurveTo(s * 0.5, s * 0.42, 0, 0);
  c.fill();
  c.strokeStyle = "rgba(20,80,30,0.5)";
  c.lineWidth = Math.max(0.6, s * 0.05);
  c.beginPath();
  c.moveTo(s * 0.08, 0);
  c.lineTo(s * 0.85, 0);
  c.stroke();
  c.restore();
}

function stem(c: CanvasRenderingContext2D, x: number, y: number, len: number, bend: number) {
  c.strokeStyle = "#6b3f1d";
  c.lineWidth = Math.max(1.2, len * 0.18);
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + bend, y - len * 0.6, x + bend * 0.6, y - len);
  c.stroke();
}

function body(c: CanvasRenderingContext2D, r: number, color: string, path?: () => void) {
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r * 1.05);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.35));
  c.fillStyle = g;
  c.beginPath();
  if (path) path();
  else c.arc(0, 0, r, 0, TAU);
  c.fill();
  c.strokeStyle = shade(color, -0.5);
  c.lineWidth = Math.max(1, r * 0.05);
  c.stroke();
}

function shine(c: CanvasRenderingContext2D, r: number) {
  c.fillStyle = "rgba(255,255,255,0.55)";
  c.beginPath();
  c.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.12, -0.7, 0, TAU);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath();
  c.arc(-r * 0.12, -r * 0.6, r * 0.06, 0, TAU);
  c.fill();
}

function face(c: CanvasRenderingContext2D, r: number, dy = 0.1) {
  const e = r * 0.09;
  c.fillStyle = "#2b1a1a";
  c.beginPath();
  c.arc(-r * 0.25, r * dy, e, 0, TAU);
  c.arc(r * 0.25, r * dy, e, 0, TAU);
  c.fill();
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(-r * 0.22, r * dy - e * 0.35, e * 0.35, 0, TAU);
  c.arc(r * 0.28, r * dy - e * 0.35, e * 0.35, 0, TAU);
  c.fill();
  c.strokeStyle = "#2b1a1a";
  c.lineWidth = Math.max(1, r * 0.05);
  c.lineCap = "round";
  c.beginPath();
  c.arc(0, r * (dy + 0.12), r * 0.1, 0.2, Math.PI - 0.2);
  c.stroke();
  c.fillStyle = "rgba(255,90,120,0.35)";
  c.beginPath();
  c.ellipse(-r * 0.42, r * (dy + 0.14), r * 0.11, r * 0.06, 0, 0, TAU);
  c.ellipse(r * 0.42, r * (dy + 0.14), r * 0.11, r * 0.06, 0, 0, TAU);
  c.fill();
}

/** Draws fruit `kind` centred on (0, 0). `withFace` adds a small friendly face. */
export function drawFruit(c: CanvasRenderingContext2D, kind: number, r: number, withFace = false) {
  const f = FRUITS[kind];
  c.save();
  switch (kind) {
    case 0: // cherry
      stem(c, 0, -r * 0.8, r * 0.9, r * 0.35);
      leaf(c, r * 0.25, -r * 1.35, r * 0.6, -0.4);
      body(c, r * 0.95, f.color);
      shine(c, r * 0.95);
      break;
    case 1: // strawberry
      body(c, r, f.color, () => {
        c.moveTo(0, r);
        c.bezierCurveTo(-r * 1.25, r * 0.15, -r * 0.95, -r * 0.95, 0, -r * 0.75);
        c.bezierCurveTo(r * 0.95, -r * 0.95, r * 1.25, r * 0.15, 0, r);
        c.closePath();
      });
      c.fillStyle = "#ffe46b";
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        const d = 0.25 + ((i * 37) % 10) / 18;
        const x = Math.cos(a) * r * d * 0.75;
        const y = Math.sin(a) * r * d * 0.65 + r * 0.05;
        c.beginPath();
        c.ellipse(x, y, r * 0.04, r * 0.07, a, 0, TAU);
        c.fill();
      }
      for (let i = 0; i < 5; i++) leaf(c, 0, -r * 0.72, r * 0.5, -Math.PI / 2 + (i - 2) * 0.55);
      shine(c, r * 0.9);
      break;
    case 2: // grape
      stem(c, 0, -r * 0.9, r * 0.45, r * 0.15);
      body(c, r, f.color);
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.beginPath();
      c.arc(r * 0.15, r * 0.1, r * 0.7, 0, TAU);
      c.fill();
      shine(c, r);
      break;
    case 3: // lemon
      body(c, r, f.color, () => c.ellipse(0, 0, r, r * 0.86, -0.35, 0, TAU));
      c.fillStyle = rgba("#b98b00", 0.25);
      for (let i = 0; i < 18; i++) {
        const a = i * 2.1;
        c.beginPath();
        c.arc(Math.cos(a) * r * 0.6 * ((i % 3) / 3 + 0.4), Math.sin(a) * r * 0.5 * ((i % 4) / 4 + 0.4), r * 0.025, 0, TAU);
        c.fill();
      }
      leaf(c, r * 0.1, -r * 0.82, r * 0.55, -0.9);
      shine(c, r);
      break;
    case 4: // orange
      body(c, r, f.color);
      c.fillStyle = rgba("#a34a00", 0.18);
      for (let i = 0; i < 24; i++) {
        const a = i * 2.39;
        const d = ((i * 17) % 10) / 11;
        c.beginPath();
        c.arc(Math.cos(a) * r * d * 0.85, Math.sin(a) * r * d * 0.85, r * 0.03, 0, TAU);
        c.fill();
      }
      leaf(c, r * 0.05, -r * 0.92, r * 0.55, -0.6);
      shine(c, r);
      break;
    case 5: // apple
      body(c, r, f.color, () => {
        c.moveTo(0, -r * 0.7);
        c.bezierCurveTo(r * 0.6, -r * 1.05, r * 1.15, -r * 0.4, r * 0.92, r * 0.35);
        c.bezierCurveTo(r * 0.75, r * 0.95, r * 0.25, r * 1.0, 0, r * 0.85);
        c.bezierCurveTo(-r * 0.25, r * 1.0, -r * 0.75, r * 0.95, -r * 0.92, r * 0.35);
        c.bezierCurveTo(-r * 1.15, -r * 0.4, -r * 0.6, -r * 1.05, 0, -r * 0.7);
        c.closePath();
      });
      c.fillStyle = "rgba(255,210,80,0.25)";
      c.beginPath();
      c.ellipse(r * 0.35, r * 0.25, r * 0.35, r * 0.45, 0.4, 0, TAU);
      c.fill();
      stem(c, 0, -r * 0.65, r * 0.4, r * 0.1);
      leaf(c, r * 0.05, -r * 0.95, r * 0.5, -0.5);
      shine(c, r);
      break;
    case 6: // pear
      body(c, r, f.color, () => {
        c.moveTo(0, -r * 0.95);
        c.bezierCurveTo(r * 0.45, -r * 0.95, r * 0.4, -r * 0.3, r * 0.8, r * 0.2);
        c.bezierCurveTo(r * 1.1, r * 0.75, r * 0.5, r * 1.0, 0, r * 1.0);
        c.bezierCurveTo(-r * 0.5, r * 1.0, -r * 1.1, r * 0.75, -r * 0.8, r * 0.2);
        c.bezierCurveTo(-r * 0.4, -r * 0.3, -r * 0.45, -r * 0.95, 0, -r * 0.95);
        c.closePath();
      });
      c.fillStyle = rgba("#6b5a00", 0.18);
      for (let i = 0; i < 16; i++) {
        const a = i * 2.2;
        c.beginPath();
        c.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.45 + r * 0.3, r * 0.025, 0, TAU);
        c.fill();
      }
      stem(c, 0, -r * 0.92, r * 0.3, r * 0.12);
      shine(c, r);
      break;
    case 7: // peach
      body(c, r, f.color);
      c.fillStyle = "rgba(255,120,80,0.35)";
      c.beginPath();
      c.ellipse(r * 0.25, r * 0.15, r * 0.6, r * 0.7, 0.3, 0, TAU);
      c.fill();
      c.strokeStyle = rgba("#c2410c", 0.35);
      c.lineWidth = r * 0.05;
      c.beginPath();
      c.moveTo(-r * 0.05, -r * 0.85);
      c.quadraticCurveTo(-r * 0.35, 0, r * 0.05, r * 0.9);
      c.stroke();
      leaf(c, 0, -r * 0.9, r * 0.5, -0.4);
      shine(c, r);
      break;
    case 8: // pineapple
      for (let i = 0; i < 5; i++) leaf(c, 0, -r * 0.75, r * 0.65, -Math.PI / 2 + (i - 2) * 0.4);
      body(c, r * 0.95, f.color, () => c.ellipse(0, r * 0.05, r * 0.85, r * 0.95, 0, 0, TAU));
      c.save();
      c.beginPath();
      c.ellipse(0, r * 0.05, r * 0.85, r * 0.95, 0, 0, TAU);
      c.clip();
      c.strokeStyle = rgba("#9a5b00", 0.45);
      c.lineWidth = r * 0.05;
      for (let k = -4; k <= 4; k++) {
        c.beginPath();
        c.moveTo(-r + k * r * 0.35, -r);
        c.lineTo(r + k * r * 0.35, r * 1.1);
        c.moveTo(r - k * r * 0.35, -r);
        c.lineTo(-r - k * r * 0.35, r * 1.1);
        c.stroke();
      }
      c.restore();
      shine(c, r * 0.9);
      break;
    case 9: // melon (net pattern)
      body(c, r, f.color);
      c.save();
      c.beginPath();
      c.arc(0, 0, r * 0.98, 0, TAU);
      c.clip();
      c.strokeStyle = "rgba(240,255,230,0.55)";
      c.lineWidth = r * 0.03;
      for (let i = 0; i < 9; i++) {
        c.beginPath();
        const y = -r + (i * r * 2) / 8;
        c.moveTo(-r, y);
        c.bezierCurveTo(-r * 0.3, y + r * 0.25, r * 0.3, y - r * 0.25, r, y + r * 0.1);
        c.stroke();
        c.beginPath();
        const x = -r + (i * r * 2) / 8;
        c.moveTo(x, -r);
        c.bezierCurveTo(x + r * 0.25, -r * 0.3, x - r * 0.25, r * 0.3, x + r * 0.1, r);
        c.stroke();
      }
      c.restore();
      stem(c, 0, -r * 0.95, r * 0.25, r * 0.1);
      shine(c, r);
      break;
    default: // watermelon
      body(c, r, f.color);
      c.save();
      c.beginPath();
      c.arc(0, 0, r * 0.98, 0, TAU);
      c.clip();
      c.strokeStyle = "#0b5a2a";
      c.lineWidth = r * 0.13;
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(i * r * 0.32, -r);
        for (let y = -r; y <= r; y += r / 6) c.lineTo(i * r * 0.32 * Math.cos(y / r) + Math.sin(y * 6 / r + i) * r * 0.05, y);
        c.stroke();
      }
      c.restore();
      shine(c, r);
  }
  if (withFace) face(c, r * (kind === 1 ? 0.85 : 1), kind === 1 ? 0.05 : 0.12);
  c.restore();
}

/**
 * Half of a sliced fruit: the fruit clipped to one side of a line through the centre, plus the cut
 * face. `angle` is the cut direction; side is +1 or -1.
 */
export function drawFruitHalf(c: CanvasRenderingContext2D, kind: number, r: number, angle: number, side: 1 | -1) {
  const f = FRUITS[kind];
  c.save();
  c.rotate(angle);
  c.beginPath();
  c.rect(-r * 2, side > 0 ? 0 : -r * 2, r * 4, r * 2);
  c.clip();
  c.rotate(-angle);
  drawFruit(c, kind, r, false);
  c.rotate(angle);
  // Cut face: a flat ellipse of flesh along the cut
  const g = c.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(f.flesh, 0.25));
  g.addColorStop(1, f.flesh);
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(0, 0, r * 0.88, r * 0.22, 0, side > 0 ? 0 : Math.PI, side > 0 ? Math.PI : TAU);
  c.fill();
  if (kind === 10) {
    c.fillStyle = "#1c1917";
    for (let i = -3; i <= 3; i++) {
      c.beginPath();
      c.ellipse(i * r * 0.2, side * r * 0.08, r * 0.03, r * 0.05, 0, 0, TAU);
      c.fill();
    }
  }
  if (kind === 4 || kind === 3) {
    c.strokeStyle = "rgba(255,255,255,0.6)";
    c.lineWidth = r * 0.03;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos((i / 6) * Math.PI) * r * 0.8, side * Math.sin((i / 6) * Math.PI) * r * 0.2);
      c.stroke();
    }
  }
  c.restore();
}
