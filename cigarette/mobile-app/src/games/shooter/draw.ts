// Drawing for "ยานพิทักษ์ดาว": map backdrops, enemies, bosses, bullets, lasers and telegraphs.
// Everything is procedural (gradients, glows, paths) in the style of the other games.

import { glow, makeSprite, rgba, rng, roundRectPath, shade, TAU, clamp, FONT_DISPLAY } from "../engine/fx";
import { ENEMIES, type Theme } from "./maps";
import { renderScale } from "../engine/quality";
import type { Bullet, Drop, Enemy, Laser, Mark, World } from "./world";

// ── Backdrops ───────────────────────────────────────────────────────────────

export function makeBackdrop(t: Theme, w: number, h: number, dpr: number, seed: number): HTMLCanvasElement {
  return makeSprite(w, h, dpr, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(0.6, t.sky[1]);
    g.addColorStop(1, t.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 5; i++) {
      const col = t.neb[i % t.neb.length];
      const x = r() * w;
      const y = r() * h;
      const rad = Math.max(w, h) * (0.22 + r() * 0.3);
      const rg = c.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, rgba(col, 0.2));
      rg.addColorStop(0.5, rgba(col, 0.08));
      rg.addColorStop(1, rgba(col, 0));
      c.fillStyle = rg;
      c.fillRect(0, 0, w, h);
    }
    const m = Math.min(w, h);
    switch (t.feature) {
      case "ringed": {
        const px = w * 0.82;
        const py = h * 0.18;
        const pr = m * 0.12;
        planet(c, px, py, pr, "#7ea6ff", "#1d2a6b");
        c.strokeStyle = "rgba(170,200,255,0.35)";
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(px, py, pr * 1.7, pr * 0.35, -0.3, 0, TAU);
        c.stroke();
        break;
      }
      case "moon": {
        const px = w * 0.2;
        const py = h * 0.14;
        const pr = m * 0.09;
        planet(c, px, py, pr, "#ffd6ef", "#5a2a55");
        c.fillStyle = "rgba(90,40,90,0.35)";
        for (let i = 0; i < 6; i++) {
          c.beginPath();
          c.arc(px + (r() - 0.6) * pr, py + (r() - 0.5) * pr, pr * (0.08 + r() * 0.12), 0, TAU);
          c.fill();
        }
        // crescent shadow
        c.fillStyle = rgba(t.sky[0], 0.55);
        c.beginPath();
        c.arc(px + pr * 0.45, py + pr * 0.1, pr * 0.95, 0, TAU);
        c.fill();
        break;
      }
      case "belt": {
        planet(c, -m * 0.1, h * 0.95, m * 0.45, "#d99a4e", "#3a2210");
        for (let i = 0; i < 26; i++) {
          const x = r() * w;
          const y = h * (0.15 + r() * 0.7);
          rockShape(c, x, y, 3 + r() * 9, r() * TAU, "#4a3424", "#2a1d14", Math.floor(r() * 1000));
        }
        break;
      }
      case "ice": {
        const px = w * 0.12;
        const py = h * 0.2;
        const pr = m * 0.16;
        planet(c, px, py, pr, "#dff9ff", "#1a5a7a");
        c.save();
        c.beginPath();
        c.arc(px, py, pr, 0, TAU);
        c.clip();
        c.strokeStyle = "rgba(255,255,255,0.25)";
        c.lineWidth = 3;
        for (let i = -3; i <= 3; i++) {
          c.beginPath();
          c.ellipse(px, py + i * pr * 0.28, pr * 1.2, pr * 0.12, 0.2, 0, TAU);
          c.stroke();
        }
        c.restore();
        for (let i = 0; i < 14; i++) crystal(c, r() * w, h * (0.3 + r() * 0.65), 4 + r() * 8, r() * TAU);
        break;
      }
      case "sun": {
        const px = w * 0.85;
        const py = h * 0.08;
        const pr = m * 0.3;
        const sg = c.createRadialGradient(px, py, pr * 0.2, px, py, pr * 2.2);
        sg.addColorStop(0, "rgba(255,200,120,0.9)");
        sg.addColorStop(0.25, "rgba(255,90,40,0.55)");
        sg.addColorStop(0.6, "rgba(160,20,30,0.18)");
        sg.addColorStop(1, "rgba(120,0,20,0)");
        c.fillStyle = sg;
        c.fillRect(0, 0, w, h);
        planet(c, px, py, pr * 0.55, "#ffe6a0", "#ff5a1e");
        break;
      }
      case "aurora": {
        for (let k = 0; k < 3; k++) {
          c.strokeStyle = rgba(t.neb[k % t.neb.length], 0.1);
          c.lineWidth = 40 + k * 20;
          c.beginPath();
          for (let x = -20; x <= w + 20; x += 20) {
            const y = h * (0.2 + k * 0.12) + Math.sin(x * 0.012 + k * 2) * 40;
            if (x === -20) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
        }
        planet(c, w * 0.78, h * 0.86, m * 0.2, "#7cf5c4", "#063a2a");
        break;
      }
      case "hole": {
        const px = w * 0.5;
        const py = h * 0.3;
        const pr = m * 0.11;
        const dg = c.createRadialGradient(px, py, pr, px, py, pr * 3.4);
        dg.addColorStop(0, "rgba(255,190,255,0.5)");
        dg.addColorStop(0.3, rgba(t.neb[0], 0.35));
        dg.addColorStop(1, rgba(t.neb[1], 0));
        c.fillStyle = dg;
        c.beginPath();
        c.ellipse(px, py, pr * 3.4, pr * 0.9, -0.15, 0, TAU);
        c.fill();
        c.fillStyle = "#000000";
        c.beginPath();
        c.arc(px, py, pr, 0, TAU);
        c.fill();
        c.strokeStyle = "rgba(255,220,255,0.6)";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(px, py, pr * 1.08, 0, TAU);
        c.stroke();
        break;
      }
      case "storm": {
        for (let i = 0; i < 9; i++) {
          const x = r() * w;
          const y = (i % 2 ? h * 0.92 : h * 0.06) + (r() - 0.5) * 60;
          const cr = m * (0.18 + r() * 0.2);
          const cg = c.createRadialGradient(x, y, 0, x, y, cr);
          cg.addColorStop(0, "rgba(40,60,120,0.6)");
          cg.addColorStop(1, "rgba(20,30,70,0)");
          c.fillStyle = cg;
          c.fillRect(x - cr, y - cr, cr * 2, cr * 2);
        }
        break;
      }
    }
  });
}

function planet(c: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string) {
  const pg = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  pg.addColorStop(0, light);
  pg.addColorStop(1, dark);
  c.fillStyle = pg;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  glow(c, x, y, r * 1.4, light, 0.12);
}

function rockShape(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, light: string, dark: string, seed: number) {
  const rr = rng(seed + 7);
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  const g = c.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 0.75 + rr() * 0.35;
    c.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.22)";
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc((rr() - 0.5) * r, (rr() - 0.5) * r, r * (0.12 + rr() * 0.12), 0, TAU);
    c.fill();
  }
  c.restore();
}

function crystal(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  const g = c.createLinearGradient(0, -s, 0, s);
  g.addColorStop(0, "rgba(220,250,255,0.5)");
  g.addColorStop(1, "rgba(60,160,220,0.15)");
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, -s * 1.6);
  c.lineTo(s * 0.5, 0);
  c.lineTo(0, s * 1.2);
  c.lineTo(-s * 0.5, 0);
  c.closePath();
  c.fill();
  c.restore();
}

/** Animated layer over the backdrop (dust, snow, embers, aurora, swirl, lightning). */
export function drawAmbient(c: CanvasRenderingContext2D, t: Theme, w: number, h: number, time: number, reduced: boolean) {
  const r = rng(99);
  c.save();
  switch (t.feature) {
    case "belt":
      for (let i = 0; i < 18; i++) {
        const x = (r() * w + time * (8 + r() * 10)) % (w + 40) - 20;
        const y = (r() * h + time * (20 + r() * 20)) % h;
        rockShape(c, x, y, 2 + r() * 4, time * (r() - 0.5) * 2, "#6b4a30", "#2a1d14", i);
      }
      break;
    case "ice":
      c.fillStyle = "rgba(230,250,255,0.6)";
      for (let i = 0; i < 40; i++) {
        const x = (r() * w + Math.sin(time * 0.6 + i) * 12 + w) % w;
        const y = (r() * h + time * (25 + r() * 30)) % h;
        c.beginPath();
        c.arc(x, y, 0.8 + r() * 1.4, 0, TAU);
        c.fill();
      }
      break;
    case "sun":
      for (let i = 0; i < 30; i++) {
        const x = (r() * w + Math.sin(time + i) * 10 + w) % w;
        const y = h - ((r() * h + time * (30 + r() * 40)) % h);
        const a = 0.3 + 0.4 * Math.sin(time * 3 + i);
        c.fillStyle = `rgba(255,${120 + Math.floor(r() * 80)},60,${Math.max(0, a)})`;
        c.beginPath();
        c.arc(x, y, 1 + r() * 1.5, 0, TAU);
        c.fill();
      }
      break;
    case "aurora":
      if (!reduced) {
        c.globalCompositeOperation = "lighter";
        for (let k = 0; k < 2; k++) {
          c.strokeStyle = rgba(t.neb[k], 0.09);
          c.lineWidth = 26;
          c.beginPath();
          for (let x = -20; x <= w + 20; x += 16) {
            const y = h * (0.25 + k * 0.2) + Math.sin(x * 0.015 + time * (0.5 + k * 0.3) + k) * 36;
            if (x === -20) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
        }
      }
      break;
    case "hole": {
      const px = w * 0.5;
      const py = h * 0.3;
      const m = Math.min(w, h);
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < 26; i++) {
        const rad = m * (0.13 + r() * 0.24);
        const a = r() * TAU + time * (0.6 * (m * 0.2) / rad);
        c.fillStyle = rgba(t.neb[i % t.neb.length], 0.5);
        c.beginPath();
        c.arc(px + Math.cos(a) * rad * 1.6, py + Math.sin(a) * rad * 0.42, 1.2 + r() * 1.5, 0, TAU);
        c.fill();
      }
      break;
    }
    case "storm": {
      const flash = Math.max(0, Math.sin(time * 0.9) * Math.sin(time * 3.7) - 0.85) * 4;
      if (flash > 0 && !reduced) {
        c.fillStyle = `rgba(150,220,255,${flash * 0.18})`;
        c.fillRect(0, 0, w, h);
        const x = w * (0.2 + ((Math.floor(time * 0.9 / TAU) * 0.37) % 0.6));
        c.strokeStyle = `rgba(200,240,255,${flash * 0.5})`;
        c.lineWidth = 2;
        c.beginPath();
        let yy = 0;
        let xx = x;
        c.moveTo(xx, yy);
        const rr = rng(Math.floor(time * 0.9 / TAU));
        while (yy < h * 0.4) {
          yy += 20 + rr() * 20;
          xx += (rr() - 0.5) * 40;
          c.lineTo(xx, yy);
        }
        c.stroke();
      }
      break;
    }
    default:
      break;
  }
  c.restore();
}

// ── Enemies ─────────────────────────────────────────────────────────────────

/** Body gradient; `hit` (0..1) brightens it briefly when a shot lands. */
function bodyFill(c: CanvasRenderingContext2D, r: number, col: string, hit = 0) {
  const g = c.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, shade(col, Math.min(0.9, 0.3 + 0.5 * hit)));
  g.addColorStop(1, shade(col, -0.4 + 0.5 * hit));
  c.fillStyle = g;
}

function core(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, col = "#fff6d6") {
  glow(c, x, y, s * 2.4, "#ffffff", 0.45 + 0.3 * Math.sin(t * 8));
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, s * 0.6, 0, TAU);
  c.fill();
}

export function drawEnemy(c: CanvasRenderingContext2D, e: Enemy, time: number) {
  const meta = ENEMIES[e.kind];
  const base = meta.color;
  const hit = e.hit;
  const r = e.r;
  c.save();
  c.translate(e.x, e.y);
  if (e.kind === "cloaker") {
    c.globalAlpha = Math.max(0.1, 1 - e.cloak * 0.9);
    if (e.cloak > 0.5) {
      // shimmer outline: always visible so it is fair
      c.strokeStyle = `rgba(200,220,255,${0.25 + 0.15 * Math.sin(time * 10)})`;
      c.lineWidth = 1.5;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.arc(0, 0, r * 1.1, 0, TAU);
      c.stroke();
      c.setLineDash([]);
    }
  }
  if (e.elite) {
    glow(c, 0, 0, r * 2.8, "#ffd166", 0.35 + 0.1 * Math.sin(time * 5));
    c.strokeStyle = `rgba(255,215,110,${0.6 + 0.3 * Math.sin(time * 6)})`;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, r * 1.35, 0, TAU);
    c.stroke();
  }
  if (e.kind !== "meteor" && e.kind !== "rock") glow(c, 0, 0, r * 2.2, base, 0.22);
  bodyFill(c, r, base, hit);
  c.strokeStyle = shade(base, -0.55);
  c.lineWidth = 2;
  switch (e.kind) {
    case "drone":
      c.beginPath();
      c.moveTo(0, r);
      c.lineTo(r, -r * 0.6);
      c.lineTo(0, -r * 0.2);
      c.lineTo(-r, -r * 0.6);
      c.closePath();
      c.fill();
      c.stroke();
      core(c, 0, -r * 0.1, r * 0.3, e.t);
      break;
    case "mini":
      c.beginPath();
      c.moveTo(0, r);
      c.lineTo(r * 0.8, 0);
      c.lineTo(0, -r);
      c.lineTo(-r * 0.8, 0);
      c.closePath();
      c.fill();
      c.stroke();
      core(c, 0, 0, r * 0.3, e.t);
      break;
    case "zig":
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + e.t * 3;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      c.stroke();
      core(c, 0, 0, r * 0.32, e.t);
      break;
    case "gunner":
      c.beginPath();
      c.moveTo(-r, -r * 0.5);
      c.lineTo(r, -r * 0.5);
      c.lineTo(r * 0.6, r * 0.7);
      c.lineTo(0, r);
      c.lineTo(-r * 0.6, r * 0.7);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = shade(base, -0.5);
      c.fillRect(-r * 0.12, r * 0.6, r * 0.24, r * 0.55);
      core(c, 0, -r * 0.1, r * 0.3, e.t);
      muzzle(c, 0, r * 1.15, e.charge, "#ff8ac0");
      break;
    case "diver":
      if (e.phase === 1) {
        // Telegraph: the dash line
        c.save();
        c.rotate(e.a);
        c.strokeStyle = `rgba(255,140,60,${0.25 + 0.6 * e.charge})`;
        c.lineWidth = 2 + e.charge * 3;
        c.setLineDash([10, 8]);
        c.lineDashOffset = -time * 60;
        c.beginPath();
        c.moveTo(r, 0);
        c.lineTo(900, 0);
        c.stroke();
        c.setLineDash([]);
        c.restore();
      }
      c.save();
      c.rotate((e.phase >= 1 ? e.a : Math.PI / 2) - Math.PI / 2);
      bodyFill(c, r, base, hit);
      c.beginPath();
      c.moveTo(0, r * 1.2);
      c.lineTo(r * 0.7, -r);
      c.lineTo(0, -r * 0.5);
      c.lineTo(-r * 0.7, -r);
      c.closePath();
      c.fill();
      c.stroke();
      if (e.phase === 2) glow(c, 0, -r, r * 1.6, "#ffb46b", 0.6);
      core(c, 0, 0, r * 0.28, e.t);
      c.restore();
      break;
    case "darter": {
      c.rotate(Math.sign(e.vx) * 0.5);
      c.beginPath();
      c.moveTo(0, r * 1.2);
      c.lineTo(r * 1.1, -r * 0.3);
      c.lineTo(r * 0.3, -r * 0.1);
      c.lineTo(0, -r);
      c.lineTo(-r * 0.3, -r * 0.1);
      c.lineTo(-r * 1.1, -r * 0.3);
      c.closePath();
      c.fill();
      c.stroke();
      core(c, 0, 0, r * 0.26, e.t);
      break;
    }
    case "tank":
      roundRectPath(c, -r, -r * 0.8, r * 2, r * 1.6, r * 0.4);
      c.fill();
      c.stroke();
      c.fillStyle = "rgba(0,0,0,0.3)";
      for (let i = -2; i <= 2; i++) c.fillRect(-r * 1.08, i * r * 0.28 - 2, r * 0.22, 4);
      for (let i = -2; i <= 2; i++) c.fillRect(r * 0.86, i * r * 0.28 - 2, r * 0.22, 4);
      c.fillStyle = shade(base, -0.45);
      for (const a of [-0.28, 0, 0.28]) {
        c.save();
        c.rotate(-a);
        c.fillRect(-2.5, r * 0.3, 5, r * 0.8);
        c.restore();
      }
      c.fillStyle = shade(base, 0.15);
      c.beginPath();
      c.arc(0, 0, r * 0.45, 0, TAU);
      c.fill();
      core(c, 0, 0, r * 0.22, e.t);
      muzzle(c, 0, r * 1.1, e.charge, "#9effc4");
      break;
    case "splitter": {
      const wob = Math.sin(e.t * 4) * 0.08;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU - Math.PI / 2 + e.t * 0.8;
        c.beginPath();
        c.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * (0.62 + wob), 0, TAU);
        c.fill();
        c.stroke();
      }
      c.strokeStyle = "rgba(255,255,255,0.4)";
      c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU - Math.PI / 2 + e.t * 0.8 + Math.PI / 3;
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.stroke();
      core(c, 0, 0, r * 0.3, e.t);
      break;
    }
    case "shield": {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.85);
      }
      c.closePath();
      c.fill();
      c.stroke();
      core(c, 0, -r * 0.15, r * 0.28, e.t);
      // Front plate: blocks the middle, the sides are open (drawn as weak spots).
      const pw = r * 0.55;
      glow(c, 0, r * 0.95, r * 1.2, "#7fe3ff", 0.35);
      c.strokeStyle = `rgba(160,240,255,${0.85 + 0.15 * Math.sin(time * 9)})`;
      c.lineWidth = 5;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-pw, r * 0.95);
      c.quadraticCurveTo(0, r * 1.35, pw, r * 0.95);
      c.stroke();
      c.lineCap = "butt";
      c.fillStyle = `rgba(255,200,90,${0.55 + 0.35 * Math.sin(time * 6)})`;
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.arc(sx * r * 0.82, r * 0.55, 3.2, 0, TAU);
        c.fill();
      }
      muzzle(c, 0, r * 1.3, e.charge, "#ff8ac0");
      break;
    }
    case "layer":
      c.beginPath();
      c.ellipse(0, 0, r * 1.25, r * 0.55, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = shade(base, 0.35);
      c.beginPath();
      c.ellipse(0, -r * 0.3, r * 0.55, r * 0.4, 0, Math.PI, TAU);
      c.fill();
      for (let i = -2; i <= 2; i++) {
        const on = Math.sin(time * 8 + i) > 0;
        c.fillStyle = on ? "#fff3b0" : "rgba(80,40,10,0.6)";
        c.beginPath();
        c.arc(i * r * 0.45, r * 0.18, 2.2, 0, TAU);
        c.fill();
      }
      break;
    case "mine": {
      const warn = e.aux < 0.9;
      const blink = warn ? Math.sin(time * 30) > 0 : Math.sin(time * 6) > 0.6;
      if (warn) {
        c.strokeStyle = `rgba(255,110,60,${0.35 + 0.35 * (1 - e.aux / 0.9)})`;
        c.lineWidth = 2;
        c.setLineDash([5, 5]);
        c.beginPath();
        c.arc(0, 0, 30 + (1 - e.aux / 0.9) * 24, 0, TAU);
        c.stroke();
        c.setLineDash([]);
      }
      c.fillStyle = shade(base, -0.3);
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + e.t;
        const rr = i % 2 ? r * 0.75 : r * 1.15;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      c.fillStyle = blink ? "#ffe08a" : "#7a2a10";
      c.beginPath();
      c.arc(0, 0, r * 0.4, 0, TAU);
      c.fill();
      if (blink) glow(c, 0, 0, r * 2, "#ff9a5a", 0.6);
      break;
    }
    case "chaser": {
      c.rotate(e.a - Math.PI / 2);
      glow(c, 0, -r * 1.2, r * 1.6, "#ff6b3d", 0.5);
      bodyFill(c, r, base, hit);
      c.beginPath();
      c.moveTo(0, r * 1.4);
      c.lineTo(r * 0.85, -r * 0.6);
      c.lineTo(0, -r * 0.2);
      c.lineTo(-r * 0.85, -r * 0.6);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * e.charge})`;
      c.beginPath();
      c.arc(0, r * 0.35, r * 0.25, 0, TAU);
      c.fill();
      break;
    }
    case "lancer":
      roundRectPath(c, -r * 0.55, -r, r * 1.1, r * 2, r * 0.5);
      c.fill();
      c.stroke();
      c.fillStyle = shade(base, -0.4);
      c.fillRect(-r, -r * 0.3, r * 0.45, r * 0.6);
      c.fillRect(r * 0.55, -r * 0.3, r * 0.45, r * 0.6);
      glow(c, 0, r * 0.75, r * 1.2, "#ff4d8d", e.phase === 2 ? 0.9 : 0.3);
      c.fillStyle = "#ffd1e6";
      c.beginPath();
      c.arc(0, r * 0.75, r * 0.28, 0, TAU);
      c.fill();
      break;
    case "carrier": {
      c.beginPath();
      c.moveTo(-r * 1.3, -r * 0.3);
      c.lineTo(-r * 0.6, -r * 0.8);
      c.lineTo(r * 0.6, -r * 0.8);
      c.lineTo(r * 1.3, -r * 0.3);
      c.lineTo(r * 1.0, r * 0.55);
      c.lineTo(-r * 1.0, r * 0.55);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.18)";
      c.fillRect(-r * 0.6, -r * 0.55, r * 1.2, r * 0.18);
      core(c, 0, -r * 0.1, r * 0.25, e.t);
      for (const sx of [-1, 1]) {
        const active = e.cycles === sx || (e.charge > 0 && e.cycles !== sx);
        const gx = sx * r * 0.75;
        const gy = r * 0.3;
        c.fillStyle = shade(base, -0.3);
        c.beginPath();
        c.arc(gx, gy, r * 0.3, 0, TAU);
        c.fill();
        c.strokeStyle = shade(base, -0.6);
        c.stroke();
        const ch = e.charge > 0 && e.cycles !== sx ? e.charge : e.aux > 0 && e.cycles === sx ? 1 : 0;
        if (active && ch > 0) muzzle(c, gx, gy + 4, ch, "#c8d8ff");
      }
      break;
    }
    case "caster": {
      c.beginPath();
      c.moveTo(0, -r * 1.1);
      c.lineTo(r * 0.8, r * 0.2);
      c.lineTo(r * 0.4, r);
      c.lineTo(-r * 0.4, r);
      c.lineTo(-r * 0.8, r * 0.2);
      c.closePath();
      c.fill();
      c.stroke();
      for (let i = 0; i < 3; i++) {
        const a = e.t * 2.5 + (i / 3) * TAU;
        c.fillStyle = "#f5d0fe";
        glow(c, Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.6, 7, "#e9a8ff", 0.6);
        c.fillStyle = "#f5d0fe";
        c.beginPath();
        c.arc(Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.6, 2.5, 0, TAU);
        c.fill();
      }
      core(c, 0, 0, r * 0.3, e.t, "#f5d0fe");
      muzzle(c, 0, r * 1.1, e.charge, "#e9a8ff");
      break;
    }
    case "wisp": {
      const fade = Math.min(1, e.life / 0.6);
      c.globalAlpha *= fade;
      c.save();
      c.rotate(e.a - Math.PI / 2);
      const tg = c.createLinearGradient(0, 0, 0, -r * 3);
      tg.addColorStop(0, "rgba(233,168,255,0.6)");
      tg.addColorStop(1, "rgba(233,168,255,0)");
      c.fillStyle = tg;
      c.beginPath();
      c.moveTo(-r * 0.7, 0);
      c.lineTo(r * 0.7, 0);
      c.lineTo(0, -r * 3);
      c.closePath();
      c.fill();
      c.restore();
      glow(c, 0, 0, r * 2.4, "#e9a8ff", 0.7);
      c.fillStyle = "#fbe8ff";
      c.beginPath();
      c.arc(0, 0, r * 0.6, 0, TAU);
      c.fill();
      break;
    }
    case "spinner": {
      c.save();
      c.rotate(e.a);
      for (let i = 0; i < 3; i++) {
        c.rotate(TAU / 3);
        bodyFill(c, r, base, hit);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(r * 0.9, -r * 0.2, r * 1.15, r * 0.35);
        c.quadraticCurveTo(r * 0.5, r * 0.3, 0, 0);
        c.fill();
        c.stroke();
      }
      c.restore();
      if (e.charge > 0) glow(c, 0, 0, r * 2.4, "#5ff5df", e.charge * 0.8);
      core(c, 0, 0, r * 0.35, e.t);
      break;
    }
    case "cloaker":
      c.beginPath();
      c.moveTo(0, r * 1.1);
      c.lineTo(r * 1.1, -r * 0.2);
      c.lineTo(r * 0.4, -r * 0.9);
      c.lineTo(-r * 0.4, -r * 0.9);
      c.lineTo(-r * 1.1, -r * 0.2);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#e2e8f0";
      c.fillRect(-r * 0.5, -r * 0.25, r * 0.35, r * 0.12);
      c.fillRect(r * 0.15, -r * 0.25, r * 0.35, r * 0.12);
      muzzle(c, 0, r * 1.15, e.charge, "#e2e8f0");
      break;
    case "weaver": {
      c.beginPath();
      c.moveTo(-r * 1.4, r * 0.4);
      c.quadraticCurveTo(0, -r * 1.4, r * 1.4, r * 0.4);
      c.lineTo(r * 1.0, r * 0.6);
      c.quadraticCurveTo(0, -r * 0.6, -r * 1.0, r * 0.6);
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = `rgba(255,220,120,${0.5 + 0.3 * Math.sin(time * 5)})`;
      c.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(i * r * 0.3, -r * 0.3);
        c.lineTo(i * r * 0.36, r * 0.55);
        c.stroke();
      }
      core(c, 0, -r * 0.5, r * 0.25, e.t);
      break;
    }
    case "rock":
      rockShape(c, 0, 0, r, e.a, e.hit > 0.5 ? "#e8d5c4" : "#a1866f", "#3a2a1e", Math.floor(r * 13));
      break;
    case "meteor": {
      const tg = c.createLinearGradient(0, 0, 0, -r * 7);
      tg.addColorStop(0, "rgba(255,170,80,0.85)");
      tg.addColorStop(1, "rgba(255,80,30,0)");
      c.fillStyle = tg;
      c.beginPath();
      c.moveTo(-r, 0);
      c.lineTo(r, 0);
      c.lineTo(0, -r * 7);
      c.closePath();
      c.fill();
      glow(c, 0, 0, r * 2.4, "#ffb35a", 0.8);
      rockShape(c, 0, 0, r, time * 3, "#ffcf8a", "#7a2a10", 5);
      break;
    }
    default:
      break;
  }
  c.restore();
  if (e.hp < e.max && e.hp > 0 && e.kind !== "mine" && e.kind !== "wisp" && e.kind !== "meteor" && e.cloak < 0.5) {
    c.fillStyle = "rgba(0,0,0,0.5)";
    c.fillRect(e.x - r, e.y - r - 9, r * 2, 3);
    c.fillStyle = e.elite ? "#ffd166" : base;
    c.fillRect(e.x - r, e.y - r - 9, r * 2 * (e.hp / e.max), 3);
  }
}

function muzzle(c: CanvasRenderingContext2D, x: number, y: number, k: number, col: string) {
  if (k <= 0) return;
  glow(c, x, y, 8 + 12 * k, col, 0.4 + 0.5 * k);
  c.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * k})`;
  c.beginPath();
  c.arc(x, y, 1.5 + 2.5 * k, 0, TAU);
  c.fill();
}

// ── Bosses ──────────────────────────────────────────────────────────────────

export function drawBoss(c: CanvasRenderingContext2D, e: Enemy, w: World, time: number) {
  const b = e.boss!;
  const s = b.spec;
  const hw = s.hw;
  const hh = s.hh;
  const hit = e.hit * 0.6;
  const acc = s.accent;
  c.save();
  if (e.cloak > 0) c.globalAlpha = Math.max(0.08, 1 - e.cloak);
  if (s.move === "serpent") {
    // Body from tail to head
    for (let i = b.segs.length - 1; i >= 0; i--) {
      const sg = b.segs[i];
      const rr = 20 - i * 0.6;
      c.save();
      c.translate(sg.x, sg.y);
      glow(c, 0, 0, rr * 2, s.color, 0.2);
      const g = c.createRadialGradient(-rr * 0.3, -rr * 0.3, rr * 0.1, 0, 0, rr);
      g.addColorStop(0, shade(s.color, 0.35 + hit * 0.5));
      g.addColorStop(1, shade(s.color, -0.45 + hit * 0.5));
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, rr, 0, TAU);
      c.fill();
      c.strokeStyle = shade(s.color, -0.6);
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = rgba(acc, 0.7);
      c.beginPath();
      c.arc(0, 0, rr * 0.35, 0, TAU);
      c.fill();
      c.restore();
    }
  }
  c.translate(e.x, e.y);
  glow(c, 0, 0, Math.max(hw, hh) * 2.2, s.color, 0.28 + 0.08 * b.phase);
  const g = c.createLinearGradient(0, -hh, 0, hh);
  g.addColorStop(0, shade(s.color, 0.3 + hit * 0.5));
  g.addColorStop(1, shade(s.color, -0.45 + hit * 0.5));
  c.fillStyle = g;
  c.strokeStyle = shade(s.color, -0.6);
  c.lineWidth = 2.5;
  switch (s.id) {
    case 0: {
      // Warden: armoured hexagon with two pods
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.ellipse(sx * hw * 0.85, hh * 0.15, hw * 0.28, hh * 0.55, 0, 0, TAU);
        c.fill();
        c.stroke();
      }
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        c.lineTo(Math.cos(a) * hw * 0.72, Math.sin(a) * hh * 1.05);
      }
      c.closePath();
      c.fill();
      c.stroke();
      eye(c, 0, 0, hh * 0.38, w, e, acc, time);
      break;
    }
    case 1: {
      // Crab: shell and two snapping claws
      const snap = 0.25 + 0.25 * Math.sin(time * 3);
      for (const sx of [-1, 1]) {
        c.save();
        c.translate(sx * hw * 0.78, hh * 0.35);
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(0, 0, hw * 0.24, hh * 0.45, sx * 0.3, 0, TAU);
        c.fill();
        c.stroke();
        for (const k of [-1, 1]) {
          c.save();
          c.rotate(sx * (0.2 + k * snap));
          c.beginPath();
          c.moveTo(0, hh * 0.3);
          c.quadraticCurveTo(k * hw * 0.2, hh * 0.9, 0, hh * 1.25);
          c.quadraticCurveTo(k * hw * 0.05, hh * 0.8, 0, hh * 0.3);
          c.fill();
          c.stroke();
          c.restore();
        }
        c.restore();
      }
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, 0, hw * 0.62, hh, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.25)";
      for (let i = 1; i <= 2; i++) {
        c.beginPath();
        c.ellipse(0, -hh * 0.1, hw * 0.62 * (i / 3), hh * (i / 3), 0, Math.PI * 1.1, Math.PI * 1.9);
        c.stroke();
      }
      for (const sx of [-1, 1]) eye(c, sx * hw * 0.2, -hh * 0.35, hh * 0.2, w, e, acc, time);
      break;
    }
    case 2: {
      // Nebula eye: petals and a tracking iris
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + time * 0.4;
        c.save();
        c.rotate(a);
        c.fillStyle = rgba(s.color, 0.55);
        c.beginPath();
        c.ellipse(hw * 0.95, 0, hw * 0.35, hh * 0.14, 0, 0, TAU);
        c.fill();
        c.restore();
      }
      const eg = c.createRadialGradient(-hw * 0.3, -hh * 0.3, 2, 0, 0, hw * 0.8);
      eg.addColorStop(0, "#ffffff");
      eg.addColorStop(1, "#e8c9f5");
      c.fillStyle = eg;
      c.beginPath();
      c.arc(0, 0, hw * 0.78, 0, TAU);
      c.fill();
      c.stroke();
      eye(c, 0, 0, hw * 0.42, w, e, s.color, time, true);
      break;
    }
    case 3: {
      // Hive queen: honeycomb body, beating wings
      const flap = Math.sin(time * 14) * 0.25;
      for (const sx of [-1, 1]) {
        c.save();
        c.scale(sx, 1);
        c.rotate(-0.3 + flap);
        c.fillStyle = "rgba(255,220,250,0.3)";
        c.beginPath();
        c.ellipse(hw * 0.75, -hh * 0.4, hw * 0.5, hh * 0.3, -0.4, 0, TAU);
        c.fill();
        c.restore();
      }
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, 0, hw * 0.7, hh, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.save();
      c.beginPath();
      c.ellipse(0, 0, hw * 0.7, hh, 0, 0, TAU);
      c.clip();
      c.strokeStyle = "rgba(255,255,255,0.22)";
      c.lineWidth = 1.5;
      const cs = 9;
      for (let yy = -hh; yy <= hh; yy += cs * 1.5) {
        for (let xx = -hw; xx <= hw; xx += cs * 1.73) {
          const ox = (Math.round(yy / (cs * 1.5)) % 2) * cs * 0.87;
          c.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            c.lineTo(xx + ox + Math.cos(a) * cs * 0.8, yy + Math.sin(a) * cs * 0.8);
          }
          c.closePath();
          c.stroke();
        }
      }
      c.restore();
      c.fillStyle = "#ffe6fa";
      c.beginPath();
      c.moveTo(-hw * 0.3, -hh * 0.9);
      for (let i = 0; i < 5; i++) c.lineTo(-hw * 0.3 + i * hw * 0.15 + hw * 0.075, -hh * (i % 2 ? 0.9 : 1.25));
      c.lineTo(hw * 0.3, -hh * 0.9);
      c.fill();
      for (const sx of [-1, 1]) eye(c, sx * hw * 0.22, -hh * 0.2, hh * 0.18, w, e, acc, time);
      break;
    }
    case 4: {
      // Spinning fortress: arms rotate with the attack spin
      c.save();
      c.rotate(b.spin + time * 0.3);
      for (let i = 0; i < 4; i++) {
        c.rotate(TAU / 4);
        c.fillStyle = g;
        roundRectPath(c, hw * 0.35, -hh * 0.16, hw * 0.75, hh * 0.32, 6);
        c.fill();
        c.stroke();
        c.fillStyle = rgba(acc, 0.9);
        c.beginPath();
        c.arc(hw * 1.02, 0, 4, 0, TAU);
        c.fill();
      }
      c.restore();
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, hw * 0.55, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = rgba(acc, 0.6);
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, hw * 0.42, time * 2, time * 2 + Math.PI * 1.4);
      c.stroke();
      eye(c, 0, 0, hw * 0.24, w, e, acc, time);
      break;
    }
    case 5: {
      // Serpent head
      const a = Math.atan2(e.y - (b.segs[0]?.y ?? e.y - 1), e.x - (b.segs[0]?.x ?? e.x));
      c.rotate(a - Math.PI / 2);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, hh * 1.3);
      c.quadraticCurveTo(hw * 1.2, hh * 0.4, hw * 0.8, -hh * 0.6);
      c.quadraticCurveTo(0, -hh * 1.1, -hw * 0.8, -hh * 0.6);
      c.quadraticCurveTo(-hw * 1.2, hh * 0.4, 0, hh * 1.3);
      c.fill();
      c.stroke();
      c.fillStyle = "#fff7c2";
      for (const sx of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx * hw * 0.3, hh * 0.9);
        c.lineTo(sx * hw * 0.15, hh * 1.45);
        c.lineTo(sx * hw * 0.05, hh * 0.95);
        c.fill();
      }
      for (const sx of [-1, 1]) {
        glow(c, sx * hw * 0.42, hh * 0.1, 10, acc, 0.8);
        c.fillStyle = "#1a2e05";
        c.beginPath();
        c.ellipse(sx * hw * 0.42, hh * 0.1, 3, 6, 0, 0, TAU);
        c.fill();
      }
      break;
    }
    case 6: {
      // Shadow queen: hood and trailing veil
      const vg = c.createLinearGradient(0, 0, 0, hh * 2.4);
      vg.addColorStop(0, rgba(s.color, 0.7));
      vg.addColorStop(1, rgba(s.color, 0));
      c.fillStyle = vg;
      c.beginPath();
      c.moveTo(-hw * 0.9, 0);
      for (let i = 0; i <= 6; i++) {
        const x = -hw * 0.9 + (i / 6) * hw * 1.8;
        c.lineTo(x, hh * (1.6 + 0.5 * Math.sin(time * 3 + i)));
      }
      c.lineTo(hw * 0.9, 0);
      c.fill();
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, -hh * 1.2);
      c.quadraticCurveTo(hw * 1.1, -hh * 0.6, hw * 0.85, hh * 0.6);
      c.lineTo(-hw * 0.85, hh * 0.6);
      c.quadraticCurveTo(-hw * 1.1, -hh * 0.6, 0, -hh * 1.2);
      c.fill();
      c.stroke();
      c.fillStyle = "#0b0f1a";
      c.beginPath();
      c.ellipse(0, 0, hw * 0.5, hh * 0.5, 0, 0, TAU);
      c.fill();
      for (const sx of [-1, 1]) {
        glow(c, sx * hw * 0.2, -hh * 0.05, 12, "#c7d2fe", 0.9);
        c.fillStyle = "#e0e7ff";
        c.beginPath();
        c.ellipse(sx * hw * 0.2, -hh * 0.05, 5, 2.5, sx * 0.3, 0, TAU);
        c.fill();
      }
      break;
    }
    default: {
      // Titan battleship
      c.beginPath();
      c.moveTo(-hw, -hh * 0.2);
      c.lineTo(-hw * 0.8, -hh * 0.8);
      c.lineTo(hw * 0.8, -hh * 0.8);
      c.lineTo(hw, -hh * 0.2);
      c.lineTo(hw * 0.7, hh * 0.7);
      c.lineTo(hw * 0.2, hh);
      c.lineTo(-hw * 0.2, hh);
      c.lineTo(-hw * 0.7, hh * 0.7);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "rgba(255,255,255,0.15)";
      c.fillRect(-hw * 0.7, -hh * 0.55, hw * 1.4, hh * 0.18);
      c.fillStyle = shade(s.color, -0.3);
      roundRectPath(c, -hw * 0.22, -hh * 1.15, hw * 0.44, hh * 0.6, 6);
      c.fill();
      c.stroke();
      for (let i = -2; i <= 2; i++) {
        c.fillStyle = Math.sin(time * 4 + i) > 0 ? "#fde68a" : "#334155";
        c.fillRect(i * hw * 0.08 - 3, -hh * 0.95, 6, 4);
      }
      for (const sx of [-1, 1]) {
        c.fillStyle = shade(s.color, -0.2);
        c.beginPath();
        c.arc(sx * hw * 0.62, hh * 0.35, hh * 0.3, 0, TAU);
        c.fill();
        c.stroke();
        c.fillStyle = shade(s.color, -0.5);
        c.fillRect(sx * hw * 0.62 - 3, hh * 0.35, 6, hh * 0.45);
      }
      eye(c, 0, hh * 0.15, hh * 0.3, w, e, acc, time);
    }
  }
  // Charge telegraph and phase-change shield
  if (e.charge > 0) {
    const k = e.charge;
    c.strokeStyle = rgba(acc, 0.3 + 0.6 * k);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, Math.max(hw, hh) * (1.5 - 0.4 * k), 0, TAU);
    c.stroke();
    glow(c, 0, hh * 0.4, 20 + 30 * k, acc, 0.3 + 0.5 * k);
  }
  if (e.inv > 0 && !b.entering) {
    c.strokeStyle = `rgba(255,255,255,${0.4 + 0.3 * Math.sin(time * 20)})`;
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(0, 0, hw * 1.25, hh * 1.4, 0, 0, TAU);
    c.stroke();
  }
  c.restore();
}

function eye(c: CanvasRenderingContext2D, x: number, y: number, r: number, w: World, e: Enemy, col: string, time: number, big = false) {
  const a = Math.atan2(w.py - (e.y + y), w.px - (e.x + x));
  glow(c, x, y, r * 2.2, col, 0.4 + 0.2 * Math.sin(time * 6));
  if (!big) {
    c.fillStyle = "#fff6d6";
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  const ix = x + Math.cos(a) * r * 0.35;
  const iy = y + Math.sin(a) * r * 0.35;
  c.fillStyle = col;
  c.beginPath();
  c.arc(ix, iy, r * 0.6, 0, TAU);
  c.fill();
  c.fillStyle = "#14051f";
  c.beginPath();
  c.arc(ix, iy, r * 0.3, 0, TAU);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.8)";
  c.beginPath();
  c.arc(ix - r * 0.15, iy - r * 0.15, r * 0.1, 0, TAU);
  c.fill();
}

// ── Bullets, lasers, marks, pickups ─────────────────────────────────────────

// Enemy shots are drawn from small cached sprites (halo, and body with rim and core), copied at
// whole device pixels: dozens of bullets cost a few cheap copies instead of four path fills each.
const bulletSprites = new Map<string, HTMLCanvasElement>();
function bulletSprite(key: string, R: number, draw: (c: CanvasRenderingContext2D) => void) {
  let s = bulletSprites.get(key);
  if (!s) {
    if (bulletSprites.size > 96) bulletSprites.clear();
    s = makeSprite(R * 2, R * 2, renderScale(), (c) => {
      c.translate(R, R);
      draw(c);
    });
    bulletSprites.set(key, s);
  }
  return s;
}
function blitBullet(c: CanvasRenderingContext2D, s: HTMLCanvasElement, x: number, y: number, R: number) {
  const k = renderScale();
  c.drawImage(s, Math.round((x - R) * k) / k, Math.round((y - R) * k) / k, s.width / k, s.height / k);
}

export function drawBullets(c: CanvasRenderingContext2D, bullets: Bullet[], flame: string) {
  c.save();
  const k = renderScale();
  // Enemy shots: dark rim + saturated body + white core, readable on every sky.
  for (const b of bullets) {
    if (!b.enemy) continue;
    const R = Math.ceil(b.r * 2 + 1);
    const spr = bulletSprite(`h|${b.color}|${b.r}|${k}`, R, (cc) => {
      cc.fillStyle = rgba(b.color, 0.28);
      cc.beginPath();
      cc.arc(0, 0, b.r * 2, 0, TAU);
      cc.fill();
    });
    blitBullet(c, spr, b.x, b.y, R);
  }
  for (const b of bullets) {
    if (!b.enemy) continue;
    const R = Math.ceil(b.r + 3);
    const spr = bulletSprite(`b|${b.color}|${b.r}|${b.kind === "big"}|${k}`, R, (cc) => {
      cc.fillStyle = b.color;
      cc.strokeStyle = "rgba(20,6,30,0.85)";
      cc.lineWidth = 1.5;
      cc.beginPath();
      cc.arc(0, 0, b.r + 0.8, 0, TAU);
      cc.fill();
      cc.stroke();
      cc.fillStyle = "#ffffff";
      cc.beginPath();
      cc.arc(0, 0, b.r * (b.kind === "big" ? 0.5 : 0.42), 0, TAU);
      cc.fill();
    });
    blitBullet(c, spr, b.x, b.y, R);
  }
  c.globalCompositeOperation = "lighter";
  for (const b of bullets) {
    if (b.enemy) continue;
    {
      const col = b.color === "drone" ? "#9ef0ff" : flame;
      c.strokeStyle = rgba(col, 0.35);
      c.lineWidth = b.r * 3;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      c.stroke();
      c.strokeStyle = "#ffffff";
      c.lineWidth = b.r * 1.1;
      c.stroke();
    }
  }
  c.restore();
}

export function drawLasers(c: CanvasRenderingContext2D, lasers: Laser[], h: number, time: number) {
  for (const l of lasers) {
    const bolt = !l.owner;
    c.save();
    if (l.warn > 0) {
      const k = 1 - l.warn / l.warnMax; // 0 → 1 as it is about to fire
      // Danger zone
      c.fillStyle = rgba(l.color, 0.06 + 0.12 * k);
      c.fillRect(l.x - l.w / 2, l.y, l.w, h - l.y);
      const blink = Math.sin(time * (14 + 20 * k)) > -0.2;
      c.strokeStyle = rgba(l.color, blink ? 0.5 + 0.4 * k : 0.25);
      c.lineWidth = 1.5;
      c.setLineDash(bolt ? [8, 6] : []);
      c.beginPath();
      c.moveTo(l.x - l.w / 2, l.y);
      c.lineTo(l.x - l.w / 2, h);
      c.moveTo(l.x + l.w / 2, l.y);
      c.lineTo(l.x + l.w / 2, h);
      c.stroke();
      c.setLineDash([]);
      c.strokeStyle = rgba(l.color, 0.4 + 0.5 * k);
      c.lineWidth = 1 + 2 * k;
      c.beginPath();
      c.moveTo(l.x, l.y);
      c.lineTo(l.x, h);
      c.stroke();
      if (bolt) {
        // warning sign at the top
        c.fillStyle = rgba(l.color, blink ? 0.95 : 0.5);
        c.beginPath();
        c.moveTo(l.x, 6);
        c.lineTo(l.x + 11, 26);
        c.lineTo(l.x - 11, 26);
        c.closePath();
        c.fill();
        c.fillStyle = "#04121a";
        c.font = `900 13px ${FONT_DISPLAY}`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("!", l.x, 19);
      }
    } else {
      c.globalCompositeOperation = "lighter";
      const k = clamp(l.dur / 0.2, 0, 1);
      if (bolt) {
        const rr = rng(Math.floor(time * 30));
        for (let n = 0; n < 2; n++) {
          c.strokeStyle = n ? "rgba(255,255,255,0.95)" : rgba(l.color, 0.7);
          c.lineWidth = n ? 3 : 12;
          c.beginPath();
          let xx = l.x;
          c.moveTo(xx, 0);
          for (let y = 0; y < h; y += 26) {
            xx = l.x + (rr() - 0.5) * l.w * 0.7;
            c.lineTo(xx, y + 26);
          }
          c.stroke();
        }
        glow(c, l.x, h * 0.5, l.w * 2, l.color, 0.25 * k);
      } else {
        const lg = c.createLinearGradient(l.x - l.w, 0, l.x + l.w, 0);
        lg.addColorStop(0, rgba(l.color, 0));
        lg.addColorStop(0.5, rgba(l.color, 0.75 * k));
        lg.addColorStop(1, rgba(l.color, 0));
        c.fillStyle = lg;
        c.fillRect(l.x - l.w, l.y, l.w * 2, h - l.y);
        c.fillStyle = `rgba(255,255,255,${0.9 * k})`;
        c.fillRect(l.x - l.w * 0.22, l.y, l.w * 0.44, h - l.y);
        glow(c, l.x, l.y, l.w * 1.6, l.color, 0.8 * k);
      }
    }
    c.restore();
  }
}

export function drawMarks(c: CanvasRenderingContext2D, marks: Mark[], w: number, h: number, time: number) {
  for (const m of marks) {
    const k = clamp(m.t / m.dur, 0, 1);
    const blink = Math.sin(time * (12 + 18 * k)) > 0;
    c.save();
    if (m.kind === "meteor") {
      c.fillStyle = `rgba(255,120,50,${0.05 + 0.12 * k})`;
      c.fillRect(m.x - 18, 0, 36, h);
      c.fillStyle = blink ? "#ffb35a" : "#ff6a3d";
      c.beginPath();
      c.moveTo(m.x, 6);
      c.lineTo(m.x + 13, 30);
      c.lineTo(m.x - 13, 30);
      c.closePath();
      c.fill();
      c.fillStyle = "#2a0a04";
      c.font = `900 15px ${FONT_DISPLAY}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("!", m.x, 22);
    } else if (m.kind === "wall") {
      const y = m.owner ? m.owner.y + m.owner.r : m.y;
      c.strokeStyle = `rgba(255,180,70,${0.35 + 0.4 * k})`;
      c.lineWidth = 3;
      c.setLineDash([6, 6]);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(m.gap - m.gw / 2, y);
      c.moveTo(m.gap + m.gw / 2, y);
      c.lineTo(w, y);
      c.stroke();
      c.setLineDash([]);
      // The safe gap glows green all the way down, so the player can line up early.
      const gg = c.createLinearGradient(0, y, 0, h);
      gg.addColorStop(0, `rgba(110,255,170,${0.25 + 0.2 * k})`);
      gg.addColorStop(1, "rgba(110,255,170,0)");
      c.fillStyle = gg;
      c.fillRect(m.gap - m.gw / 2 + 6, y, m.gw - 12, h - y);
      c.strokeStyle = `rgba(140,255,190,${blink ? 0.9 : 0.5})`;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(m.gap - m.gw / 2 + 4, y - 8);
      c.lineTo(m.gap - m.gw / 2 + 4, y + 8);
      c.moveTo(m.gap + m.gw / 2 - 4, y - 8);
      c.lineTo(m.gap + m.gw / 2 - 4, y + 8);
      c.stroke();
    } else {
      c.strokeStyle = `rgba(200,210,255,${0.3 + 0.5 * k})`;
      c.lineWidth = 2;
      c.setLineDash([5, 5]);
      c.lineDashOffset = time * 30;
      c.beginPath();
      c.arc(m.x, m.y, 50 * (1.4 - 0.6 * k), 0, TAU);
      c.stroke();
      c.setLineDash([]);
      glow(c, m.x, m.y, 40, "#c7d2fe", 0.3 * k);
    }
    c.restore();
  }
}

export const PICKUP_COLOR: Record<string, string> = { spread: "#9ef0ff", shield: "#a5f3fc", heal: "#86efac", nova: "#ffd36e" };

export function drawPickup(c: CanvasRenderingContext2D, d: Drop, time: number) {
  const col = PICKUP_COLOR[d.kind] || "#ffffff";
  const bob = Math.sin(d.t * 5) * 2;
  c.save();
  c.translate(d.x, d.y + bob);
  glow(c, 0, 0, 28, col, 0.6);
  const g = c.createRadialGradient(-4, -4, 1, 0, 0, 12);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, col);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 12, 0, TAU);
  c.fill();
  c.strokeStyle = rgba(col, 0.9);
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(0, 0, 15 + Math.sin(time * 6) * 1.5, 0, TAU);
  c.stroke();
  c.strokeStyle = "#0b1027";
  c.fillStyle = "#0b1027";
  c.lineWidth = 2.2;
  c.lineCap = "round";
  c.beginPath();
  if (d.kind === "spread") {
    for (const a of [-0.5, 0, 0.5]) {
      c.moveTo(0, 5);
      c.lineTo(Math.sin(a) * 8, 5 - Math.cos(a) * 11);
    }
    c.stroke();
  } else if (d.kind === "shield") {
    c.arc(0, 0, 6, 0, TAU);
    c.stroke();
  } else if (d.kind === "heal") {
    c.moveTo(-6, 0);
    c.lineTo(6, 0);
    c.moveTo(0, -6);
    c.lineTo(0, 6);
    c.stroke();
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.lineTo(Math.cos(a) * (i % 2 ? 3 : 8), Math.sin(a) * (i % 2 ? 3 : 8));
    }
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** A map node on the star chart: a small planet in the map's colours. */
export function drawMapPlanet(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: Theme, locked: boolean, time: number, seed: number) {
  const light = locked ? "#5b6178" : shade(t.color, 0.45);
  const dark = locked ? "#1b1e2c" : shade(t.neb[0], -0.55);
  if (!locked) glow(c, x, y, r * 2.2, t.color, 0.35);
  const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.clip();
  const rr = rng(seed);
  c.fillStyle = locked ? "rgba(255,255,255,0.05)" : rgba(t.neb[1 % t.neb.length], 0.35);
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.ellipse(x + (rr() - 0.5) * r, y + (rr() - 0.5) * r * 1.2, r * (0.5 + rr() * 0.5), r * 0.14, 0.2, 0, TAU);
    c.fill();
  }
  c.restore();
  if (!locked && (t.feature === "ringed" || t.feature === "hole" || t.feature === "belt")) {
    c.strokeStyle = rgba(t.star, 0.55);
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(x, y, r * 1.6, r * 0.35, -0.3 + Math.sin(time * 0.5) * 0.03, 0, TAU);
    c.stroke();
  }
}
