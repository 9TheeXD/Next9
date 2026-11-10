// Smooth page scroll with our own easing, so it looks the same in every browser (some ignore
// `behavior: 'smooth'` or jump when the page height changes mid-scroll). A new call cancels the one in
// progress. Resolves when the scroll ends.
let running = 0;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function smoothScrollTo(top, duration = 420) {
  const id = ++running;
  const start = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const target = Math.max(0, Math.min(max, top));
  const dist = target - start;
  if (Math.abs(dist) < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo(0, target);
    return Promise.resolve();
  }
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      if (id !== running) return resolve();
      const t = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, start + dist * ease(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// Where the bottom of the stuck header ends up (site nav plus any sticky toolbar), so content can be
// scrolled to sit just below it. Uses each element's own `top`, so it is right even before a sticky
// toolbar has become stuck.
export function stickyBottom() {
  let bottom = 0;
  document.querySelectorAll('.nav, .v2-toolbar').forEach((el) => {
    const top = parseFloat(getComputedStyle(el).top) || 0;
    bottom = Math.max(bottom, top + el.offsetHeight);
  });
  return bottom;
}

// Scrolls so `el` starts just below the stuck header.
export function scrollBelowHeader(el, gap = 10) {
  if (!el) return Promise.resolve();
  return smoothScrollTo(window.scrollY + el.getBoundingClientRect().top - stickyBottom() - gap);
}
