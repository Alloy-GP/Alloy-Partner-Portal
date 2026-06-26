import { describe, it, expect } from "vitest";
import { enginesOf, ENGINE_ORDER, CORE_KEY } from "./engines.js";

describe("enginesOf", () => {
  it("prefers explicit Monday engine tags over the category fallback", () => {
    expect(enginesOf({ engines: ["match"], phase: "SEO & Technical" })).toEqual(["match"]);
  });

  it("normalizes tag case and drops unknown tags", () => {
    expect(enginesOf({ engines: ["REACH", "bogus"] })).toEqual(["reach"]);
  });

  it("falls back to the category map when there are no valid tags", () => {
    expect(enginesOf({ phase: "Sales Enablement" })).toEqual(["match"]);
    expect(enginesOf({ phase: "Client Retention" })).toEqual(["retain"]);
  });

  it("is case-insensitive on category names", () => {
    expect(enginesOf({ phase: "design & assets" })).toEqual(["match"]);
  });

  it("maps Core categories to the equip key (not one of the three engines)", () => {
    expect(enginesOf({ phase: "Education & Training" })).toEqual([CORE_KEY]);
    expect(ENGINE_ORDER).not.toContain(CORE_KEY);
  });

  it("returns [] for an unknown / missing phase", () => {
    expect(enginesOf({ phase: "Nonexistent" })).toEqual([]);
    expect(enginesOf({})).toEqual([]);
    expect(enginesOf(null)).toEqual([]);
  });
});
