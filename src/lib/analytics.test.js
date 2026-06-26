import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "./supabase.js";
import { fetchPerformance } from "./analytics.js";

vi.mock("./supabase.js", () => ({
  supabase: { functions: { invoke: vi.fn() } },
  isSupabaseConfigured: true,
}));
vi.mock("../data.js", () => ({ DATA: { account: { id: "acc-1" } } }));

describe("fetchPerformance (configured)", () => {
  beforeEach(() => {
    supabase.functions.invoke.mockReset();
  });

  it("calls the analytics function with accountId + range and returns the payload", async () => {
    const payload = { leads: { total: 5 } };
    supabase.functions.invoke.mockResolvedValue({ data: payload, error: null });

    const result = await fetchPerformance("acc-9", "90d");

    expect(result).toBe(payload);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "analytics",
      expect.objectContaining({
        body: expect.objectContaining({ accountId: "acc-9", range: "90d" }),
      }),
    );
  });

  it("defaults range to '12mo' when omitted", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: {}, error: null });

    await fetchPerformance("acc-9");

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "analytics",
      expect.objectContaining({
        body: expect.objectContaining({ accountId: "acc-9", range: "12mo" }),
      }),
    );
  });

  it("falls back to DATA.account.id when accountId is missing", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: {}, error: null });

    await fetchPerformance(undefined, "30d");

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "analytics",
      expect.objectContaining({
        body: expect.objectContaining({ accountId: "acc-1", range: "30d" }),
      }),
    );
  });

  it("returns null when data is null/empty", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });
    await expect(fetchPerformance("acc-1")).resolves.toBeNull();
  });

  it("catches and returns null when invoke reports an error", async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error("boom"),
    });
    await expect(fetchPerformance("acc-1")).resolves.toBeNull();
  });

  it("catches and returns null when invoke rejects", async () => {
    supabase.functions.invoke.mockRejectedValue(new Error("network"));
    await expect(fetchPerformance("acc-1")).resolves.toBeNull();
  });
});

describe("fetchPerformance (mock mode)", () => {
  it("short-circuits to null WITHOUT calling invoke when supabase is not configured", async () => {
    vi.resetModules();
    const invoke = vi.fn();
    vi.doMock("./supabase.js", () => ({
      supabase: { functions: { invoke } },
      isSupabaseConfigured: false,
    }));
    vi.doMock("../data.js", () => ({ DATA: { account: { id: "acc-1" } } }));

    const mod = await import("./analytics.js");
    const result = await mod.fetchPerformance("acc-1", "12mo");

    expect(result).toBeNull();
    expect(invoke).not.toHaveBeenCalled();

    vi.resetModules();
  });
});
