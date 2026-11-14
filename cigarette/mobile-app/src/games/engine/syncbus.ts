// Tiny hook so the game code (wallet, best scores) can tell the cloud sync that something changed,
// without the games knowing anything about accounts or the network.

let hook: (() => void) | null = null;

export const syncBus = {
  set(fn: (() => void) | null) {
    hook = fn;
  },
  changed() {
    try {
      hook?.();
    } catch {
      /* sync must never break a game */
    }
  },
};
