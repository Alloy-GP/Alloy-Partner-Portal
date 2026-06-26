import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Shared invoke mock. Declared via vi.hoisted so it exists when the hoisted
// vi.mock factory below runs. The configured-mode tests import the real module
// (top of file) which binds to this mocked supabase.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./supabase.js", () => ({
  supabase: { functions: { invoke } },
  isSupabaseConfigured: true,
}));
vi.mock("../data.js", () => ({ DATA: { account: { id: "acc-1" } } }));

import {
  zdList,
  zdThread,
  zdReply,
  zdResolve,
  zdAddCc,
  zdCreate,
  pendingTickets,
} from "./zendesk.js";

describe("zendesk wrapper (Supabase configured)", () => {
  beforeEach(() => {
    invoke.mockReset();
    // Default: a successful, empty payload so contract tests don't throw.
    invoke.mockResolvedValue({ data: {}, error: null });
  });

  describe("request contract", () => {
    it("zdList invokes 'zendesk' with action 'list' + the active accountId", async () => {
      await zdList();
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith("zendesk", {
        body: { action: "list", accountId: "acc-1" },
      });
    });

    it("zdThread threads the ticket id through", async () => {
      await zdThread("t-42");
      expect(invoke).toHaveBeenCalledWith("zendesk", {
        body: { action: "thread", accountId: "acc-1", id: "t-42" },
      });
    });

    it("zdReply passes action 'reply' plus body, status, uploads, cc", async () => {
      await zdReply("t-7", "hello there", {
        status: "open",
        uploads: ["tok1"],
        cc: ["a@b.com"],
      });
      expect(invoke).toHaveBeenCalledWith("zendesk", {
        body: {
          action: "reply",
          accountId: "acc-1",
          id: "t-7",
          body: "hello there",
          status: "open",
          uploads: ["tok1"],
          cc: ["a@b.com"],
        },
      });
    });

    it("zdReply tolerates omitted opts (status/uploads/cc undefined)", async () => {
      await zdReply("t-8", "just text");
      expect(invoke).toHaveBeenCalledWith("zendesk", {
        body: {
          action: "reply",
          accountId: "acc-1",
          id: "t-8",
          body: "just text",
          status: undefined,
          uploads: undefined,
          cc: undefined,
        },
      });
    });

    it("zdResolve passes action 'resolve' + id", async () => {
      await zdResolve("t-9");
      expect(invoke).toHaveBeenCalledWith("zendesk", {
        body: { action: "resolve", accountId: "acc-1", id: "t-9" },
      });
    });

    it("zdAddCc passes action 'add_cc' + id + cc", async () => {
      await zdAddCc("t-10", ["cc@x.com"]);
      expect(invoke).toHaveBeenCalledWith("zendesk", {
        body: { action: "add_cc", accountId: "acc-1", id: "t-10", cc: ["cc@x.com"] },
      });
    });

    it("zdCreate invokes the separate 'zendesk-create' function (no action key)", async () => {
      await zdCreate({
        subject: "Need help",
        body: "details",
        priority: "high",
        uploads: ["u1"],
      });
      expect(invoke).toHaveBeenCalledWith("zendesk-create", {
        body: {
          accountId: "acc-1",
          subject: "Need help",
          body: "details",
          priority: "high",
          uploads: ["u1"],
        },
      });
    });
  });

  describe("error propagation", () => {
    it("throws the raw error when invoke resolves a truthy { error }", async () => {
      const boom = new Error("network down");
      invoke.mockResolvedValueOnce({ data: null, error: boom });
      await expect(zdList()).rejects.toBe(boom);
    });

    it("throws Error(data.error) when invoke resolves { data: { error } }", async () => {
      invoke.mockResolvedValueOnce({ data: { error: "forbidden" }, error: null });
      await expect(zdList()).rejects.toThrow("forbidden");
    });

    it("zdCreate also surfaces an embedded data.error", async () => {
      invoke.mockResolvedValueOnce({ data: { error: "bad subject" }, error: null });
      await expect(
        zdCreate({ subject: "", body: "x", priority: "low", uploads: [] })
      ).rejects.toThrow("bad subject");
    });

    it("returns data on success", async () => {
      invoke.mockResolvedValueOnce({ data: { tickets: [{ id: 1 }] }, error: null });
      await expect(zdList()).resolves.toEqual({ tickets: [{ id: 1 }] });
    });
  });

  describe("pendingTickets", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("filters the returned tickets to only status 'pending'", async () => {
      invoke.mockResolvedValueOnce({
        data: {
          tickets: [
            { id: 1, status: "pending" },
            { id: 2, status: "open" },
            { id: 3, status: "pending" },
            { id: 4, status: "solved" },
          ],
        },
        error: null,
      });
      const out = await pendingTickets("acc-cache-1");
      expect(out).toEqual([
        { id: 1, status: "pending" },
        { id: 3, status: "pending" },
      ]);
    });

    it("resolves to [] (never throws) when the underlying call rejects", async () => {
      invoke.mockResolvedValueOnce({ data: null, error: new Error("kaboom") });
      await expect(pendingTickets("acc-err")).resolves.toEqual([]);
    });

    it("caches within 60s: a second call with the same key does not re-invoke", async () => {
      vi.useFakeTimers();
      invoke.mockReset();
      invoke.mockResolvedValue({
        data: { tickets: [{ id: 1, status: "pending" }] },
        error: null,
      });

      const p1 = pendingTickets("acc-cache-key");
      const p2 = pendingTickets("acc-cache-key");
      // Same in-flight promise returned — true dedupe of simultaneous fetches.
      expect(p2).toBe(p1);

      await p1;
      // Within TTL, still one network call.
      vi.advanceTimersByTime(30000);
      await pendingTickets("acc-cache-key");
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it("refetches after the 60s TTL elapses", async () => {
      vi.useFakeTimers();
      invoke.mockReset();
      invoke.mockResolvedValue({
        data: { tickets: [{ id: 1, status: "pending" }] },
        error: null,
      });

      await pendingTickets("acc-ttl");
      expect(invoke).toHaveBeenCalledTimes(1);

      // Advance past the 60s window → cache is stale → new network call.
      vi.advanceTimersByTime(60001);
      await pendingTickets("acc-ttl");
      expect(invoke).toHaveBeenCalledTimes(2);
    });
  });
});

// Mock mode: isSupabaseConfigured === false. Re-import the module with a fresh
// mock so the early-return branches are exercised without touching invoke.
describe("zendesk wrapper (mock mode — Supabase NOT configured)", () => {
  let mod;
  const mockInvoke = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    mockInvoke.mockReset();
    vi.doMock("./supabase.js", () => ({
      supabase: { functions: { invoke: mockInvoke } },
      isSupabaseConfigured: false,
    }));
    vi.doMock("../data.js", () => ({ DATA: { account: { id: "acc-1" } } }));
    mod = await import("./zendesk.js");
  });

  afterEach(() => {
    vi.doUnmock("./supabase.js");
    vi.doUnmock("../data.js");
  });

  it("zdList resolves to null without invoking the edge function", async () => {
    await expect(mod.zdList()).resolves.toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("zdCreate resolves to null without invoking", async () => {
    await expect(
      mod.zdCreate({ subject: "s", body: "b", priority: "low", uploads: [] })
    ).resolves.toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("pendingTickets resolves to [] without invoking", async () => {
    await expect(mod.pendingTickets("acc-mock")).resolves.toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
