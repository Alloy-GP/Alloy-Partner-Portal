// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// driver.js is the heavy dependency — replace it with a spy factory so we can
// observe how startPortalTour constructs/drives it.
const driveSpy = vi.fn();
const driverFactory = vi.fn(() => ({ drive: driveSpy }));

vi.mock("driver.js", () => ({ driver: driverFactory }));
vi.mock("driver.js/dist/driver.css", () => ({}));
vi.mock("../data.js", () => ({ DATA: { user: {} } }));
vi.mock("./supabase.js", () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: () => Promise.resolve({}) }) }),
  },
}));

describe("TOUR_REVISED_AT", () => {
  it("is a valid ISO date string", async () => {
    const { TOUR_REVISED_AT } = await import("./tour.js");
    expect(typeof TOUR_REVISED_AT).toBe("string");
    expect(Number.isNaN(Date.parse(TOUR_REVISED_AT))).toBe(false);
  });
});

describe("startPortalTour", () => {
  beforeEach(() => {
    vi.resetModules();
    driverFactory.mockClear();
    driveSpy.mockClear();
  });

  it("constructs the driver and drives it with the elementless steps that survive in jsdom", async () => {
    const { startPortalTour } = await import("./tour.js");

    startPortalTour({});

    expect(driverFactory).toHaveBeenCalledTimes(1);
    expect(driveSpy).toHaveBeenCalledTimes(1);

    const config = driverFactory.mock.calls[0][0];
    // In jsdom no [data-tour] elements exist, so only the elementless
    // welcome/closing steps survive visibleSteps().
    expect(Array.isArray(config.steps)).toBe(true);
    expect(config.steps.length).toBeGreaterThanOrEqual(2);
    for (const step of config.steps) {
      expect(step.element).toBeUndefined();
      expect(step.popover).toBeTruthy();
    }
  });

  it("does not construct a second driver while one is already active (active guard)", async () => {
    const { startPortalTour } = await import("./tour.js");

    startPortalTour({});
    expect(driverFactory).toHaveBeenCalledTimes(1);

    // Second immediate call — `active` is still set, so it must early-return.
    startPortalTour({});
    expect(driverFactory).toHaveBeenCalledTimes(1);
  });
});
