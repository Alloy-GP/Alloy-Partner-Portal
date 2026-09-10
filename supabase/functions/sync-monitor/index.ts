import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================================
// sync-monitor — the watchdog. pg_cron calls it every 10 min (x-sync-secret).
//
// 1. HARVEST  Every cron job records the pg_net request id it fires in
//             cron_http_requests (20260909210000_sync_monitor.sql wraps the
//             commands). Pull the ones that have a response (or none after
//             10 min), classify, store in sync_runs. pg_net forgets responses
//             after ~6h; sync_runs is the durable log.
// 2. EVALUATE For each ACTIVE cron job: "fail" if its latest run failed,
//             "stale" if nothing ran inside its window (derived from the cron
//             expression; never under 2h). Plus the data-level check that would
//             have caught the 2026-08-17 outage on day one: every Monday board
//             must re-stamp monday_sync_status within 2h.
// 3. ALERT    sync_alerts holds open problems, with HYSTERESIS so a flapping
//             job is one incident, not one email per flip (first night: 19 of
//             41 WhatConverts runs failed, never twice in a row, 22 emails):
//               - a frequent job (window <= 6h) gets one bad tick free: alert
//                 on two failures in a row or >= 3 in 6h; daily+ jobs alert on
//                 any failure. Once open, it stays open while either holds.
//               - recovery must HOLD 2h (frequent jobs) before "recovered";
//                 a failure inside the hold is a flap, counted, not emailed.
//               - new -> email now; still open after 24h -> reminder.
//             One email per run, however many problems changed. The email goes
//             out BEFORE state is written, so a Resend failure retries next run.
//
// Recipients: app_config.sync_alert_emails (comma/space separated) if set, else
// every staff profile's auth email. Body {"test":"email"} sends a test message
// and changes nothing. verify_jwt: false, gated by SYNC_SECRET (fails closed).
// ============================================================================

const PORTAL_URL = Deno.env.get("PORTAL_URL") || "https://growth.alloygp.co";
const HEALTH_URL = `${PORTAL_URL}/admin/health`;
const FROM = "Alloy Growth Partners <noreply@alloygp.co>";
const REMIND_MS = 24 * 3600_000;
const BOARD_STALE_MS = 2 * 3600_000; // matches SyncHealth.jsx STALE_MS
const FREQUENT_MS = 6 * 3600_000;      // a job whose silence window is <= this runs often enough to flap
const FLAP_WINDOW_MS = 6 * 3600_000;   // count a frequent job's failures over this window...
const FLAP_THRESHOLD = 3;              // ...and this many = flaky = alert, even if never two in a row
const RECOVERY_HOLD_MS = 2 * 3600_000; // a frequent job must stay clean this long before "recovered"
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Pending = {
  request_id: number; job_name: string; requested_at: string; responded_at: string | null;
  status_code: number | null; timed_out: boolean | null; error_msg: string | null; content: string | null;
};
type Run = { source: string; started_at: string; ok: boolean; error: string | null; status_code: number | null };
type Problem = { key: string; kind: "fail" | "stale"; source: string; detail: Record<string, unknown> };

function tryJson(s: string | null): any { if (!s) return null; try { return JSON.parse(s); } catch { return null; } }
const excerpt = (s: string | null, n = 300) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);

// One request -> ok / failed + a one-line reason. A 200 can still be a failure:
// the sync functions answer {ok:false} / {failed:N} / per-account {error}.
function classify(p: Pending, now: number): { ok: boolean; error: string | null; summary: unknown } {
  if (!p.responded_at) {
    const lost = now - Date.parse(p.requested_at) > 6 * 3600_000;
    return {
      ok: false, summary: null,
      error: lost
        ? "no response on record (pg_net expired it before the watchdog harvested - was the watchdog down?)"
        : "no response from pg_net within 10 minutes",
    };
  }
  if (p.timed_out) return { ok: false, error: "timed out", summary: null };
  if (p.error_msg) return { ok: false, error: p.error_msg, summary: null };
  const body = tryJson(p.content);
  if (p.status_code == null || p.status_code < 200 || p.status_code >= 300) {
    return { ok: false, error: `HTTP ${p.status_code ?? "?"}: ${body?.error ?? excerpt(p.content)}`, summary: body };
  }
  if (body && typeof body === "object") {
    const items: any[] = Array.isArray(body.summary) ? body.summary : Array.isArray(body.accounts) ? body.accounts : [];
    const bad = items.filter((x) => x && (x.ok === false || x.error));
    if (body.ok === false || (typeof body.failed === "number" && body.failed > 0) || bad.length) {
      const parts = bad.map((x) => `${x.name ?? x.short_name ?? x.account ?? "?"}: ${x.error ?? "failed"}`);
      return { ok: false, error: parts.length ? parts.join("; ") : String(body.error ?? "reported ok:false"), summary: body };
    }
  }
  return { ok: true, error: null, summary: body };
}

// Max silence before a job counts as stale, from its cron expression. Generous
// (>= 4 intervals and >= 2h) so a slow run or one skipped tick never pages
// anyone. Month-day jobs (month-end snapshots) are not judged for silence.
function maxSilenceMs(schedule: string): number | null {
  const f = schedule.trim().split(/\s+/);
  if (f.length < 5) return null;
  const [min, hour, dom, , dow] = f;
  if (dom !== "*") return null;
  if (dow !== "*") return 8 * 86400_000;
  if (hour !== "*") return 26 * 3600_000;
  let every = 60;
  const m = /^\*\/(\d+)$/.exec(min);
  if (m) every = Number(m[1]);
  else if (min === "*") every = 1;
  else if (min.includes(",")) every = Math.round(60 / min.split(",").length);
  return Math.max(2 * 3600_000, 4 * every * 60_000);
}

async function recipients(db: any): Promise<string[]> {
  const { data: cfg } = await db.from("app_config").select("value").eq("key", "sync_alert_emails").maybeSingle();
  const configured = String(cfg?.value || "").split(/[\s,;]+/).map((s: string) => s.trim()).filter((s: string) => s.includes("@"));
  if (configured.length) return configured;
  const { data: staff } = await db.from("profiles").select("id").eq("is_staff", true);
  const ids = new Set((staff ?? []).map((s: any) => s.id));
  const out: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (ids.has(u.id) && u.email) out.push(u.email);
    if (data.users.length < 200) break;
  }
  return out;
}

async function sendEmail(to: string[], subject: string, html: string, text: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || !to.length) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${excerpt(await res.text(), 300)}`);
  return true;
}

function describe(p: Problem): { title: string; what: string } {
  const d = p.detail as any;
  if (p.kind === "stale") {
    const what = Array.isArray(d.boards)
      ? `no re-stamp within 2h: ${d.boards.join(", ")}`
      : `no run in ${d.window_hours}h (schedule "${d.schedule}"; last ${d.last_run ? new Date(d.last_run).toUTCString() : "never"})`;
    return { title: `${p.source} is silent`, what };
  }
  const flaky = d.fails_recent != null && d.runs_recent != null && d.fails_recent < d.runs_recent
    ? ` (flaky: ${d.fails_recent} of ${d.runs_recent} runs failed in the last ${d.recent_hours}h)` : "";
  return { title: `${p.source} is failing`, what: `${d.status_code != null ? `HTTP ${d.status_code} - ` : ""}${d.error ?? "failed"}${flaky}` };
}

function renderEmail(fresh: Problem[], reminders: Problem[], recovered: any[]): { subject: string; html: string; text: string } {
  const failing = [...fresh, ...reminders];
  const subject = failing.length
    ? `[Alloy portal] ${failing.length} sync${failing.length === 1 ? "" : "s"} failing${recovered.length ? `, ${recovered.length} recovered` : ""}: ${failing.map((p) => p.source).join(", ")}`
    : `[Alloy portal] Sync recovered: ${recovered.map((a) => a.source).join(", ")}`;
  const sections: string[] = [];
  const textParts: string[] = [];
  const block = (title: string, items: { title: string; what: string }[], color: string) => {
    if (!items.length) return;
    sections.push(
      `<h3 style="margin:18px 0 6px;font:700 14px/1.3 Inter,Arial,sans-serif;color:${color}">${esc(title)}</h3>` +
      `<ul style="margin:0;padding-left:18px;font:13px/1.5 Inter,Arial,sans-serif;color:#222">` +
      items.map((i) => `<li><b>${esc(i.title)}</b> - ${esc(i.what)}</li>`).join("") + `</ul>`,
    );
    textParts.push(`${title}\n${items.map((i) => `- ${i.title} - ${i.what}`).join("\n")}`);
  };
  block("New", fresh.map(describe), "#b03a3a");
  block("Still broken (daily reminder)", reminders.map(describe), "#b03a3a");
  block("Recovered", recovered.map((a) => ({
    title: a.source,
    what: `was ${a.kind === "stale" ? "silent" : "failing"} since ${new Date(a.first_seen).toUTCString()}${a.flap_count ? `, came back ${a.flap_count}x before staying clear` : ""}`,
  })), "#2c8a6e");
  const html = `<div style="max-width:640px;margin:0 auto;padding:20px;font:14px/1.5 Inter,Arial,sans-serif;color:#222">
    <div style="font:800 18px/1.2 Poppins,Inter,Arial,sans-serif;color:#3b1e6e">Sync watchdog</div>
    ${sections.join("")}
    <p style="margin:18px 0 0"><a href="${HEALTH_URL}" style="color:#3b1e6e;font-weight:700">Open Sync Health</a> for every board, the failed runs, and the runbook in CLAUDE.md (section "SYNC_SECRET").</p>
    <p style="margin:10px 0 0;font-size:11.5px;color:#777">Sent by the sync-monitor edge function (every 10 min, only when something changes). Recipients: app_config.sync_alert_emails, else all staff.</p>
  </div>`;
  const text = `Sync watchdog\n\n${textParts.join("\n\n")}\n\nSync Health: ${HEALTH_URL}`;
  return { subject, html, text };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }

    // AUTH — FAIL CLOSED (the contract every sync function follows; CLAUDE.md).
    const secret = Deno.env.get("SYNC_SECRET") || "";
    const provided = req.headers.get("x-sync-secret") || url.searchParams.get("secret") || "";
    if (!secret || provided !== secret) return new Response("unauthorized", { status: 401 });

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    if (body?.test === "email") {
      const to = await recipients(db);
      const sent = await sendEmail(to, "[Alloy portal] Sync watchdog test",
        `<p>This is a test from the sync watchdog. If you can read this, alerts will reach you.</p><p><a href="${HEALTH_URL}">Sync Health</a></p>`,
        `Test from the sync watchdog. Sync Health: ${HEALTH_URL}`);
      return Response.json({ ok: sent, test: true, recipients: to.length, sent, ...(sent ? {} : { error: "not sent: no recipients or RESEND_API_KEY unset" }) });
    }

    // 1) HARVEST — pending cron results -> sync_runs (idempotent on request_id).
    const { data: pending, error: pErr } = await db.rpc("sync_pending_cron_results");
    if (pErr) throw pErr;
    const harvested: any[] = [];
    for (const p of (pending ?? []) as Pending[]) {
      const c = classify(p, now);
      const summary = c.summary && JSON.stringify(c.summary).length > 8000 ? { truncated: excerpt(p.content, 2000) } : c.summary;
      harvested.push({
        source: p.job_name, trigger: "cron", started_at: p.requested_at, finished_at: p.responded_at,
        ok: c.ok, status_code: p.status_code, error: c.error, summary, request_id: p.request_id,
      });
    }
    if (harvested.length) {
      const { error } = await db.from("sync_runs").upsert(harvested, { onConflict: "request_id", ignoreDuplicates: true });
      if (error) throw error;
      const { error: mErr } = await db.rpc("sync_mark_harvested", { ids: harvested.map((h) => h.request_id) });
      if (mErr) throw mErr;
    }

    // 2) EVALUATE — every active cron job, plus the Monday boards' own stamps.
    const { data: sinceCfg } = await db.from("app_config").select("value").eq("key", "sync_monitor_since").maybeSingle();
    const trackingSince = Date.parse(sinceCfg?.value ?? "") || now;
    const { data: jobs, error: jErr } = await db.rpc("sync_cron_jobs");
    if (jErr) throw jErr;
    const { data: recent, error: rErr } = await db.from("sync_runs")
      .select("source, started_at, ok, error, status_code")
      .gte("started_at", new Date(now - 9 * 86400_000).toISOString())
      .order("started_at", { ascending: false }).limit(3000);
    if (rErr) throw rErr;
    const bySource = new Map<string, Run[]>(); // newest first (query is ordered desc)
    for (const r of (recent ?? []) as Run[]) { const l = bySource.get(r.source) ?? []; l.push(r); bySource.set(r.source, l); }
    const { data: openRows, error: oErr } = await db.from("sync_alerts").select("*").is("resolved_at", null);
    if (oErr) throw oErr;
    const open = new Map<string, any>((openRows ?? []).map((a: any) => [a.key, a]));
    const holdMs = new Map<string, number>(); // per source: how long a recovery must hold before it counts

    const problems: Problem[] = [];
    for (const j of (jobs ?? []) as { jobname: string; schedule: string; active: boolean }[]) {
      if (!j.active) continue;
      const runs = bySource.get(j.jobname) ?? [];
      const last = runs[0];
      const win = maxSilenceMs(j.schedule);
      const frequent = win != null && win <= FREQUENT_MS;
      holdMs.set(j.jobname, frequent ? RECOVERY_HOLD_MS : 0);
      const recentRuns = runs.filter((r) => now - Date.parse(r.started_at) <= FLAP_WINDOW_MS);
      const failsRecent = recentRuns.filter((r) => !r.ok).length;
      const failingNow = !!last && !last.ok;
      const prevFailed = !!runs[1] && !runs[1].ok;
      const alreadyOpen = open.has(`fail:${j.jobname}`);
      // A frequent job gets one bad tick free: alert on two in a row, or on
      // FLAP_THRESHOLD failures inside the window (flaky); once open, stay open
      // while either holds. Infrequent jobs (daily+) alert on any failure —
      // one miss there is a day of missing data.
      const present = frequent
        ? (failingNow && (prevFailed || failsRecent >= FLAP_THRESHOLD)) || (alreadyOpen && (failingNow || failsRecent >= FLAP_THRESHOLD))
        : failingNow;
      if (present) {
        const lastFail = runs.find((r) => !r.ok) ?? last;
        problems.push({ key: `fail:${j.jobname}`, kind: "fail", source: j.jobname, detail: {
          error: lastFail.error, status_code: lastFail.status_code, at: lastFail.started_at, schedule: j.schedule,
          fails_recent: failsRecent, runs_recent: recentRuns.length, recent_hours: FLAP_WINDOW_MS / 3600_000,
        } });
      }
      if (win != null) {
        const lastAt = last ? Date.parse(last.started_at) : trackingSince;
        if (now - lastAt > win) {
          problems.push({ key: `stale:${j.jobname}`, kind: "stale", source: j.jobname,
            detail: { last_run: last?.started_at ?? null, window_hours: Math.round(win / 3600_000), schedule: j.schedule } });
        }
      }
    }
    const { data: boards, error: bErr } = await db.from("monday_sync_status").select("account_id, synced_at, accounts(short_name)");
    if (bErr) throw bErr;
    const staleBoards = (boards ?? [])
      .filter((b: any) => now - Date.parse(b.synced_at) > BOARD_STALE_MS)
      .map((b: any) => `${b.accounts?.short_name ?? b.account_id} (${Math.floor((now - Date.parse(b.synced_at)) / 3600_000)}h)`);
    if (staleBoards.length) {
      problems.push({ key: "stale:monday-boards", kind: "stale", source: "monday-boards", detail: { boards: staleBoards } });
    }
    holdMs.set("monday-boards", RECOVERY_HOLD_MS);

    // 3) ALERT — diff against open alerts, with hysteresis; email first, then persist.
    //   new problem          -> insert + "New"
    //   open, still present  -> a running recovery hold means it came BACK: flap, cleared, no email;
    //                           remind every 24h
    //   open, absent         -> start (or continue) the recovery hold; "Recovered" only once it has held
    const problemByKey = new Map(problems.map((p) => [p.key, p]));
    const fresh: Problem[] = [], reminders: Problem[] = [], recovered: any[] = [];
    const patches = new Map<number, any>();
    for (const p of problems) if (!open.has(p.key)) fresh.push(p);
    for (const a of openRows ?? []) {
      const p = problemByKey.get(a.key);
      if (p) {
        const patch: any = { last_seen: nowIso, detail: p.detail };
        if (a.clear_since) { patch.clear_since = null; patch.flap_count = (a.flap_count ?? 0) + 1; }
        if (!a.last_notified_at || now - Date.parse(a.last_notified_at) > REMIND_MS) reminders.push(p);
        patches.set(a.id, patch);
      } else {
        const hold = holdMs.get(a.source) ?? 0;
        const clearSince = a.clear_since ? Date.parse(a.clear_since) : now;
        if (now - clearSince >= hold) recovered.push(a);
        else if (!a.clear_since) patches.set(a.id, { clear_since: nowIso });
      }
    }

    let emailed = false;
    const changed = fresh.length + reminders.length + recovered.length > 0;
    if (changed) {
      const mail = renderEmail(fresh, reminders, recovered);
      emailed = await sendEmail(await recipients(db), mail.subject, mail.html, mail.text);
    }
    for (const p of fresh) {
      const { error } = await db.from("sync_alerts").insert({
        key: p.key, kind: p.kind, source: p.source, detail: p.detail,
        first_seen: nowIso, last_seen: nowIso, last_notified_at: emailed ? nowIso : null, notify_count: emailed ? 1 : 0,
      });
      if (error) throw error;
    }
    if (emailed) {
      for (const p of reminders) {
        const a = open.get(p.key);
        const patch = patches.get(a.id) ?? {};
        patch.last_notified_at = nowIso; patch.notify_count = (a.notify_count ?? 0) + 1;
        patches.set(a.id, patch);
      }
    }
    for (const [id, patch] of patches) {
      const { error } = await db.from("sync_alerts").update(patch).eq("id", id);
      if (error) throw error;
    }
    for (const a of recovered) {
      const { error } = await db.from("sync_alerts").update({ resolved_at: nowIso }).eq("id", a.id);
      if (error) throw error;
    }

    // 4) HOUSEKEEPING — bounded tables.
    await db.from("sync_runs").delete().lt("started_at", new Date(now - 90 * 86400_000).toISOString());
    await db.from("sync_alerts").delete().not("resolved_at", "is", null).lt("resolved_at", new Date(now - 180 * 86400_000).toISOString());
    await db.from("cron_http_requests").delete().not("harvested_at", "is", null).lt("requested_at", new Date(now - 7 * 86400_000).toISOString());

    // A watchdog nobody can hear is a failure: surface it as one (this run's
    // own harvested row then shows red in Sync Health).
    const mute = changed && !emailed;
    return Response.json({
      ok: !mute, ...(mute ? { error: "alerts not emailed: no recipients or RESEND_API_KEY unset" } : {}),
      harvested: harvested.length, problems: problems.map((p) => p.key),
      notified: { fresh: fresh.map((p) => p.key), reminders: reminders.map((p) => p.key), recovered: recovered.map((a) => a.key) },
      emailed,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
