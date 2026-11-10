// One IntersectionObserver shared by many elements, each with its own callback. Mounting a
// thousand tiles creates one observer, not a thousand.
export function sharedObserver(options: IntersectionObserverInit) {
  let io: IntersectionObserver | null = null;
  const callbacks = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>();
  return function observe(el: Element, cb: (entry: IntersectionObserverEntry) => void) {
    if (typeof IntersectionObserver === "undefined") return () => {};
    if (!io) io = new IntersectionObserver((entries) => entries.forEach((en) => callbacks.get(en.target)?.(en)), options);
    callbacks.set(el, cb);
    io.observe(el);
    return () => {
      io?.unobserve(el);
      callbacks.delete(el);
    };
  };
}
