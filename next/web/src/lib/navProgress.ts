// Navigation progress shared by every way of moving between app pages (links, router.push from code,
// tab bars): the top progress bar starts the moment a navigation begins, even when the next page still
// has to come from the server, and finishes when the new URL has rendered.
type State = "idle" | "loading" | "done";

let state: State = "idle";
let startedAt = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const navProgress = {
  get: () => state,
  startedAt: () => startedAt,
  start() {
    state = "loading";
    startedAt = Date.now();
    emit();
  },
  done() {
    if (state !== "loading") return;
    state = "done";
    emit();
  },
  reset() {
    state = "idle";
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
