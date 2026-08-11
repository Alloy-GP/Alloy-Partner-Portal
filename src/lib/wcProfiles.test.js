import { describe, it, expect } from 'vitest';
import { parseProfileIds, wcProfileLabel, hasProfileName, profileList } from './wcProfiles.js';

const NAMES = { 116235: 'CMGT', 115145: 'CMGT Landing' };

describe('parseProfileIds', () => {
  it('splits the comma-separated column', () => {
    expect(parseProfileIds('116235,115145,117049')).toEqual(['116235', '115145', '117049']);
  });
  it('tolerates spaces, newlines and stray separators', () => {
    expect(parseProfileIds(' 116235 , 115145 ,, ')).toEqual(['116235', '115145']);
    expect(parseProfileIds('116235\n115145')).toEqual(['116235', '115145']);
  });
  it('is empty for empty/nullish', () => {
    for (const v of ['', '   ', null, undefined]) expect(parseProfileIds(v)).toEqual([]);
  });
});

describe('wcProfileLabel', () => {
  it('resolves a known id to its name', () => {
    expect(wcProfileLabel('116235', NAMES)).toBe('CMGT');
    expect(wcProfileLabel('115145', NAMES)).toBe('CMGT Landing');
  });
  it('accepts numeric ids too (layers disagree on type)', () => {
    expect(wcProfileLabel(115145, NAMES)).toBe('CMGT Landing');
  });
  it('falls back to the raw id when unnamed — never blank', () => {
    expect(wcProfileLabel('117049', NAMES)).toBe('117049');
    expect(wcProfileLabel('117049', {})).toBe('117049');
    expect(wcProfileLabel('117049', null)).toBe('117049');
  });
  it('is empty only when there is no id', () => {
    expect(wcProfileLabel('', NAMES)).toBe('');
    expect(wcProfileLabel(null, NAMES)).toBe('');
  });
  it('treats a blank name as unnamed', () => {
    expect(wcProfileLabel('999', { 999: '   ' })).toBe('999');
  });
});

describe('hasProfileName', () => {
  it('distinguishes named from id-echo', () => {
    expect(hasProfileName('116235', NAMES)).toBe(true);
    expect(hasProfileName('117049', NAMES)).toBe(false);
    expect(hasProfileName('', NAMES)).toBe(false);
    expect(hasProfileName('999', { 999: '  ' })).toBe(false);
  });
});

describe('profileList', () => {
  it('labels every configured profile and flags the unnamed one', () => {
    expect(profileList('116235,115145,117049', NAMES)).toEqual([
      { id: '116235', label: 'CMGT', named: true },
      { id: '115145', label: 'CMGT Landing', named: true },
      { id: '117049', label: '117049', named: false },
    ]);
  });
  it('is empty when nothing is configured', () => {
    expect(profileList('', NAMES)).toEqual([]);
    expect(profileList(null, NAMES)).toEqual([]);
  });
});
