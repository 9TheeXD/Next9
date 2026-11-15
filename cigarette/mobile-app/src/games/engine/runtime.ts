// Mounts a game into a DOM element: canvas sizing at device resolution, the frame loop, pointer and
// keyboard input, pausing when the page is hidden, and sound unlocking on the first tap.

import { Sfx } from "./audio";
import { syncBus } from "./syncbus";
import type { GameDefinition, GameEvent, GameInstance, PointerInfo } from "./types";

export interface GameHandle {
  pause(): void;
  resume(): void;
  setMuted(muted: boolean): void;
  readonly paused: boolean;
  destroy(): void;
}

export interface MountOptions {
  onEvent?: (e: GameEvent) => void;
  /** Called when the game pauses itself because the page was hidden. */
  onAutoPause?: () => void;
  muted?: boolean;
}

export const STORE_PREFIX = "nb_game_";

export function mountGame(def: GameDefinition, host: HTMLElement, opts: MountOptions = {}): GameHandle {
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  canvas.style.userSelect = "none";
  (canvas.style as any).webkitUserSelect = "none";
  (canvas.style as any).webkitTapHighlightColor = "transparent";
  canvas.setAttribute("aria-label", def.title);
  canvas.setAttribute("role", "img");
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.appendChild(canvas);

  const ctx = canvas.getContext("2d", { alpha: false })!;
  const sfx = new Sfx();
  sfx.setMuted(!!opts.muted);
  const reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Countdown overlay ("3, 2, 1, เริ่ม!"): while it runs the game is drawn but not updated.
  let cdLeft = 0;
  let cdLabel = "";
  let cdLastShown = -1;
  let live = false; // between a "start" and an "end" event
  function countdown(seconds = 3, label = "เตรียมตัว") {
    if (reducedMotion) seconds = Math.min(seconds, 2);
    cdLeft = Math.max(0.5, seconds) + 0.55; // the extra part shows "เริ่ม!"
    cdLabel = label;
    cdLastShown = -1;
  }

  const game: GameInstance = def.create({
    canvas,
    ctx,
    sfx,
    reducedMotion,
    countdown,
    counting: () => cdLeft > 0,
    emit: (e) => {
      if (e.type === "start") {
        live = true;
        if (def.countdown) countdown();
      } else if (e.type === "end") {
        live = false;
        cdLeft = 0;
      }
      opts.onEvent?.(e);
    },
    store: {
      get: (k) => {
        try {
          return localStorage.getItem(STORE_PREFIX + def.id + "_" + k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          localStorage.setItem(STORE_PREFIX + def.id + "_" + k, v);
          syncBus.changed();
        } catch {
          /* storage full or blocked */
        }
      },
    },
  });

  let width = 0;
  let height = 0;
  let dpr = 1;
  function resize() {
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const d = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w === width && h === height && d === dpr) return;
    width = w;
    height = h;
    dpr = d;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    game.resize(w, h);
    game.render();
  }
  resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(host);
  window.addEventListener("resize", resize);

  let paused = false;
  let raf = 0;
  let last = performance.now();
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (paused) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cdLeft > 0) {
      cdLeft = Math.max(0, cdLeft - dt);
      game.render();
      drawCountdown();
      return;
    }
    game.update(dt);
    game.render();
  }

  function drawCountdown() {
    const n = Math.ceil(cdLeft - 0.55); // 3, 2, 1, then 0 = "เริ่ม!"
    if (n !== cdLastShown) {
      cdLastShown = n;
      if (n > 0) sfx.tone({ freq: 520, dur: 0.12, vol: 0.14, type: "sine" });
      else sfx.tone({ freq: 880, dur: 0.25, vol: 0.18, type: "triangle" });
    }
    const frac = n > 0 ? cdLeft - 0.55 - (n - 1) : cdLeft / 0.55; // 1 → 0 within the current number
    const w = width;
    const h = height;
    const c = ctx;
    c.save();
    c.fillStyle = `rgba(6, 10, 24, ${n > 0 ? 0.45 : 0.45 * frac})`;
    c.fillRect(0, 0, w, h);
    const k = reducedMotion ? 1 : 1 + 0.35 * Math.max(0, frac - 0.6) / 0.4;
    const alpha = Math.min(1, frac * 3);
    c.globalAlpha = alpha;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const size = Math.min(w, h) * (n > 0 ? 0.32 : 0.16) * k;
    c.font = `800 ${Math.round(size)}px "NBPrompt", "Prompt", "Kanit", sans-serif`;
    c.lineWidth = Math.max(4, size * 0.07);
    c.strokeStyle = "rgba(0,0,0,0.35)";
    const text = n > 0 ? String(n) : "เริ่ม!";
    c.strokeText(text, w / 2, h / 2);
    c.fillStyle = n > 0 ? "#ffffff" : "#7cf5c4";
    c.fillText(text, w / 2, h / 2);
    if (n > 0 && cdLabel) {
      c.globalAlpha = 0.9;
      c.font = `600 ${Math.round(Math.max(15, Math.min(w, h) * 0.05))}px "NBPrompt", "Prompt", sans-serif`;
      c.fillStyle = "#e2e8f0";
      c.fillText(cdLabel, w / 2, h / 2 - Math.min(w, h) * 0.31);
    }
    // ring that empties once per number
    if (n > 0) {
      const r = Math.min(w, h) * 0.22;
      c.globalAlpha = 0.85;
      c.lineWidth = 6;
      c.strokeStyle = "rgba(255,255,255,0.18)";
      c.beginPath();
      c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = "#7cf5c4";
      c.beginPath();
      c.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      c.stroke();
    }
    c.restore();
  }
  raf = requestAnimationFrame(frame);

  // Pointer input
  function toInfo(e: PointerEvent, type: PointerInfo["type"]): PointerInfo {
    const r = canvas.getBoundingClientRect();
    return { type, x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId, t: performance.now() };
  }
  const onDown = (e: PointerEvent) => {
    sfx.unlock();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    e.preventDefault();
    if (!paused && cdLeft <= 0) game.pointer(toInfo(e, "down"));
  };
  const onMove = (e: PointerEvent) => {
    if (!paused && cdLeft <= 0) game.pointer(toInfo(e, "move"));
  };
  const onUp = (e: PointerEvent) => {
    if (!paused) game.pointer(toInfo(e, "up"));
  };
  const onCancel = (e: PointerEvent) => {
    if (!paused) game.pointer(toInfo(e, "cancel"));
  };
  const noMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("contextmenu", noMenu);

  const onKey = (e: KeyboardEvent) => {
    if (paused || !game.key) return;
    if (cdLeft > 0 && e.type === "keydown") return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (e.type === "keydown") sfx.unlock();
    if (game.key(e.code, e.type === "keydown")) e.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);

  const onVisibility = () => {
    if (document.hidden && !paused) {
      handle.pause();
      opts.onAutoPause?.();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const handle: GameHandle = {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = performance.now();
      if (def.countdown && live) countdown(3, "เล่นต่อ");
    },
    setMuted(m: boolean) {
      sfx.setMuted(m);
    },
    get paused() {
      return paused;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("contextmenu", noMenu);
      game.destroy?.();
      sfx.destroy();
      canvas.remove();
    },
  };

  // Redraw once the Thai web fonts arrive, so the first frame is not drawn in a fallback font.
  const fonts = (document as any).fonts;
  if (fonts?.load) {
    // Load the Thai glyphs explicitly (a load without sample text fetches only the Latin part).
    const th = "ภาษาไทย";
    Promise.all(
      ['500 16px "NBPrompt"', '700 20px "NBPrompt"', '800 20px "NBPrompt"', '500 16px "NBSarabun"', '700 16px "NBSarabun"'].map(
        (f) => fonts.load(f, th).catch(() => [])
      )
    )
      .then(() => game.render())
      .catch(() => {});
  }

  return handle;
}
