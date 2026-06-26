import { describe, it, expect, vi, beforeEach } from "vitest";

// insert() returns a thenable (fire-and-forget). We don't await it in source —
// it calls .then(onOk, onErr). A plain object with a .then spy is enough.
const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn(() => ({ then: vi.fn() }));
  const from = vi.fn(() => ({ insert }));
  return { insert, from };
});

vi.mock("./supabase.js", () => ({
  supabase: { from },
  isSupabaseConfigured: true,
}));

// Default: a normal (non-staff) client user.
vi.mock("../data.js", () => ({ DATA: { user: { isStaff: false } } }));

import { track } from "./track.js";

beforeEach(() => {
  from.mockClear();
  insert.mockClear();
});

describe("track", () => {
  it("inserts { type, meta } into the events table for a normal client user", () => {
    track("view_dashboard", { tab: "leads" });
    expect(from).toHaveBeenCalledWith("events");
    expect(insert).toHaveBeenCalledWith({
      type: "view_dashboard",
      meta: { tab: "leads" },
    });
  });

  it("defaults meta to {} when omitted", () => {
    track("page_open");
    expect(insert).toHaveBeenCalledWith({ type: "page_open", meta: {} });
  });

  it("does NOT insert when Supabase isn't configured (mock mode)", async () => {
    vi.resetModules();
    const localInsert = vi.fn(() => ({ then: vi.fn() }));
    const localFrom = vi.fn(() => ({ insert: localInsert }));
    vi.doMock("./supabase.js", () => ({
      supabase: { from: localFrom },
      isSupabaseConfigured: false,
    }));
    vi.doMock("../data.js", () => ({ DATA: { user: { isStaff: false } } }));
    const { track: t } = await import("./track.js");

    t("view_dashboard", { tab: "leads" });
    expect(localFrom).not.toHaveBeenCalled();
    expect(localInsert).not.toHaveBeenCalled();

    vi.doUnmock("./supabase.js");
    vi.doUnmock("../data.js");
  });

  it("does NOT insert when the current user is Alloy staff", async () => {
    vi.resetModules();
    const localInsert = vi.fn(() => ({ then: vi.fn() }));
    const localFrom = vi.fn(() => ({ insert: localInsert }));
    vi.doMock("./supabase.js", () => ({
      supabase: { from: localFrom },
      isSupabaseConfigured: true,
    }));
    vi.doMock("../data.js", () => ({ DATA: { user: { isStaff: true } } }));
    const { track: t } = await import("./track.js");

    t("view_dashboard", { tab: "leads" });
    expect(localFrom).not.toHaveBeenCalled();
    expect(localInsert).not.toHaveBeenCalled();

    vi.doUnmock("./supabase.js");
    vi.doUnmock("../data.js");
  });

  it("never throws even if the insert call blows up synchronously", async () => {
    vi.resetModules();
    const localInsert = vi.fn(() => {
      throw new Error("network down");
    });
    const localFrom = vi.fn(() => ({ insert: localInsert }));
    vi.doMock("./supabase.js", () => ({
      supabase: { from: localFrom },
      isSupabaseConfigured: true,
    }));
    vi.doMock("../data.js", () => ({ DATA: { user: { isStaff: false } } }));
    const { track: t } = await import("./track.js");

    expect(() => t("boom", {})).not.toThrow();
    expect(localInsert).toHaveBeenCalledWith({ type: "boom", meta: {} });

    vi.doUnmock("./supabase.js");
    vi.doUnmock("../data.js");
  });
});
