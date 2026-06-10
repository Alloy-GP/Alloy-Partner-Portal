import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Syncs WhatConverts leads into the portal's `leads` table, per account
// (accounts.whatconverts_profile_id holds a WhatConverts *account_id*).
// Mirrors sync-monday: delete-all-then-insert per account, over a recent
// window. Paginates so the full window is captured (no silent cap).
//
// Secrets: WHATCONVERTS_TOKEN (API token) + WHATCONVERTS_SECRET (API secret).
// Auth is HTTP Basic (token:secret). Trigger: manual / daily cron / on profile
// save. Optional ?secret=SYNC_SECRET.

const WC_BASE = "https://app.whatconverts.com/api/v1";
const PER_PAGE = 1000;        // WhatConverts allows large pages
const MAX_PAGES = 30;         // safety backstop (30k leads/yr)

// Live window = calendar year-to-date. Clients work annually, so the portal's
// lead list and counts are YTD (Jan 1 → today), not an arbitrary trailing
// window. Prior years are kept as aggregates by the rollup function.
function ytdStart(): string { return `${new Date().getUTCFullYear()}-01-01`; }

function authHeader(): string {
  const token = (Deno.env.get("WHATCONVERTS_TOKEN") || "").trim();
  const secret = (Deno.env.get("WHATCONVERTS_SECRET") || "").trim();
  return "Basic " + btoa(`${token}:${secret}`);
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// WhatConverts date strings ("2026-06-09 14:23:05", profile-local) to ISO.
function toIso(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// WhatConverts lead_type is a human label ("Web Form", "Phone Call", ...).
// Normalize to the DB check-constraint set. Future-proofs for call tracking:
// if calls start flowing into WhatConverts, they map automatically.
function leadType(raw: unknown): string {
  const t = String(raw || "").toLowerCase();
  if (t.includes("call") || t.includes("phone")) return "call";
  if (t.includes("form")) return "form";
  if (t.includes("chat")) return "chat";
  if (t.includes("transaction") || t.includes("sale")) return "sale";
  if (t.includes("appointment")) return "appointment";
  if (t.includes("text")) return "text";
  if (t.includes("event")) return "event";
  return "lead";
}

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

// WhatConverts `quotable` is "Yes" / "No" / "Pending" / "Not Set". Normalize to
// a stable token so the portal can tell "not a fit" (no) from "needs triage".
function quotableState(raw: unknown): string {
  const q = String(raw || "").trim().toLowerCase();
  if (q === "yes") return "yes";
  if (q === "no") return "no";
  if (q === "pending") return "pending";
  return "not_set";
}

// WhatConverts form data arrives as additional_fields / custom_fields, each an
// array of { field_name, field_value } (or an object map). Flatten to pairs.
function fieldPairs(l: any): Array<{ name: string; value: string }> {
  const pairs: Array<{ name: string; value: string }> = [];
  for (const src of [l.additional_fields, l.custom_fields, l.mapped_fields]) {
    if (Array.isArray(src)) {
      for (const f of src) {
        const name = String(f?.field_name ?? f?.name ?? f?.key ?? "").trim();
        const value = String(f?.field_value ?? f?.value ?? "").trim();
        if (value) pairs.push({ name, value });
      }
    } else if (src && typeof src === "object") {
      for (const [name, value] of Object.entries(src)) {
        if (value != null && String(value).trim()) pairs.push({ name: String(name), value: String(value).trim() });
      }
    }
  }
  return pairs;
}

// The lead's own words: prefer an actual message/comments field, else the
// longest free-text answer (skip emails, phones, URLs, short categories).
function leadMessage(l: any): string | null {
  const pairs = fieldPairs(l);
  const named = pairs.find((p) => /\b(message|comments?|your message|describe|tell us|details?)\b/i.test(p.name));
  if (named) return named.value.slice(0, 800);
  const longest = pairs.map((p) => p.value)
    .filter((v) => !/^https?:|@|^\+?[0-9 ()-]+$/.test(v) && !/^(yes|no)$/i.test(v))
    .sort((a, b) => b.length - a.length)[0];
  return longest && longest.length > 25 ? longest.slice(0, 800) : null;
}

// How they arrived: search keyword, else form name, else landing path.
function leadContext(l: any): string | null {
  const kw = String(l.keyword || "").trim();
  if (kw && !/^\(.*\)$/.test(kw)) return `"${kw}"`;     // a real search term
  const form = String(l.form_name || "").trim();
  if (form) return form;
  try {
    const u = new URL(l.landing_url || l.lead_url || "");
    const path = u.pathname.replace(/\/$/, "");
    if (path && path !== "") return path.split("/").filter(Boolean).slice(-1)[0].replace(/-/g, " ");
  } catch { /* ignore */ }
  return null;
}

function mapLead(l: any, i: number, acctId: string) {
  const quotable = quotableState(l.quotable);
  // quality kept for back-compat: only an explicit "yes" is qualified.
  const quality = quotable === "yes" ? "qualified" : "review";
  // WhatConverts values are MONTHLY (how the client enters them). We store the
  // raw monthly figure and annualize (x12) only for display.
  const quoteValue = num(l.quote_value);   // monthly, quoted (open)
  const salesValue = num(l.sales_value);   // monthly, closed
  const monthly = salesValue || quoteValue || num(l.lead_value);
  const annual = monthly * 12;
  const created = toIso(l.date_created) || new Date().toISOString();  // created_at is NOT NULL
  return {
    account_id: acctId,
    wc_lead_id: l.lead_id != null ? String(l.lead_id) : null,
    name: l.contact_name || l.contact_company_name || l.contact_company || "New lead",
    email: l.contact_email_address || l.email_address || l.email || null,
    phone: l.contact_phone_number || l.caller_number || l.phone_number || null,
    company: l.contact_company_name || l.contact_company || null,
    message: leadMessage(l),
    context: leadContext(l),
    source: l.lead_source || l.lead_medium || l.source || "Direct",
    quality,
    quotable,
    value: annual > 0 ? `$${annual.toLocaleString("en-US")}` : "",   // annualized for display
    quote_value: quoteValue || null,   // monthly
    sales_value: salesValue || null,   // monthly
    type: leadType(l.lead_type),
    time_label: relTime(created),
    created_at: created,
    sort: i,
  };
}

async function fetchAllLeads(acctId: string, startDate: string): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${WC_BASE}/leads?account_id=${encodeURIComponent(acctId)}` +
      `&start_date=${startDate}&leads_per_page=${PER_PAGE}&page_number=${page}&order=DESC`;  // DESC = newest first (by date)
    const res = await fetch(url, { headers: { "Authorization": authHeader(), "Accept": "application/json" } });
    if (!res.ok) throw new Error(`WhatConverts ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const batch = data.leads || [];
    all.push(...batch);
    if (batch.length < PER_PAGE) break;  // last page
  }
  return all;
}

async function syncAccount(supabase: any, acct: any, startDate: string) {
  const raw = await fetchAllLeads(acct.whatconverts_profile_id, startDate);
  const leads = raw.map((l, i) => mapLead(l, i, acct.id));

  // Mirror WhatConverts for this account: clear then insert.
  const { error: delErr } = await supabase.from("leads").delete().eq("account_id", acct.id);
  if (delErr) throw new Error(`delete: ${delErr.message}`);
  if (leads.length) {
    const { error: insErr } = await supabase.from("leads").insert(leads);
    if (insErr) throw new Error(`insert: ${insErr.message}`);
  }
  return leads.length;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    const secret = Deno.env.get("SYNC_SECRET");
    if (secret && url.searchParams.get("secret") !== secret) {
      return new Response("unauthorized", { status: 401 });
    }
    if (!Deno.env.get("WHATCONVERTS_TOKEN") || !Deno.env.get("WHATCONVERTS_SECRET")) {
      return Response.json({ ok: false, error: "WHATCONVERTS_TOKEN/SECRET not set" }, { status: 500 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const onlyAccount = body.accountId ? String(body.accountId) : null;
    const startDate = ytdStart();   // calendar YTD

    const { data: accounts, error } = await supabase
      .from("accounts").select("id, short_name, company, whatconverts_profile_id")
      .not("whatconverts_profile_id", "is", null);
    if (error) throw error;

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      if (onlyAccount && acct.id !== onlyAccount) continue;
      if (!acct.whatconverts_profile_id) continue;
      try {
        const n = await syncAccount(supabase, acct, startDate);
        summary.push({ account: acct.id, name: acct.short_name || acct.company, ok: true, leads: n });
      } catch (e) {
        summary.push({ account: acct.id, name: acct.short_name || acct.company, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const failed = summary.filter((s) => !s.ok).length;
    return Response.json({ ok: failed === 0, synced: summary.length - failed, failed, summary });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
