import { describe, it, expect } from "vitest";
import {
  isDelivered, isPlanned, isInMotion,
  currentQuarter, inMotionNow, inMotionByEngine,
  deliveredThisQuarter, quarterStats,
} from "./quarterStats.js";

// A fixed "now" in the middle of Q1 2026 (Jan 1 – Mar 31). Feb 15 is day ~45 of
// a ~90-day quarter, so ~50% elapsed — handy for exercising the pace band.
const NOW = new Date(2026, 1, 15); // months are 0-indexed → Feb

const p = (over) => ({ status: "assigned", dueDate: "2026-02-10", origin: "added", ...over });

describe("status partition", () => {
  it("is mutually exclusive and exhaustive", () => {
    const live = { status: "live" };
    const planned = { status: "planned" };
    const motion = { status: "assigned" };
    for (const x of [live, planned, motion]) {
      const hits = [isDelivered(x), isPlanned(x), isInMotion(x)].filter(Boolean);
      expect(hits.length).toBe(1); // exactly one bucket
    }
    expect(isDelivered(live)).toBe(true);
    expect(isPlanned(planned)).toBe(true);
    expect(isInMotion(motion)).toBe(true);
  });

  it("treats any non-live, non-planned status as in motion", () => {
    for (const s of ["assigned", "waiting", "planning", "in progress"]) {
      expect(isInMotion({ status: s })).toBe(true);
    }
  });

  it("a project with no status is in no bucket (not in motion)", () => {
    expect(isInMotion({})).toBe(false);
    expect(isDelivered({})).toBe(false);
    expect(isPlanned({})).toBe(false);
  });
});

describe("currentQuarter", () => {
  it("derives Q1 boundaries from a mid-Q1 date", () => {
    const q = currentQuarter(NOW);
    expect(q.q).toBe(1);
    expect(q.year).toBe(2026);
    expect(q.label).toBe("Q1 2026");
    expect(q.start.getMonth()).toBe(0); // Jan
    expect(q.end.getMonth()).toBe(2);   // Mar
  });
});

describe("inMotionNow / inMotionByEngine", () => {
  it("counts in-motion projects all-time, even without a due date", () => {
    const projects = [
      p({ status: "assigned", dueDate: null }),
      p({ status: "waiting", dueDate: null }),
      p({ status: "live" }),     // delivered, excluded
      p({ status: "planned" }),  // planned, excluded
    ];
    expect(inMotionNow(projects)).toBe(2);
  });

  it("buckets in-motion work by primary engine via category fallback", () => {
    const projects = [
      p({ status: "assigned", phase: "SEO & Technical" }),   // reach
      p({ status: "assigned", phase: "Sales Enablement" }),  // match
      p({ status: "assigned", phase: "Client Retention" }),  // retain
      p({ status: "live", phase: "SEO & Technical" }),       // delivered → excluded
    ];
    expect(inMotionByEngine(projects)).toEqual({ reach: 1, match: 1, retain: 1 });
  });
});

describe("deliveredThisQuarter", () => {
  it("counts only live projects whose due date is inside the quarter", () => {
    const projects = [
      p({ status: "live", dueDate: "2026-02-01" }),  // in Q1 ✓
      p({ status: "live", dueDate: "2026-05-01" }),  // Q2 ✗
      p({ status: "assigned", dueDate: "2026-02-01" }), // not delivered ✗
    ];
    expect(deliveredThisQuarter(projects, NOW)).toBe(1);
  });
});

describe("quarterStats", () => {
  it("partitions this-quarter work: delivered + inFlight === total === planned + added", () => {
    const projects = [
      p({ status: "live", origin: "planned" }),     // delivered, planned
      p({ status: "live", origin: "added" }),        // delivered, added
      p({ status: "assigned", origin: "planned" }),  // inFlight, planned
      p({ status: "waiting", origin: "added" }),      // inFlight, added
      p({ status: "assigned", dueDate: "2026-09-01" }), // out of quarter → ignored
    ];
    const s = quarterStats(projects, NOW);
    expect(s.total).toBe(4);
    expect(s.delivered).toBe(2);
    expect(s.inFlight).toBe(2);
    expect(s.delivered + s.inFlight).toBe(s.total);
    expect(s.planned).toBe(2);
    expect(s.added).toBe(2);
    expect(s.planned + s.added).toBe(s.total);
    expect(s.plannedDone).toBe(1);
    expect(s.plannedMotion).toBe(1);
    expect(s.addedDone).toBe(1);
    expect(s.addedMotion).toBe(1);
  });

  it("reports hasData=false and zeros when nothing is due this quarter", () => {
    const s = quarterStats([p({ dueDate: "2026-11-01" })], NOW);
    expect(s.hasData).toBe(false);
    expect(s.total).toBe(0);
    expect(s.pct).toBe(0);
  });

  describe("pace (the 10-point grace band)", () => {
    // ~50% of Q1 has elapsed at NOW (Feb 15). Grace = 10 points.
    it("is On track when delivered % meets elapsed % exactly", () => {
      // 1 of 2 delivered = 50% ≈ elapsed → On track
      const s = quarterStats(
        [p({ status: "live" }), p({ status: "assigned" })], NOW);
      expect(s.pct).toBe(50);
      expect(s.pace).toBe("On track");
    });

    it("stays On track when only slightly behind (within the grace band)", () => {
      // 2 of 5 delivered = 40%, elapsed ~50% → 10 behind → still On track (grace)
      const projects = [
        p({ status: "live" }), p({ status: "live" }),
        p({ status: "assigned" }), p({ status: "assigned" }), p({ status: "assigned" }),
      ];
      const s = quarterStats(projects, NOW);
      expect(s.pct).toBe(40);
      expect(s.elapsedPct - s.pct).toBeLessThanOrEqual(10);
      expect(s.pace).toBe("On track");
    });

    it("flags Behind when meaningfully past the grace band", () => {
      // 0 of 10 delivered = 0%, elapsed ~50% → 50 behind → Behind
      const projects = Array.from({ length: 10 }, () => p({ status: "assigned" }));
      const s = quarterStats(projects, NOW);
      expect(s.pct).toBe(0);
      expect(s.pace).toBe("Behind");
    });
  });

  it("scopeDelta measures added work as a % of planned", () => {
    const projects = [
      p({ status: "assigned", origin: "planned" }),
      p({ status: "assigned", origin: "planned" }),
      p({ status: "assigned", origin: "added" }),
    ];
    const s = quarterStats(projects, NOW);
    expect(s.planned).toBe(2);
    expect(s.added).toBe(1);
    expect(s.scopeDelta).toBe(50); // 1 added / 2 planned
  });
});
