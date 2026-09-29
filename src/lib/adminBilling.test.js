import { describe, it, expect } from 'vitest';
import { firstOfNextMonth, validateAutopayForm, ordinal, fmtMoney } from './adminBilling.js';

describe('firstOfNextMonth', () => {
  it('rolls to the 1st of the following month, including across a year end', () => {
    expect(firstOfNextMonth(new Date('2026-09-29T20:00:00Z'))).toBe('2026-10-01');
    expect(firstOfNextMonth(new Date('2026-12-31T23:59:00Z'))).toBe('2027-01-01');
    expect(firstOfNextMonth(new Date('2026-10-01T00:00:00Z'))).toBe('2026-11-01');
  });
});

describe('validateAutopayForm', () => {
  const now = new Date('2026-09-29T20:00:00Z');
  const good = { amount: '4250', itemId: '12', dayOfMonth: 1, startDate: '2026-10-01' };
  it('passes a complete form', () => {
    expect(validateAutopayForm(good, now)).toEqual({ ok: true, errors: {} });
  });
  it('requires amount and item', () => {
    const r = validateAutopayForm({ ...good, amount: '0', itemId: '' }, now);
    expect(Object.keys(r.errors).sort()).toEqual(['amount', 'itemId']);
  });
  it('keeps the day inside 1–28', () => {
    expect(validateAutopayForm({ ...good, dayOfMonth: 29 }, now).errors.dayOfMonth).toBeTruthy();
    expect(validateAutopayForm({ ...good, dayOfMonth: 0 }, now).errors.dayOfMonth).toBeTruthy();
    expect(validateAutopayForm({ ...good, dayOfMonth: 28 }, now).ok).toBe(true);
  });
  it('never lets the first draft land before the 1st of next month', () => {
    expect(validateAutopayForm({ ...good, startDate: '2026-09-30' }, now).errors.startDate).toMatch(/2026-10-01/);
    expect(validateAutopayForm({ ...good, startDate: '2026-11-15' }, now).ok).toBe(true);
    expect(validateAutopayForm({ ...good, startDate: '' }, now).ok).toBe(true); // blank = function default
  });
});

describe('formatting', () => {
  it('ordinal + money', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 28].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '28th']);
    expect(fmtMoney(8856)).toBe('$8,856.00');
  });
});
