import { describe, it, expect } from 'vitest';
import { goalsForTicketTags, currentQuarterLabel } from './goals.js';

describe('goalsForTicketTags', () => {
  it('matches a ticket tagged `goals`', () => {
    expect(goalsForTicketTags(['goals'])).toBe(true);
    expect(goalsForTicketTags(['newsletter', 'goals', 'video'])).toBe(true);
  });
  it('is false without the tag, or with no tags', () => {
    expect(goalsForTicketTags(['newsletter'])).toBe(false);
    expect(goalsForTicketTags([])).toBe(false);
    expect(goalsForTicketTags(null)).toBe(false);
    expect(goalsForTicketTags(undefined)).toBe(false);
  });
});

describe('currentQuarterLabel', () => {
  it('labels the calendar quarter of the given date', () => {
    expect(currentQuarterLabel(new Date('2026-01-15T00:00:00'))).toBe('Q1 2026');
    expect(currentQuarterLabel(new Date('2026-04-01T00:00:00'))).toBe('Q2 2026');
    expect(currentQuarterLabel(new Date('2026-08-06T00:00:00'))).toBe('Q3 2026');
    expect(currentQuarterLabel(new Date('2026-12-31T00:00:00'))).toBe('Q4 2026');
  });
});
