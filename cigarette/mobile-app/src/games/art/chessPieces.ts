// Vector chess pieces drawn with canvas paths (Staunton-like silhouettes), shaded ivory or ebony.
// Each piece is drawn into a 100×100 box; callers cache them as sprites per size.

import { makeSprite } from "../engine/fx";

type Path = (c: CanvasRenderingContext2D) => void;

function base(c: CanvasRenderingContext2D) {
  // Two-step plinth shared by all pieces
  c.moveTo(18, 92);
  c.lineTo(82, 92);
  c.quadraticCurveTo(84, 84, 76, 82);
  c.lineTo(24, 82);
  c.quadraticCurveTo(16, 84, 18, 92);
  c.closePath();
  c.moveTo(26, 82);
  c.lineTo(74, 82);
  c.quadraticCurveTo(74, 75, 68, 74);
  c.lineTo(32, 74);
  c.quadraticCurveTo(26, 75, 26, 82);
  c.closePath();
}

const PATHS: Record<number, Path> = {
  1: (c) => {
    base(c);
    c.moveTo(36, 74);
    c.quadraticCurveTo(40, 58, 44, 50);
    c.lineTo(56, 50);
    c.quadraticCurveTo(60, 58, 64, 74);
    c.closePath();
    c.moveTo(36, 50);
    c.lineTo(64, 50);
    c.quadraticCurveTo(66, 45, 60, 44);
    c.lineTo(40, 44);
    c.quadraticCurveTo(34, 45, 36, 50);
    c.closePath();
    c.moveTo(64, 32);
    c.arc(50, 32, 14, 0, Math.PI * 2);
  },
  2: (c) => {
    base(c);
    c.moveTo(30, 74);
    c.bezierCurveTo(30, 60, 44, 56, 46, 48);
    c.bezierCurveTo(38, 52, 30, 54, 25, 50);
    c.bezierCurveTo(20, 46, 22, 40, 28, 36);
    c.bezierCurveTo(36, 30, 40, 22, 44, 16);
    c.lineTo(46, 9);
    c.lineTo(51, 15);
    c.bezierCurveTo(66, 16, 78, 30, 76, 52);
    c.bezierCurveTo(75, 62, 72, 68, 72, 74);
    c.closePath();
  },
  3: (c) => {
    base(c);
    c.moveTo(34, 74);
    c.quadraticCurveTo(40, 62, 42, 56);
    c.lineTo(58, 56);
    c.quadraticCurveTo(60, 62, 66, 74);
    c.closePath();
    c.moveTo(34, 56);
    c.lineTo(66, 56);
    c.quadraticCurveTo(68, 51, 62, 50);
    c.lineTo(38, 50);
    c.quadraticCurveTo(32, 51, 34, 56);
    c.closePath();
    // Mitre
    c.moveTo(50, 14);
    c.bezierCurveTo(66, 24, 68, 40, 60, 50);
    c.lineTo(40, 50);
    c.bezierCurveTo(32, 40, 34, 24, 50, 14);
    c.closePath();
    c.moveTo(55, 9);
    c.arc(50, 9, 5, 0, Math.PI * 2);
  },
  4: (c) => {
    base(c);
    c.moveTo(32, 74);
    c.lineTo(36, 36);
    c.lineTo(64, 36);
    c.lineTo(68, 74);
    c.closePath();
    c.moveTo(28, 36);
    c.lineTo(72, 36);
    c.lineTo(72, 16);
    c.lineTo(63, 16);
    c.lineTo(63, 24);
    c.lineTo(55, 24);
    c.lineTo(55, 16);
    c.lineTo(45, 16);
    c.lineTo(45, 24);
    c.lineTo(37, 24);
    c.lineTo(37, 16);
    c.lineTo(28, 16);
    c.closePath();
  },
  5: (c) => {
    base(c);
    c.moveTo(32, 74);
    c.quadraticCurveTo(40, 56, 38, 40);
    c.lineTo(62, 40);
    c.quadraticCurveTo(60, 56, 68, 74);
    c.closePath();
    // Crown with points
    c.moveTo(36, 42);
    c.lineTo(24, 18);
    c.lineTo(38, 30);
    c.lineTo(42, 12);
    c.lineTo(50, 28);
    c.lineTo(58, 12);
    c.lineTo(62, 30);
    c.lineTo(76, 18);
    c.lineTo(64, 42);
    c.closePath();
    for (const [x, y] of [
      [24, 16],
      [42, 10],
      [58, 10],
      [76, 16],
    ]) {
      c.moveTo(x + 4, y);
      c.arc(x, y, 4, 0, Math.PI * 2);
    }
    c.moveTo(54, 8);
    c.arc(50, 8, 4.5, 0, Math.PI * 2);
  },
  6: (c) => {
    base(c);
    c.moveTo(32, 74);
    c.quadraticCurveTo(40, 56, 37, 40);
    c.lineTo(63, 40);
    c.quadraticCurveTo(60, 56, 68, 74);
    c.closePath();
    c.moveTo(30, 42);
    c.bezierCurveTo(22, 30, 32, 20, 50, 26);
    c.bezierCurveTo(68, 20, 78, 30, 70, 42);
    c.closePath();
    // Cross
    c.moveTo(47, 26);
    c.lineTo(47, 14);
    c.lineTo(41, 14);
    c.lineTo(41, 9);
    c.lineTo(47, 9);
    c.lineTo(47, 3);
    c.lineTo(53, 3);
    c.lineTo(53, 9);
    c.lineTo(59, 9);
    c.lineTo(59, 14);
    c.lineTo(53, 14);
    c.lineTo(53, 26);
    c.closePath();
  },
};

export function drawPiece(c: CanvasRenderingContext2D, kind: number, white: boolean) {
  const path = PATHS[kind];
  if (!path) return;
  // Soft shadow
  c.save();
  c.fillStyle = "rgba(0,0,0,0.28)";
  c.beginPath();
  c.ellipse(52, 94, 34, 6, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
  c.beginPath();
  path(c);
  const g = c.createLinearGradient(20, 0, 80, 100);
  if (white) {
    g.addColorStop(0, "#fffdf6");
    g.addColorStop(0.55, "#efe6d2");
    g.addColorStop(1, "#c9b896");
  } else {
    g.addColorStop(0, "#5b5f6e");
    g.addColorStop(0.5, "#2b2e3a");
    g.addColorStop(1, "#13141b");
  }
  c.fillStyle = g;
  c.fill("nonzero");
  c.lineJoin = "round";
  c.lineWidth = 3.2;
  c.strokeStyle = white ? "#5b4a33" : "#0a0a10";
  c.stroke();
  // Rim light
  c.save();
  c.clip();
  c.strokeStyle = white ? "rgba(255,255,255,0.8)" : "rgba(160,170,200,0.35)";
  c.lineWidth = 2;
  c.translate(-2, -2);
  c.beginPath();
  path(c);
  c.stroke();
  c.restore();
  // Knight eye and mane detail
  if (kind === 2) {
    c.fillStyle = white ? "#5b4a33" : "#cbd5e1";
    c.beginPath();
    c.arc(56, 26, 3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = white ? "rgba(91,74,51,0.6)" : "rgba(200,210,230,0.35)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(62, 20);
    c.quadraticCurveTo(72, 34, 68, 64);
    c.stroke();
  }
  if (kind === 3) {
    c.strokeStyle = white ? "#5b4a33" : "#cbd5e1";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(46, 30);
    c.lineTo(56, 40);
    c.stroke();
  }
}

const cache = new Map<string, HTMLCanvasElement>();

/** Cached sprite of a piece at `size` CSS pixels. */
export function pieceSprite(kind: number, white: boolean, size: number): HTMLCanvasElement {
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2.5);
  const k = `${kind}${white ? "w" : "b"}${Math.round(size)}`;
  let s = cache.get(k);
  if (!s) {
    s = makeSprite(size, size, dpr, (c) => {
      c.scale(size / 100, size / 100);
      drawPiece(c, kind, white);
    });
    cache.set(k, s);
  }
  return s;
}
