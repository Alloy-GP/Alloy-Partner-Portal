import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Lets a client (or staff) qualify a lead from the portal. Writes the
// qualification back to WhatConverts (the source of truth) via its Edit Lead
// endpoint, then mirrors the change onto the portal `leads` row so the UI
// updates instantly. The next sync confirms it.
//
// Cross-tenant boundary: a client can ONLY touch leads on their OWN account;
// staff may touch any. We re-verify the lead belongs to the target account
// before writing anything — never trust the requested id for non-staff.
//
// Secrets: WHATCONVERTS_TOKEN + WHATCONVERTS_SECRET (HTTP Basic, token:secret).

const WC_BASE = "https://app.whatconverts.com/api/v1";

function wcAuth(): string {
  const token = (Deno.env.get("WHATCONVERTS_TOKEN") || "").trim();
  const secret = (Deno.env.get("WHATCONVERTS_SECRET") || "").trim();
  return "Basic " + btoa(`${token}:${secret}`);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

    if (!Deno.env.get("WHATCONVERTS_TOKEN") || !Deno.env.get("WHATCONVERTS_SECRET")) {
      return json({ error: "WhatConverts not configured" }, 500);
    }

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);

    // Identify the caller (RLS-scoped client carrying their JWT).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await userClient
      .from("profiles").select("account_id, is_staff").eq("id", user.id).maybeSingle();
    if (!profile?.account_id) return json({ error: "no account" }, 403);

    const body = await req.json().catch(() => ({}));
    const wcLeadId = String(body.wcLeadId || "").trim();
    if (!wcLeadId) return json({ error: "missing wcLeadId" }, 400);

    // quotable: "yes" (qualified) | "no" (not a fit) | "pending".
    const quotable = String(body.quotable || "").trim().toLowerCase();
    if (!["yes", "no", "pending"].includes(quotable)) return json({ error: "bad quotable" }, 400);

    // Resolve which account we're acting on. Clients are pinned to their own.
    const requested = body.accountId ? String(body.accountId) : null;
    let targetAccountId = String(profile.account_id);
    if (requested && requested !== String(profile.account_id)) {
      if (!profile.is_staff) return json({ error: "forbidden" }, 403);
      targetAccountId = requested;
    }

    // Re-verify the lead is actually on the target account (RLS read). This is
    // the tenant check — without it a client could pass any wcLeadId.
    const { data: lead } = await userClient
      .from("leads").select("id, account_id")
      .eq("account_id", targetAccountId).eq("wc_lead_id", wcLeadId).maybeSingle();
    if (!lead) return json({ error: "lead not found for account" }, 404);

    // Optional money fields. quote = open opportunity; sales = closed (annual).
    const hasQuote = body.quoteValue !== undefined && body.quoteValue !== null && body.quoteValue !== "";
    const hasSales = body.salesValue !== undefined && body.salesValue !== null && body.salesValue !== "";
    const quoteValue = hasQuote ? num(body.quoteValue) : null;
    const salesValue = hasSales ? num(body.salesValue) : null;

    // --- Write back to WhatConverts (source of truth) ---
    const form = new URLSearchParams();
    form.set("quotable", quotable);
    if (quoteValue != null) form.set("quote_value", String(quoteValue));
    if (salesValue != null) form.set("sales_value", String(salesValue));

    const wcRes = await fetch(`${WC_BASE}/leads/${encodeURIComponent(wcLeadId)}`, {
      method: "POST",
      headers: { "Authorization": wcAuth(), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!wcRes.ok) return json({ error: `WhatConverts ${wcRes.status}: ${await wcRes.text()}` }, 502);

    // --- Mirror onto our row (service role: synced data isn't client-writable) ---
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const quality = quotable === "yes" ? "qualified" : "review";
    const patch: Record<string, unknown> = { quality, quotable };
    if (quoteValue != null) patch.quote_value = quoteValue;
    if (salesValue != null) patch.sales_value = salesValue;
    // Display value favors closed (sales/annual), then quote. Recompute from the
    // post-update picture (new value if provided, else whatever was on the row).
    const { data: row } = await admin.from("leads").select("quote_value, sales_value").eq("id", lead.id).maybeSingle();
    const finalSales = salesValue != null ? salesValue : num(row?.sales_value);
    const finalQuote = quoteValue != null ? quoteValue : num(row?.quote_value);
    const display = finalSales || finalQuote;
    patch.value = display > 0 ? `$${display.toLocaleString("en-US")}` : "";

    const { data: updated, error: upErr } = await admin
      .from("leads").update(patch).eq("id", lead.id)
      .select("id, wc_lead_id, name, source, quality, quotable, value, quote_value, sales_value, type, time_label")
      .maybeSingle();
    if (upErr) return json({ error: `db: ${upErr.message}` }, 500);

    return json({ ok: true, lead: updated });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
