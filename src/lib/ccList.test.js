import { describe, it, expect } from 'vitest';
import { parseCcInput, isEmailish, CC_MAX } from './ccList.js';

describe('parseCcInput', () => {
  it('is empty for empty/nullish input', () => {
    for (const raw of ['', '   ', null, undefined]) {
      const r = parseCcInput(raw);
      expect(r.list).toEqual([]);
      expect(r.invalid).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });

  it('splits on commas, semicolons, spaces and newlines', () => {
    const r = parseCcInput('a@x.com, b@x.com; c@x.com\nd@x.com e@x.com');
    expect(r.list).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com']);
    expect(r.ok).toBe(true);
  });

  it('tolerates trailing separators mid-typing', () => {
    expect(parseCcInput('a@x.com, ').list).toEqual(['a@x.com']);
    expect(parseCcInput('a@x.com, ').ok).toBe(true);
  });

  it('collects malformed entries and blocks the send', () => {
    const r = parseCcInput('good@x.com, nope, bad@');
    expect(r.list).toEqual(['good@x.com']);
    expect(r.invalid).toEqual(['nope', 'bad@']);
    expect(r.ok).toBe(false);
  });

  it('de-dupes case-insensitively, keeping the first spelling and order', () => {
    const r = parseCcInput('B@Y.com, a@x.com, b@y.com');
    expect(r.list).toEqual(['B@Y.com', 'a@x.com']);
    expect(r.dupes).toEqual(['b@y.com']);
    expect(r.ok).toBe(true); // a duplicate is not a typo — don't block on it
  });

  it('flags overflow past the server cap without dropping entries', () => {
    const many = Array.from({ length: CC_MAX + 3 }, (_, i) => `u${i}@x.com`).join(', ');
    const r = parseCcInput(many);
    expect(r.list).toHaveLength(CC_MAX + 3);
    expect(r.overflow).toBe(true);
    expect(parseCcInput('a@x.com').overflow).toBe(false);
  });
});

describe('isEmailish', () => {
  it('accepts ordinary addresses', () => {
    for (const e of ['a@b.co', 'first.last+tag@sub.domain.org', 'TREASURER@OakGrove.ORG']) {
      expect(isEmailish(e)).toBe(true);
    }
  });
  it('rejects non-addresses', () => {
    for (const e of ['', '   ', 'nope', 'a@b', 'a@@b.co', 'a b@c.co', '@b.co', 'a@.co', null]) {
      expect(isEmailish(e)).toBe(false);
    }
  });
});
