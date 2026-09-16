import React from 'react';
import { proposalStats, fmtWhole, fmtCompact, sentSplitLabel } from '../lib/proposalStats.js';

// ============================================================================
// Proposals · pipeline stats strip — two cards directly under the stepper on
// every stage LIST view (inbox grid, Build bucket, Sent list, Won/Lost). Hidden
// once a single lead is drilled into, and on UVP Library / Archive.
//
// Presentational only. src/lib/proposalStats.js decides every number (and drops
// any row that is not the viewed account's); this file just lays them out per
// the design handoff. Styles: 15-proposals.css, `.fx-stats`.
// ============================================================================

// One line under each stage tile.
const TILE_NOTE = {
  new: () => 'Unopened intake',
  reviewed: () => 'Waiting to qualify',
  build: () => 'Qualified · being built',
  sent: (s) => sentSplitLabel(s),
};

// Bar widths to two decimals — the share is exact in the stats, the markup need not be.
const pctWidth = (pct) => (Math.round(pct * 100) / 100) + '%';

export default function ProposalStats({ rows, accountId }) {
  const s = proposalStats(rows, { accountId });
  return (
    <div className="fx-stats" data-account={s.accountId || ''}>
      <div className="fx-stat">
        <div className="fx-stat-head">
          <span className="fx-stat-l">Open pipeline</span>
          <span className="fx-stat-note">Everything not yet won or lost</span>
        </div>
        <div className="fx-stat-v" data-stat="open">{s.open}</div>
        <div className="fx-stat-body">
          {s.open > 0 ? (
            <>
              <div className="fx-split" aria-hidden="true">
                {s.segments.map((seg) => <span key={seg.id} data-bucket={seg.id} style={{ width: pctWidth(seg.pct) }} />)}
              </div>
              <div className="fx-tiles">
                {s.segments.map((seg) => (
                  <div className="fx-tile" key={seg.id} data-tile={seg.id}>
                    <div className="n"><span className="dot" data-bucket={seg.id} />{seg.count} {seg.label}</div>
                    <div className="t">{TILE_NOTE[seg.id](s)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="fx-stat-empty">Nothing open yet. New intake and qualified proposals land here.</div>
          )}
        </div>
      </div>

      <div className="fx-stat">
        <div className="fx-stat-head">
          <span className="fx-stat-l">Open value</span>
          {/* Only qualified rows are valued (a New lead's price is an estimate
              nobody has quoted), so the card says whose money this is. */}
          <span className="fx-stat-note">Monthly recurring · Build + Sent</span>
        </div>
        <div className="fx-stat-v" data-stat="monthly">{fmtWhole(s.value.monthly)}<small>/mo</small></div>
        <div className="fx-stat-body">
          <div className="fx-tiles">
            <div className="fx-tile" data-tile="annual">
              <div className="n">{fmtCompact(s.value.annual)}</div>
              <div className="t">Annualized</div>
            </div>
            <div className="fx-tile" data-tile="average">
              <div className="n">{s.value.average != null ? <>{fmtWhole(s.value.average)}<small>/mo</small></> : '—'}</div>
              <div className="t">Average per qualified proposal</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
