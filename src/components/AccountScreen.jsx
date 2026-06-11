import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { can } from '../lib/perms.js';
import { downloadInvoice } from '../lib/billing.js';
import { saveNotificationPrefs } from '../lib/prefs.js';

// Account Details — ported from the design handoff. Wires real portal data:
// company profile, Plan & usage, billing/invoices via QuickBooks, team seats
// from same-account profiles, and real per-user notification prefs.

const ROLE_LABEL = { admin: 'Admin', staff: 'Staff', owner: 'Owner', accounting: 'Accounting', bd: 'BD', ops: 'Ops' };
// Map a canonical role to a pill style. Legacy bd/ops kept for old rows.
const ROLE_CLASS = { owner: 'owner', admin: 'owner', accounting: 'acct', staff: 'staff', bd: 'bd', ops: 'ops' };

function money(n, compact = false) {
  const v = Number(n) || 0;
  if (compact && Math.abs(v) >= 1000) {
    const k = v / 1000;
    return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'K';
  }
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function monthLabel(s) {
  if (!s) return '';
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function initialsOf(name, fallback) {
  if (fallback) return fallback;
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}

function InvoiceRow({ inv, tier }) {
  const [state, setState] = React.useState('idle'); // idle | loading | ok | err
  const paid = !(Number(inv.balance) > 0);
  const onDownload = async () => {
    if (state === 'loading') return;
    setState('loading');
    try {
      await downloadInvoice(inv.id, `invoice-${inv.number || inv.id}.pdf`);
      setState('ok');
      setTimeout(() => setState('idle'), 2200);
    } catch (e) {
      setState('err');
      setTimeout(() => setState('idle'), 2600);
    }
  };
  return (
    <div className="acct-inv-row" role="row">
      <span className="mono">{inv.number || '—'}</span>
      <span className="date">{fmtDate(inv.date)}</span>
      <span className="desc">{tier ? `${tier} · ${monthLabel(inv.date)}` : monthLabel(inv.date)}</span>
      <span className="amt">{money(inv.amount)}</span>
      <span className="st"><span className={`acct-status ${paid ? 'paid' : 'due'}`}>{paid ? 'Paid' : 'Due'}</span></span>
      <span className="acct-dl-cell">
        <button
          className={`acct-dl${state === 'ok' ? ' ok' : ''}${state === 'err' ? ' err' : ''}`}
          onClick={onDownload}
          aria-label={`Download ${inv.number || 'invoice'} as PDF`}
        >
          {state === 'loading' ? '…' : state === 'ok' ? '✓ Saved' : state === 'err' ? 'Retry' : <><I.Download width={12} height={12} /> PDF</>}
        </button>
      </span>
    </div>
  );
}

// Deterministic palette for the Plan & usage category pills (project phases).
const CAT_PALETTE = ['#d9356e', '#2c6e62', '#2a6391', '#b8881a', '#381c4f', '#5a8f7b'];

export default function AccountScreen({ onNav, onCompose }) {
  const acct = DATA.account || {};
  const user = DATA.user || {};
  const team = DATA.team || [];
  const clientSeats = team.filter((m) => !m.isStaff);
  const services = DATA.recurringServices || [];
  const projects = DATA.projects || [];

  // Plan & usage — momentum framing (in-motion / delivered / lifetime qualified).
  const now = new Date();
  const curQuarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
  // Same expressions the rest of the portal uses, so these numbers always match:
  //   in motion         = open projects → sidebar + Dashboard "Work in motion"
  //   delivered this qtr = live projects whose due date lands in the current
  //                        quarter → identical to Dashboard "Work in motion"
  //   qualified          = wcQualifiedTotal → Leads "qualified all-time" + Dashboard
  const inMotion = projects.filter((p) => p.status && p.status !== 'live').length;
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1);
  const inQuarter = (d) => { if (!d) return false; const x = new Date(d); return x >= qStart && x < qEnd; };
  const deliveredQtr = projects.filter((p) => p.status === 'live' && inQuarter(p.dueDate)).length;
  const qualified = acct.wcQualifiedTotal || 0;
  // Categories of work = projects grouped by phase, top 6 by count.
  const phaseCounts = {};
  projects.forEach((p) => { const k = (p.phase || '').trim() || 'Other'; phaseCounts[k] = (phaseCounts[k] || 0) + 1; });
  const categories = Object.entries(phaseCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, n], i) => ({ name, n, color: CAT_PALETTE[i % CAT_PALETTE.length] }));
  // On the horizon = planned/queued work from Monday's "Planned Work" group.
  const quarterOf = (d) => {
    if (!d) return '';
    const x = new Date(`${String(d).slice(0, 10)}T00:00:00`);
    return `Q${Math.floor(x.getMonth() / 3) + 1}`;
  };
  const horizon = (DATA.plannedProjects || [])
    .slice()
    .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))
    .map((p) => ({ q: quarterOf(p.dueDate), nm: p.title, mt: p.phase ? `· ${p.phase}` : (p.dueLabel ? `· ${p.dueLabel}` : '') }))
    .filter((nd) => nd.nm)
    .slice(0, 5);
  const openRequest = () => { if (onCompose) onCompose(); else if (onNav) onNav('tickets'); };
  const invoices = (DATA.invoices || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const showBilling = can(user, 'billing');
  const canInvite = can(user, 'manageUsers');

  // Billing derived from real invoices.
  const open = invoices
    .filter((i) => Number(i.balance) > 0)
    .sort((a, b) => String(a.dueDate || a.date).localeCompare(String(b.dueDate || b.date)));
  const nextInv = open[0] || null;
  const thisYear = new Date().getFullYear();
  const ytd = invoices
    .filter((i) => String(i.date).slice(0, 4) === String(thisYear))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paidCount = invoices.filter((i) => !(Number(i.balance) > 0)).length;
  const lastPaid = invoices.find((i) => !(Number(i.balance) > 0)) || null;

  // Invoice table: default to the current year (clients can have 300+ all-time).
  // Year chips switch the view; a soft cap keeps even a heavy year tidy.
  const invYears = Array.from(new Set(invoices.map((i) => String(i.date).slice(0, 4)))).filter(Boolean).sort((a, b) => b.localeCompare(a));
  const [invYear, setInvYear] = React.useState(() => {
    const cy = String(thisYear);
    return invYears.includes(cy) ? cy : (invYears[0] || cy);
  });
  const [invExpanded, setInvExpanded] = React.useState(false);
  const pickYear = (y) => { setInvYear(y); setInvExpanded(false); };
  const INV_CAP = 24;
  const shownInvoices = invYear === 'all' ? invoices : invoices.filter((i) => String(i.date).slice(0, 4) === invYear);
  const cappedInvoices = invExpanded ? shownInvoices : shownInvoices.slice(0, INV_CAP);

  // Notification prefs — persisted per-user to profiles.notification_prefs.
  // Default ON unless explicitly turned off. monthly_snapshot gates the snapshot
  // email; lead_alerts gates the in-portal "leads to qualify" bell.
  const initPrefs = user.notificationPrefs || {};
  const [prefs, setPrefs] = React.useState({
    monthly_snapshot: initPrefs.monthly_snapshot !== false,
    lead_alerts: initPrefs.lead_alerts !== false,
  });
  const toggle = (k) => setPrefs((p) => {
    const next = { ...p, [k]: !p[k] };
    saveNotificationPrefs(user.id, next).catch(() => { /* optimistic; next load reconciles */ });
    return next;
  });
  const PREFS = [
    { k: 'monthly_snapshot', t: 'Monthly snapshot', s: "Month-end email — wins, waiting-on-you, what's next" },
    { k: 'lead_alerts', t: 'New lead alerts', s: 'A heads-up in your portal when a new lead needs qualifying' },
  ];

  return (
    <div className="acct-page">
      {/* ── Row 1: Company profile | Plan & usage ─────────────── */}
      <div className="acct-grid2">
        <section className="card card-pad-lg">
          <div className="card-head"><span className="kicker">Account</span><h3>Company profile</h3><div className="grow" /></div>
          <div className="acct-row"><span className="acct-row-lbl">Company</span><span className="acct-row-val">{acct.company || '—'}</span></div>
          <div className="acct-row"><span className="acct-row-lbl">Display name</span><span className="acct-row-val">{acct.shortName || '—'}</span></div>
          <div className="acct-row"><span className="acct-row-lbl">Market</span><span className="acct-row-val">{acct.market || '—'}</span></div>
          <div className="acct-row"><span className="acct-row-lbl">Client since</span><span className="acct-row-val">{acct.since || '—'}</span></div>
          <div className="acct-row no-line">
            <span className="acct-row-lbl">Plan tier</span>
            {acct.tier ? <span className="tier-pill"><span className="star">★</span> {acct.tier}</span> : <span className="acct-row-val">—</span>}
          </div>
        </section>

        <section className="card card-pad-lg">
          <div className="card-head"><span className="kicker">Subscription</span><h3>Plan &amp; usage</h3><div className="grow" /></div>

          <div className="pu-stats">
            <div className="pu-stat">
              <div className="n">{inMotion}</div><div className="l">in motion now</div><div className="s">active engagements</div>
            </div>
            <div className="pu-stat green">
              <div className="n">{deliveredQtr}</div><div className="l">delivered this qtr</div><div className="s">{curQuarter}</div>
            </div>
            <div className="pu-stat pink">
              <div className="n">{qualified}</div><div className="l">qualified leads</div>
              <div className="s">{acct.since ? `since ${acct.since}` : 'lifetime'}</div>
            </div>
          </div>

          {categories.length ? (
            <div className="pu-pills">
              {categories.map((c) => (
                <span className="pu-pill" key={c.name} style={{ '--c': c.color }}>
                  <span className="dot" />{c.name}<span className="n">{c.n}</span>
                </span>
              ))}
            </div>
          ) : null}

          {horizon.length ? (
            <div className="pu-horizon">
              <div className="pu-horizon-head">
                <span className="t">On the horizon</span>
                <button className="pu-pull" onClick={openRequest}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5l8 7-8 7V5zm9 0l8 7-8 7V5z" /></svg>
                  Pull work forward
                </button>
              </div>
              <div className="pu-timeline">
                {horizon.map((nd, i) => (
                  <div className="pu-node" key={i}>
                    <div className="pu-node-line">
                      {nd.q ? <span className="pu-q">{nd.q}</span> : null}
                      <span className="nm">{nd.nm}</span>
                      {nd.mt ? <span className="mt">{nd.mt}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <footer className="pu-foot">
            <div className="tx"><strong>{services.length} always-on services</strong> running · included in your plan</div>
            <button className="btn btn-secondary btn-sm" onClick={openRequest}>Plan with your strategist →</button>
          </footer>
        </section>
      </div>

      {/* ── Row 2: Billing & invoices (gated to billing roles) ───── */}
      {showBilling ? (
        <section className="card card-pad-lg" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <span className="kicker">Billing</span><h3>Billing &amp; invoices</h3><div className="grow" />
            {invoices.length ? (
              <div className="acct-inv-years">
                {invYears.map((y) => (
                  <button key={y} className={`acct-year${invYear === y ? ' on' : ''}`} onClick={() => pickYear(y)}>{y}</button>
                ))}
                {invYears.length > 1 ? (
                  <button className={`acct-year${invYear === 'all' ? ' on' : ''}`} onClick={() => pickYear('all')}>All</button>
                ) : null}
              </div>
            ) : null}
          </div>

          {invoices.length === 0 ? (
            <div className="acct-empty">No invoices yet. Once billing runs in QuickBooks, your invoices appear here for download.</div>
          ) : (
            <>
              <div className="acct-billing-strip">
                <div className="acct-bill-stat hero">
                  <div className="lbl">Next invoice</div>
                  <div className="val">{nextInv ? money(nextInv.amount) : 'Up to date'}</div>
                  <div className="sub">{nextInv ? `due ${fmtDate(nextInv.dueDate || nextInv.date)}` : 'no open balance'}</div>
                </div>
                <div className="acct-bill-stat">
                  <div className="lbl">Billing cycle</div>
                  <div className="val-sm">Monthly</div>
                  <div className="sub">{thisYear} invested {money(ytd, true)}</div>
                </div>
                <div className="acct-bill-stat">
                  <div className="lbl">Invoices</div>
                  <div className="val-sm">{invoices.length} total</div>
                  <div className="sub">{paidCount} paid</div>
                </div>
                <div className="acct-bill-stat">
                  <div className="lbl">Last payment</div>
                  <div className="val-sm">{lastPaid ? money(lastPaid.amount) : '—'}</div>
                  <div className="sub">{lastPaid ? fmtDate(lastPaid.date) : 'none yet'}</div>
                </div>
              </div>

              <div role="table" aria-label="Invoice history">
                <div className="acct-inv-head" role="row">
                  <span>Invoice</span><span>Date</span><span className="desc">Description</span>
                  <span className="amt">Amount</span><span className="st">Status</span><span aria-hidden="true" />
                </div>
                {cappedInvoices.length === 0 ? (
                  <div className="acct-empty">No invoices in {invYear === 'all' ? 'this account' : invYear}.</div>
                ) : cappedInvoices.map((inv) => <InvoiceRow key={inv.id} inv={inv} tier={acct.tier} />)}
              </div>
              {shownInvoices.length > INV_CAP ? (
                <button className="acct-inv-more" onClick={() => setInvExpanded((v) => !v)}>
                  {invExpanded ? 'Show fewer' : `Show all ${shownInvoices.length}${invYear === 'all' ? '' : ` in ${invYear}`}`}
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* ── Row 3: Team seats | Notifications ──────────────────── */}
      <div className="acct-grid2" style={{ marginBottom: 0 }}>
        <section className="card card-pad-lg">
          <div className="card-head">
            <span className="kicker">Portal access</span><h3>Team seats</h3><div className="grow" />
            {canInvite ? <button className="btn btn-secondary btn-sm" onClick={() => onNav && onNav('tickets')}>+ Invite</button> : null}
          </div>
          {clientSeats.length === 0 ? (
            <div className="acct-empty">No portal users on this account yet.</div>
          ) : clientSeats.map((m) => (
            <div className="acct-seat" key={m.id}>
              <div className="acct-avatar">{initialsOf(m.name, m.initials)}</div>
              <div className="who">
                <div className="nm">{m.name || 'Member'}{m.id === user.id ? <span className="you">you</span> : null}</div>
              </div>
              <div className="meta">
                <span className={`acct-role ${ROLE_CLASS[m.role] || 'owner'}`}>{ROLE_LABEL[m.role] || m.role}</span>
              </div>
            </div>
          ))}
          <div className="acct-foot-hint">Owner sees everything · Staff sees day-to-day work · Accounting sees billing</div>
        </section>

        <section className="card card-pad-lg">
          <div className="card-head"><span className="kicker">Notifications</span><h3>What we send you</h3><div className="grow" /></div>
          {PREFS.map((p) => (
            <div className="acct-pref" key={p.k}>
              <div className="tx"><div className="t">{p.t}</div><div className="s">{p.s}</div></div>
              <button
                className={`toggle${prefs[p.k] ? ' on' : ''}`}
                role="switch"
                aria-checked={prefs[p.k]}
                aria-label={p.t}
                onClick={() => toggle(p.k)}
              ><span className="thumb" /></button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
