import { describe, it, expect } from 'vitest';
import { parseLabelMap, formatLabelMap } from './leadFieldLabels.js';

describe('parseLabelMap', () => {
  it('parses one mapping per line, trimming both halves', () => {
    expect(parseLabelMap('e g Fawn Lake = Community name\ne g 240 = Number of homes')).toEqual({
      'e g Fawn Lake': 'Community name',
      'e g 240': 'Number of homes',
    });
  });

  it('splits on the FIRST "=" so a label containing "=" survives', () => {
    expect(parseLabelMap('a = b = c')).toEqual({ a: 'b = c' });
  });

  it('skips blank lines and lines missing either half', () => {
    expect(parseLabelMap('\n  \nno separator\n= orphan\nlonely =\nok = fine')).toEqual({ ok: 'fine' });
  });

  it('lets a later duplicate win', () => {
    expect(parseLabelMap('x = one\nx = two')).toEqual({ x: 'two' });
  });

  it('returns an empty map for nullish input', () => {
    expect(parseLabelMap(null)).toEqual({});
    expect(parseLabelMap(undefined)).toEqual({});
    expect(parseLabelMap('')).toEqual({});
  });
});

describe('formatLabelMap', () => {
  it('renders one "raw = corrected" line per entry', () => {
    expect(formatLabelMap({ 'e g 240': 'Number of homes' })).toBe('e g 240 = Number of homes');
  });

  it('drops entries with an empty half', () => {
    expect(formatLabelMap({ good: 'yes', bad: '', '': 'orphan' })).toBe('good = yes');
  });

  it('formats non-object input as empty rather than throwing', () => {
    expect(formatLabelMap(null)).toBe('');
    expect(formatLabelMap(['a'])).toBe('');
    expect(formatLabelMap('nope')).toBe('');
  });
});

describe('round trip', () => {
  it('survives parse -> format -> parse unchanged', () => {
    const map = { 'e g Fawn Lake': 'Community name', 'you@email com': 'Email', '(540) 000-0000': 'Phone' };
    expect(parseLabelMap(formatLabelMap(map))).toEqual(map);
  });
});
