import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Lifetime WhatConverts tenure rollup, per account. Walks the client's full
// history in <=400-day windows (WhatConverts caps a single query at 400 days)
// from their "since" date to today, counting QUALIFIED leads (quotable=Yes)
// and breaking them down by source. Stores the aggregates on the account for
// the dashboard's tenure banner. Runs weekly (lifetime totals move slowly).
//
// Filtering to quotable=yes keeps the volume tiny — we only pull qualified
// leads, not the full firehose. Optional { dry: true } returns the computed
// stats without writing. Optional { accountId } limits to one account.
//
// Secrets: WHATCONVERTS_TOKEN + WHATCONVERTS_SECRET (HTTP Basic, token:secret).

const WC_BASE = "https://app.whatconverts.com/api/v1";
const WINDOW_DAYS = 390;   // under WhatConverts' 400-day max, with margin
const PER_PAGE = 2000;     // WhatConverts per-page max
const MAX_PAGES = 25;      // per-window safety backstop
const FLOOR = "2018-01-01"; // earliest we'll look if "since" is unparseable

function authHeader(): string {
  const token = (Deno.env.get("WHATCONVERTS_TOKEN") || "").trim();
  const secret = (Deno.env.get("WHATCONVERTS_SECRET") || "").trim();
  return "Basic " + btoa(`${token}:${secret}`);
}

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

// WhatConverts dates arrive as ISO ("2026-06-05T16:15:12Z") OR space-form
// ("2026-06-05 16:15:12"). Parse both; null if unparseable.
function toIso(s: unknown): string | null {
  if (!s) return null;
  const str = String(s);
  const d = new Date(str.includes("T") ? str : str.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// "Mar 2025" / "September 2025" → Date (first of month). Falls back to FLOOR.
function parseSince(s: unknown): Date {
  const d = new Date(String(s || ""));
  if (!isNaN(d.getTime())) return d;
  return new Date(FLOOR);
}

async function fetchQualified(acctId: string, start: string, end: string): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${WC_BASE}/leads?account_id=${encodeURIComponent(acctId)}` +
      `&start_date=${start}&end_date=${end}&quotable=yes` +
      `&leads_per_page=${PER_PAGE}&page_number=${page}&order=DESC`;
    const res = await fetch(url, { headers: { "Authorization": authHeader(), "Accept": "application/json" } });
    if (!res.ok) throw new Error(`WhatConverts ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const batch = data.leads || [];
    all.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return all;
}

async function rollupAccount(acct: any) {
  const today = new Date();
  let cursor = parseSince(acct.since);
  // Don't look further back than FLOOR.
  const floor = new Date(FLOOR);
  if (cursor < floor) cursor = floor;

  const bySource: Record<string, number> = {};
  const byYear: Record<string, number> = {};   // qualified per calendar year
  let total = 0;
  let firstLead: string | null = null;

  // Walk forward in <=WINDOW_DAYS chunks from the start to today.
  for (let i = 0; i < 40; i++) {                 // 40 windows * 390d ~= 42 years cap
    if (cursor > today) break;
    const winEnd = new Date(Math.min(cursor.getTime() + WINDOW_DAYS * 864e5, today.getTime()));
    const leads = await fetchQualified(acct.whatconverts_profile_id, ymd(cursor), ymd(winEnd));
    for (const l of leads) {
      total++;
      const src = String(l.lead_source || l.lead_medium || "Direct").trim() || "Direct";
      bySource[src] = (bySource[src] || 0) + 1;
      const dc = toIso(l.date_created);
      if (dc) {
        if (!firstLead || dc < firstLead) firstLead = dc;
        const yr = dc.slice(0, 4);              // YYYY
        byYear[yr] = (byYear[yr] || 0) + 1;
      }
    }
    // advance past this window
    cursor = new Date(winEnd.getTime() + 864e5);
    if (winEnd.getTime() >= today.getTime()) break;
  }

  return {
    account: acct.id,
    name: acct.short_name || acct.company,
    qualified_total: total,
    by_source: bySource,
    by_year: byYear,
    first_lead_at: firstLead,   // already ISO
  };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    const secret = Deno.env.get("SYNC_SECRET");
    if (secret && url.searchParams.get("secret") !== secret) return new Response("unauthorized", { status: 401 });
    if (!Deno.env.get("WHATCONVERTS_TOKEN") || !Deno.env.get("WHATCONVERTS_SECRET")) {
      return Response.json({ ok: false, error: "WHATCONVERTS_TOKEN/SECRET not set" }, { status: 500 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const onlyAccount = body.accountId ? String(body.accountId) : null;

    const { data: accounts, error } = await supabase
      .from("accounts").select("id, short_name, company, since, whatconverts_profile_id")
      .not("whatconverts_profile_id", "is", null);
    if (error) throw error;

    const out: any[] = [];
    for (const acct of accounts ?? []) {
      if (onlyAccount && acct.id !== onlyAccount) continue;
      try {
        const stats = await rollupAccount(acct);
        if (!body.dry) {
          const { error: upErr } = await supabase.from("accounts").update({
            wc_qualified_total: stats.qualified_total,
            wc_qualified_by_source: stats.by_source,
            wc_qualified_by_year: stats.by_year,
            wc_first_lead_at: stats.first_lead_at,
            wc_rollup_at: new Date().toISOString(),
          }).eq("id", acct.id);
          if (upErr) throw new Error(upErr.message);
        }
        out.push({ ...stats, ok: true });
      } catch (e) {
        out.push({ account: acct.id, name: acct.short_name || acct.company, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return Response.json({ ok: out.every((o) => o.ok), dry: !!body.dry, accounts: out });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
