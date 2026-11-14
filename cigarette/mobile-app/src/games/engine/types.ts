// Shared types for the games. Games are plain TypeScript on a Canvas 2D context: no React and no
// React Native inside, so they run the same in the app (web/PWA) and in a bare browser page.

import type { Sfx } from "./audio";

export interface PointerInfo {
  type: "down" | "move" | "up" | "cancel";
  /** CSS pixels from the canvas's top-left corner. */
  x: number;
  y: number;
  id: number;
  /** performance.now() in ms. */
  t: number;
}

export type GameEvent =
  | { type: "start" }
  | { type: "score"; score: number }
  | { type: "end"; score: number; best: number; summary: string; stats?: Record<string, number> };

export interface GameEnv {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sfx: Sfx;
  emit: (event: GameEvent) => void;
  /** True when the user asked the system for less motion. */
  reducedMotion: boolean;
  /** Small key-value store for best scores (localStorage, failures ignored). */
  store: {
    get: (key: string) => string | null;
    set: (key: string, value: string) => void;
  };
}

export interface GameInstance {
  /** Called on mount and whenever the canvas size changes. Sizes are CSS pixels. */
  resize(width: number, height: number): void;
  /** dt in seconds, capped by the runtime. */
  update(dt: number): void;
  render(): void;
  pointer(p: PointerInfo): void;
  /** Return true when the key was used, so the page does not scroll. */
  key?(code: string, down: boolean): boolean;
  destroy?(): void;
}

export type GameCategory = "puzzle" | "brain" | "action" | "calm";

export interface GameDefinition {
  id: string;
  title: string;
  /** One line under the title in the game list. */
  tagline: string;
  /** Why this game helps with a craving, in one or two sentences. */
  why: string;
  minutes: string;
  /** Shelf in the game list. */
  category: GameCategory;
  /** Two colours for the card art in the game list. */
  palette: [string, string];
  create(env: GameEnv): GameInstance;
}
