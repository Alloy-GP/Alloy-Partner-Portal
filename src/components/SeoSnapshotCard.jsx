import React from 'react';
import { I } from './icons.jsx';

/**
 * SEO Performance card — surfaces Ahrefs data in the portal.
 *
 * POC NOTE: the `POC_SEED` below is LIVE data pulled from the Ahrefs API for
 * riseamg.com on 2026-06-13 (Site Explorer + Rank Tracker + Site Audit). In
 * production this object comes from Supabase via loadData.js (`DATA.seo`),
 * populated by a `sync-ahrefs` edge function on a pg_cron schedule — mirroring
 * the WhatConverts integration. The component is data-driven, so wiring it to
 * real data is just passing a different `seo` prop.
 *
 * Ahrefs money fields arrive in USD cents → divide by 100 for display.
 */
const POC_SEED = {
  domain: 'riseamg.com',
  updatedLabel: 'Jun 13',
  crawledLabel: '1,326 pages crawled Jun 11',
  // Site Explorer — site-explorer-metrics / domain-rating / backlinks-stats
  orgTraffic: 1757,
  orgKeywords: 360,
  orgKeywordsTop3: 96,
  domainRating: 31,
  trafficValueCents: 153075, // → $1,531/mo
  backlinks: 1180,
  refDomains: 417,
  // Rank Tracker — rank-tracker-overview (58 tracked keywords)
  trackedTotal: 58,
  trackedTop10: 18,
  dist: { top3: 12, p4to10: 6, p11plus: 6 },
  topKeywords: [
    { keyword: 'rise association management group', position: 1, volume: 900 },
    { keyword: 'rise management', position: 1, volume: 600 },
    { keyword: 'what is a pud in real estate', position: 1, volume: 600 },
    { keyword: 'hoa management austin', position: 3, volume: 200 },
    { keyword: 'poa vs hoa', position: 9, volume: 800 },
    { keyword: 'what do hoa fees cover', position: 21, volume: 1000 },
  ],
  // Site Audit — site-audit-projects
  healthScore: 74,
  errors: 343,
  warnings: 414,
  notices: 244,
};

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const posClass = (p) => (p <= 3 ? 'pos-top' : p <= 10 ? 'pos-mid' : 'pos-low');

export default function SeoSnapshotCard({ seo = POC_SEED }) {
  const trafficValue = Math.round((seo.trafficValueCents || 0) / 100);
  const distTotal = Math.max(1, seo.dist.top3 + seo.dist.p4to10 + seo.dist.p11plus);
  const pct = (n) => `${Math.round((n / distTotal) * 100)}%`;

  return (
    <div className="seo-card">
      {/* Header */}
      <div className="seo-head">
        <span className="seo-ic"><I.TrendUp width={22} height={22} /></span>
        <div className="seo-titles">
          <div className="seo-kicker">Search performance</div>
          <div className="seo-title">SEO Performance</div>
        </div>
        <div className="seo-meta">
          Powered by <b>Ahrefs</b><br />{seo.domain} · updated {seo.updatedLabel}
        </div>
      </div>

      {/* Hero stat tiles */}
      <div className="seo-stats">
        <div className="seo-stat">
          <div className="num" style={{ color: 'var(--alloy-purple)' }}>{fmt(seo.orgTraffic)}</div>
          <div className="lbl">Organic traffic</div>
          <div className="sub">est. visits / mo</div>
        </div>
        <div className="seo-stat">
          <div className="num" style={{ color: '#2f6fb0' }}>{fmt(seo.orgKeywords)}</div>
          <div className="lbl">Ranking keywords</div>
          <div className="sub">{fmt(seo.orgKeywordsTop3)} in top 3</div>
        </div>
        <div className="seo-stat">
          <div className="num" style={{ color: 'var(--alloy-pink)' }}>{seo.domainRating}</div>
          <div className="lbl">Domain Rating</div>
          <div className="sub">authority / 100</div>
        </div>
        <div className="seo-stat">
          <div className="num" style={{ color: '#2c8a6e' }}>${fmt(trafficValue)}</div>
          <div className="lbl">Traffic value</div>
          <div className="sub">equiv. PPC / mo</div>
        </div>
      </div>

      {/* Lower sections */}
      <div className="seo-body">
        {/* Tracked keywords */}
        <div className="seo-sec">
          <div className="seo-sec-head">
            <span className="seo-sec-title">Tracked keywords</span>
            <span className="seo-sec-pill">{seo.trackedTotal} tracked · {seo.trackedTop10} in top 10</span>
          </div>
          {seo.topKeywords.map((k) => (
            <div className="kw" key={k.keyword}>
              <span className={`kw-pos ${posClass(k.position)}`}>{k.position}</span>
              <span className="kw-txt">{k.keyword}</span>
              <span className="kw-vol">{fmt(k.volume)} vol</span>
            </div>
          ))}
        </div>

        {/* Distribution + backlinks + health */}
        <div className="seo-sec">
          <div className="seo-sec-head"><span className="seo-sec-title">Rank distribution</span></div>
          <div className="dist">
            <div className="dist-row">
              <span className="dist-lbl">Pos 1–3</span>
              <span className="dist-track"><span className="dist-fill" style={{ width: pct(seo.dist.top3), background: 'var(--alloy-green, #2c8a6e)' }} /></span>
              <span className="dist-n">{seo.dist.top3}</span>
            </div>
            <div className="dist-row">
              <span className="dist-lbl">Pos 4–10</span>
              <span className="dist-track"><span className="dist-fill" style={{ width: pct(seo.dist.p4to10), background: 'var(--alloy-yellow)' }} /></span>
              <span className="dist-n">{seo.dist.p4to10}</span>
            </div>
            <div className="dist-row">
              <span className="dist-lbl">Pos 11+</span>
              <span className="dist-track"><span className="dist-fill" style={{ width: pct(seo.dist.p11plus), background: 'var(--alloy-pink)' }} /></span>
              <span className="dist-n">{seo.dist.p11plus}</span>
            </div>
          </div>

          <div className="seo-sec-head" style={{ marginTop: 20 }}>
            <span className="seo-sec-title">Backlinks</span>
          </div>
          <div className="seo-backlinks">
            <div><div className="num">{fmt(seo.backlinks)}</div><div className="sub">backlinks</div></div>
            <div><div className="num">{fmt(seo.refDomains)}</div><div className="sub">referring domains</div></div>
          </div>

          <div className="seo-sec-head" style={{ marginTop: 20 }}>
            <span className="seo-sec-title">Site health</span>
          </div>
          <div className="health">
            <div className="donut" style={{ background: `conic-gradient(var(--alloy-green, #2c8a6e) 0% ${seo.healthScore}%, var(--border-subtle) ${seo.healthScore}% 100%)` }}>
              <div className="donut-inner"><b>{seo.healthScore}</b><span>/ 100</span></div>
            </div>
            <div className="health-stats">
              <div className="hrow"><span className="hdot" style={{ background: 'var(--alloy-pink)' }} />Errors<span className="n">{fmt(seo.errors)}</span></div>
              <div className="hrow"><span className="hdot" style={{ background: 'var(--alloy-yellow)' }} />Warnings<span className="n">{fmt(seo.warnings)}</span></div>
              <div className="hrow"><span className="hdot" style={{ background: '#2f6fb0' }} />Notices<span className="n">{fmt(seo.notices)}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="seo-foot">Live data · Ahrefs Site Explorer, Rank Tracker &amp; Site Audit · {seo.crawledLabel}</div>
    </div>
  );
}
