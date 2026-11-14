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

  const game: GameInstance = def.create({
    canvas,
    ctx,
    sfx,
    reducedMotion,
    emit: (e) => opts.onEvent?.(e),
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
    game.update(dt);
    game.render();
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
    if (!paused) game.pointer(toInfo(e, "down"));
  };
  const onMove = (e: PointerEvent) => {
    if (!paused) game.pointer(toInfo(e, "move"));
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
    Promise.all([fonts.load('700 20px "Prompt"'), fonts.load('500 16px "Sarabun"')])
      .then(() => game.render())
      .catch(() => {});
  }

  return handle;
}
