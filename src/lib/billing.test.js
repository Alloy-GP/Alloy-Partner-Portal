// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// supabase.auth.getSession is the only thing billing.js touches on the client.
vi.mock("./supabase.js", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { downloadInvoice } from "./billing.js";
import { supabase } from "./supabase.js";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-invoice-pdf`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A minimal Response-like object. billing.js only calls .ok/.status/.json/.blob.
function fakeRes({ ok = true, status = 200, json, blob } = {}) {
  return {
    ok,
    status,
    json: json || (() => Promise.reject(new Error("no json"))),
    blob: blob || (() => Promise.resolve(new Blob(["pdf-bytes"], { type: "application/pdf" }))),
  };
}

describe("downloadInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom lacks these object-URL helpers.
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    global.fetch = vi.fn();
    // Default: signed in with a token.
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "tok-123" } },
    });
  });

  it("throws 'Not signed in' when there is no token", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(downloadInvoice("INV-1")).rejects.toThrow("Not signed in");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("sends the correct URL, method, headers (Bearer token), and body", async () => {
    global.fetch.mockResolvedValue(fakeRes());
    await downloadInvoice("INV-7");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(FN_URL);
    expect(opts.method).toBe("POST");
    expect(opts.headers).toMatchObject({
      Authorization: "Bearer tok-123",
      apikey: ANON,
      "Content-Type": "application/json",
    });
    expect(opts.body).toBe(JSON.stringify({ invoiceId: "INV-7" }));
  });

  it("triggers an anchor click with the provided filename on success", async () => {
    global.fetch.mockResolvedValue(fakeRes());
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, "remove");

    await downloadInvoice("INV-7", "custom-name.pdf");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const anchor = appendSpy.mock.calls[0][0];
    expect(anchor.tagName).toBe("A");
    expect(anchor.href).toBe("blob:x");
    expect(anchor.getAttribute("download")).toBe("custom-name.pdf");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);

    appendSpy.mockRestore();
    clickSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("defaults the download filename to invoice-<id>.pdf", async () => {
    global.fetch.mockResolvedValue(fakeRes());
    const appendSpy = vi.spyOn(document.body, "appendChild");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadInvoice("INV-42");

    const anchor = appendSpy.mock.calls[0][0];
    expect(anchor.getAttribute("download")).toBe("invoice-INV-42.pdf");

    appendSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("schedules URL.revokeObjectURL after the download", async () => {
    vi.useFakeTimers();
    global.fetch.mockResolvedValue(fakeRes());
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadInvoice("INV-9");

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("throws the JSON error message when the response is not ok and has {error}", async () => {
    global.fetch.mockResolvedValue(
      fakeRes({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Invoice not found" }),
      })
    );
    await expect(downloadInvoice("INV-X")).rejects.toThrow("Invoice not found");
  });

  it("throws 'Download failed (<status>)' when the error response has no JSON body", async () => {
    global.fetch.mockResolvedValue(
      fakeRes({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
      })
    );
    await expect(downloadInvoice("INV-X")).rejects.toThrow("Download failed (500)");
  });
});
