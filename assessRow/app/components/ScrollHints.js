'use client';

// Rows that scroll sideways (chip rows, tab rows, wide tables) fade out at the edge that has more
// content, so it is visible that they scroll even when the last visible item happens to end exactly
// at the edge. Classes can-left / can-right are kept up to date on every such row on the page.

import { useEffect } from 'react';

export const SCROLLERS = '.v2-chips, .table-wrapper';

function update(el) {
  const max = el.scrollWidth - el.clientWidth;
  el.classList.toggle('can-left', max > 2 && el.scrollLeft > 2);
  el.classList.toggle('can-right', max > 2 && el.scrollLeft < max - 2);
}

export default function ScrollHints() {
  useEffect(() => {
    let queued = false;
    const all = () => {
      queued = false;
      document.querySelectorAll(SCROLLERS).forEach(update);
    };
    const queue = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(all);
      }
    };
    const onScroll = (e) => {
      if (e.target instanceof Element && e.target.matches(SCROLLERS)) update(e.target);
    };
    all();
    const mo = new MutationObserver(queue);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', queue);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      mo.disconnect();
      window.removeEventListener('resize', queue);
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, []);
  return null;
}
