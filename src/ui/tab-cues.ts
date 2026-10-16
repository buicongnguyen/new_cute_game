// Ported from cute_game/src/tab-cues.ts; observers belong to the panel render.
export function tabCues(root: HTMLElement): () => void {
  const cleanups: (() => void)[] = [];
  for (const strip of root.querySelectorAll<HTMLElement>('.tabs')) {
    const sync = () => { const max = strip.scrollWidth - strip.clientWidth; strip.classList.toggle('more-l', strip.scrollLeft > 3); strip.classList.toggle('more-r', max > 3 && strip.scrollLeft < max - 3); };
    const active = strip.querySelector<HTMLElement>('.on, [aria-selected="true"]');
    if (active) strip.scrollLeft = Math.max(0, active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2);
    strip.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync); observer.observe(strip); sync();
    cleanups.push(() => { observer.disconnect(); strip.removeEventListener('scroll', sync); });
  }
  return () => cleanups.forEach(fn => fn());
}
