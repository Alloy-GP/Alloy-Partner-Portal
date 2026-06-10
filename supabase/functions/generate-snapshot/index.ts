import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Generates a DRAFT weekly snapshot per account as a week-over-week DELTA:
// what shipped, what's newly in motion, new leads, and what's waiting on the
// client — diffed against the last PUBLISHED snapshot's stored state (so it's
// truly "this week", not a board readout). Staff review/edit, then publish.
//
// Reliability for unattended runs:
//   - sync Monday first (fresh data in) unless body.skipSync
//   - isolate each client (one failure can't block the rest)
//   - attach anomaly flags so the review queue can triage at a glance
//
// Trigger: scheduled (Friday AM) or manual. Optional ?secret=SYNC_SECRET.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function parseMoney(v: string): number {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

async function generateForAccount(supabase: any, acct: any, now: Date, preserve = false) {
  // Last published snapshot → diff baseline + period start.
  const { data: prev } = await supabase
    .from("weekly_snapshots")
    .select("id, state, period_end, created_at")
    .eq("account_id", acct.id).eq("status", "published")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const prevProjects: Record<string, string> = (prev?.state?.projects) || {};
  const hasBaseline = !!(prev && prev.state && prev.state.projects);
  const periodStart = prev ? new Date(prev.period_end || prev.created_at) : new Date(now.getTime() - 7 * 864e5);

  const [{ data: projects }, { data: actions }, { data: leads }] = await Promise.all([
    supabase.from("projects").select("monday_item_id, title, status, due_label, pulse").eq("account_id", acct.id),
    supabase.from("action_items").select("title, due_label").eq("account_id", acct.id).order("sort"),
    supabase.from("leads").select("name, value, source, created_at").eq("account_id", acct.id),
  ]);
  const projs = projects || [];

  const shipped = hasBaseline
    ? projs.filter((p: any) => p.status === "live" && prevProjects[p.monday_item_id] !== "live")
    : [];
  const inMotion = hasBaseline
    ? projs.filter((p: any) => p.status !== "live" && !(p.monday_item_id in prevProjects))
    : projs.filter((p: any) => p.status !== "live").slice(0, 6);
  const waiting = actions || [];
  const newLeads = (leads || []).filter((l: any) => l.created_at && new Date(l.created_at) >= periodStart);
  const leadsSum = newLeads.reduce((t: number, l: any) => t + parseMoney(l.value), 0);
  const leadsValue = leadsSum > 0 ? `$${leadsSum.toLocaleString("en-US")}` : "";

  // Anomaly flags — let the review queue triage instead of trusting blindly.
  const flags: any[] = [];
  if (acct.monday_board_id && projs.length === 0) {
    flags.push({ level: "warn", msg: "No Monday data synced — board may be disconnected." });
  }
  if (shipped.length > 12 || (projs.length > 0 && shipped.length > projs.length * 0.5)) {
    flags.push({ level: "warn", msg: `Unusually high "shipped" (${shipped.length}) — worth a look.` });
  }

  const bits: string[] = [];
  if (shipped.length) bits.push(`${shipped.length} ${shipped.length === 1 ? "thing" : "things"} shipped`);
  if (newLeads.length) bits.push(`${newLeads.length} new ${newLeads.length === 1 ? "lead" : "leads"}`);
  if (waiting.length) bits.push(`${waiting.length} waiting on you`);
  const headline = bits.length ? cap(bits.join(" · ")) : "A steady week — here’s where things stand.";

  const weekLabel = `Week of ${fmtDay(now)}`;
  const newState = { projects: Object.fromEntries(projs.map((p: any) => [p.monday_item_id, p.status])) };

  // Replace any existing draft for this account (keep published history). On a
  // staff "refresh from latest", carry over their edited headline + note so a
  // refresh updates the data without wiping their words.
  const { data: oldDrafts } = await supabase
    .from("weekly_snapshots").select("id, headline, note").eq("account_id", acct.id).eq("status", "draft");
  const prevDraft = (oldDrafts || [])[0];
  const finalHeadline = (preserve && prevDraft && prevDraft.headline) ? prevDraft.headline : headline;
  const finalNote = (preserve && prevDraft) ? (prevDraft.note ?? null) : null;
  const oldIds = (oldDrafts || []).map((d: any) => d.id);
  if (oldIds.length) {
    await supabase.from("weekly_snapshot_items").delete().in("snapshot_id", oldIds);
    await supabase.from("weekly_snapshots").delete().in("id", oldIds);
  }

  const { data: snap, error: snapErr } = await supabase.from("weekly_snapshots").insert({
    account_id: acct.id, week_label: weekLabel, status: "draft", is_current: false,
    headline: finalHeadline, note: finalNote,
    summary_completed: shipped.length, summary_waiting: waiting.length,
    summary_leads: newLeads.length, leads_value: leadsValue, quarterly_href: "roi",
    period_start: periodStart.toISOString(), period_end: now.toISOString(),
    state: newState, flags, sort: 0,
  }).select("id").single();
  if (snapErr) throw snapErr;

  const items: any[] = [];
  shipped.slice(0, 10).forEach((p: any, i: number) => items.push({ snapshot_id: snap.id, kind: "completed", text: p.title, meta: p.pulse || null, sort: i }));
  inMotion.slice(0, 10).forEach((p: any, i: number) => items.push({ snapshot_id: snap.id, kind: "upcoming", text: p.title, meta: p.due_label || null, sort: i }));
  waiting.slice(0, 10).forEach((a: any, i: number) => items.push({ snapshot_id: snap.id, kind: "waiting", text: a.title, meta: a.due_label || null, sort: i }));
  newLeads.slice(0, 10).forEach((l: any, i: number) => items.push({ snapshot_id: snap.id, kind: "lead", text: l.name || "New lead", meta: l.source || null, sort: i }));
  if (items.length) {
    const { error: itErr } = await supabase.from("weekly_snapshot_items").insert(items);
    if (itErr) throw itErr;
  }

  return { shipped: shipped.length, inMotion: inMotion.length, waiting: waiting.length, newLeads: newLeads.length, flags: flags.length };
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const onlyAccount = body.accountId ? String(body.accountId) : null;
    const preserve = !!body.preserve;
    const now = new Date();

    // Fresh data in: sync Monday before diffing (skippable for quick manual
    // runs). For a single-account refresh, sync just that board (fast) instead
    // of every client.
    if (!body.skipSync) {
      try {
        const u = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-monday${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
        let syncBody = "{}";
        if (onlyAccount) {
          const { data: a } = await supabase.from("accounts").select("monday_board_id").eq("id", onlyAccount).maybeSingle();
          if (a?.monday_board_id) syncBody = JSON.stringify({ event: { boardId: a.monday_board_id } });
        }
        await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: syncBody });
        // Also refresh WhatConverts leads so "new leads" is current.
        const wc = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-whatconverts${secret ? `?secret=${encodeURIComponent(secret)}` : ""}`;
        await fetch(wc, { method: "POST", headers: { "Content-Type": "application/json" }, body: onlyAccount ? JSON.stringify({ accountId: onlyAccount }) : "{}" });
      } catch (_e) { /* generation continues; flags will catch stale/empty data */ }
    }

    const { data: accounts, error: accErr } = await supabase.from("accounts").select("id, company, short_name, monday_board_id");
    if (accErr) throw accErr;

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      if (onlyAccount && acct.id !== onlyAccount) continue;
      // Isolate each client — one failure must not block the others.
      try {
        const r = await generateForAccount(supabase, acct, now, preserve);
        summary.push({ account: acct.id, name: acct.short_name || acct.company, ok: true, ...r });
      } catch (e) {
        summary.push({ account: acct.id, name: acct.short_name || acct.company, ok: false, error: String(e) });
      }
    }

    const failed = summary.filter((s) => !s.ok).length;
    return Response.json({ ok: failed === 0, generated: summary.length - failed, failed, summary });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
