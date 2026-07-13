import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Syncs WhatConverts leads into the portal's `leads` table, per account
// (accounts.whatconverts_profile_id holds one or more WhatConverts *account_ids*,
// comma-separated — a client can span multiple WC accounts, e.g. main + landing).
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
// WhatConverts dates come as ISO with T (+ Z or a -05:00 offset) OR space-form
// ("2026-06-05 16:15:12"). Only the space-form needs a T/Z appended — appending
// Z to an already-zoned ISO string makes it invalid (was defaulting to now()).
function toIso(s: string | null): string | null {
  if (!s) return null;
  const str = String(s).trim();
  const d = new Date(str.includes("T") ? str : str.replace(" ", "T") + "Z");
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

// Pull a contact detail out of the raw form submission by matching the field
// LABEL. Client forms use wildly different labels ("Your name", "Contact Name",
// "First & last") that WhatConverts never maps to its standard contact_* fields,
// so without this every form lead reads "New lead". `res` are tried in order
// (most specific first); `exclude` skips false positives (e.g. "Company name"
// when we're after a person's name).
function pickField(
  pairs: Array<{ name: string; value: string }>, res: RegExp[], exclude?: RegExp,
): string | null {
  for (const re of res) {
    const hit = pairs.find((p) => re.test(p.name) && (!exclude || !exclude.test(p.name)) && p.value);
    if (hit) return hit.value;
  }
  return null;
}

// The lead's own words: ONLY a field literally named message/comments/etc. The
// full submission is kept in `fields`, so the panel shows dropdown answers (e.g.
// "What brings you here") under their own labels — no need to guess a "message"
// from the longest answer (that used to grab a bare phone number).
function leadMessage(l: any): string | null {
  const pairs = fieldPairs(l);
  const named = pairs.find((p) => /\b(message|comments?|your message|describe|tell us|details?|how can we help|reason)\b/i.test(p.name));
  return named && named.value.length > 1 ? named.value.slice(0, 800) : null;
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

// WhatConverts customer_journey → compact ordered touchpoints for the panel.
// Each entry: a session (type "attribution") with source/medium/date + the
// pages viewed in order, or the conversion itself (type "lead").
function leadJourney(l: any): any[] | null {
  const cj = Array.isArray(l.customer_journey) ? l.customer_journey : [];
  if (!cj.length) return null;
  const steps = cj.map((s: any) => ({
    type: s.type === "lead" ? "lead" : "visit",
    date: s.date_created || null,
    source: s.source || null,
    medium: s.medium || null,
    pages: Array.isArray(s.page_views) ? s.page_views.map((p: any) => p.page_url).filter(Boolean) : [],
  }));
  return steps.length ? steps : null;
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
  // Derive name/company/phone/email from the raw form submission when the
  // standard WhatConverts contact_* field is empty (custom form labels never
  // map through), so leads show a real name instead of "New lead". Person name
  // preferred; fall back to the company / HOA / community name.
  const pairs = fieldPairs(l);
  const companyName = l.contact_company_name || l.contact_company ||
    pickField(pairs, [/company name/i, /\bcompany\b/i, /associat/i, /communit/i, /\bhoa\b/i, /organi[sz]ation/i, /business name/i]);
  const personName = l.contact_name ||
    pickField(pairs,
      [/your name/i, /contact name/i, /\bfull name\b/i, /first\s*&?\s*(?:and\s*)?last/i, /^\s*name\b/i, /\bname\b/i],
      /(compan|communit|associat|business|organi|form|file|user|screen|field|board)/i);
  return {
    account_id: acctId,
    wc_lead_id: l.lead_id != null ? String(l.lead_id) : null,
    name: personName || companyName || "New lead",
    email: l.contact_email_address || l.email_address || l.email || pickField(pairs, [/^e-?mail/i, /\bemail\b/i]) || null,
    phone: l.contact_phone_number || l.caller_number || l.phone_number || pickField(pairs, [/phone/i, /\bmobile\b/i, /\bcell\b/i, /\btel(?:ephone)?\b/i]) || null,
    company: companyName || null,
    message: leadMessage(l),
    fields: pairs,                               // full form submission (incl. dropdowns)
    context: leadContext(l),
    page: l.lead_url || l.landing_url || null,   // the page the form/widget was on
    journey: leadJourney(l),                     // full multi-touch path
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
      `&start_date=${startDate}&leads_per_page=${PER_PAGE}&page_number=${page}&order=DESC&customer_journey=true`;  // DESC = newest first
    const res = await fetch(url, { headers: { "Authorization": authHeader(), "Accept": "application/json" } });
    if (!res.ok) throw new Error(`WhatConverts ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const batch = data.leads || [];
    all.push(...batch);
    if (batch.length < PER_PAGE) break;  // last page
  }
  return all;
}

// A client can span MULTIPLE WhatConverts accounts (main site + landing page +
// …), stored comma-separated in whatconverts_profile_id. Fetch each, merge +
// dedup by lead_id, order newest-first, then delete-all-insert.
function parseAccountIds(v: unknown): string[] {
  return String(v ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

async function syncAccount(supabase: any, acct: any, startDate: string) {
  const ids = parseAccountIds(acct.whatconverts_profile_id);
  const seen = new Set<string>();
  const raw: any[] = [];
  for (const id of ids) {
    const batch = await fetchAllLeads(id, startDate);
    for (const l of batch) {
      const k = l.lead_id != null ? String(l.lead_id) : `${id}-${raw.length}`;
      if (seen.has(k)) continue;   // WC lead_ids are globally unique; dedup defensively
      seen.add(k);
      raw.push(l);
    }
  }
  // Merged across sources → re-order newest-first so the `sort` index is stable.
  raw.sort((a, b) => new Date(b.date_created || 0).getTime() - new Date(a.date_created || 0).getTime());
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
