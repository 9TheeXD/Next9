// Neon Pulse art: one look per world (sky, parallax scenery, floor, blocks, spikes, music feel),
// plus the monsters, portals, finish gate and player. Everything is drawn procedurally; the static
// scenery layers are drawn once into tiling sprites.

import { TAU, rng, glow, makeSprite, roundRectPath, clamp } from "../engine/fx";
import { drawCoin } from "../engine/ui";
import { CEIL, chomper, crawlerX, droneY, railY, type Obj } from "./sim";
import { THEME_COUNT } from "./levels";
import { renderScale } from "../engine/quality";

export type Style = 0 | 1 | 2 | 3 | 4 | 5; // sunset, cave, garden, factory, abyss, storm

export interface Theme {
  style: Style;
  hue: number; // main hue
  acc: number; // accent hue (spikes, highlights)
  sat: number;
  player: number; // player hue
  music: { bpm: number; scale: number[]; base: number; lead: OscillatorType; bass: OscillatorType; hat: number };
}

const BASE: Theme[] = [
  { style: 0, hue: 300, acc: 190, sat: 80, player: 175, music: { bpm: 112, scale: [0, 2, 4, 7, 9], base: 392, lead: "triangle", bass: "sawtooth", hat: 7000 } },
  { style: 1, hue: 185, acc: 170, sat: 75, player: 300, music: { bpm: 118, scale: [0, 3, 5, 7, 10], base: 349, lead: "sine", bass: "triangle", hat: 9000 } },
  { style: 2, hue: 140, acc: 95, sat: 60, player: 40, music: { bpm: 124, scale: [0, 2, 4, 6, 9], base: 440, lead: "triangle", bass: "square", hat: 8000 } },
  { style: 3, hue: 25, acc: 30, sat: 85, player: 200, music: { bpm: 128, scale: [0, 2, 3, 7, 9], base: 330, lead: "square", bass: "sawtooth", hat: 6000 } },
  { style: 4, hue: 265, acc: 320, sat: 70, player: 160, music: { bpm: 132, scale: [0, 1, 5, 7, 8], base: 370, lead: "sine", bass: "triangle", hat: 10000 } },
  { style: 5, hue: 230, acc: 45, sat: 70, player: 50, music: { bpm: 140, scale: [0, 3, 5, 8, 11], base: 311, lead: "sawtooth", bass: "sawtooth", hat: 7500 } },
];

/** World look; later laps round the six looks shift their colours. */
export function themeFor(world: number): Theme {
  const b = BASE[world % THEME_COUNT];
  const lap = Math.floor(world / THEME_COUNT);
  if (!lap) return b;
  const shift = [0, 50, -40, 100, -90][lap % 5];
  return {
    ...b,
    hue: (b.hue + shift + 360) % 360,
    acc: (b.acc + shift + 360) % 360,
    player: (b.player + shift + 360) % 360,
    music: { ...b.music, bpm: b.music.bpm + Math.min(16, lap * 4) },
  };
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

// ── Cheap drawing helpers ───────────────────────────────────────────────────
// Old phones spend their frame on pixels. Copying a sprite 1:1 onto whole device pixels is several
// times cheaper than a scaled copy, a gradient fill or a shadowBlur, so the big pieces below are
// cached at the canvas' own resolution and copied that way.

/** Device pixels per CSS pixel when `c` carries the plain runtime transform (a scale), else 0. */
function plainScale(c: CanvasRenderingContext2D): number {
  const m = c.getTransform();
  return m.b === 0 && m.c === 0 && m.a === m.d && m.a > 0 ? m.a : 0;
}

/** Copy `img` (made at `k` device px per CSS px) 1:1 with its top-left at CSS (x, y), snapped to device pixels. */
function blit1(c: CanvasRenderingContext2D, k: number, img: HTMLCanvasElement, x: number, y: number) {
  const m = c.getTransform();
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(img, Math.round(x * k + m.e), Math.round(y * k + m.f));
  c.restore();
}

const glowCache = new Map<string, HTMLCanvasElement>();
/** fx glow() from a cached sprite of the exact on-screen size (alpha via globalAlpha). */
function glowFast(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
  const k = plainScale(c);
  if (!k || alpha <= 0 || r <= 0) {
    if (!k) glow(c, x, y, r, color, alpha);
    return;
  }
  let R = Math.max(1, Math.round(r * k));
  if (R > 48) R = Math.round(R / 3) * 3;
  const key = color + "|" + R;
  let img = glowCache.get(key);
  if (!img) {
    if (glowCache.size > 60) glowCache.clear();
    img = makeSprite(R * 2, R * 2, 1, (g) => glow(g, R, R, R, color, 1));
    glowCache.set(key, img);
  }
  const prev = c.globalAlpha;
  c.globalAlpha = prev * Math.min(1, alpha);
  blit1(c, k, img, x - R / k, y - R / k);
  c.globalAlpha = prev;
}

// ── Backdrop ────────────────────────────────────────────────────────────────

/** Scenery behind the level. Caches its sprite layers per size and theme. */
export class Backdrop {
  private key = "";
  private far: HTMLCanvasElement | null = null;
  private near: HTMLCanvasElement | null = null;
  private farW = 0;
  private nearW = 0;
  private farH = 0;
  private nearH = 0;
  private dots: { x: number; y: number; r: number; d: number; s: number }[] = [];
  private flash = 0;
  private bolt: { x: number; pts: number[] } | null = null;
  // Cached pieces (see "Cheap drawing helpers")
  private sun: { key: string; img: HTMLCanvasElement; cx: number; cy: number } | null = null;
  private ray: { key: string; img: HTMLCanvasElement } | null = null;
  private ground: { key: string; img: HTMLCanvasElement } | null = null;
  private edges = new Map<string, HTMLCanvasElement>();
  private lastGyd = -1;
  private skyBase = "";
  private skyImgs = new Map<number, HTMLCanvasElement>();
  private dotQ = new Int8Array(0);
  private dotX = new Float32Array(0);
  private dotY = new Float32Array(0);

  private prepare(th: Theme, w: number, h: number) {
    const key = `${th.style}:${th.hue}:${w}:${h}@${renderScale()}`;
    if (key === this.key) return;
    this.key = key;
    const dpr = renderScale();
    const r = rng(th.style * 31 + th.hue);
    this.dots = [];
    for (let i = 0; i < 60; i++) this.dots.push({ x: r(), y: r(), r: 0.5 + r() * 1.6, d: 0.03 + r() * 0.15, s: r() * 10 });
    const sw = Math.max(w, 640);
    this.farW = sw;
    this.nearW = sw;
    this.farH = h * 0.42;
    this.nearH = h * 0.3;
    const H = th.hue;
    const A = th.acc;
    const fh = this.farH;
    const nh = this.nearH;
    switch (th.style) {
      case 0: // skyline
        this.far = makeSprite(sw, fh, dpr, (c) => {
          let x = 0;
          while (x < sw) {
            const bw = 22 + r() * 46;
            const bh = fh * (0.25 + r() * 0.6);
            c.fillStyle = hsl(H + 230, 50, 9, 0.95);
            c.fillRect(x, fh - bh, bw, bh);
            c.fillStyle = hsl(H, 100, 85, 0.28);
            for (let wy = fh - bh + 6; wy < fh - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 8) if (r() < 0.3) c.fillRect(wx, wy, 3, 4);
            x += bw + r() * 6;
          }
        });
        this.near = makeSprite(sw, nh, dpr, (c) => {
          // palm silhouettes
          for (let x = 30; x < sw; x += 140 + r() * 120) {
            const th2 = nh * (0.55 + r() * 0.35);
            c.strokeStyle = hsl(H + 240, 60, 6);
            c.lineWidth = 5;
            c.beginPath();
            c.moveTo(x, nh);
            c.quadraticCurveTo(x + 10, nh - th2 * 0.5, x + 4, nh - th2);
            c.stroke();
            c.fillStyle = hsl(H + 240, 60, 6);
            for (let k = 0; k < 6; k++) {
              const a = -Math.PI / 2 + (k - 2.5) * 0.55;
              c.beginPath();
              c.moveTo(x + 4, nh - th2);
              c.quadraticCurveTo(x + 4 + Math.cos(a) * 28, nh - th2 + Math.sin(a) * 18 - 10, x + 4 + Math.cos(a) * 46, nh - th2 + Math.sin(a) * 30 + 14);
              c.quadraticCurveTo(x + 4 + Math.cos(a) * 26, nh - th2 + Math.sin(a) * 14, x + 4, nh - th2);
              c.fill();
            }
          }
        });
        break;
      case 1: // crystal cave
        this.far = makeSprite(sw, fh, dpr, (c) => {
          for (let x = 0; x < sw; x += 30 + r() * 50) {
            const ch = fh * (0.2 + r() * 0.65);
            const cw = 14 + r() * 26;
            const g = c.createLinearGradient(0, fh - ch, 0, fh);
            g.addColorStop(0, hsl(A, 90, 60, 0.55));
            g.addColorStop(1, hsl(H, 60, 12, 0.2));
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(x, fh);
            c.lineTo(x + cw * 0.2, fh - ch * 0.75);
            c.lineTo(x + cw * 0.5, fh - ch);
            c.lineTo(x + cw * 0.8, fh - ch * 0.7);
            c.lineTo(x + cw, fh);
            c.fill();
            c.strokeStyle = hsl(A, 100, 80, 0.35);
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(x + cw * 0.5, fh - ch);
            c.lineTo(x + cw * 0.45, fh);
            c.stroke();
          }
        });
        this.near = makeSprite(sw, nh, dpr, (c) => {
          // stalactites hanging from the top edge of this layer
          for (let x = 0; x < sw; x += 18 + r() * 40) {
            const len = nh * (0.25 + r() * 0.7);
            const bw = 10 + r() * 22;
            c.fillStyle = hsl(H + 10, 45, 7, 0.98);
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x + bw / 2, len);
            c.lineTo(x + bw, 0);
            c.fill();
            if (r() < 0.4) {
              c.fillStyle = hsl(A, 100, 70, 0.8);
              c.beginPath();
              c.arc(x + bw / 2, len + 3, 1.6, 0, TAU);
              c.fill();
            }
          }
        });
        break;
      case 2: // sky garden
        this.far = makeSprite(sw, fh, dpr, (c) => {
          for (let i = 0; i < 9; i++) {
            const x = r() * sw;
            const y = fh * (0.15 + r() * 0.5);
            const s = 30 + r() * 50;
            c.fillStyle = "rgba(255,255,255,0.55)";
            for (let k = 0; k < 5; k++) {
              c.beginPath();
              c.arc(x + (k - 2) * s * 0.45, y + Math.abs(k - 2) * s * 0.12, s * (0.45 - Math.abs(k - 2) * 0.08), 0, TAU);
              c.fill();
            }
          }
        });
        this.near = makeSprite(sw, nh, dpr, (c) => {
          for (let x = 40; x < sw; x += 170 + r() * 140) {
            const y = nh * (0.25 + r() * 0.35);
            const iw = 50 + r() * 60;
            // floating island: grass top, rock cone underneath, a round tree
            c.fillStyle = hsl(H - 110, 25, 30);
            c.beginPath();
            c.moveTo(x - iw / 2, y);
            c.lineTo(x, y + iw * 0.7);
            c.lineTo(x + iw / 2, y);
            c.fill();
            c.fillStyle = hsl(H, 55, 38);
            roundRectPath(c, x - iw / 2 - 3, y - 5, iw + 6, 9, 4);
            c.fill();
            c.fillStyle = hsl(H - 10, 50, 26);
            c.fillRect(x - 2, y - 26, 4, 22);
            c.fillStyle = hsl(H + 5, 55, 34);
            c.beginPath();
            c.arc(x, y - 30, 14, 0, TAU);
            c.fill();
          }
        });
        break;
      case 3: // factory
        this.far = makeSprite(sw, fh, dpr, (c) => {
          let x = 0;
          while (x < sw) {
            const bw = 40 + r() * 70;
            const bh = fh * (0.25 + r() * 0.45);
            c.fillStyle = hsl(H + 190, 25, 11);
            c.fillRect(x, fh - bh, bw, bh);
            // saw-tooth factory roof
            c.beginPath();
            for (let k = 0; k < bw; k += 16) {
              c.moveTo(x + k, fh - bh);
              c.lineTo(x + k + 16, fh - bh - 10);
              c.lineTo(x + k + 16, fh - bh);
            }
            c.fill();
            if (r() < 0.6) {
              const cx = x + bw * 0.7;
              c.fillRect(cx, fh - bh - fh * 0.3, 9, fh * 0.3);
            }
            c.fillStyle = hsl(A, 100, 60, 0.4);
            for (let wy = fh - bh + 10; wy < fh - 8; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 14) if (r() < 0.25) c.fillRect(wx, wy, 6, 4);
            x += bw + 4;
          }
        });
        this.near = makeSprite(sw, nh, dpr, (c) => {
          // pipes along the top with valves
          c.strokeStyle = hsl(H + 190, 20, 16);
          c.lineWidth = 10;
          c.beginPath();
          c.moveTo(0, nh * 0.2);
          c.lineTo(sw, nh * 0.2);
          c.stroke();
          for (let x = 30; x < sw; x += 90 + r() * 80) {
            c.beginPath();
            c.moveTo(x, nh * 0.2);
            c.lineTo(x, nh * (0.4 + r() * 0.5));
            c.stroke();
            c.fillStyle = hsl(A, 90, 50, 0.7);
            c.beginPath();
            c.arc(x, nh * 0.2, 6, 0, TAU);
            c.fill();
          }
        });
        break;
      case 4: // abyss
        this.far = makeSprite(sw, fh, dpr, (c) => {
          for (let x = 0; x < sw; x += 10 + r() * 24) {
            const kh = fh * (0.25 + r() * 0.7);
            c.strokeStyle = hsl(H - 100, 50, 14, 0.9);
            c.lineWidth = 3 + r() * 4;
            c.beginPath();
            c.moveTo(x, fh);
            const sway = 10 + r() * 14;
            c.bezierCurveTo(x - sway, fh - kh * 0.35, x + sway, fh - kh * 0.7, x - sway * 0.4, fh - kh);
            c.stroke();
          }
        });
        this.near = makeSprite(sw, nh, dpr, (c) => {
          for (let x = 20; x < sw; x += 60 + r() * 90) {
            const cr = 10 + r() * 20;
            c.fillStyle = hsl(A, 60, 22);
            for (let k = 0; k < 5; k++) {
              c.beginPath();
              c.arc(x + (k - 2) * cr * 0.5, nh - cr * (0.4 + (k % 2) * 0.5), cr * 0.45, 0, TAU);
              c.fill();
            }
            c.fillStyle = hsl(A, 100, 75, 0.7);
            for (let k = 0; k < 4; k++) {
              c.beginPath();
              c.arc(x + (r() - 0.5) * cr * 2, nh - r() * cr * 1.2, 1.5, 0, TAU);
              c.fill();
            }
          }
        });
        break;
      case 5: // storm citadel
        this.far = makeSprite(sw, fh, dpr, (c) => {
          let x = 0;
          c.fillStyle = hsl(H, 35, 9);
          while (x < sw) {
            const tw = 26 + r() * 30;
            const tht = fh * (0.35 + r() * 0.55);
            c.fillRect(x, fh - tht, tw, tht);
            for (let k = 0; k < tw; k += 8) c.fillRect(x + k, fh - tht - 6, 5, 6);
            if (r() < 0.5) {
              c.beginPath();
              c.moveTo(x - 3, fh - tht);
              c.lineTo(x + tw / 2, fh - tht - 34);
              c.lineTo(x + tw + 3, fh - tht);
              c.fill();
            }
            c.fillRect(x + tw, fh - fh * 0.2, 30 + r() * 30, fh * 0.2);
            x += tw + 34 + r() * 40;
          }
          c.fillStyle = hsl(A, 100, 65, 0.45);
          for (let i = 0; i < 40; i++) c.fillRect(r() * sw, fh * (0.3 + r() * 0.6), 3, 5);
        });
        this.near = makeSprite(sw, nh, dpr, (c) => {
          c.fillStyle = hsl(H, 30, 6);
          for (let x = 0; x < sw; x += 120 + r() * 100) {
            const bw = 40 + r() * 30;
            c.fillRect(x, nh * 0.45, bw, nh * 0.55);
            for (let k = 0; k < bw; k += 10) c.fillRect(x + k, nh * 0.45 - 7, 6, 7);
          }
        });
        break;
    }
  }

  render(c: CanvasRenderingContext2D, th: Theme, w: number, h: number, cam: number, U: number, gy: number, time: number, pulse: number, beatHit: boolean) {
    this.prepare(th, w, h);
    const H = th.hue;
    const A = th.acc;
    // Sky
    const skies: number[][] = [
      [H + 220, 70, 7, H, 65, 18],
      [H + 20, 60, 5, H, 50, 13],
      [210, 70, 45, H + 210, 75, 78],
      [H + 200, 30, 8, H, 70, 22],
      [H + 10, 70, 5, H - 30, 60, 16],
      [H, 45, 7, H + 20, 35, 18],
    ];
    const sky = skies[th.style];
    const k = plainScale(c);
    const R = Math.min(w, h) * 0.24;
    // The cave and garden glows are fixed in the sky: they are part of the cached sky.
    const skyGlow = (c: CanvasRenderingContext2D, fast: boolean) => {
      const f = fast ? glowFast : glow;
      if (th.style === 2) f(c, w * 0.75, gy * 0.35, R * 1.8, "#fff4c2", 0.55);
      else if (th.style === 1) f(c, w * 0.3, gy * 0.5, R * 1.6, hsl(A, 90, 50), 0.18);
    };
    // floor() always paints an opaque floor from gy down right after this, so the sky stops at gy
    const gyd = Math.round(clamp(gy, 0, h) * k);
    const steady = k > 0 && gyd > 0 && gyd === this.lastGyd;
    this.lastGyd = gyd;
    let glowDone = false;
    if (steady) {
      // Opaque sky sprite while the camera is still, one per quarter step of the beat pulse
      // (the beat lifts the sky by at most 2-3% lightness).
      const q = Math.round(pulse * 3) / 3;
      const base = `${th.style}|${H}|${A}|${w}|${gyd}|${k}`;
      if (base !== this.skyBase) {
        this.skyBase = base;
        this.skyImgs.clear();
      }
      let img = this.skyImgs.get(q);
      if (!img) {
        img = document.createElement("canvas");
        img.width = Math.ceil(w * k);
        img.height = gyd;
        const sc = img.getContext("2d", { alpha: false })!;
        sc.scale(k, k);
        const sg = sc.createLinearGradient(0, 0, 0, gy);
        sg.addColorStop(0, hsl(sky[0], sky[1], sky[2] + q * 2));
        sg.addColorStop(1, hsl(sky[3], sky[4], sky[5] + q * 3));
        sc.fillStyle = sg;
        sc.fillRect(0, 0, w, gyd / k + 1);
        skyGlow(sc, false);
        this.skyImgs.set(q, img);
      }
      blit1(c, k, img, 0, 0);
      glowDone = true;
    } else {
      const g = c.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, hsl(sky[0], sky[1], sky[2] + pulse * 2));
      g.addColorStop(1, hsl(sky[3], sky[4], sky[5] + pulse * 3));
      c.fillStyle = g;
      c.fillRect(0, 0, w, clamp(gy, 0, h));
    }

    if (th.style === 5 && beatHit && Math.random() < 0.12) {
      this.flash = 1;
      const pts: number[] = [];
      let y = 0;
      while (y < gy * 0.6) {
        y += 12 + Math.random() * 22;
        pts.push((Math.random() - 0.5) * 36, y);
      }
      this.bolt = { x: w * (0.2 + Math.random() * 0.6), pts };
    }
    this.flash = Math.max(0, this.flash - 0.06);

    // Stars / spores / dust: twinkle alpha in steps of 1/40, one path per step
    if (th.style !== 2) {
      const n = this.dots.length;
      if (this.dotQ.length !== n) {
        this.dotQ = new Int8Array(n);
        this.dotX = new Float32Array(n);
        this.dotY = new Float32Array(n);
      }
      let qMin = 99;
      let qMax = -1;
      for (let i = 0; i < n; i++) {
        const s = this.dots[i];
        this.dotX[i] = (((s.x * w - cam * U * s.d) % w) + w) % w;
        let y = s.y * gy * 0.9;
        if (th.style === 4 || th.style === 1) y = (((s.y * gy - time * (8 + s.d * 60)) % gy) + gy) % gy; // rising bubbles / spores
        this.dotY[i] = y;
        const q = Math.round((0.3 + 0.3 * Math.sin(time * 2 + s.s)) * 40);
        this.dotQ[i] = q;
        if (q < qMin) qMin = q;
        if (q > qMax) qMax = q;
      }
      if (th.style === 4) c.lineWidth = 1;
      for (let q = qMin; q <= qMax; q++) {
        const a = q / 40;
        let any = false;
        for (let i = 0; i < n; i++) {
          if (this.dotQ[i] !== q) continue;
          if (!any) {
            c.beginPath();
            any = true;
          }
          const r = th.style === 4 ? this.dots[i].r * 1.6 : this.dots[i].r;
          c.moveTo(this.dotX[i] + r, this.dotY[i]);
          c.arc(this.dotX[i], this.dotY[i], r, 0, TAU);
        }
        if (!any) continue;
        if (th.style === 4) {
          c.strokeStyle = hsl(A, 80, 80, a * 0.8);
          c.stroke();
        } else {
          c.fillStyle = th.style === 0 || th.style === 5 ? `rgba(255,255,255,${a})` : hsl(A, 90, 75, a);
          c.fill();
        }
      }
    }

    // Big sky feature
    if (th.style === 0) {
      const sy = gy - h * 0.2;
      const drawSun = (c: CanvasRenderingContext2D, cx: number, sy: number, rr: number) => {
        const sg = c.createLinearGradient(0, sy - R, 0, sy + R);
        sg.addColorStop(0, hsl(H + 60, 100, 70));
        sg.addColorStop(1, hsl(H, 100, 55));
        c.save();
        c.globalAlpha = 0.6;
        c.fillStyle = sg;
        c.beginPath();
        c.arc(cx, sy, rr, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
        c.fillStyle = hsl(H + 220, 60, 12);
        for (let i = 0; i < 6; i++) c.fillRect(cx - R, sy + i * R * 0.17, R * 2, 2 + i * 1.3);
        c.restore();
      };
      if (k) {
        // The beat swells the sun by up to 2%: one sprite per whole device pixel of radius.
        const rr = Math.round(R * (1 + pulse * 0.02) * k) / k;
        const key = `${H}|${R}|${rr}|${k}`;
        if (!this.sun || this.sun.key !== key) {
          const half = R * 1.03 + 3;
          this.sun = { key, img: makeSprite(half * 2, half * 2, k, (g) => drawSun(g, half, half, rr)), cx: half, cy: half };
        }
        blit1(c, k, this.sun.img, w * 0.68 - this.sun.cx, sy - this.sun.cy);
      } else drawSun(c, w * 0.68, sy, R * (1 + pulse * 0.02));
    } else if (th.style === 2) {
      if (!glowDone) skyGlow(c, true);
    } else if (th.style === 3) {
      c.fillStyle = hsl(A, 30, 80, 0.85);
      c.beginPath();
      c.arc(w * 0.75, gy * 0.28, R * 0.7, 0, TAU);
      c.fill();
      c.fillStyle = hsl(A, 20, 65, 0.6);
      for (const [dx, dy, rr] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.12], [-0.05, 0.35, 0.1]]) {
        c.beginPath();
        c.arc(w * 0.75 + dx * R, gy * 0.28 + dy * R, rr * R, 0, TAU);
        c.fill();
      }
      // turning gears
      for (const [gx, gyy, gr, sp] of [[0.18, 0.45, 0.16, 0.4], [0.33, 0.58, 0.1, -0.64]]) this.gear(c, w * gx - ((cam * U * 0.08) % (w * 1.4)) + w * 0.2, gy * gyy, Math.min(w, h) * gr, time * sp, hsl(H + 190, 20, 14));
    } else if (th.style === 4) {
      c.save();
      c.globalCompositeOperation = "lighter";
      // Light shafts: one cached shaft (full strength) copied four times with their own alpha
      const shaft = (c: CanvasRenderingContext2D, x: number, a: number) => {
        const rg = c.createLinearGradient(0, 0, 0, gy);
        rg.addColorStop(0, hsl(A, 80, 70, a));
        rg.addColorStop(1, hsl(A, 80, 70, 0));
        c.fillStyle = rg;
        c.beginPath();
        c.moveTo(x - 20, 0);
        c.lineTo(x + 20, 0);
        c.lineTo(x + 90, gy);
        c.lineTo(x - 10, gy);
        c.fill();
      };
      const rkey = `${A}|${Math.round(gy * k)}|${k}`;
      if (k && gy > 0 && (!this.ray || this.ray.key !== rkey)) this.ray = { key: rkey, img: makeSprite(112, gy, k, (g) => shaft(g, 21, 1)) };
      for (let i = 0; i < 4; i++) {
        const x = w * (0.15 + i * 0.25) + Math.sin(time * 0.3 + i) * 20;
        const a = 0.12 + 0.05 * Math.sin(time + i * 2);
        if (k && this.ray) {
          c.globalAlpha = a;
          blit1(c, k, this.ray.img, x - 21, 0);
          c.globalAlpha = 1;
        } else shaft(c, x, a);
      }
      c.restore();
      // jellyfish
      for (let i = 0; i < 3; i++) {
        const jx = ((((i * 0.37 + 0.1) * w - cam * U * 0.12) % (w + 80)) + w + 80) % (w + 80) - 40;
        const jy = gy * (0.25 + i * 0.15) + Math.sin(time * 1.3 + i * 2) * 12;
        this.jelly(c, jx, jy, 14 + i * 4, time + i, A);
      }
    } else if (th.style === 5) {
      if (this.flash > 0) {
        c.fillStyle = `rgba(220,230,255,${this.flash * 0.35})`;
        c.fillRect(0, 0, w, gy);
        if (this.bolt) {
          c.strokeStyle = `rgba(255,255,230,${this.flash})`;
          c.lineWidth = 2.5;
          c.beginPath();
          c.moveTo(this.bolt.x, 0);
          for (let i = 0; i < this.bolt.pts.length; i += 2) c.lineTo(this.bolt.x + this.bolt.pts[i], this.bolt.pts[i + 1]);
          c.stroke();
        }
      }
    } else if (th.style === 1) {
      if (!glowDone) skyGlow(c, true);
    }

    // Parallax layers
    const blit = (img: HTMLCanvasElement | null, iw: number, ih: number, speed: number, y: number) => {
      if (!img) return;
      const off = (((cam * U * speed) % iw) + iw) % iw;
      if (k === renderScale()) {
        // 1:1 copies; the second tile goes exactly one sprite width further on, so no seam
        const m = c.getTransform();
        const dx = Math.round(-off * k + m.e);
        const dy = Math.round(y * k + m.f);
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(img, dx, dy);
        if (dx + img.width < w * k) c.drawImage(img, dx + img.width, dy);
        c.restore();
        return;
      }
      c.drawImage(img, -off, y, iw, ih);
      if (iw - off < w) c.drawImage(img, -off + iw, y, iw, ih);
    };
    blit(this.far, this.farW, this.farH, 0.12, gy - this.farH + 2);
    if (th.style === 1 || th.style === 3) blit(this.near, this.nearW, this.nearH, 0.3, 0);
    else blit(this.near, this.nearW, this.nearH, 0.3, gy - this.nearH + 2);

    if (th.style === 5) {
      // rain
      c.strokeStyle = "rgba(190,210,255,0.22)";
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 50; i++) {
        const rx = ((i * 97.3 + time * 60 - cam * U * 0.5) % w + w) % w;
        const ry = ((i * 53.1 + time * 700) % gy);
        c.moveTo(rx, ry);
        c.lineTo(rx - 4, ry + 14);
      }
      c.stroke();
    }
  }

  private gear(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, col: string) {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = col;
    c.beginPath();
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * TAU;
      const rr = k % 2 ? r : r * 1.18;
      c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.08)";
    c.beginPath();
    c.arc(0, 0, r * 0.35, 0, TAU);
    c.fill();
    c.restore();
  }

  private jelly(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, A: number) {
    c.save();
    c.globalCompositeOperation = "lighter";
    glowFast(c, x, y, r * 2.2, hsl(A, 90, 60), 0.25);
    c.fillStyle = hsl(A, 90, 75, 0.35);
    c.beginPath();
    c.arc(x, y, r, Math.PI, 0);
    c.quadraticCurveTo(x + r * 0.5, y + r * 0.25, x, y + r * 0.15);
    c.quadraticCurveTo(x - r * 0.5, y + r * 0.25, x - r, y);
    c.fill();
    c.strokeStyle = hsl(A, 90, 80, 0.35);
    c.lineWidth = 1.2;
    for (let k = -2; k <= 2; k++) {
      c.beginPath();
      c.moveTo(x + k * r * 0.35, y + r * 0.1);
      c.quadraticCurveTo(x + k * r * 0.35 + Math.sin(t * 3 + k) * 5, y + r * 1.1, x + k * r * 0.3, y + r * 1.9);
      c.stroke();
    }
    c.restore();
  }

  /** The floor from y = gy down. */
  floor(c: CanvasRenderingContext2D, th: Theme, w: number, h: number, cam: number, U: number, gy: number, pulse: number) {
    const H = th.hue;
    const A = th.acc;
    const g = c.createLinearGradient(0, gy, 0, h);
    const cols: [string, string][] = [
      [hsl(H, 60, 14), hsl(H, 60, 4)],
      [hsl(H, 45, 12), hsl(H, 50, 3)],
      [hsl(H - 110, 35, 26), hsl(H - 110, 35, 10)],
      [hsl(H + 190, 18, 18), hsl(H + 190, 20, 6)],
      [hsl(A - 20, 30, 20), hsl(H, 50, 6)],
      [hsl(H, 18, 18), hsl(H, 25, 5)],
    ];
    g.addColorStop(0, cols[th.style][0]);
    g.addColorStop(1, cols[th.style][1]);
    const k = plainScale(c);
    const fh = h - gy;
    if (k && fh > 0) {
      // Opaque floor gradient, cached until the floor line moves (camera climbs) or the theme changes
      const gyd = Math.round(gy * k);
      const key = `${th.style}|${H}|${A}|${w}|${h}|${gyd}|${k}`;
      if (!this.ground || this.ground.key !== key) {
        const img = this.ground?.img || document.createElement("canvas");
        const top = gyd / k;
        img.width = Math.ceil(w * k);
        img.height = Math.max(1, Math.ceil((h - top) * k));
        const gc = img.getContext("2d", { alpha: false })!;
        gc.setTransform(k, 0, 0, k, 0, -top * k);
        const gg = gc.createLinearGradient(0, gy, 0, h);
        gg.addColorStop(0, cols[th.style][0]);
        gg.addColorStop(1, cols[th.style][1]);
        gc.fillStyle = gg;
        gc.fillRect(0, top - 1, w, h - top + 2);
        this.ground = { key, img };
      }
      blit1(c, k, this.ground.img, 0, gyd / k);
    } else if (fh > 0) {
      c.fillStyle = g;
      c.fillRect(0, gy, w, h - gy);
    }
    const off = -((cam * U) % U);
    c.save();
    switch (th.style) {
      case 0:
        c.strokeStyle = hsl(H, 100, 70, 0.25);
        c.lineWidth = 1;
        // The fan lines never touch each other, nor do the cross lines: one path each
        c.beginPath();
        for (let gx = off; gx < w; gx += U) {
          c.moveTo(gx, gy);
          c.lineTo(w / 2 + (gx - w / 2) * 2.4, h);
        }
        c.stroke();
        c.beginPath();
        for (let k = 1; k < 5; k++) {
          const y = gy + (h - gy) * Math.pow(k / 5, 1.6);
          c.moveTo(0, y);
          c.lineTo(w, y);
        }
        c.stroke();
        break;
      case 1: {
        c.strokeStyle = hsl(A, 100, 70, 0.3);
        c.lineWidth = 1.2;
        const r = rng(Math.floor(cam / 6) + 3);
        for (let gx = off - U * 6; gx < w + U * 6; gx += U * 1.5) {
          const sx = gx - (((cam * U) % (U * 1.5)) - ((cam * U) % U));
          c.beginPath();
          c.moveTo(sx, gy + 6 + r() * 20);
          c.lineTo(sx + 14, gy + 30 + r() * 50);
          c.lineTo(sx + 4, gy + 70 + r() * 60);
          c.stroke();
        }
        break;
      }
      case 2:
        c.fillStyle = hsl(H, 55, 40);
        c.fillRect(0, gy, w, 8);
        c.fillStyle = hsl(H, 60, 48);
        for (let gx = off; gx < w + U; gx += U / 3) {
          c.beginPath();
          c.arc(gx, gy + 6, U / 6, 0, Math.PI);
          c.fill();
        }
        c.fillStyle = hsl(H - 110, 25, 20, 0.6);
        for (let gx = off; gx < w + U; gx += U) {
          c.beginPath();
          c.arc(gx + U * 0.3, gy + 30, 4, 0, TAU);
          c.arc(gx + U * 0.7, gy + 60, 3, 0, TAU);
          c.fill();
        }
        break;
      case 3:
        c.strokeStyle = hsl(H + 190, 15, 30, 0.6);
        c.lineWidth = 1;
        for (let gx = off; gx < w + U; gx += U * 2) {
          c.strokeRect(gx, gy + 12, U * 2, U * 1.2);
          c.fillStyle = hsl(H + 190, 10, 40, 0.6);
          c.fillRect(gx + 4, gy + 16, 3, 3);
          c.fillRect(gx + U * 2 - 7, gy + 16, 3, 3);
        }
        // hazard stripes along the edge
        c.beginPath();
        c.rect(0, gy, w, 10);
        c.clip();
        c.fillStyle = hsl(A, 95, 50);
        c.fillRect(0, gy, w, 10);
        c.fillStyle = "#1c1917";
        for (let gx = off - 20; gx < w + 20; gx += 20) {
          c.beginPath();
          c.moveTo(gx, gy + 10);
          c.lineTo(gx + 10, gy);
          c.lineTo(gx + 18, gy);
          c.lineTo(gx + 8, gy + 10);
          c.fill();
        }
        break;
      case 4:
        c.fillStyle = hsl(A, 80, 70, 0.25);
        for (let gx = off; gx < w + U; gx += U) {
          c.beginPath();
          c.arc(gx + U * 0.2, gy + 22, 2, 0, TAU);
          c.arc(gx + U * 0.75, gy + 48, 1.5, 0, TAU);
          c.fill();
        }
        c.strokeStyle = hsl(A, 60, 50, 0.2);
        c.lineWidth = 2;
        for (let k = 1; k < 4; k++) {
          c.beginPath();
          for (let x = 0; x <= w; x += 20) c.lineTo(x, gy + k * 34 + Math.sin(x * 0.03 + cam * 0.5 + k) * 4);
          c.stroke();
        }
        break;
      case 5:
        c.strokeStyle = hsl(H, 20, 30, 0.5);
        c.lineWidth = 1;
        for (let row = 0; row < 5; row++) {
          const y = gy + 6 + row * U * 0.6;
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(w, y);
          c.stroke();
          c.beginPath();
          for (let gx = off + (row % 2) * U * 0.5; gx < w + U; gx += U) {
            c.moveTo(gx, y);
            c.lineTo(gx, y + U * 0.6);
          }
          c.stroke();
        }
        break;
    }
    c.restore();
    // glowing edge
    const edge = (c: CanvasRenderingContext2D, y: number, blur: number) => {
      c.strokeStyle = th.style === 2 ? hsl(H, 70, 60) : hsl(th.style === 3 || th.style === 5 ? A : H, 100, 72);
      c.lineWidth = 3;
      c.shadowColor = hsl(th.style === 3 || th.style === 5 ? A : H, 100, 60);
      c.shadowBlur = blur;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      c.shadowBlur = 0;
    };
    if (k) {
      // Pre-blurred strip, one per whole step of blur (the beat widens it from 12 to 20)
      const blur = Math.round(12 + pulse * 8);
      const M = Math.ceil((blur * 1.6 + 4) / k);
      const key = `${th.style}|${H}|${A}|${w}|${k}|${blur}`;
      let img = this.edges.get(key);
      if (!img) {
        if (this.edges.size > 24) this.edges.clear();
        img = makeSprite(w, M * 2, k, (g) => edge(g, M, blur));
        this.edges.set(key, img);
      }
      blit1(c, k, img, 0, gy - M);
    } else edge(c, gy, 12 + pulse * 8);
  }
}

// ── Level objects ───────────────────────────────────────────────────────────

export interface View {
  U: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
  time: number; // wall clock for idle animation
  t: number; // run clock for hazard positions
  pulse: number;
  playerX: number;
  playerY: number;
}

export function drawBlock(c: CanvasRenderingContext2D, th: Theme, v: View, o: Obj) {
  const { U } = v;
  const x = v.sx(o.x);
  const y = v.sy(o.y + o.h);
  const w = o.w * U;
  const h = o.h * U;
  const H = th.hue;
  const A = th.acc;
  c.save();
  switch (th.style) {
    case 0: {
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, hsl(H, 70, 28, 0.95));
      g.addColorStop(1, hsl(H, 70, 12, 0.95));
      c.fillStyle = g;
      c.fillRect(x, y, w, h);
      c.strokeStyle = hsl(H, 100, 75);
      c.lineWidth = 2;
      c.shadowColor = hsl(H, 100, 60);
      c.shadowBlur = 8;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      c.shadowBlur = 0;
      c.strokeStyle = hsl(H, 100, 75, 0.25);
      c.lineWidth = 1;
      for (let k = 1; k < o.h; k++) {
        c.beginPath();
        c.moveTo(x + 2, y + k * U);
        c.lineTo(x + w - 2, y + k * U);
        c.stroke();
      }
      break;
    }
    case 1: {
      const g = c.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, hsl(A, 60, 30));
      g.addColorStop(1, hsl(H, 55, 10));
      c.fillStyle = g;
      c.fillRect(x, y, w, h);
      c.strokeStyle = hsl(A, 90, 75, 0.35);
      c.lineWidth = 1;
      c.beginPath();
      for (let k = 0; k < w + h; k += U * 0.9) {
        c.moveTo(x + Math.min(k, w), y + Math.max(0, k - w));
        c.lineTo(x + Math.max(0, k - h), y + Math.min(k, h));
      }
      c.stroke();
      c.strokeStyle = hsl(A, 100, 80);
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      break;
    }
    case 2: {
      c.fillStyle = hsl(H - 110, 22, 32);
      roundRectPath(c, x, y, w, h, 5);
      c.fill();
      c.fillStyle = hsl(H - 110, 22, 24);
      for (let k = 0; k < o.h; k++) for (let j = 0; j < o.w - 0.4; j += 1) c.fillRect(x + j * U + 3 + (k % 2) * U * 0.5, y + k * U + U * 0.55, U * 0.4, 3);
      c.fillStyle = hsl(H, 60, 42);
      roundRectPath(c, x - 2, y - 3, w + 4, Math.min(h, U * 0.32), 5);
      c.fill();
      c.fillStyle = hsl(H, 65, 52);
      for (let j = x + 4; j < x + w - 2; j += U / 3) {
        c.beginPath();
        c.arc(j, y + U * 0.22, U * 0.09, 0, Math.PI);
        c.fill();
      }
      break;
    }
    case 3: {
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, hsl(H + 190, 12, 42));
      g.addColorStop(1, hsl(H + 190, 15, 20));
      c.fillStyle = g;
      c.fillRect(x, y, w, h);
      c.strokeStyle = hsl(H + 190, 10, 12);
      c.lineWidth = 1;
      for (let k = 1; k < o.w; k++) {
        c.beginPath();
        c.moveTo(x + k * U, y);
        c.lineTo(x + k * U, y + h);
        c.stroke();
      }
      c.fillStyle = hsl(H + 190, 10, 60);
      for (const [px, py] of [[4, 4], [w - 7, 4], [4, h - 7], [w - 7, h - 7]]) c.fillRect(x + px, y + py, 3, 3);
      c.strokeStyle = hsl(A, 95, 55);
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      break;
    }
    case 4: {
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, hsl(A - 30, 45, 30));
      g.addColorStop(1, hsl(H, 50, 12));
      c.fillStyle = g;
      roundRectPath(c, x, y, w, h, U * 0.2);
      c.fill();
      c.fillStyle = hsl(A, 100, 75, 0.55 + v.pulse * 0.3);
      const r = rng(o.id * 13 + 1);
      for (let k = 0; k < o.w * o.h * 2; k++) {
        c.beginPath();
        c.arc(x + r() * w, y + r() * h, 1.2 + r() * 1.8, 0, TAU);
        c.fill();
      }
      c.strokeStyle = hsl(A, 90, 70, 0.8);
      c.lineWidth = 1.5;
      roundRectPath(c, x + 1, y + 1, w - 2, h - 2, U * 0.2);
      c.stroke();
      break;
    }
    case 5: {
      c.fillStyle = hsl(H, 15, 24);
      c.fillRect(x, y, w, h);
      c.strokeStyle = hsl(H, 20, 12);
      c.lineWidth = 1.5;
      const bh = U / 2;
      for (let k = 0; k * bh < h - 1; k++) {
        c.beginPath();
        c.moveTo(x, y + k * bh);
        c.lineTo(x + w, y + k * bh);
        c.stroke();
        for (let j = (k % 2) * U * 0.5; j < w; j += U) {
          c.beginPath();
          c.moveTo(x + j, y + k * bh);
          c.lineTo(x + j, y + Math.min(h, (k + 1) * bh));
          c.stroke();
        }
      }
      c.fillStyle = hsl(A, 90, 55);
      c.fillRect(x, y, w, 3);
      c.fillRect(x, y + h - 3, w, 3);
      break;
    }
  }
  c.restore();
}

export function drawSpike(c: CanvasRenderingContext2D, th: Theme, v: View, o: Obj) {
  const { U } = v;
  const x = v.sx(o.x);
  const up = o.kind === "spike";
  const base = up ? v.sy(o.y) : v.sy(o.y + 1);
  const tip = up ? v.sy(o.y + 0.95) : v.sy(o.y + 0.05);
  const A = th.acc;
  const pal: [string, string][] = [
    [hsl(A, 80, 25), hsl(A, 100, 80)],
    [hsl(A, 70, 30), hsl(A, 100, 85)],
    [hsl(150, 50, 12), hsl(90, 55, 45)],
    [hsl(210, 10, 35), hsl(210, 10, 90)],
    [hsl(A, 70, 25), hsl(A, 100, 75)],
    [hsl(A, 80, 25), hsl(A, 100, 70)],
  ];
  const [c0, c1] = pal[th.style];
  const g = c.createLinearGradient(0, base, 0, tip);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x + U * 0.08, base);
  c.lineTo(x + U * 0.5, tip);
  c.lineTo(x + U * 0.92, base);
  c.closePath();
  c.fill();
  // facet / detail
  c.fillStyle = "rgba(255,255,255,0.22)";
  c.beginPath();
  c.moveTo(x + U * 0.5, tip);
  c.lineTo(x + U * 0.5, base);
  c.lineTo(x + U * 0.92, base);
  c.closePath();
  c.fill();
  c.strokeStyle = th.style === 3 ? hsl(A, 100, 60) : "#ffffff";
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x + U * 0.08, base);
  c.lineTo(x + U * 0.5, tip);
  c.lineTo(x + U * 0.92, base);
  c.stroke();
  if (th.style === 2) {
    // thorns
    c.fillStyle = hsl(90, 50, 30);
    for (const k of [0.3, 0.6]) {
      const yy = base + (tip - base) * k;
      c.beginPath();
      c.moveTo(x + U * (0.5 - 0.42 * (1 - k)), yy);
      c.lineTo(x + U * (0.5 - 0.42 * (1 - k)) - U * 0.12, yy - (up ? U * 0.06 : -U * 0.06));
      c.lineTo(x + U * (0.5 - 0.42 * (1 - k)) + 2, yy + (up ? 4 : -4));
      c.fill();
    }
  }
}

function sawShape(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, a: number, hub: string) {
  c.save();
  c.translate(cx, cy);
  c.rotate(a);
  const g = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  g.addColorStop(0, "#f8fafc");
  g.addColorStop(1, "#94a3b8");
  c.fillStyle = g;
  c.beginPath();
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * TAU;
    const rr = k % 2 ? r * 0.76 : r;
    c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.8)";
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = hub;
  c.beginPath();
  c.arc(0, 0, r * 0.3, 0, TAU);
  c.fill();
  c.restore();
}

export function drawHazard(c: CanvasRenderingContext2D, th: Theme, v: View, o: Obj) {
  const { U } = v;
  const A = th.acc;
  switch (o.kind) {
    case "saw":
      sawShape(c, v.sx(o.x + o.w / 2), v.sy(o.y + o.h / 2), o.w * U * 0.5, -v.time * 8, hsl(A, 80, 40));
      break;
    case "rail": {
      const cx = v.sx(o.x + o.w / 2);
      const top = v.sy(o.y + o.a + 0.1);
      const bot = v.sy(Math.max(0, o.y - o.a));
      c.strokeStyle = hsl(A, 80, 60, 0.6);
      c.lineWidth = 3;
      c.setLineDash([5, 5]);
      c.beginPath();
      c.moveTo(cx, top);
      c.lineTo(cx, bot);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = hsl(A, 80, 60, 0.8);
      c.fillRect(cx - 7, top - 3, 14, 4);
      glow(c, cx, v.sy(railY(o, v.t)), o.w * U * 0.8, hsl(A, 100, 60), 0.3);
      sawShape(c, cx, v.sy(railY(o, v.t)), o.w * U * 0.5, -v.time * 10, hsl(A, 90, 45));
      break;
    }
    case "drone":
      drawDrone(c, v, o, A);
      break;
    case "crawler":
      drawCrawler(c, v, o, A);
      break;
    case "chomper":
      drawChomper(c, v, o, A);
      break;
  }
}

/** Hovering eye drone: metal shell, big eye that watches the player, flapping fins. */
function drawDrone(c: CanvasRenderingContext2D, v: View, o: Obj, A: number) {
  const { U } = v;
  const cx = v.sx(o.x + 0.5);
  const cy = v.sy(droneY(o, v.t));
  const r = U * 0.46;
  glow(c, cx, cy, r * 2.4, hsl(0, 90, 55), 0.3);
  // fins
  const flap = Math.sin(v.time * 18) * 0.35;
  c.fillStyle = hsl(A, 30, 40);
  for (const s of [-1, 1]) {
    c.save();
    c.translate(cx + s * r * 0.85, cy - r * 0.2);
    c.rotate(s * (0.5 + flap));
    c.beginPath();
    c.ellipse(s * r * 0.35, 0, r * 0.45, r * 0.16, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#e2e8f0");
  g.addColorStop(1, "#475569");
  c.fillStyle = g;
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.fill();
  // eye white + iris looking at player
  c.fillStyle = "#fff7ed";
  c.beginPath();
  c.arc(cx, cy, r * 0.68, 0, TAU);
  c.fill();
  const dx = v.sx(v.playerX + 0.5) - cx;
  const dy = v.sy(v.playerY + 0.5) - cy;
  const dl = Math.hypot(dx, dy) || 1;
  const ix = cx + (dx / dl) * r * 0.25;
  const iy = cy + (dy / dl) * r * 0.25;
  c.fillStyle = "#dc2626";
  c.beginPath();
  c.arc(ix, iy, r * 0.36, 0, TAU);
  c.fill();
  c.fillStyle = "#111827";
  c.beginPath();
  c.arc(ix, iy, r * 0.17, 0, TAU);
  c.fill();
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(ix - r * 0.1, iy - r * 0.12, r * 0.07, 0, TAU);
  c.fill();
  // blink lid
  const blink = Math.sin(v.time * 1.7 + o.id) > 0.97 ? 1 : 0;
  if (blink) {
    c.fillStyle = "#64748b";
    c.beginPath();
    c.arc(cx, cy, r * 0.7, 0, TAU);
    c.fill();
  }
  c.strokeStyle = "rgba(255,255,255,0.7)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.stroke();
}

/** Spiky bug walking back and forth on its track. */
function drawCrawler(c: CanvasRenderingContext2D, v: View, o: Obj, A: number) {
  const { U } = v;
  const ceiling = o.y > CEIL / 2;
  const surf = ceiling ? v.sy(o.y + 0.55) : v.sy(o.y);
  const dir = ceiling ? 1 : -1; // body grows away from the surface
  // patrol track (telegraph)
  c.strokeStyle = "rgba(251,146,60,0.6)";
  c.lineWidth = 3;
  c.setLineDash([4, 6]);
  c.beginPath();
  c.moveTo(v.sx(o.x + 0.1), surf - dir * 2);
  c.lineTo(v.sx(o.x + o.w - 0.1), surf - dir * 2);
  c.stroke();
  c.setLineDash([]);
  const cx = v.sx(crawlerX(o, v.t));
  const moving = Math.sin(o.f * v.t + o.p); // >0 walking right
  const r = U * 0.42;
  // legs
  c.strokeStyle = "#1f2937";
  c.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const lx = cx + (k - 1) * r * 0.6;
    const step = Math.sin(v.t * 14 + k * 2) * r * 0.2;
    c.beginPath();
    c.moveTo(lx, surf + dir * r * 0.35);
    c.lineTo(lx + step - r * 0.15, surf + dir * r * 0.05);
    c.lineTo(lx + step - r * 0.25, surf);
    c.stroke();
  }
  // shell
  // fixed warm colours so it stands out from every world's scenery
  const g = c.createLinearGradient(0, surf + dir * r * 1.2, 0, surf);
  g.addColorStop(0, "#fdba74");
  g.addColorStop(1, "#c2410c");
  c.fillStyle = g;
  glow(c, cx, surf + dir * r * 0.5, r * 2, "#f97316", 0.35);
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(cx, surf + dir * r * 0.3, r, r * 0.95, 0, ceiling ? 0 : Math.PI, ceiling ? Math.PI : TAU);
  c.fill();
  c.strokeStyle = "#ffffff";
  c.lineWidth = 1.5;
  c.stroke();
  // back spikes
  c.fillStyle = "#fef3c7";
  for (let k = -1; k <= 1; k++) {
    const bx = cx + k * r * 0.5;
    const by = surf + dir * r * (1.1 - Math.abs(k) * 0.25);
    c.beginPath();
    c.moveTo(bx - r * 0.15, by - dir * r * 0.05);
    c.lineTo(bx, by + dir * r * 0.35);
    c.lineTo(bx + r * 0.15, by - dir * r * 0.05);
    c.fill();
  }
  // eyes on the side it walks to
  const ex = cx + (moving >= 0 ? 1 : -1) * r * 0.55;
  c.fillStyle = "#fde047";
  for (const k of [-1, 1]) {
    c.beginPath();
    c.arc(ex + k * r * 0.14, surf + dir * r * 0.55, r * 0.12, 0, TAU);
    c.fill();
  }
}

/** Pops up out of the floor: glowing eyes in a slit, a warning shake, then jaws. */
function drawChomper(c: CanvasRenderingContext2D, v: View, o: Obj, A: number) {
  const { U } = v;
  const { up, warn } = chomper(o, v.t);
  const cx = v.sx(o.x + 0.5);
  const base = v.sy(o.y);
  // slit in the floor
  c.fillStyle = "#020617";
  c.beginPath();
  c.ellipse(cx, base + 2, U * 0.55, U * 0.12, 0, 0, TAU);
  c.fill();
  if (warn > 0) {
    glow(c, cx, base, U * (0.8 + warn * 0.6), "#f97316", 0.25 + warn * 0.5);
    c.fillStyle = `rgba(253,186,116,${0.4 + warn * 0.6})`;
    for (const k of [-1, 1]) {
      c.beginPath();
      c.arc(cx + k * U * 0.16 + Math.sin(v.time * 50) * warn * 2, base - 1, U * 0.06, 0, TAU);
      c.fill();
    }
  }
  if (up <= 0.02) return;
  const hgt = 1.5 * up * U;
  const top = base - hgt;
  c.save();
  c.beginPath();
  c.rect(cx - U, top - U, U * 2, hgt + U);
  c.clip();
  const g = c.createLinearGradient(0, top, 0, base);
  g.addColorStop(0, hsl(A + 120, 70, 50));
  g.addColorStop(1, hsl(A + 120, 70, 20));
  c.fillStyle = g;
  roundRectPath(c, cx - U * 0.4, top, U * 0.8, hgt + U * 0.2, U * 0.35);
  c.fill();
  // mouth with teeth
  const open = 0.5 + 0.5 * Math.sin(v.time * 12);
  const my = top + U * 0.55;
  c.fillStyle = "#1e1b4b";
  c.beginPath();
  c.ellipse(cx, my, U * 0.3, U * (0.08 + open * 0.12), 0, 0, TAU);
  c.fill();
  c.fillStyle = "#ffffff";
  for (let k = -2; k <= 2; k++) {
    c.beginPath();
    c.moveTo(cx + k * U * 0.11 - U * 0.04, my - U * (0.08 + open * 0.12));
    c.lineTo(cx + k * U * 0.11, my);
    c.lineTo(cx + k * U * 0.11 + U * 0.04, my - U * (0.08 + open * 0.12));
    c.fill();
  }
  // eyes
  c.fillStyle = "#fde047";
  for (const k of [-1, 1]) {
    c.beginPath();
    c.arc(cx + k * U * 0.17, top + U * 0.25, U * 0.08, 0, TAU);
    c.fill();
  }
  c.restore();
}

export function drawPickup(c: CanvasRenderingContext2D, th: Theme, v: View, o: Obj, used: boolean) {
  const { U } = v;
  const x = v.sx(o.x);
  const y = v.sy(o.y + o.h);
  switch (o.kind) {
    case "pad": {
      const b = v.sy(o.y);
      glow(c, x + U / 2, b, U, "#fde047", used ? 0.15 : 0.5 + v.pulse * 0.3);
      c.fillStyle = used ? "rgba(253,224,71,0.45)" : "#fde047";
      c.beginPath();
      c.ellipse(x + U / 2, b - U * 0.08, U * 0.45, U * 0.16, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = "#a16207";
      c.fillRect(x + U * 0.1, b - U * 0.08, U * 0.8, U * 0.08);
      break;
    }
    case "orb": {
      const cx = x + (o.w * U) / 2;
      const cy = y + (o.h * U) / 2;
      glow(c, cx, cy, U * 1.1, "#fde047", used ? 0.12 : 0.6);
      c.strokeStyle = used ? "rgba(253,224,71,0.3)" : "#fde047";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy, U * 0.38 * (1 + 0.08 * Math.sin(v.time * 8)), 0, TAU);
      c.stroke();
      c.fillStyle = used ? "rgba(253,224,71,0.2)" : "rgba(253,224,71,0.65)";
      c.beginPath();
      c.arc(cx, cy, U * 0.18, 0, TAU);
      c.fill();
      if (!used) {
        // pulsing ring telling the player to tap here
        const k = (v.time * 1.5) % 1;
        c.strokeStyle = `rgba(253,224,71,${0.6 * (1 - k)})`;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(cx, cy, U * (0.4 + k * 0.5), 0, TAU);
        c.stroke();
      }
      break;
    }
    case "coin": {
      if (used) break;
      const cx = x + (o.w * U) / 2;
      const cy = y + (o.h * U) / 2 + Math.sin(v.time * 4 + o.id) * 3;
      glow(c, cx, cy, U * 0.7, "#ffd76a", 0.5);
      c.save();
      c.translate(cx, cy);
      c.scale(Math.abs(Math.cos(v.time * 3 + o.id)) * 0.7 + 0.3, 1);
      drawCoin(c, 0, 0, U * 0.28);
      c.restore();
      break;
    }
  }
}

export function drawPortal(c: CanvasRenderingContext2D, v: View, o: Obj, slow: boolean) {
  const { U } = v;
  const x = v.sx(o.x);
  const col = o.kind === "gravity" ? "#60a5fa" : o.kind === "glide" ? "#f472b6" : o.kind === "cube" ? "#4ade80" : slow ? "#fb923c" : "#facc15";
  const top = v.sy(o.y + o.h);
  const bot = v.sy(o.y);
  c.save();
  c.globalCompositeOperation = "lighter";
  const g = c.createLinearGradient(x - U * 0.4, 0, x + U * 0.8, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.5, col);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.globalAlpha = 0.45 + 0.2 * Math.sin(v.time * 6);
  c.fillRect(x - U * 0.4, top, U * 1.2, bot - top);
  c.restore();
  c.strokeStyle = col;
  c.lineWidth = 3;
  c.shadowColor = col;
  c.shadowBlur = 10;
  c.beginPath();
  c.ellipse(x + U * 0.2, (top + bot) / 2, U * 0.3, (bot - top) * 0.32, 0, 0, TAU);
  c.stroke();
  c.shadowBlur = 0;
  const mx = x + U * 0.2;
  const my = (top + bot) / 2;
  c.save();
  c.translate(mx, my);
  c.fillStyle = "#ffffff";
  c.strokeStyle = "#ffffff";
  c.lineWidth = 2.5;
  if (o.kind === "gravity") {
    c.beginPath();
    c.moveTo(-6, -4);
    c.lineTo(0, -12);
    c.lineTo(6, -4);
    c.moveTo(-6, 4);
    c.lineTo(0, 12);
    c.lineTo(6, 4);
    c.stroke();
  } else if (o.kind === "glide") {
    c.beginPath();
    c.moveTo(-10, 4);
    c.quadraticCurveTo(-2, -12, 12, -8);
    c.quadraticCurveTo(2, -2, 2, 6);
    c.closePath();
    c.fill();
  } else if (o.kind === "cube") c.fillRect(-6, -6, 12, 12);
  else {
    // chevrons: >> fast, < slow
    const n = slow ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const ox = (k - (n - 1) / 2) * 9 * (slow ? -1 : 1);
      c.beginPath();
      if (slow) {
        c.moveTo(ox + 4, -9);
        c.lineTo(ox - 4, 0);
        c.lineTo(ox + 4, 9);
      } else {
        c.moveTo(ox - 4, -9);
        c.lineTo(ox + 4, 0);
        c.lineTo(ox - 4, 9);
      }
      c.stroke();
    }
  }
  c.restore();
}

export function drawCheck(c: CanvasRenderingContext2D, v: View, o: Obj, used: boolean) {
  const { U } = v;
  const cx = v.sx(o.x);
  const base = v.sy(0);
  c.strokeStyle = "rgba(134,239,172,0.7)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(cx, base);
  c.lineTo(cx, base - U * 1.5);
  c.stroke();
  c.fillStyle = used ? "#86efac" : "rgba(134,239,172,0.4)";
  c.beginPath();
  c.moveTo(cx, base - U * 1.5);
  c.lineTo(cx + U * 0.5, base - U * 1.3);
  c.lineTo(cx, base - U * 1.1);
  c.closePath();
  c.fill();
}

/** Finish gate: two glowing pillars, a chequered banner and a light curtain. */
export function drawFinish(c: CanvasRenderingContext2D, th: Theme, v: View, x: number) {
  const { U } = v;
  const sx = v.sx(x);
  const base = v.sy(0);
  const top = v.sy(4.2);
  const col = hsl(th.player, 100, 65);
  c.save();
  c.globalCompositeOperation = "lighter";
  const g = c.createLinearGradient(sx - U, 0, sx + U * 2, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.5, hsl(th.player, 100, 60, 0.35 + v.pulse * 0.2));
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(sx - U, top, U * 3, base - top);
  c.restore();
  for (const px of [sx - U * 0.15, sx + U * 1.15]) {
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 14;
    c.fillRect(px - 3, top, 6, base - top);
  }
  c.shadowBlur = 0;
  // chequered banner
  const bw = U * 1.3;
  const bh = U * 0.5;
  const bx = sx - U * 0.15;
  const by = top;
  const n = 6;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < 2; j++) {
      c.fillStyle = (i + j) % 2 ? "#ffffff" : "#111827";
      const wave = Math.sin(v.time * 5 + i * 0.8) * 2;
      c.fillRect(bx + (i * bw) / n, by + (j * bh) / 2 + wave, bw / n + 0.5, bh / 2 + 0.5);
    }
  c.strokeStyle = col;
  c.lineWidth = 2;
  c.strokeRect(bx, by - 2, bw, bh + 4);
}

/** Neon sign on a post, used for tutorial hints placed inside the level. */
export function drawSign(c: CanvasRenderingContext2D, th: Theme, v: View, x: number, text: string, font: string) {
  const { U } = v;
  const sx = v.sx(x);
  const base = v.sy(0);
  c.font = `600 13px ${font}`;
  const tw = c.measureText(text).width;
  const bw = tw + 20;
  const bh = 30;
  const top = v.sy(5.2);
  const bx = clamp(sx - bw / 2, 6, Number.MAX_SAFE_INTEGER);
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(sx, base);
  c.lineTo(sx, top + bh);
  c.stroke();
  c.fillStyle = "rgba(10,8,30,0.82)";
  roundRectPath(c, bx, top, bw, bh, 10);
  c.fill();
  c.strokeStyle = hsl(th.player, 100, 65);
  c.lineWidth = 1.5;
  c.shadowColor = hsl(th.player, 100, 60);
  c.shadowBlur = 8;
  c.stroke();
  c.shadowBlur = 0;
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, bx + bw / 2, top + bh / 2 + 1);
  void U;
}

export function drawPlayer(c: CanvasRenderingContext2D, th: Theme, v: View, glide: boolean, rot: number, held: boolean, grav: number) {
  const { U } = v;
  const cx = v.sx(v.playerX + 0.5);
  const cy = v.sy(v.playerY + 0.5);
  const col = hsl(th.player, 100, 62);
  glow(c, cx, cy, U * 1.3, col, 0.35 + v.pulse * 0.25);
  c.save();
  c.translate(cx, cy);
  if (glide) {
    c.rotate(rot);
    if (grav < 0) c.scale(1, -1);
    const flap = Math.sin(v.time * 18) * (held ? 0.25 : 0.08);
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(U * 0.6, 0);
    c.lineTo(-U * 0.45, -U * 0.22);
    c.lineTo(-U * 0.3, 0);
    c.lineTo(-U * 0.45, U * 0.22);
    c.closePath();
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(U * 0.1, 0);
    c.quadraticCurveTo(-U * 0.2, -U * (0.7 + flap), -U * 0.55, -U * (0.55 + flap));
    c.lineTo(-U * 0.2, 0);
    c.closePath();
    c.fill();
    c.globalAlpha = 0.6;
    c.beginPath();
    c.moveTo(U * 0.1, 0);
    c.quadraticCurveTo(-U * 0.2, U * (0.5 - flap), -U * 0.5, U * (0.4 - flap));
    c.lineTo(-U * 0.2, 0);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
  } else {
    c.rotate(rot);
    const s = U * 0.96;
    const g = c.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, col);
    g.addColorStop(1, hsl(th.player + 40, 90, 35));
    c.fillStyle = g;
    roundRectPath(c, -s / 2, -s / 2, s, s, s * 0.18);
    c.fill();
    c.strokeStyle = "#ffffff";
    c.lineWidth = 2;
    c.stroke();
    const k = 0.22 + v.pulse * 0.06;
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.beginPath();
    c.moveTo(0, -s * k);
    c.lineTo(s * k, 0);
    c.lineTo(0, s * k);
    c.lineTo(-s * k, 0);
    c.closePath();
    c.fill();
  }
  c.restore();
}

export { hsl };
