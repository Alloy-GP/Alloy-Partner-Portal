import { describe, it, expect } from 'vitest';
import { selectIntakeBatch, isHoaIntake, isJunk, junkStatusForReason, clearsJunkFlag, nextLeadStatus, isJunkStatus, isDispositioned } from './intakeDrain.js';

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

describe('isJunk', () => {
  it('flags spam and duplicate, case-insensitively', () => {
    expect(isJunk({ leadStatus: 'spam' })).toBe(true);
    expect(isJunk({ leadStatus: 'Spam' })).toBe(true);
    expect(isJunk({ leadStatus: 'duplicate' })).toBe(true);
    expect(isJunk({ leadStatus: 'DUPLICATE' })).toBe(true);
  });
  it('leaves everything else alone', () => {
    for (const v of [null, undefined, '', 'unique', 'qualified', 'review']) {
      expect(isJunk({ leadStatus: v })).toBe(false);
    }
    expect(isJunk({})).toBe(false);
    expect(isJunk(null)).toBe(false);
  });
});

describe('selectIntakeBatch', () => {
  it('never mints a lead marked spam or duplicate', () => {
    const spam = { id: 'sp', leadStatus: 'spam', fields: [{ name: 'Biggest frustrations' }] };
    const dup = { id: 'dp', leadStatus: 'duplicate', fields: [{ name: 'Association name' }] };
    const good = hoa('ok');
    const { batch, remaining } = selectIntakeBatch({ leads: [spam, dup, good] });
    expect(batch.map((l) => l.id)).toEqual(['ok']);
    expect(remaining).toBe(0); // junk isn't "waiting", it's excluded
  });

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

  // The reason archiving is a soft-delete: the drain's only notion of "new" is
  // "no proposal row yet". Archived leads have no PIPELINE row, so their ids must
  // be passed in existingIds or every tick re-mints the spam (and re-pays for an
  // LLM match). Guarding it here because the failure is silent and recurring.
  it('never re-mints an archived lead', () => {
    const leads = [hoa('spam-1'), hoa('real-1'), hoa('spam-2')];
    const pipeline = ['real-1'];
    const archivedIds = ['spam-1', 'spam-2'];
    const { batch, remaining } = selectIntakeBatch({
      leads, existingIds: [...pipeline, ...archivedIds],
    });
    expect(batch).toEqual([]);
    expect(remaining).toBe(0);
  });

  it('still mints genuinely new leads alongside archived ones', () => {
    const { batch } = selectIntakeBatch({
      leads: [hoa('spam-1'), hoa('brand-new')],
      existingIds: ['spam-1'],
    });
    expect(batch.map((l) => l.id)).toEqual(['brand-new']);
  });

  it('archived leads do not consume the cap', () => {
    const leads = [...Array.from({ length: 10 }, (_, i) => hoa(`spam${i}`)),
                   ...Array.from({ length: 5 }, (_, i) => hoa(`new${i}`))];
    const { batch, remaining } = selectIntakeBatch({
      leads, existingIds: Array.from({ length: 10 }, (_, i) => `spam${i}`), cap: 3,
    });
    expect(batch.map((l) => l.id)).toEqual(['new0', 'new1', 'new2']);
    expect(remaining).toBe(2);
  });

  it('treats cap 0 as "mint nothing, everything remains"', () => {
    const { batch, remaining } = selectIntakeBatch({ leads: [hoa('a'), hoa('b')], cap: 0 });
    expect(batch).toEqual([]);
    expect(remaining).toBe(2);
  });
});

describe('junkStatusForReason — what a permanent delete must flag the lead as', () => {
  it('maps duplicate reasons to duplicate', () => {
    expect(junkStatusForReason('Duplicate of another lead')).toBe('duplicate');
    expect(junkStatusForReason('duplicate')).toBe('duplicate');
  });
  it('maps every other archive reason to spam', () => {
    for (const r of ['Spam / junk submission', 'Test submission', 'Wrong form / not an HOA', 'Other', '', undefined]) {
      expect(junkStatusForReason(r)).toBe('spam');
    }
  });
  // The whole point: whatever it returns must satisfy isJunk, or the drain
  // re-mints the row we just deleted.
  it('always returns a value the drain treats as junk', () => {
    for (const r of ['Duplicate of another lead', 'Test submission', 'Other', null]) {
      expect(isJunk({ leadStatus: junkStatusForReason(r) })).toBe(true);
    }
  });
});

describe('junk flags cannot be cleared from Partnership', () => {
  it('refuses to clear spam or duplicate', () => {
    for (const cur of ['spam', 'duplicate']) {
      for (const req of [null, undefined, '', 'notfit']) {
        expect(clearsJunkFlag(cur, req)).toBe(true);
        expect(nextLeadStatus(cur, req)).toBe(cur);   // the flag survives
      }
    }
  });
  it('allows swapping one junk flag for the other', () => {
    expect(clearsJunkFlag('spam', 'duplicate')).toBe(false);
    expect(nextLeadStatus('spam', 'duplicate')).toBe('duplicate');
    expect(nextLeadStatus('duplicate', 'spam')).toBe('spam');
  });
  it('leaves a non-junk lead completely alone', () => {
    expect(clearsJunkFlag(null, null)).toBe(false);
    expect(nextLeadStatus(null, null)).toBe(null);
    expect(nextLeadStatus('', 'spam')).toBe('spam');
    expect(nextLeadStatus(undefined, 'duplicate')).toBe('duplicate');
  });
  it('is case- and whitespace-insensitive about the current flag', () => {
    expect(clearsJunkFlag('SPAM', null)).toBe(true);
    expect(nextLeadStatus('Duplicate', null)).toBe('duplicate');
  });
  // The property that matters: whatever it returns for a junk lead still reads
  // as junk to the drain, so the deleted row cannot come back.
  it('never lets the drain see a previously-junk lead as mintable', () => {
    for (const cur of ['spam', 'duplicate']) {
      for (const req of [null, 'spam', 'duplicate', 'anything']) {
        expect(isJunk({ leadStatus: nextLeadStatus(cur, req) })).toBe(true);
      }
    }
  });
});

describe('a portal disposition is durable — worked leads never come back', () => {
  const hoa = { id: '1', fields: [{ name: 'Frustrations', value: 'x' }] };

  it('never re-mints a lead marked not a fit (quotable=no, no lead_status)', () => {
    // The gap this closes: "not a fit" sets quotable='no' and leaves lead_status
    // null, so isJunk() missed it and the drain offered the lead again.
    const lead = { ...hoa, quotable: 'no', leadStatus: null };
    expect(isDispositioned(lead)).toBe(true);
    expect(selectIntakeBatch({ leads: [lead] }).batch).toEqual([]);
  });

  it('never re-mints spam or duplicate', () => {
    for (const st of ['spam', 'duplicate']) {
      const lead = { ...hoa, quotable: 'no', leadStatus: st };
      expect(selectIntakeBatch({ leads: [lead] }).batch).toEqual([]);
    }
  });

  it('still mints leads nobody has judged yet', () => {
    for (const q of ['pending', 'not_set', '', null, undefined]) {
      const lead = { ...hoa, quotable: q, leadStatus: null };
      expect(isDispositioned(lead)).toBe(false);
      expect(selectIntakeBatch({ leads: [lead] }).batch).toHaveLength(1);
    }
  });

  it('still mints a QUALIFIED lead — that is the whole point', () => {
    const lead = { ...hoa, quotable: 'yes', leadStatus: null };
    expect(isDispositioned(lead)).toBe(false);
    expect(selectIntakeBatch({ leads: [lead] }).batch).toHaveLength(1);
  });

  it('is case-insensitive about quotable', () => {
    expect(isDispositioned({ quotable: 'NO' })).toBe(true);
  });
});
