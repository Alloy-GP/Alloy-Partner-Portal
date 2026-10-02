import { describe, it, expect } from 'vitest';
import { parseDocSlug, passwordStorageKey, viewerKey, unlockErrorMessage } from './hostedDoc.js';

describe('parseDocSlug', () => {
  it('matches /p/<slug> and lowercases it', () => {
    expect(parseDocSlug('/p/cmgt-2026-03')).toBe('cmgt-2026-03');
    expect(parseDocSlug('/p/CMGT-2026-03/')).toBe('cmgt-2026-03');
  });
  it('rejects everything that is not a hosted doc path', () => {
    expect(parseDocSlug('/')).toBeNull();
    expect(parseDocSlug('/p')).toBeNull();
    expect(parseDocSlug('/p/')).toBeNull();
    expect(parseDocSlug('/p/a')).toBeNull();                 // too short
    expect(parseDocSlug('/p/-leading-hyphen')).toBeNull();
    expect(parseDocSlug('/p/has space')).toBeNull();
    expect(parseDocSlug('/p/x/y')).toBeNull();               // nested
    expect(parseDocSlug('/proposals/board/abc')).toBeNull(); // existing public route
    expect(parseDocSlug('/goals')).toBeNull();
    expect(parseDocSlug(null)).toBeNull();
  });
});

describe('passwordStorageKey', () => {
  it('is namespaced per slug', () => {
    expect(passwordStorageKey('a')).not.toBe(passwordStorageKey('b'));
    expect(passwordStorageKey('cmgt')).toContain('cmgt');
  });
});

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('viewerKey', () => {
  it('creates a key once and reuses it on the same device', () => {
    const s = fakeStorage();
    const first = viewerKey(s, () => 0.123456789, () => 1700000000000);
    expect(first.startsWith('v-')).toBe(true);
    expect(viewerKey(s, () => 0.9, () => 1)).toBe(first); // stored → stable
  });
  it('falls back to anon when storage throws (private mode)', () => {
    const broken = { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); } };
    expect(viewerKey(broken)).toBe('anon');
  });
});

describe('unlockErrorMessage', () => {
  it('maps each edge-fn error code to reader copy', () => {
    expect(unlockErrorMessage('wrong_password')).toMatch(/password/i);
    expect(unlockErrorMessage('not_found')).toMatch(/link/i);
    expect(unlockErrorMessage('expired')).toMatch(/no longer/i);
    expect(unlockErrorMessage('lookup_failed')).toMatch(/try again/i);
    expect(unlockErrorMessage(undefined)).toMatch(/try again/i);
  });
});
