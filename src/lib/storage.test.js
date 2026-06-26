import { describe, it, expect, vi, beforeEach } from "vitest";

const { createSignedUrl, storageFrom } = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  const storageFrom = vi.fn(() => ({ createSignedUrl }));
  return { createSignedUrl, storageFrom };
});

vi.mock("./supabase.js", () => ({
  supabase: { storage: { from: storageFrom } },
  isSupabaseConfigured: true,
}));

import { getDocumentUrl } from "./storage.js";

beforeEach(() => {
  storageFrom.mockClear();
  createSignedUrl.mockClear();
});

describe("getDocumentUrl", () => {
  it("returns null when a path is given but Supabase isn't configured", async () => {
    vi.resetModules();
    vi.doMock("./supabase.js", () => ({
      supabase: null,
      isSupabaseConfigured: false,
    }));
    const { getDocumentUrl: get } = await import("./storage.js");
    await expect(get("acct/reports/weekly.pdf")).resolves.toBeNull();
    vi.doUnmock("./supabase.js");
  });

  it("returns null (and never calls storage) when path is empty", async () => {
    await expect(getDocumentUrl("")).resolves.toBeNull();
    await expect(getDocumentUrl(undefined)).resolves.toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs against the 'documents' bucket and passes the path + expiry", async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://signed/url" },
      error: null,
    });
    const url = await getDocumentUrl("acct-1/reports/weekly.pdf", 300);

    expect(storageFrom).toHaveBeenCalledWith("documents");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "acct-1/reports/weekly.pdf",
      300,
    );
    expect(url).toBe("https://signed/url");
  });

  it("defaults the expiry to 60 seconds when omitted", async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://signed/default" },
      error: null,
    });
    await getDocumentUrl("acct-1/reports/weekly.pdf");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "acct-1/reports/weekly.pdf",
      60,
    );
  });

  it("returns null when createSignedUrl reports an error", async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: new Error("object not found"),
    });
    await expect(getDocumentUrl("acct-1/missing.pdf")).resolves.toBeNull();
  });

  it("returns the signedUrl on success", async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: "https://signed/ok" },
      error: null,
    });
    await expect(getDocumentUrl("acct-1/ok.pdf")).resolves.toBe(
      "https://signed/ok",
    );
  });

  it("returns null when data has no signedUrl (no error, empty data)", async () => {
    createSignedUrl.mockResolvedValueOnce({ data: {}, error: null });
    await expect(getDocumentUrl("acct-1/weird.pdf")).resolves.toBeNull();
  });
});
