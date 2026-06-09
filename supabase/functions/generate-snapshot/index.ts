import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Generates a DRAFT weekly snapshot per account as a week-over-week DELTA:
// what shipped, what's newly in motion, new leads, and what's waiting on the
// client — diffed against the last PUBLISHED snapshot's stored state (so it's
// truly "this week", not a board readout). Staff review/edit, then publish.
//
// Trigger: scheduled (Friday AM) or manual. Optional ?secret=SYNC_SECRET.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function parseMoney(v: string): number {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    const expected = Deno.env.get("SYNC_SECRET");
    if (expected && url.searchParams.get("secret") !== expected) {
      return new Response("unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const onlyAccount = body.accountId ? String(body.accountId) : null;
    const now = new Date();

    const { data: accounts, error: accErr } = await supabase.from("accounts").select("id, company, short_name");
    if (accErr) throw accErr;

    const summary: any[] = [];
    for (const acct of accounts ?? []) {
      if (onlyAccount && acct.id !== onlyAccount) continue;

      // Last published snapshot → diff baseline + period start.
      const { data: prev } = await supabase
        .from("weekly_snapshots")
        .select("id, state, period_end, created_at")
        .eq("account_id", acct.id).eq("status", "published")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const prevProjects: Record<string, string> = (prev?.state?.projects) || {};
      // A true delta needs a stored project baseline. The first snapshot (or a
      // seeded one with no state) shows current active work instead of claiming
      // everything ever completed "shipped this week".
      const hasBaseline = !!(prev && prev.state && prev.state.projects);
      const periodStart = prev ? new Date(prev.period_end || prev.created_at) : new Date(now.getTime() - 7 * 864e5);

      const [{ data: projects }, { data: actions }, { data: leads }] = await Promise.all([
        supabase.from("projects").select("monday_item_id, title, status, due_label, pulse").eq("account_id", acct.id),
        supabase.from("action_items").select("title, due_label").eq("account_id", acct.id).order("sort"),
        supabase.from("leads").select("name, value, source, created_at").eq("account_id", acct.id),
      ]);
      const projs = projects || [];

      // Deltas vs last published snapshot.
      const shipped = hasBaseline
        ? projs.filter((p) => p.status === "live" && prevProjects[p.monday_item_id] !== "live")
        : [];
      const inMotion = hasBaseline
        ? projs.filter((p) => p.status !== "live" && !(p.monday_item_id in prevProjects))
        : projs.filter((p) => p.status !== "live").slice(0, 6); // first snapshot: current active work
      const waiting = actions || [];
      const newLeads = (leads || []).filter((l) => l.created_at && new Date(l.created_at) >= periodStart);
      const leadsSum = newLeads.reduce((t, l) => t + parseMoney(l.value), 0);
      const leadsValue = leadsSum > 0 ? `$${leadsSum.toLocaleString("en-US")}` : "";

      // Auto headline (staff can edit before publishing).
      const bits: string[] = [];
      if (shipped.length) bits.push(`${shipped.length} ${shipped.length === 1 ? "thing" : "things"} shipped`);
      if (newLeads.length) bits.push(`${newLeads.length} new ${newLeads.length === 1 ? "lead" : "leads"}`);
      if (waiting.length) bits.push(`${waiting.length} waiting on you`);
      const headline = bits.length ? cap(bits.join(" · ")) : "A steady week — here’s where things stand.";

      const weekLabel = `Week of ${fmtDay(now)}`;
      const newState = { projects: Object.fromEntries(projs.map((p) => [p.monday_item_id, p.status])) };

      // Replace any existing draft for this account (keep published history).
      const { data: oldDrafts } = await supabase
        .from("weekly_snapshots").select("id").eq("account_id", acct.id).eq("status", "draft");
      const oldIds = (oldDrafts || []).map((d) => d.id);
      if (oldIds.length) {
        await supabase.from("weekly_snapshot_items").delete().in("snapshot_id", oldIds);
        await supabase.from("weekly_snapshots").delete().in("id", oldIds);
      }

      const { data: snap, error: snapErr } = await supabase.from("weekly_snapshots").insert({
        account_id: acct.id,
        week_label: weekLabel,
        status: "draft",
        is_current: false,
        headline,
        note: null,
        summary_completed: shipped.length,
        summary_waiting: waiting.length,
        summary_leads: newLeads.length,
        leads_value: leadsValue,
        quarterly_href: "roi",
        period_start: periodStart.toISOString(),
        period_end: now.toISOString(),
        state: newState,
        sort: 0,
      }).select("id").single();
      if (snapErr) throw snapErr;

      const items: any[] = [];
      shipped.slice(0, 10).forEach((p, i) => items.push({ snapshot_id: snap.id, kind: "completed", text: p.title, meta: p.pulse || null, sort: i }));
      inMotion.slice(0, 10).forEach((p, i) => items.push({ snapshot_id: snap.id, kind: "upcoming", text: p.title, meta: p.due_label || null, sort: i }));
      waiting.slice(0, 10).forEach((a, i) => items.push({ snapshot_id: snap.id, kind: "waiting", text: a.title, meta: a.due_label || null, sort: i }));
      newLeads.slice(0, 10).forEach((l, i) => items.push({ snapshot_id: snap.id, kind: "lead", text: l.name || "New lead", meta: l.source || null, sort: i }));
      if (items.length) {
        const { error: itErr } = await supabase.from("weekly_snapshot_items").insert(items);
        if (itErr) throw itErr;
      }

      summary.push({ account: acct.id, shipped: shipped.length, inMotion: inMotion.length, waiting: waiting.length, newLeads: newLeads.length });
    }

    return Response.json({ ok: true, summary });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
