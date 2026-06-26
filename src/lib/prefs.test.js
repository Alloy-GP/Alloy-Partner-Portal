import { describe, it, expect, vi, beforeEach } from "vitest";

// Default mock: a configured supabase whose query chain resolves to no error.
// Individual tests override the resolved value or the whole module as needed.
const { eq, update, from } = vi.hoisted(() => {
  const eq = vi.fn();
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { eq, update, from };
});

vi.mock("./supabase.js", () => ({
  supabase: { from },
  isSupabaseConfigured: true,
}));

import { saveNotificationPrefs } from "./prefs.js";

beforeEach(() => {
  from.mockClear();
  update.mockClear();
  eq.mockClear();
  // Happy-path default: query resolves with no error.
  eq.mockResolvedValue({ error: null });
});

describe("saveNotificationPrefs", () => {
  it("no-ops (does not touch the DB) when userId is missing", async () => {
    await saveNotificationPrefs(undefined, { email: true });
    expect(from).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("no-ops when supabase client is null (mock mode)", async () => {
    vi.resetModules();
    vi.doMock("./supabase.js", () => ({
      supabase: null,
      isSupabaseConfigured: false,
    }));
    const { saveNotificationPrefs: save } = await import("./prefs.js");
    // Should simply return without throwing — no client to call.
    await expect(save("user-1", { email: true })).resolves.toBeUndefined();
    vi.doUnmock("./supabase.js");
  });

  it("updates the user's own profile row with the given prefs", async () => {
    const prefs = { email: true, sms: false, digest: "weekly" };
    await saveNotificationPrefs("user-42", prefs);

    expect(from).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({ notification_prefs: prefs });
    expect(eq).toHaveBeenCalledWith("id", "user-42");
  });

  it("resolves to undefined on success (no error returned)", async () => {
    await expect(
      saveNotificationPrefs("user-7", { email: false }),
    ).resolves.toBeUndefined();
  });

  it("throws the error when the update query returns one", async () => {
    const dbErr = new Error("RLS: row violates policy");
    eq.mockResolvedValueOnce({ error: dbErr });
    await expect(
      saveNotificationPrefs("user-9", { email: true }),
    ).rejects.toBe(dbErr);
  });
});
