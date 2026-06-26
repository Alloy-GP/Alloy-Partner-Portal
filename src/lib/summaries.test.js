import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "./supabase.js";
import { summarizeTickets } from "./summaries.js";

vi.mock("./supabase.js", () => ({
  supabase: { functions: { invoke: vi.fn() } },
  isSupabaseConfigured: true,
}));
vi.mock("../data.js", () => ({ DATA: { account: { id: "acc-1" } } }));

describe("summarizeTickets (configured)", () => {
  beforeEach(() => {
    supabase.functions.invoke.mockReset();
  });

  it("calls summarize-tickets with accountId + stringified ids and returns the payload", async () => {
    const payload = { summaries: { "1": "needs reply" }, counts: { "1": 2 } };
    supabase.functions.invoke.mockResolvedValue({ data: payload, error: null });

    const result = await summarizeTickets([1, "2"]);

    expect(result).toBe(payload);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "summarize-tickets",
      expect.objectContaining({
        body: expect.objectContaining({ accountId: "acc-1", ids: ["1", "2"] }),
      }),
    );
  });

  it("maps ids through String() then filters falsy STRINGS before sending", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: {}, error: null });

    // The filter runs AFTER String(): String("") === "" is the only falsy
    // result here and gets dropped. String(0) === "0" is truthy and kept.
    // (null/undefined stringify to the truthy strings "null"/"undefined".)
    await summarizeTickets([0, "", 42]);

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "summarize-tickets",
      expect.objectContaining({
        body: expect.objectContaining({ ids: ["0", "42"] }),
      }),
    );
  });

  it("returns {} for an empty ids array WITHOUT calling invoke", async () => {
    const result = await summarizeTickets([]);
    expect(result).toEqual({});
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("returns {} for null ids WITHOUT calling invoke", async () => {
    const result = await summarizeTickets(null);
    expect(result).toEqual({});
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("returns {} (no invoke) only when EVERY id stringifies to a falsy string", async () => {
    // String("") === "" → filtered → empty list → short-circuit to {}.
    supabase.functions.invoke.mockResolvedValue({ data: {}, error: null });
    const result = await summarizeTickets(["", ""]);
    expect(result).toEqual({});
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("returns {} when data is null/empty", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });
    await expect(summarizeTickets(["1"])).resolves.toEqual({});
  });

  it("catches and returns {} when invoke reports an error", async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error("boom"),
    });
    await expect(summarizeTickets(["1"])).resolves.toEqual({});
  });

  it("catches and returns {} when invoke rejects", async () => {
    supabase.functions.invoke.mockRejectedValue(new Error("network"));
    await expect(summarizeTickets(["1"])).resolves.toEqual({});
  });
});

describe("summarizeTickets (mock mode)", () => {
  it("short-circuits to {} WITHOUT calling invoke when supabase is not configured", async () => {
    vi.resetModules();
    const invoke = vi.fn();
    vi.doMock("./supabase.js", () => ({
      supabase: { functions: { invoke } },
      isSupabaseConfigured: false,
    }));
    vi.doMock("../data.js", () => ({ DATA: { account: { id: "acc-1" } } }));

    const mod = await import("./summaries.js");
    const result = await mod.summarizeTickets(["1"]);

    expect(result).toEqual({});
    expect(invoke).not.toHaveBeenCalled();

    vi.resetModules();
  });
});
