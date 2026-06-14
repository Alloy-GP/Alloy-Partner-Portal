import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Performance page data. Account-scoped. Ahrefs v3, auto-matched by domain.
// LIVE: scorecard, traffic trend, Site Explorer, Rankings, Keywords, Site Audit,
// Traffic sources (Ahrefs Web Analytics). NOT wired: Brand Radar (no data yet),
// Paid Search (Google Ads). Secrets: AHREFS_API_KEY. Per-account: accounts.website.
//
// CACHING: Ahrefs is slow (~8-9s/account even with the 5 source blocks run
// concurrently). Results are cached in `analytics_cache` keyed by (account_id,
// range). The read path serves cache when fresh (<26h) and lazily fills on
// miss/stale. A daily cron hits {action:"refresh"} (secret-guarded) to pre-warm
// the default range for every account, so the common load is instant.
//
// verify_jwt is FALSE (like the other cron-callable functions): the data path
// still enforces auth in-code via getUser; the refresh path is guarded by a
// secret stored in app_config.

const AH_BASE = "https://api.ahrefs.com/v3";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
function normDomain(u: string): string {
  let s = String(u || "").trim().toLowerCase();
  s = s.replace("https://", "").replace("http://", "");
  if (s.startsWith("www.")) s = s.slice(4);
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
async function ah(path: string, params: Record<string, string> = {}): Promise<any> {
  const key = Deno.env.get("AHREFS_API_KEY");
  if (!key) throw new Error("no AHREFS_API_KEY");
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${AH_BASE}${path}${qs ? "?" + qs : ""}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`ahrefs ${path} ${r.status} ${await r.text()}`);
  return r.json();
}
const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);
const fmtVol = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n || 0)));

// Trend window for the organic-traffic chart, driven by the page's timeframe
// toggle. Short windows group daily; long ones group monthly.
const RANGE: Record<string, { days: number; grouping: string }> = {
  "30d": { days: 30, grouping: "daily" },
  "90d": { days: 90, grouping: "daily" },
  "12mo": { days: 365, grouping: "monthly" },
  "All": { days: 365 * 5, grouping: "monthly" },
};
const normRange = (v: unknown) => (RANGE[String(v)] ? String(v) : "12mo");
const CACHE_FRESH_MS = 26 * 3600 * 1000; // a touch over 24h so the daily cron always counts as fresh

// Build the live payload for one domain + range by hitting Ahrefs. The five
// source blocks run concurrently; each has its own try/catch so a failing
// source nulls only its own keys.
async function buildPayload(website: string, rangeKey: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { configured: true, website };
  const t = today();
  const r = RANGE[rangeKey] || RANGE["12mo"];
  const from = daysAgo(r.days);

  // --- Scorecard (DR / organic traffic / traffic value) + traffic trend ---
  const scorecardBlock = async () => {
    try {
      const [dr, metrics, hist] = await Promise.all([
        ah("/site-explorer/domain-rating", { target: website, date: t, protocol: "both" }).catch(() => null),
        ah("/site-explorer/metrics", { target: website, date: t, volume_mode: "monthly", protocol: "both" }).catch(() => null),
        ah("/site-explorer/metrics-history", { target: website, date_from: from, date_to: t, volume_mode: "monthly", protocol: "both", history_grouping: r.grouping }).catch(() => null),
      ]);
      const drv = dr?.domain_rating?.domain_rating ?? dr?.domain_rating ?? null;
      const m = metrics?.metrics || metrics || {};
      const orgTraffic = m.org_traffic ?? m.organic_traffic ?? null;
      const orgCostCents = m.org_cost ?? m.organic_cost ?? null;
      const series = (hist?.metrics || hist?.metrics_history || []).map((x: any) => x.org_traffic ?? x.organic_traffic ?? 0);
      const sc: any[] = [];
      if (orgTraffic != null) sc.push({ key: "traffic", label: "Organic traffic", value: fmtNum(orgTraffic), unit: "/mo", color: "#d9356e" });
      if (orgCostCents != null) sc.push({ key: "trafficVal", label: "Traffic value", value: fmtK(orgCostCents / 100), unit: "/mo", color: "#2c7d68" });
      if (drv != null) sc.push({ key: "dr", label: "Domain Rating", value: String(Math.round(drv)), unit: "/100", color: "#2a6391" });
      out.scorecard = sc.length ? sc : null;
      out.trafficSeries = series.length ? series : null;
      out.organicTraffic = orgTraffic != null ? fmtNum(orgTraffic) : null;
    } catch { out.scorecard = null; out.trafficSeries = null; }
  };

  // --- Site Explorer: backlinks + referring domains + top pages ---
  const siteExplorerBlock = async () => {
    try {
      const bs = await ah("/site-explorer/backlinks-stats", { target: website, date: t, protocol: "both" }).catch(() => null);
      let pages: any[] = [];
      try {
        const top = await ah("/site-explorer/top-pages", { target: website, date: t, protocol: "both", country: "us", limit: "4", order_by: "sum_traffic:desc", select: "url,sum_traffic,value" });
        pages = (top?.pages || []).slice(0, 4).map((p: any) => ({
          url: (() => { try { return new URL(p.url).pathname || p.url; } catch { return p.url; } })(),
          traffic: fmtNum(p.sum_traffic ?? p.traffic ?? 0),
          value: fmtK((p.value ?? p.traffic_value ?? 0) / 100),
        }));
      } catch { /* optional */ }
      const m = bs?.metrics || bs || {};
      const backlinks = m.live ?? m.backlinks ?? m.live_backlinks ?? null;
      const refDomains = m.live_refdomains ?? m.refdomains ?? m.referring_domains ?? null;
      out.siteExplorer = (backlinks != null || refDomains != null || pages.length)
        ? { backlinks: backlinks != null ? fmtNum(backlinks) : "—", refDomains: refDomains != null ? fmtNum(refDomains) : "—", topPages: pages }
        : null;
    } catch { out.siteExplorer = null; }
  };

  // --- Rankings + Keyword opportunities (organic keywords, by position) ---
  const rankingsBlock = async () => {
    try {
      const ok = await ah("/site-explorer/organic-keywords", {
        target: website, country: "us", date: t, protocol: "both",
        select: "keyword,best_position,volume,sum_traffic,keyword_difficulty",
        order_by: "best_position:asc", limit: "1000",
      });
      const rows = (ok?.keywords || ok?.organic_keywords || []) as any[];
      const pos = (r: any) => Number(r.best_position ?? r.position ?? 999);
      const vol = (r: any) => Number(r.volume ?? 0);
      const tr = (r: any) => Number(r.sum_traffic ?? r.traffic ?? 0);
      if (rows.length) {
        const top3 = rows.filter((r) => pos(r) <= 3).length;
        const top10 = rows.filter((r) => pos(r) <= 10).length;
        const table = rows.slice().sort((a, b) => tr(b) - tr(a)).slice(0, 5).map((r) => ({ kw: r.keyword, pos: pos(r), vol: fmtVol(vol(r)) }));
        out.rankTracker = { tracked: rows.length, top3, top10, keywords: table };
        const opps = rows.filter((r) => pos(r) >= 4 && pos(r) <= 20).sort((a, b) => vol(b) - vol(a)).slice(0, 4)
          .map((r) => ({ kw: r.keyword, vol: fmtVol(vol(r)), kd: Math.round(Number(r.keyword_difficulty ?? 0)), intent: "—" }));
        out.keywords = opps.length ? opps : null;
      } else { out.rankTracker = null; out.keywords = null; }
    } catch { out.rankTracker = null; out.keywords = null; }
  };

  // --- Site Audit (Technical health) — matched by domain in the audit list ---
  const siteAuditBlock = async () => {
    try {
      const sa = await ah("/site-audit/projects");
      const w = normDomain(website);
      const hs = (sa?.healthscores || []).find((p: any) => normDomain(p.target_url) === w);
      out.siteAudit = hs ? {
        health: Math.round(Number(hs.health_score ?? 0)),
        issues: [
          { label: "Errors", count: Number(hs.urls_with_errors ?? 0), color: "#d9356e" },
          { label: "Warnings", count: Number(hs.urls_with_warnings ?? 0), color: "#a8761a" },
          { label: "Notices", count: Number(hs.urls_with_notices ?? 0), color: "#2a6391" },
        ],
      } : null;
    } catch { out.siteAudit = null; }
  };

  // --- Traffic sources (Ahrefs Web Analytics — first-party, by project) ---
  const webAnalyticsBlock = async () => {
    try {
      const proj = await ah("/management/projects").catch(() => null);
      const w = normDomain(website);
      const p = (proj?.projects || []).find((x: any) => normDomain(x.url) === w || normDomain(x.url).includes(w));
      const pid = p?.project_id ? String(p.project_id) : null;
      if (pid) {
        const r90 = { date_from: daysAgo(90), date_to: today() };
        const rPrev = { date_from: daysAgo(180), date_to: daysAgo(91) };
        const [stats, prev, ch, cities, dev] = await Promise.all([
          ah("/web-analytics/stats", { ...r90, project_id: pid }).catch(() => null),
          ah("/web-analytics/stats", { ...rPrev, project_id: pid }).catch(() => null),
          ah("/web-analytics/source-channels", { ...r90, project_id: pid }).catch(() => null),
          ah("/web-analytics/cities", { ...r90, project_id: pid }).catch(() => null),
          ah("/web-analytics/devices", { ...r90, project_id: pid }).catch(() => null),
        ]);
        const visits = stats?.stats?.visits ?? stats?.stats?.visitors ?? null;
        const prevVisits = prev?.stats?.visits ?? prev?.stats?.visitors ?? null;
        const visitsDelta = (visits != null && prevVisits) ? Math.round((visits - prevVisits) / prevVisits * 100) : null;
        const CH: Record<string, [string, string]> = {
          search: ["Organic search", "#2c7d68"], direct: ["Direct", "#381c4f"], referral: ["Referral", "#2a6391"],
          social: ["Social", "#d9356e"], paid: ["Paid", "#a8761a"], paid_search: ["Paid", "#a8761a"], "search/paid": ["Paid", "#a8761a"], email: ["Email", "#2a6391"],
        };
        const chRows = (ch?.stats || []).filter((c: any) => c.source_channel !== "internal");
        const chTotal = chRows.reduce((s: number, c: any) => s + (c.visitors || 0), 0) || 1;
        const channels = chRows.map((c: any) => {
          const meta = CH[c.source_channel] || [c.source_channel, "#8a8395"];
          return { name: meta[0], color: meta[1], value: Math.round((c.visitors || 0) / chTotal * 100) };
        }).sort((a: any, b: any) => b.value - a.value).slice(0, 5);
        const organicPct = (channels.find((c: any) => /organic/i.test(c.name)) || {}).value ?? null;
        const cityRows = cities?.stats || [];
        const cityTotal = cityRows.reduce((s: number, c: any) => s + (c.visitors || 0), 0) || 1;
        const geo = cityRows.slice(0, 5).map((c: any) => ({ name: c.city || c.name || "—", value: Math.round((c.visitors || 0) / cityTotal * 100) }));
        const DEV: Record<string, string> = { Desktop: "Desktop", Smartphone: "Mobile", Mobile: "Mobile", Tablet: "Tablet" };
        const devRows = (dev?.stats || []).filter((c: any) => c.device && c.device !== "Unknown" && (c.visitors || 0) > 0);
        const devTotal = devRows.reduce((s: number, c: any) => s + (c.visitors || 0), 0) || 1;
        const devices = devRows.map((c: any) => ({ name: DEV[c.device] || c.device, value: Math.round((c.visitors || 0) / devTotal * 100) }));
        out.webAnalytics = visits != null ? { visits: fmtNum(visits), visitsDelta, organicPct, channels, devices, geo } : null;
      } else out.webAnalytics = null;
    } catch { out.webAnalytics = null; }
  };

  await Promise.all([scorecardBlock(), siteExplorerBlock(), rankingsBlock(), siteAuditBlock(), webAnalyticsBlock()]);

  out.brandRadar = null;
  out.paidSearch = null;
  return out;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    // --- Daily cron pre-warm (secret-guarded; no user). Rebuilds the cache for
    // the default range across every account with a website. ---
    if (body.action === "refresh") {
      const { data: cfg } = await admin.from("app_config").select("value").eq("key", "analytics_cron_secret").maybeSingle();
      if (!cfg?.value || body.secret !== cfg.value) return json({ error: "forbidden" }, 403);
      if (!Deno.env.get("AHREFS_API_KEY")) return json({ error: "no_key" }, 200);
      const rangeKey = normRange(body.range);
      const { data: accts } = await admin.from("accounts").select("id, website").not("website", "is", null);
      let refreshed = 0; const errors: string[] = [];
      for (const a of (accts || [])) {
        const w = String((a as any).website || "").trim();
        if (!w) continue;
        try {
          const payload = await buildPayload(w, rangeKey);
          await admin.from("analytics_cache").upsert({ account_id: (a as any).id, range: rangeKey, payload, fetched_at: new Date().toISOString() });
          refreshed++;
        } catch (e) { errors.push(`${w}: ${String(e).slice(0, 120)}`); }
      }
      return json({ refreshed, range: rangeKey, errors });
    }

    // --- User-facing path (auth enforced in-code via getUser) ---
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: me } = await userClient.from("profiles").select("account_id, is_staff").eq("id", user.id).maybeSingle();
    if (!me?.account_id && !me?.is_staff) return json({ error: "forbidden" }, 403);

    // Staff-only: list Ahrefs projects / site-audit projects (for diagnostics).
    if (body.action === "discover") {
      if (!me.is_staff) return json({ error: "forbidden" }, 403);
      const probe = async (path: string, params: Record<string, string> = {}) => {
        try { return await ah(path, params); } catch (e) { return { error: String(e).slice(0, 240) }; }
      };
      const [projects, siteAudit, brandRadar] = await Promise.all([
        probe("/management/projects"),
        probe("/site-audit/projects"),
        probe("/management/brand-radar-reports"),
      ]);
      return json({ projects, siteAudit, brandRadar });
    }

    const accountId = me.is_staff && body.accountId ? String(body.accountId) : me.account_id;
    const { data: acct } = await admin.from("accounts").select("website").eq("id", accountId).maybeSingle();
    const website = (acct?.website || "").trim();
    const hasKey = !!Deno.env.get("AHREFS_API_KEY");
    if (!hasKey || !website) return json({ configured: false, website: website || null, reason: !hasKey ? "no_key" : "no_website" });

    const rangeKey = normRange(body.range);

    // Serve from cache when fresh; otherwise build live + cache it.
    const { data: cached } = await admin.from("analytics_cache").select("payload, fetched_at").eq("account_id", accountId).eq("range", rangeKey).maybeSingle();
    if (cached && cached.fetched_at && (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_FRESH_MS) {
      return json({ ...(cached.payload as Record<string, unknown>), cached: true, fetchedAt: cached.fetched_at });
    }

    const payload = await buildPayload(website, rangeKey);
    await admin.from("analytics_cache").upsert({ account_id: accountId, range: rangeKey, payload, fetched_at: new Date().toISOString() });
    return json({ ...payload, cached: false, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
