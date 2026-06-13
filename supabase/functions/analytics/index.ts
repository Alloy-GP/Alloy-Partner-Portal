import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Performance page data. Account-scoped (clients only their own account; staff
// any). Ahrefs v3, all auto-matched by the account's domain — no per-account
// project IDs needed. Defensive: each source in try/catch → errors return that
// section null so the client falls back to sample per-section.
//
// LIVE from Ahrefs: scorecard (DR / organic traffic / traffic value), 12-month
// traffic trend, Site Explorer (backlinks / ref domains / top pages), Rankings
// + Keyword opportunities (organic keywords), Site Audit (health + issues,
// matched by domain in /site-audit/projects).
// NOT wired: Brand Radar (Ahrefs API 404s on this plan), GA4 (web analytics),
// Google Ads (paid search).
//
// Secrets: AHREFS_API_KEY. Per-account: accounts.website (domain).
// Staff `{action:"discover"}` lists Ahrefs projects / site-audit projects.
// Money note: Ahrefs monetary values are USD CENTS — divide by 100.

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

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const { data: auth } = await userClient.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: me } = await userClient.from("profiles").select("account_id, is_staff").eq("id", user.id).maybeSingle();
    if (!me?.account_id && !me?.is_staff) return json({ error: "forbidden" }, 403);
    const body = await req.json().catch(() => ({}));

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
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: acct } = await admin.from("accounts").select("website").eq("id", accountId).maybeSingle();
    const website = (acct?.website || "").trim();
    const hasKey = !!Deno.env.get("AHREFS_API_KEY");
    if (!hasKey || !website) return json({ configured: false, website: website || null, reason: !hasKey ? "no_key" : "no_website" });

    const out: Record<string, unknown> = { configured: true, website };
    const t = today(), from = daysAgo(365);

    // --- Scorecard (DR / organic traffic / traffic value) + 12-month trend ---
    try {
      const [dr, metrics, hist] = await Promise.all([
        ah("/site-explorer/domain-rating", { target: website, date: t, protocol: "both" }).catch(() => null),
        ah("/site-explorer/metrics", { target: website, date: t, volume_mode: "monthly", protocol: "both" }).catch(() => null),
        ah("/site-explorer/metrics-history", { target: website, date_from: from, date_to: t, volume_mode: "monthly", protocol: "both", history_grouping: "monthly" }).catch(() => null),
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

    // --- Site Explorer: backlinks + referring domains + top pages ---
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

    // --- Rankings + Keyword opportunities (organic keywords, by position) ---
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

    // --- Site Audit (Technical health) — matched by domain in the audit list ---
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

    // Not wired: Brand Radar (Ahrefs API 404 on this plan), GA4, Google Ads.
    out.brandRadar = null;
    out.webAnalytics = null;
    out.paidSearch = null;
    return json(out);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
