import { describe, it, expect } from 'vitest';
import {
  MODULES, MODULE_BY_KEY, ENGINE_META, DEFAULT_MODULES,
  normalizeLocations, modulesFor, groupByEngine, deliverableLine, deliverableLines,
  scalesWithLocations, moduleEffort, totalEffort, effortByEngine, locationImpact, effortCurve,
} from './engagementCatalog.js';

describe('catalog integrity', () => {
  it('every module has a unique key, a known engine, copy, deliverables and effort', () => {
    const keys = new Set();
    for (const m of MODULES) {
      expect(keys.has(m.key)).toBe(false); keys.add(m.key);
      expect(ENGINE_META.some((e) => e.key === m.engine)).toBe(true);
      expect(m.name.length).toBeGreaterThan(2);
      expect(m.summary.length).toBeGreaterThan(10);
      expect(m.includes.length).toBeGreaterThan(0);
      expect(m.deliverables.length).toBeGreaterThan(0);
      for (const d of m.deliverables) {
        expect(['flat', 'location']).toContain(d.per);
        expect(d.qty).toBeGreaterThan(0);
        expect(d.unit.length).toBeGreaterThan(0);
      }
      expect(m.effort.flat + m.effort.perLocation).toBeGreaterThan(0);
    }
  });
  it('the default set only names real modules', () => {
    for (const k of DEFAULT_MODULES) expect(MODULE_BY_KEY[k]).toBeTruthy();
  });
});

describe('normalizeLocations', () => {
  it('floors to a whole number and never goes below 1', () => {
    expect(normalizeLocations(3.7)).toBe(3);
    expect(normalizeLocations(0)).toBe(1);
    expect(normalizeLocations(-2)).toBe(1);
    expect(normalizeLocations('4')).toBe(4);
    expect(normalizeLocations(undefined)).toBe(1);
    expect(normalizeLocations('abc')).toBe(1);
  });
});

describe('modulesFor / groupByEngine', () => {
  it('returns modules in catalog order regardless of key order, dropping unknowns', () => {
    const mods = modulesFor(['gbp', 'nope', 'foundation']);
    expect(mods.map((m) => m.key)).toEqual(['foundation', 'gbp']);
  });
  it('tolerates a missing or non-array input', () => {
    expect(modulesFor(null)).toEqual([]);
    expect(modulesFor('gbp')).toEqual([]);
  });
  it('groups by engine and skips empty engines', () => {
    const g = groupByEngine(['gbp', 'review-program']);
    expect(g.map((x) => x.engine.key)).toEqual(['reach', 'retain']);
    expect(g[0].modules[0].key).toBe('gbp');
  });
});

describe('deliverable lines scale with locations', () => {
  it('multiplies per-location lines and annotates the math', () => {
    const gbp = MODULE_BY_KEY['gbp'];
    expect(deliverableLine(gbp.deliverables[0], 3)).toBe('3 profile managed weekly (1 × 3 locations)');
    expect(deliverableLine(gbp.deliverables[1], 3)).toBe('12 posts / month (4 × 3 locations)');
  });
  it('leaves flat lines alone and drops the annotation at one location', () => {
    const rep = MODULE_BY_KEY['reporting'];
    expect(deliverableLine(rep.deliverables[0], 3)).toBe('12 monthly reports / year');
    expect(deliverableLine(MODULE_BY_KEY['gbp'].deliverables[0], 1)).toBe('1 profile managed weekly');
  });
  it('carries the note through', () => {
    expect(deliverableLines(MODULE_BY_KEY['foundation'], 2)[0]).toContain('· first 45 days');
  });
});

describe('effort', () => {
  it('module effort = flat + perLocation × n', () => {
    expect(moduleEffort(MODULE_BY_KEY['website'], 1)).toBe(12);
    expect(moduleEffort(MODULE_BY_KEY['website'], 3)).toBe(16);
    expect(moduleEffort(MODULE_BY_KEY['reporting'], 5)).toBe(4);
  });
  it('flags which modules scale', () => {
    expect(scalesWithLocations(MODULE_BY_KEY['gbp'])).toBe(true);
    expect(scalesWithLocations(MODULE_BY_KEY['newsletter'])).toBe(false);
  });
  it('total and by-engine add up', () => {
    const keys = ['gbp', 'local-seo', 'newsletter'];
    const total = totalEffort(keys, 2);
    expect(total).toBe((0 + 3 * 2) + (1 + 3 * 2) + 3);
    const by = effortByEngine(keys, 2);
    expect(by.reduce((s, x) => s + x.effort, 0)).toBe(total);
    expect(by.map((x) => x.engine.key)).toEqual(['reach', 'retain']);
  });
  it('locationImpact reports the multiplier vs one location and which modules drive it', () => {
    const r = locationImpact(['gbp', 'newsletter'], 3);
    // gbp: 3/location → 9; newsletter flat 3 → 12 at 3 locations vs 6 at one.
    expect(r.atOne).toBe(6); expect(r.atN).toBe(12); expect(r.multiplier).toBe(2);
    expect(r.scalingModules).toEqual(['gbp']);
    expect(r.locations).toBe(3);
  });
  it('locationImpact is 1× for a flat-only plan and safe when nothing is on', () => {
    expect(locationImpact(['newsletter'], 4).multiplier).toBe(1);
    expect(locationImpact([], 4)).toMatchObject({ atOne: 0, atN: 0, multiplier: 1 });
  });
  it('effortCurve runs 1..max, clamped to 1..12', () => {
    expect(effortCurve(['gbp'], 3).map((p) => p.effort)).toEqual([3, 6, 9]);
    expect(effortCurve(['gbp'], 0)).toHaveLength(1);
    expect(effortCurve(['gbp'], 50)).toHaveLength(12);
  });
});
