import { describe, it, expect } from 'vitest';
import { selectIntakeBatch, isHoaIntake } from './intakeDrain.js';

const hoa = (id) => ({ id, fields: [{ name: 'Biggest frustrations', value: 'x' }] });
const other = (id) => ({ id, fields: [{ name: 'How did you hear about us?', value: 'x' }] });

describe('isHoaIntake', () => {
  it('matches the intake questions by field name', () => {
    expect(isHoaIntake(hoa('a'))).toBe(true);
    expect(isHoaIntake({ fields: [{ name: 'Association name' }] })).toBe(true);
    expect(isHoaIntake({ fields: [{ name: 'Number of units' }] })).toBe(true);
    expect(isHoaIntake({ fields: [{ name: 'Community type' }] })).toBe(true);
  });

  it('ignores non-intake forms and malformed rows', () => {
    expect(isHoaIntake(other('a'))).toBe(false);
    expect(isHoaIntake({ fields: [] })).toBe(false);
    expect(isHoaIntake({})).toBe(false);
    expect(isHoaIntake(null)).toBe(false);
    expect(isHoaIntake({ fields: [{ value: 'no name key' }] })).toBe(false);
  });
});

describe('selectIntakeBatch', () => {
  it('mints only un-minted HOA intake', () => {
    const { batch, remaining } = selectIntakeBatch({
      leads: [hoa('a'), other('b'), hoa('c')],
      existingIds: ['c'],
    });
    expect(batch.map((l) => l.id)).toEqual(['a']);
    expect(remaining).toBe(0);
  });

  it('caps the pass and reports the leftovers rather than dropping them', () => {
    const leads = Array.from({ length: 40 }, (_, i) => hoa(`l${i}`));
    const { batch, remaining } = selectIntakeBatch({ leads, cap: 25 });
    expect(batch).toHaveLength(25);
    expect(remaining).toBe(15);
    expect(batch.length + remaining).toBe(40); // nothing vanishes
  });

  it('preserves input order so a capped pass takes the newest', () => {
    // Caller passes created_at DESC; the newest must be minted first.
    const leads = [hoa('newest'), hoa('mid'), hoa('oldest')];
    const { batch } = selectIntakeBatch({ leads, cap: 2 });
    expect(batch.map((l) => l.id)).toEqual(['newest', 'mid']);
  });

  it('de-dupes repeated ids inside the fetched window', () => {
    const { batch, remaining } = selectIntakeBatch({ leads: [hoa('a'), hoa('a'), hoa('b')] });
    expect(batch.map((l) => l.id)).toEqual(['a', 'b']);
    expect(remaining).toBe(0);
  });

  it('accepts a Set of existing ids as well as an array', () => {
    const { batch } = selectIntakeBatch({ leads: [hoa('a'), hoa('b')], existingIds: new Set(['a']) });
    expect(batch.map((l) => l.id)).toEqual(['b']);
  });

  it('is empty and stable on empty / missing input', () => {
    expect(selectIntakeBatch()).toEqual({ batch: [], remaining: 0 });
    expect(selectIntakeBatch({ leads: [] })).toEqual({ batch: [], remaining: 0 });
    expect(selectIntakeBatch({ leads: [null, {}, { id: null }] })).toEqual({ batch: [], remaining: 0 });
  });

  it('mints nothing when everything is already in the pipeline (the steady state)', () => {
    const leads = [hoa('a'), hoa('b')];
    const { batch, remaining } = selectIntakeBatch({ leads, existingIds: ['a', 'b'] });
    expect(batch).toEqual([]);
    expect(remaining).toBe(0);
  });

  it('treats cap 0 as "mint nothing, everything remains"', () => {
    const { batch, remaining } = selectIntakeBatch({ leads: [hoa('a'), hoa('b')], cap: 0 });
    expect(batch).toEqual([]);
    expect(remaining).toBe(2);
  });
});
