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
//
// `onGo(stageId)` is optional. When given, the Build and Sent tiles render as
// buttons that jump to that stage's LIST view (the cockpit passes its own `go`,
// so the landing spot is exactly the stepper's). New and Reviewed both live in
// the New inbox the strip already sits on, so they stay plain tiles.
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

// Which stepper stage a tile opens. Only buckets that ARE a stage list of their
// own; new/reviewed share the inbox and get no link.
const TILE_STAGE = { build: 'build', sent: 'sent' };
const TILE_TITLE = { build: 'Open the Build stage', sent: 'Open the Sent stage' };

export default function ProposalStats({ rows, accountId, onGo }) {
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
                {s.segments.map((seg) => {
                  const stage = onGo ? TILE_STAGE[seg.id] : null;
                  const inner = (<>
                    <div className="n"><span className="dot" data-bucket={seg.id} />{seg.count} {seg.label}</div>
                    <div className="t">{TILE_NOTE[seg.id](s)}</div>
                  </>);
                  // A real <button>, not a div with onClick: keyboard-reachable, and
                  // the placement test can find it as one.
                  return stage
                    ? <button type="button" className="fx-tile fx-tile--link" key={seg.id} data-tile={seg.id} data-stage={stage} title={TILE_TITLE[seg.id]} onClick={() => onGo(stage)}>{inner}</button>
                    : <div className="fx-tile" key={seg.id} data-tile={seg.id}>{inner}</div>;
                })}
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
