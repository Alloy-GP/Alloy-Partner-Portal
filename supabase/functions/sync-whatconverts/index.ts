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

// LABEL REPAIR (accounts.lead_field_labels): a raw WhatConverts label -> the
// label it should have had. Some client forms don't give their inputs a real
// name/label, so WhatConverts reports the input's PLACEHOLDER as the field name
// — Landmarc's proposal form arrives as "e g Fawn Lake" (the community),
// "e g 240" (homes), "you@email com", "(540) 000-0000". Nothing downstream can
// know what those mean, so the whole pipeline degrades: no community beside the
// lead's name, no stat cards, and raw placeholder text shown as the label in
// "What they submitted". Renaming at ingest fixes ALL of that at once, because
// every consumer keys off the label. Matching is case/space-insensitive so a
// stray capital in the form can't break the mapping. The right long-term fix is
// still to label the form properly (or map the fields in WhatConverts) — this is
// the repair for forms we don't control.
type LabelMap = Record<string, string>;
const labelKey = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function buildLabelMap(raw: unknown): LabelMap {
  const out: LabelMap = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [from, to] of Object.entries(raw as Record<string, unknown>)) {
      const k = labelKey(from), v = String(to ?? "").trim();
      if (k && v) out[k] = v;
    }
  }
  return out;
}

// WhatConverts form data arrives as additional_fields / custom_fields, each an
// array of { field_name, field_value } (or an object map). Flatten to pairs,
// applying the account's label repairs as we go.
function fieldPairs(l: any, labels: LabelMap = {}): Array<{ name: string; value: string }> {
  const pairs: Array<{ name: string; value: string }> = [];
  const fix = (name: string) => labels[labelKey(name)] ?? name;
  for (const src of [l.additional_fields, l.custom_fields, l.mapped_fields]) {
    if (Array.isArray(src)) {
      for (const f of src) {
        const name = String(f?.field_name ?? f?.name ?? f?.key ?? "").trim();
        const value = String(f?.field_value ?? f?.value ?? "").trim();
        if (value) pairs.push({ name: fix(name), value });
      }
    } else if (src && typeof src === "object") {
      for (const [name, value] of Object.entries(src)) {
        if (value != null && String(value).trim()) pairs.push({ name: fix(String(name)), value: String(value).trim() });
      }
    }
  }
  return pairs;
}

// A person / company / community name is SHORT. Anything longer is an answer to
// a prose question, not a name — across every live client the longest real value
// is 83 chars. Without this cap a form question like "Tell us about your
// community and what you're looking for" matches the /communit/i company pattern
// and the lead's whole essay lands in `company`, which the portal renders as the
// subtitle beside their name (list rows AND the detail panel).
const MAX_NAME_LEN = 120;

// Pull a contact detail out of the raw form submission by matching the field
// LABEL. Client forms use wildly different labels ("Your name", "Contact Name",
// "First & last") that WhatConverts never maps to its standard contact_* fields,
// so without this every form lead reads "New lead". `res` are tried in order
// (most specific first); `exclude` skips false positives (e.g. "Company name"
// when we're after a person's name); `skip` drops one specific label — used to
// keep the field already claimed as the MESSAGE from also becoming a name.
function pickField(
  pairs: Array<{ name: string; value: string }>, res: RegExp[], exclude?: RegExp, skip?: string | null,
): string | null {
  for (const re of res) {
    const hit = pairs.find((p) =>
      re.test(p.name) && (!exclude || !exclude.test(p.name)) &&
      p.name !== skip && p.value && p.value.length <= MAX_NAME_LEN);
    if (hit) return hit.value;
  }
  return null;
}

// The field holding the lead's own words: ONLY one literally named
// message/comments/etc. The full submission is kept in `fields`, so the panel
// shows dropdown answers (e.g. "What brings you here") under their own labels —
// no need to guess a "message" from the longest answer (that used to grab a bare
// phone number). Returned as the PAIR, not just the text, so mapLead can exclude
// this label from the name/company picks — a message field is by definition the
// lead's prose and must never double as their community name.
function messageField(pairs: Array<{ name: string; value: string }>): { name: string; value: string } | null {
  const named = pairs.find((p) => /\b(message|comments?|your message|describe|tell us|details?|how can we help|reason)\b/i.test(p.name));
  return named && named.value.length > 1 ? named : null;
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

function mapLead(l: any, i: number, acctId: string, wcAccountId: string, labels: LabelMap = {}) {
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
  const pairs = fieldPairs(l, labels);
  // Whatever became the message can never also be a name (see messageField).
  const msg = messageField(pairs);
  const msgLabel = msg ? msg.name : null;
  const companyName = l.contact_company_name || l.contact_company ||
    pickField(pairs, [/company name/i, /\bcompany\b/i, /associat/i, /communit/i, /\bhoa\b/i, /organi[sz]ation/i, /business name/i], undefined, msgLabel);
  const personName = l.contact_name ||
    pickField(pairs,
      [/your name/i, /contact name/i, /\bfull name\b/i, /first\s*&?\s*(?:and\s*)?last/i, /^\s*name\b/i, /\bname\b/i],
      /(compan|communit|associat|business|organi|form|file|user|screen|field|board)/i, msgLabel);
  return {
    account_id: acctId,
    wc_lead_id: l.lead_id != null ? String(l.lead_id) : null,
    // WHICH WhatConverts account this came from. A client can span several
    // (whatconverts_profile_id is comma-separated); this used to be discarded in
    // the merge, so the portal couldn't say which profile a lead belonged to.
    wc_account_id: wcAccountId || null,
    name: personName || companyName || "New lead",
    email: l.contact_email_address || l.email_address || l.email || pickField(pairs, [/^e-?mail/i, /\bemail\b/i]) || null,
    phone: l.contact_phone_number || l.caller_number || l.phone_number || pickField(pairs, [/phone/i, /\bmobile\b/i, /\bcell\b/i, /\btel(?:ephone)?\b/i]) || null,
    company: companyName || null,
    message: msg ? msg.value.slice(0, 800) : null,
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
  const labels = buildLabelMap(acct.lead_field_labels);
  const seen = new Set<string>();
  const raw: any[] = [];
  for (const id of ids) {
    const batch = await fetchAllLeads(id, startDate);
    for (const l of batch) {
      const k = l.lead_id != null ? String(l.lead_id) : `${id}-${raw.length}`;
      if (seen.has(k)) continue;   // WC lead_ids are globally unique; dedup defensively
      seen.add(k);
      raw.push({ ...l, __wcAccountId: id });   // carry the origin through the merge
    }
  }
  // Merged across sources → re-order newest-first so the `sort` index is stable.
  raw.sort((a, b) => new Date(b.date_created || 0).getTime() - new Date(a.date_created || 0).getTime());
  const stamp = new Date().toISOString();
  const leads = raw.map((l, i) => ({ ...mapLead(l, i, acct.id, l.__wcAccountId, labels), last_synced_at: stamp }));

  // Upsert-and-prune (NOT delete-all-then-insert): write current leads keyed by
  // (account_id, wc_lead_id), then delete only rows this run did NOT touch
  // (removed/aged-out in WhatConverts). No window where the table is empty, and
  // upsert refreshes edits (quotable, value, contact) in place.
  if (leads.length) {
    // CLAIM, then upsert. leads now has a GLOBAL unique on wc_lead_id (migration
    // 20260815120000), so one WhatConverts lead can exist on exactly one portal
    // account. When a WC account is legitimately reassigned from client A to
    // client B, B fetches leads that still have A's row — and the upsert's
    // conflict target (account_id, wc_lead_id) does NOT match the violated
    // global constraint, so it would error instead of resolving.
    //
    // Claiming is safe because accounts_wc_account_unique guarantees the WC
    // account these leads came from is claimed by exactly one portal account, so
    // only the rightful owner can ever reach this line for a given lead.
    const keys = leads.map((l: any) => l.wc_lead_id).filter(Boolean);
    if (keys.length) {
      const { data: stolen, error: clErr } = await supabase.from("leads")
        .delete().neq("account_id", acct.id).in("wc_lead_id", keys).select("wc_lead_id");
      if (clErr) throw new Error(`claim: ${clErr.message}`);
      if (stolen?.length) {
        console.log(`claimed ${stolen.length} lead(s) for ${acct.short_name || acct.id} from another account (WhatConverts account reassigned)`);
      }
    }
    const { error: upErr } = await supabase.from("leads").upsert(leads, { onConflict: "account_id,wc_lead_id" });
    if (upErr) throw new Error(`upsert: ${upErr.message}`);
  }
  //
  // PRUNE ONLY INSIDE THE WINDOW WE ACTUALLY QUERIED. This is the correctness
  // fix that makes "gone from WhatConverts" a real signal instead of a guess.
  // The fetch asks for start_date=startDate (calendar YTD), so a lead created
  // before that was never asked about — its absence from the response says
  // nothing. The old prune deleted it anyway, which meant:
  //   * every lead older than Jan 1 was deleted as though removed upstream, and
  //   * on Jan 1 the window resets and the ENTIRE prior year would be wiped.
  // Restricting the prune to created_at >= startDate is what lets the proposal
  // archive below trust it.
  const pruned: string[] = [];
  for (const stale of [
    supabase.from("leads").delete().eq("account_id", acct.id).gte("created_at", startDate).lt("last_synced_at", stamp).select("wc_lead_id"),
    supabase.from("leads").delete().eq("account_id", acct.id).gte("created_at", startDate).is("last_synced_at", null).select("wc_lead_id"),
  ]) {
    const { data, error } = await stale;
    if (error) throw new Error(`prune: ${error.message}`);
    for (const r of data ?? []) if (r.wc_lead_id) pruned.push(String(r.wc_lead_id));
  }

  // Mirror REAL removals into the pipeline. Archiving is driven by evidence, not
  // by absence:
  //   * `pruned` — the lead was inside the window WhatConverts was asked about
  //     and was not returned, so it really is gone upstream. Deleting spam in
  //     WhatConverts lands here on the next sync.
  //   * lead_status spam|duplicate — a human marked it in the portal (or via the
  //     write-back in qualify-lead), and the lead row still exists.
  // The previous version inferred "deleted" from "no lead row on this account",
  // which was also true for anything aged out of the window — that is how it
  // buried 19 real prospects. Never widen this back to bare absence.
  await archiveRemovedProposals(supabase, acct.id, pruned);

  return leads.length;
}

// Archive proposals whose lead was PROVABLY removed or flagged. Reversible
// (Restore in the cockpit) and never a hard delete: the row is also the drain's
// tombstone, so deleting it would re-mint and re-LLM-match the lead.
async function archiveRemovedProposals(supabase: any, accountId: string, prunedLeadKeys: string[]) {
  const { data: props, error: pErr } = await supabase
    .from("proposals")
    .select("id, lead_key, community")
    .eq("account_id", accountId)
    .eq("source", "whatconverts")
    .is("archived_at", null);
  if (pErr || !props?.length) return;

  // spam/duplicate is read from the leads that still exist.
  const { data: rows, error: lErr } = await supabase
    .from("leads")
    .select("wc_lead_id, lead_status")
    .eq("account_id", accountId)
    .in("wc_lead_id", props.map((p: any) => p.lead_key));
  if (lErr) return;
  const flag = new Map<string, string>();
  for (const r of rows ?? []) flag.set(String(r.wc_lead_id), String(r.lead_status || "").toLowerCase());

  const gone = new Set(prunedLeadKeys.map(String));
  const stamp = new Date().toISOString();
  for (const p of props) {
    const key = String(p.lead_key);
    const f = flag.get(key) || "";
    const reason = gone.has(key) ? "Deleted in WhatConverts"
      : f === "spam" ? "Marked spam"
      : f === "duplicate" ? "Marked duplicate"
      : "";
    if (!reason) continue;
    const { error } = await supabase.from("proposals")
      .update({ archived_at: stamp, archived_reason: reason, archived_by: "intake sync" })
      .eq("id", p.id);
    if (error) console.error(`archive ${key}: ${error.message}`);
    else console.log(`archived proposal ${key} (${p.community}): ${reason}`);
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    // AUTH — FAIL CLOSED. This was `if (secret && provided !== secret)`, so with
    // SYNC_SECRET unset (which it was) the check never ran and this endpoint was
    // publicly callable with verify_jwt:false. An anonymous POST returned every
    // client's account id, name and lead count — a cross-client roster leak — and
    // could force full WhatConverts syncs against the API quota.
    // An unset secret must mean "nobody", never "everybody".
    const secret = Deno.env.get("SYNC_SECRET") || "";
    const provided = req.headers.get("x-sync-secret") || url.searchParams.get("secret") || "";
    if (!secret || provided !== secret) {
      return new Response("unauthorized", { status: 401 });
    }
    if (!Deno.env.get("WHATCONVERTS_TOKEN") || !Deno.env.get("WHATCONVERTS_SECRET")) {
      return Response.json({ ok: false, error: "WHATCONVERTS_TOKEN/SECRET not set" }, { status: 500 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const onlyAccount = body.accountId ? String(body.accountId) : null;
    const startDate = ytdStart();   // calendar YTD

    const { data: accounts, error } = await supabase
      .from("accounts").select("id, short_name, company, whatconverts_profile_id, lead_field_labels")
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
