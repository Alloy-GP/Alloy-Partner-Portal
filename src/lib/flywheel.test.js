import { describe, it, expect } from "vitest";
import { flywheelStats, sourceMapFromLeads, quarterTrends } from "./flywheel.js";

describe("flywheelStats", () => {
  it("classifies reputation-fed sources (exact + substring) and computes strength", () => {
    const map = {
      "(direct)": 2,          // exact fed
      "ChatGPT referral": 1,  // substring fed (chatgpt / referral)
      "Google Organic": 5,    // earned reach — NOT fed
      "GBP": 2,               // exact fed
      "hoamanagement.com": 3, // paid directory — NOT fed
    };
    const s = flywheelStats(map);
    expect(s.total).toBe(13);
    expect(s.fed).toBe(5); // 2 + 1 + 2
    expect(s.earned).toBe(8);
    expect(s.strengthPct).toBe(38); // round(5/13*100)
  });

  it("does not double-count a source matching multiple fed keywords", () => {
    expect(flywheelStats({ "word of mouth referral": 4 }).fed).toBe(4);
  });

  it("returns zeros (no divide-by-zero) for an empty/missing map", () => {
    expect(flywheelStats({})).toEqual({ total: 0, fed: 0, earned: 0, strengthPct: 0 });
    expect(flywheelStats(null).strengthPct).toBe(0);
  });

  it("treats organic search as earned, never fed", () => {
    expect(flywheelStats({ "Organic Search": 10 }).fed).toBe(0);
  });
});

describe("sourceMapFromLeads", () => {
  it("counts only qualified (quotable yes) leads, grouped by source", () => {
    const leads = [
      { quotable: "yes", source: "GBP" },
      { quotable: "yes", source: "GBP" },
      { quotable: "no", source: "GBP" },     // not qualified → excluded
      { quotable: "yes", source: "Referral" },
      { quotable: "yes" },                     // missing source → "unknown"
    ];
    expect(sourceMapFromLeads(leads)).toEqual({ GBP: 2, Referral: 1, unknown: 1 });
  });

  it("returns {} for empty input", () => {
    expect(sourceMapFromLeads([])).toEqual({});
    expect(sourceMapFromLeads(null)).toEqual({});
  });
});

describe("quarterTrends", () => {
  // Fixed "now" = Feb 15 2026 (mid-Q1). Elapsed window ≈ 45 days, so the prior
  // window is Oct 1 2025 → ~Nov 15 2025 (same elapsed slice of Q4 2025).
  const NOW = new Date(2026, 1, 15).getTime();
  const d = (y, m, day) => new Date(y, m, day).toISOString();

  const leads = [
    // current quarter window
    { date: d(2026, 0, 10), quotable: "yes", source: "GBP" },        // match + retain (fed)
    { date: d(2026, 0, 20), quotable: "yes", source: "Google Organic" }, // match only
    { date: d(2026, 1, 1), quotable: "no", source: "GBP" },           // reach only
    { date: d(2026, 1, 10), quotable: "yes", source: "referral program" }, // match + retain
    // prior quarter window (within the same elapsed slice)
    { date: d(2025, 9, 10), quotable: "yes", source: "gmb" },         // prior match + retain
    { date: d(2025, 10, 1), quotable: "yes", source: "Bing" },        // prior match only
    // outside both windows → ignored
    { date: d(2025, 11, 1), quotable: "yes", source: "gmb" },         // past prior window
    { date: d(2026, 2, 1), quotable: "yes", source: "GBP" },          // after "now"
  ];

  it("aligns elapsed windows and counts reach/match/retain for each", () => {
    const t = quarterTrends(leads, NOW);
    expect(t.hasPrior).toBe(true);
    expect(t.reach).toMatchObject({ cur: 4, prev: 2, dir: "up", deltaPct: 100 });
    expect(t.match).toMatchObject({ cur: 3, prev: 2, dir: "up", deltaPct: 50 });
    expect(t.retain).toMatchObject({ cur: 2, prev: 1, dir: "up", deltaPct: 100 });
  });

  it("reports deltaPct=null ('new', no baseline) when prior is zero but current isn't", () => {
    const t = quarterTrends(
      [{ date: d(2026, 0, 10), quotable: "yes", source: "GBP" }], NOW);
    expect(t.hasPrior).toBe(false);
    expect(t.reach.deltaPct).toBe(null);
    expect(t.reach.dir).toBe("up");
  });

  it("reports deltaPct=0 and flat when both windows are empty for a stage", () => {
    const t = quarterTrends([], NOW);
    expect(t.reach).toMatchObject({ cur: 0, prev: 0, deltaPct: 0, dir: "flat" });
  });
});
