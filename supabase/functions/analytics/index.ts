import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Performance page data. Account-scoped (clients only their own account; staff
// any). Pulls Ahrefs v3 for the domain-based metrics (Site Explorer scorecard,
// traffic history, backlinks, top pages). Project-id-gated Ahrefs sources
// (Rank Tracker / Site Audit / Brand Radar) and the Google sources (GA4 web
// analytics, Google Ads paid search) return null until configured/wired — the
// client falls back to sample data per-section, so the page never breaks.
//
// Secrets: AHREFS_API_KEY.
// Per-account config: accounts.website (domain) + accounts.analytics_config
//   { ahrefsRankProjectId, ahrefsAuditProjectId, brandRadarReportId,
//     ga4PropertyId, googleAdsCustomerId }.
// Money note: Ahrefs returns monetary values in USD CENTS — divide by 100.

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

// Ahrefs v3 GET. Returns parsed JSON or throws.
async function ah(path: string, params: Record<string, string>): Promise<any> {
  const key = Deno.env.get("AHREFS_API_KEY");
  if (!key) throw new Error("no AHREFS_API_KEY");
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${AH_BASE}${path}?${qs}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`ahrefs ${path} ${r.status}`);
  return r.json();
}

const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`);

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: me } = await userClient
      .from("profiles").select("account_id, is_staff").eq("id", user.id).maybeSingle();
    if (!me?.account_id && !me?.is_staff) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const accountId = me.is_staff && body.accountId ? String(body.accountId) : me.account_id;

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: acct } = await admin
      .from("accounts").select("website, analytics_config").eq("id", accountId).maybeSingle();

    const website = (acct?.website || "").trim();
    const cfg = (acct?.analytics_config || {}) as Record<string, string>;
    const hasKey = !!Deno.env.get("AHREFS_API_KEY");

    // Nothing to wire from → tell the client to use sample data.
    if (!hasKey || !website) {
      return json({ configured: false, website: website || null, reason: !hasKey ? "no_key" : "no_website" });
    }

    const out: Record<string, unknown> = { configured: true, website };
    const t = today(), from = daysAgo(84); // ~12 weeks

    // --- Site Explorer scorecard: DR + organic traffic + traffic value ---
    try {
      const [dr, metrics, hist] = await Promise.all([
        ah("/site-explorer/domain-rating", { target: website, date: t, protocol: "both" }).catch(() => null),
        ah("/site-explorer/metrics", { target: website, date: t, volume_mode: "monthly", protocol: "both" }).catch(() => null),
        ah("/site-explorer/metrics-history", { target: website, date_from: from, date_to: t, volume_mode: "monthly", protocol: "both" }).catch(() => null),
      ]);
      const drv = dr?.domain_rating?.domain_rating ?? dr?.domain_rating ?? null;
      const m = metrics?.metrics || metrics || {};
      const orgTraffic = m.org_traffic ?? m.organic_traffic ?? null;
      const orgCostCents = m.org_cost ?? m.organic_cost ?? null; // USD cents
      const series = (hist?.metrics || hist?.metrics_history || []).map((x: any) => x.org_traffic ?? x.organic_traffic ?? 0);

      const sc: any[] = [];
      if (orgTraffic != null) sc.push({ key: "traffic", label: "Organic traffic", value: fmtNum(orgTraffic), unit: "/mo", color: "#d9356e" });
      if (orgCostCents != null) sc.push({ key: "trafficVal", label: "Traffic value", value: fmtK(orgCostCents / 100), unit: "/mo", color: "#2c7d68" });
      if (drv != null) sc.push({ key: "dr", label: "Domain Rating", value: String(Math.round(drv)), unit: "/100", color: "#2a6391" });
      out.scorecard = sc.length ? sc : null;
      out.trafficSeries = series.length ? series : null;
      out.organicTraffic = orgTraffic != null ? fmtNum(orgTraffic) : null;
    } catch { out.scorecard = null; out.trafficSeries = null; }

    // --- Site Explorer: backlinks + referring domains + top pages ---
    try {
      const [bs, top] = await Promise.all([
        ah("/site-explorer/backlinks-stats", { target: website, date: t, protocol: "both" }).catch(() => null),
        ah("/site-explorer/top-pages", { target: website, date: t, protocol: "both", limit: "4", order_by: "sum_traffic_merged:desc" }).catch(() => null),
      ]);
      const m = bs?.metrics || bs || {};
      const backlinks = m.live ?? m.backlinks ?? m.live_backlinks ?? null;
      const refDomains = m.live_refdomains ?? m.refdomains ?? m.referring_domains ?? null;
      const pages = (top?.pages || []).slice(0, 4).map((p: any) => ({
        url: (() => { try { return new URL(p.url).pathname || p.url; } catch { return p.url; } })(),
        traffic: fmtNum(p.sum_traffic ?? p.traffic ?? 0),
        value: fmtK((p.value ?? p.traffic_value ?? 0) / 100),
      }));
      out.siteExplorer = (backlinks != null || refDomains != null || pages.length)
        ? { backlinks: backlinks != null ? fmtNum(backlinks) : "—", refDomains: refDomains != null ? fmtNum(refDomains) : "—", topPages: pages }
        : null;
    } catch { out.siteExplorer = null; }

    // --- Project-id-gated Ahrefs sources: only when configured ---
    // Rank Tracker / Site Audit / Brand Radar have richer per-project shapes;
    // left null until the project ids are set + verified against live responses.
    out.rankTracker = null;   // needs cfg.ahrefsRankProjectId
    out.siteAudit = null;     // needs cfg.ahrefsAuditProjectId
    out.brandRadar = null;    // needs cfg.brandRadarReportId
    out.keywords = null;

    // --- Google sources: not wired yet ---
    out.webAnalytics = null;  // GA4 (cfg.ga4PropertyId)
    out.paidSearch = null;    // Google Ads (cfg.googleAdsCustomerId)

    return json(out);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
