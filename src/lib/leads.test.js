import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "./supabase.js";
import { qualifyLead } from "./leads.js";

vi.mock("./supabase.js", () => ({
  supabase: { functions: { invoke: vi.fn() } },
  isSupabaseConfigured: true,
}));
vi.mock("../data.js", () => ({ DATA: { account: { id: "acc-1" } } }));

describe("qualifyLead (configured)", () => {
  beforeEach(() => {
    supabase.functions.invoke.mockReset();
  });

  it("calls the qualify-lead function with the active account id + opts and returns data.lead", async () => {
    const lead = { id: "wc-9", quotable: "yes" };
    supabase.functions.invoke.mockResolvedValue({ data: { lead }, error: null });

    const result = await qualifyLead("wc-9", {
      quotable: "yes",
      quoteValue: 100,
      salesValue: 200,
    });

    expect(result).toBe(lead);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "qualify-lead",
      expect.objectContaining({
        body: expect.objectContaining({
          accountId: "acc-1",
          wcLeadId: "wc-9",
          quotable: "yes",
          quoteValue: 100,
          salesValue: 200,
        }),
      }),
    );
  });

  it("defaults opts to an empty object (undefined quotable/values) when omitted", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { lead: null }, error: null });

    await qualifyLead("wc-1");

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "qualify-lead",
      expect.objectContaining({
        body: expect.objectContaining({
          accountId: "acc-1",
          wcLeadId: "wc-1",
          quotable: undefined,
          quoteValue: undefined,
          salesValue: undefined,
        }),
      }),
    );
  });

  it("returns undefined when data has no lead (data && data.lead)", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: {}, error: null });
    await expect(qualifyLead("wc-1", { quotable: "no" })).resolves.toBeUndefined();
  });

  it("returns null/undefined when data itself is null", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });
    const result = await qualifyLead("wc-1", { quotable: "no" });
    expect(result).toBeFalsy();
  });

  it("throws the transport error when invoke returns an error", async () => {
    const err = new Error("network down");
    supabase.functions.invoke.mockResolvedValue({ data: null, error: err });
    await expect(qualifyLead("wc-1", { quotable: "yes" })).rejects.toBe(err);
  });

  it("throws an Error built from data.error when the function reports a payload error", async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { error: "lead not in account" },
      error: null,
    });
    await expect(qualifyLead("wc-1", { quotable: "yes" })).rejects.toThrow(
      "lead not in account",
    );
  });
});

describe("qualifyLead (mock mode)", () => {
  it("short-circuits to null WITHOUT calling invoke when supabase is not configured", async () => {
    vi.resetModules();
    const invoke = vi.fn();
    vi.doMock("./supabase.js", () => ({
      supabase: { functions: { invoke } },
      isSupabaseConfigured: false,
    }));
    vi.doMock("../data.js", () => ({ DATA: { account: { id: "acc-1" } } }));

    const mod = await import("./leads.js");
    const result = await mod.qualifyLead("wc-1", { quotable: "yes" });

    expect(result).toBeNull();
    expect(invoke).not.toHaveBeenCalled();

    vi.resetModules();
  });
});
