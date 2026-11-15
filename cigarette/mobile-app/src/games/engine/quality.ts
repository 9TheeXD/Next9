// Render quality shared by the runtime and the games.
//
// Phones redraw the whole canvas every frame, so the cost is mostly pixels: a 3x screen has 9 times
// the pixels of a 1x one. The runtime starts at a sharp resolution and lowers it while frames come
// in late (older phones), then raises it again if there is room. Games build their cached sprites
// at renderScale() so they match the canvas, and can skip optional effects when lowPower() is true.

let scale = 1;
let low = false;

/** Pixels per CSS pixel the canvas currently uses. Use it for makeSprite() caches. */
export function renderScale(): number {
  return scale;
}

/** True when the device struggled: skip optional effects (extra particles, weather, glow). */
export function lowPower(): boolean {
  return low;
}

export function setRenderQuality(s: number, isLow: boolean) {
  scale = s;
  low = isLow;
}

/** A guess before any frame was measured: few cores or little memory means an older phone. */
export function weakDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency || 8;
  const mem = (navigator as any).deviceMemory as number | undefined;
  return cores <= 4 || (mem !== undefined && mem <= 3);
}
