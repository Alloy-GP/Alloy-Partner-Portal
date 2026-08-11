import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// A chainable, awaitable Supabase mock. Every builder method returns the same
// builder; awaiting it (or calling .maybeSingle()/.limit()) resolves to the
// canned { data, error } for that table. Lets us drive loadAccountData purely.
const h = vi.hoisted(() => {
  const tables = {};
  const builder = (table) => {
    const result = Promise.resolve(tables[table] ?? { data: [], error: null });
    const b = {
      select: () => b, eq: () => b, or: () => b, order: () => b, limit: () => b,
      maybeSingle: () => result,
      then: (res, rej) => result.then(res, rej),
    };
    return b;
  };
  return { tables, supabase: { from: (t) => builder(t) } };
});

vi.mock("./supabase.js", () => ({ supabase: h.supabase, isSupabaseConfigured: true }));

import { relativeDue, monthsSinceLabel, loadAccountData, proposalRowToRaw } from "./loadData.js";

// The seam that made the inbox misdate every lead: proposals.received_at is the
// board's real submission time, proposals.created_at is when a sync minted the
// row. Dropping received_at here silently reverts the age to mint time.
describe("proposalRowToRaw · received_at seam", () => {
  const row = {
    lead_key: "wc-1", community: "Oak Grove HOA",
    received_at: "2026-07-07T23:47:15+00:00",
    created_at: "2026-08-11T16:11:14+00:00",
    received: "Jul 7, 2026 at 6:47 PM",
  };

  it("threads received_at through as receivedAt", () => {
    expect(proposalRowToRaw(row).receivedAt).toBe("2026-07-07T23:47:15+00:00");
  });

  it("keeps arrivedAt as the distinct mint time, not a duplicate of received", () => {
    const raw = proposalRowToRaw(row);
    expect(raw.arrivedAt).toBe("2026-08-11T16:11:14+00:00");
    expect(raw.arrivedAt).not.toBe(raw.receivedAt);
  });

  it("nulls receivedAt when the column is empty (client falls back)", () => {
    expect(proposalRowToRaw({ ...row, received_at: null }).receivedAt).toBeNull();
  });
});

describe("relativeDue (computed fresh, never stale)", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 26)); }); // Jun 26 2026
  afterAll(() => vi.useRealTimers());

  it("labels today / past / near future / far future", () => {
    expect(relativeDue("2026-06-26")).toBe("due today");
    expect(relativeDue("2026-06-20")).toBe("6 days ago");
    expect(relativeDue("2026-06-30")).toBe("in 4 days");
    expect(relativeDue("2026-07-20")).toBe("in 4 wks"); // 24 days → ceil(24/7)
  });

  it("returns '' for no date", () => {
    expect(relativeDue("")).toBe("");
    expect(relativeDue(null)).toBe("");
  });
});

describe("monthsSinceLabel (market age)", () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 26)); });
  afterAll(() => vi.useRealTimers());

  it("labels just-launched / months / singular & plural years", () => {
    expect(monthsSinceLabel("2026-06-01")).toBe("Just launched");
    expect(monthsSinceLabel("2025-10-01")).toBe("8 months in");
    expect(monthsSinceLabel("2025-06-01")).toBe("1 year in");
    expect(monthsSinceLabel("2024-06-01")).toBe("2 years in");
    expect(monthsSinceLabel("")).toBe("");
  });
});

describe("loadAccountData field mapping (the 'five seams' guard)", () => {
  const session = { user: { id: "user-1" } };
  const me = { profile: { name: "Rim", role: "owner", is_staff: false, tour_completed_at: "2026-06-01T00:00:00Z" } };

  beforeAll(() => {
    h.tables.accounts = {
      data: { id: "acc-1", company: "Tidewater", short_name: "Tidewater", pastel_url: "https://usepastel.com/x", monday_board_id: "123", wc_qualified_total: 42 },
      error: null,
    };
    h.tables.leads = {
      data: [{
        wc_lead_id: "L1", name: "Jane", email: "j@x.com", phone: "555-1212", company: "Acme",
        source: "GBP", quality: "good", quotable: "yes", value: "$100", quote_value: 500, sales_value: 600,
        type: "phone", time_label: "2h ago", created_at: "2026-06-01T00:00:00Z",
        page: "/contact", fields: { a: 1 }, context: "ctx", sort: 1,
      }],
      error: null,
    };
    h.tables.projects = {
      data: [
        { code: "P1", title: "SEO", phase: "SEO & Technical", status: "assigned", due_date: "2026-07-01" }, // origin missing → default
        { code: "P2", title: "Queued", status: "planned", due_date: "2026-08-01" },                          // → plannedProjects
      ],
      error: null,
    };
  });

  it("threads every lead column through recentLeads (catches a dropped seam)", async () => {
    const data = await loadAccountData(session, "acc-1", me);
    const lead = data.recentLeads[0];
    // The fields most likely to be silently dropped when a middle layer is skipped:
    expect(lead).toMatchObject({
      id: "L1", phone: "555-1212", quotable: "yes",
      quoteValue: 500, salesValue: 600, context: "ctx", page: "/contact", type: "phone",
    });
    expect(lead.fields).toEqual({ a: 1 });
  });

  it("maps account fields incl. pastelUrl, and defaults origin to 'added'", async () => {
    const data = await loadAccountData(session, "acc-1", me);
    expect(data.account.pastelUrl).toBe("https://usepastel.com/x");
    expect(data.account.shortName).toBe("Tidewater");
    expect(data.account.wcQualifiedTotal).toBe(42);
    expect(data.projects[0].origin).toBe("added"); // missing origin → default
  });

  it("splits planned work out of active projects", async () => {
    const data = await loadAccountData(session, "acc-1", me);
    expect(data.projects.map((p) => p.id)).toEqual(["P1"]);       // planned excluded
    expect(data.plannedProjects.map((p) => p.id)).toEqual(["P2"]); // planned only
  });

  it("returns null when the account id resolves to nothing", async () => {
    h.tables.accounts = { data: null, error: null };
    expect(await loadAccountData(session, "missing", me)).toBe(null);
    // restore for any later test ordering
    h.tables.accounts = { data: { id: "acc-1", company: "Tidewater" }, error: null };
  });
});
