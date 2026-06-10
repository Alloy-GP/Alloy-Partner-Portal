import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Syncs WhatConverts leads into the portal's `leads` table, per account
// (accounts.whatconverts_profile_id). Mirrors sync-monday: delete-all-then-
// insert per account. Recent window only (the dashboard shows recent leads;
// the weekly snapshot counts "new this week").
//
// Secrets: WHATCONVERTS_TOKEN (API token) + WHATCONVERTS_SECRET (API secret).
// Auth is HTTP Basic (token:secret). Trigger: manual / cron / on profile save.
// Optional ?secret=SYNC_SECRET.

const WC_BASE = "https://app.whatconverts.com/api/v1";
const DAYS_BACK = 120;        // pull recent leads only
const PER_PAGE = 250;

function authHeader(): string {
  const token = (Deno.env.get("WHATCONVERTS_TOKEN") || "").trim();
  const secret = (Deno.env.get("WHATCONVERTS_SECRET") || "").trim();
  return "Basic " + btoa(`${token}:${secret}`);
}

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

function relTime(iso: string | null): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// WhatConverts date strings ("2026-06-09 14:23:05", profile-local) → ISO.
function toIso(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const TYPE_LABEL: Record<string, string> = {
  phone_call: "Call", web_form: "Form", chat: "Chat", transaction: "Sale",
  appointment: "Appointment", event: "Event", other: "Lead", text_message: "Text",
};

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

function mapLead(l: any, i: number, acctId: string) {
  const quotable = String(l.quotable || "").trim().toLowerCase();
  // Two-state portal: explicitly "Quotable" → qualified (show value); anything
  // else (unworked / blank / not-quotable) → needs triage.
  const quality = quotable.startsWith("quotable") ? "qualified" : "review";
  const val = num(l.sales_value) || num(l.quote_value) || num(l.lead_value);
  const created = toIso(l.date_created);
  return {
    account_id: acctId,
    name: l.contact_name || l.contact_company_name || l.contact_company || "New lead",
    source: l.lead_source || l.lead_medium || l.source || "Direct",
    quality,
    value: val > 0 ? `$${val.toLocaleString("en-US")}` : "",
    type: TYPE_LABEL[l.lead_type] || "Lead",
    time_label: relTime(created),
    created_at: created,
    sort: i,
  };
}

async function syncAccount(supabase: any, acct: any, startDate: string) {
  const url = `${WC_BASE}/leads?profile_id=${encodeURIComponent(acct.whatconverts_profile_id)}` +
    `&start_date=${startDate}&leads_per_page=${PER_PAGE}&page_number=1&order=date_desc`;
  const res = await fetch(url, { headers: { "Authorization": authHeader(), "Accept": "application/json" } });
  if (!res.ok) throw new Error(`WhatConverts ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const leads = (data.leads || []).map((l: any, i: number) => mapLead(l, i, acct.id));

  // Mirror WhatConverts for this account: clear then insert.
  const { error: delErr } = await supabase.from("leads").delete().eq("account_id", acct.id);
  if (delErr) throw delErr;
  if (leads.length) {
    const { error: insErr } = await supabase.from("leads").insert(leads);
    if (insErr) throw insErr;
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
    const startDate = ymd(new Date(Date.now() - DAYS_BACK * 864e5));

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
        summary.push({ account: acct.id, name: acct.short_name || acct.company, ok: false, error: String(e) });
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
