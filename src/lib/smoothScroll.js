// ============================================================================
// Soft anchor scrolling for the proposal page. Native `scroll-behavior: smooth`
// uses a fixed browser curve; this eases out (fast start, long gentle landing),
// scales duration with distance, stops the moment the reader scrolls on their
// own, and jumps instantly under prefers-reduced-motion. Pure; tested in
// smoothScroll.test.js with an injected window / clock / frame scheduler.
// ============================================================================

// 1 - (1-t)^5: ~97% of the way at half time, then a long glide into place.
export const easeOutQuint = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, Number(t) || 0)), 5);

// Longer trips take longer, within bounds, so nothing whips past the reader.
export function scrollDuration(distance, { min = 700, max = 1700, perPx = 0.32 } = {}) {
  const d = Math.abs(Number(distance) || 0);
  return Math.round(Math.min(max, Math.max(min, min + d * perPx)));
}

// Animate the window to `targetY`. Returns a cancel function.
// opts: { win, duration, ease, raf, now, reduceMotion } — all injectable.
export function animateScroll(targetY, opts = {}) {
  const w = opts.win || (typeof window !== 'undefined' ? window : null);
  if (!w || typeof w.scrollTo !== 'function') return () => {};
  const reduce = opts.reduceMotion != null ? !!opts.reduceMotion
    : (typeof w.matchMedia === 'function' && !!w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const startY = Number(w.scrollY ?? w.pageYOffset) || 0;
  const docH = w.document && w.document.documentElement ? Number(w.document.documentElement.scrollHeight) : NaN;
  const maxY = Number.isFinite(docH) ? Math.max(0, docH - (Number(w.innerHeight) || 0)) : Infinity;
  const to = Math.max(0, Math.min(Number(targetY) || 0, maxY));
  const dist = to - startY;
  const scroll = (y) => w.scrollTo({ top: y, left: 0, behavior: 'auto' });
  if (reduce || Math.abs(dist) < 2) { scroll(to); return () => {}; }

  const duration = opts.duration || scrollDuration(dist);
  const ease = opts.ease || easeOutQuint;
  const raf = opts.raf || ((fn) => w.requestAnimationFrame(fn));
  const now = opts.now || (() => (w.performance && typeof w.performance.now === 'function' ? w.performance.now() : Date.now()));
  const inputs = ['wheel', 'touchstart', 'keydown'];
  let cancelled = false;
  const stopListening = () => inputs.forEach((e) => { try { w.removeEventListener(e, cancel); } catch { /* fake windows */ } });
  const cancel = () => { cancelled = true; stopListening(); };
  inputs.forEach((e) => { try { w.addEventListener(e, cancel, { passive: true }); } catch { /* fake windows */ } });

  const t0 = now();
  const tick = () => {
    if (cancelled) return;
    const p = Math.min(1, (now() - t0) / duration);
    scroll(startY + dist * ease(p));
    if (p < 1) raf(tick); else stopListening();
  };
  raf(tick);
  return cancel;
}

// Scroll so `el` sits `offset` px below the top (room for sticky bars).
export function scrollToElement(el, { offset = 0, ...opts } = {}) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return () => {};
  const w = opts.win || (typeof window !== 'undefined' ? window : null);
  if (!w) return () => {};
  const y = el.getBoundingClientRect().top + (Number(w.scrollY ?? w.pageYOffset) || 0) - offset;
  return animateScroll(y, { win: w, ...opts });
}
