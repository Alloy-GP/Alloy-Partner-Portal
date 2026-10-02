import { describe, it, expect, vi } from 'vitest';
import { easeOutQuint, scrollDuration, animateScroll, scrollToElement } from './smoothScroll.js';

// A fake window + a hand-cranked clock/frame queue so the animation is deterministic.
function fakeWin({ scrollY = 0, scrollHeight = 6000, innerHeight = 900 } = {}) {
  const w = {
    scrollY, innerHeight,
    document: { documentElement: { scrollHeight } },
    scrollTo: vi.fn(({ top }) => { w.scrollY = top; }),
    listeners: {},
    addEventListener(e, fn) { w.listeners[e] = fn; },
    removeEventListener(e) { delete w.listeners[e]; },
    matchMedia: () => ({ matches: false }),
  };
  return w;
}
function clock() {
  let t = 0; const q = [];
  return {
    now: () => t,
    raf: (fn) => q.push(fn),
    // advance by `ms` and run one frame
    frame(ms) { t += ms; const fns = q.splice(0); fns.forEach((f) => f()); },
    pending: () => q.length,
  };
}

describe('easeOutQuint / scrollDuration', () => {
  it('starts at 0, ends at 1, is well past halfway at half time (soft landing)', () => {
    expect(easeOutQuint(0)).toBe(0); expect(easeOutQuint(1)).toBe(1);
    expect(easeOutQuint(0.5)).toBeGreaterThan(0.9);
    expect(easeOutQuint(0.9)).toBeLessThan(1); expect(easeOutQuint(2)).toBe(1); expect(easeOutQuint(-1)).toBe(0);
  });
  it('duration grows with distance within bounds', () => {
    expect(scrollDuration(0)).toBe(700);
    expect(scrollDuration(1000)).toBe(1020);
    expect(scrollDuration(50000)).toBe(1700);
    expect(scrollDuration(-1000)).toBe(1020);
  });
});

describe('animateScroll', () => {
  it('eases to the target over the duration, decelerating, and lands exactly', () => {
    const w = fakeWin(); const c = clock();
    animateScroll(2000, { win: w, duration: 1000, raf: c.raf, now: c.now });
    expect(c.pending()).toBe(1);
    const ys = [];
    for (let i = 0; i < 10; i++) { c.frame(100); ys.push(w.scrollY); }
    c.frame(100);
    expect(w.scrollY).toBe(2000);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]);   // monotonic
    const steps = ys.map((y, i) => y - (i ? ys[i - 1] : 0));
    expect(steps[0]).toBeGreaterThan(steps[steps.length - 1] * 5);                         // big first step, tiny last
    expect(ys[4]).toBeGreaterThan(1900);                                                   // most of the way by half time
    expect(c.pending()).toBe(0);
  });
  it('clamps to the document bottom and jumps instantly under reduced motion', () => {
    const w = fakeWin({ scrollHeight: 3000, innerHeight: 900 }); const c = clock();
    animateScroll(99999, { win: w, reduceMotion: true, raf: c.raf, now: c.now });
    expect(w.scrollTo).toHaveBeenCalledTimes(1);
    expect(w.scrollY).toBe(2100);
    expect(c.pending()).toBe(0);
  });
  it('stops when the reader scrolls on their own', () => {
    const w = fakeWin(); const c = clock();
    animateScroll(2000, { win: w, duration: 1000, raf: c.raf, now: c.now });
    c.frame(100);
    const mid = w.scrollY; expect(mid).toBeGreaterThan(0);
    w.listeners.wheel();                     // user input
    c.frame(100);
    expect(w.scrollY).toBe(mid);             // no further movement
    expect(Object.keys(w.listeners)).toEqual([]);
  });
  it('scrollToElement targets the element minus the sticky offset', () => {
    const w = fakeWin({ scrollY: 300 }); const c = clock();
    const el = { getBoundingClientRect: () => ({ top: 1000 }) };
    scrollToElement(el, { offset: 120, win: w, duration: 400, raf: c.raf, now: c.now });
    c.frame(400);
    expect(w.scrollY).toBe(1180);            // 300 + 1000 - 120
  });
  it('is a no-op without a window', () => {
    expect(typeof animateScroll(100, { win: null })).toBe('function');
  });
});
