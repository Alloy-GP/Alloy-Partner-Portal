import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { can } from '../lib/perms.js';
import { downloadInvoice } from '../lib/billing.js';
import { saveNotificationPrefs } from '../lib/prefs.js';
import { inMotionNow, deliveredThisQuarter } from '../lib/quarterStats.js';

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

const Pin = () => (
  <svg className="pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
);

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
      <span className="desc">{inv.description || (tier ? `${tier} · ${monthLabel(inv.date)}` : monthLabel(inv.date))}</span>
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

const BankIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M4 10h16M5 10l7-5 7 5M6 10v8M10 10v8M14 10v8M18 10v8" />
  </svg>
);
const CalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
function prettyAcctType(t) {
  const s = String(t || '').toUpperCase();
  if (s.includes('SAVINGS')) return 'Savings';
  if (s.includes('CHECKING')) return 'Checking';
  return 'Bank account';
}
function ordinal(n) {
  const d = Number(n) || 1;
  const suf = ['th', 'st', 'nd', 'rd'], v = d % 100;
  return d + (suf[(v - 20) % 10] || suf[v] || suf[0]);
}
// Next draft = the next billing-day on/after today (and not before the schedule start).
function nextDraftDate(billingDay, startDate) {
  const day = Math.min(Math.max(Number(billingDay) || 1, 1), 28);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cand = new Date(today.getFullYear(), today.getMonth(), day);
  if (cand < today) cand = new Date(today.getFullYear(), today.getMonth() + 1, day);
  if (startDate) {
    const sd = new Date(`${String(startDate).slice(0, 10)}T00:00:00`);
    if (cand < sd) cand = sd;
  }
  return cand;
}

// Payment method on file + autopay schedule. Data from loadData (DATA.paymentMethod
// from quickbooks_payment_methods, DATA.autopay from autopay_schedules). Billing-gated.
function PaymentMethodCard({ pm, autopay }) {
  if (!pm && !autopay) return null;
  const active = autopay && autopay.status === 'active';
  const draft = autopay ? nextDraftDate(autopay.billingDay, autopay.startDate) : null;
  const amountStr = autopay && autopay.amount
    ? Number(autopay.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : null;
  const day = autopay && autopay.billingDay ? ordinal(autopay.billingDay) : null;
  return (
    <section className="card card-pad-lg acct-pm" style={{ marginBottom: 20 }}>
      <div className="card-head">
        <span className="kicker">Payment method on file</span>
        <h3>{autopay ? 'Autopay via bank account' : 'Bank account on file'}</h3>
        <div className="grow" />
        {active ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--alloy-green-tint, #e7f2ef)', color: 'var(--dark-green, #2c6e62)', fontWeight: 700, fontSize: 12, letterSpacing: '.04em', padding: '5px 12px', borderRadius: 999 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: 'currentColor' }} /> ACTIVE
          </span>
        ) : null}
      </div>

      {pm ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--alloy-purple-tint)', color: 'var(--alloy-purple)' }}><BankIcon /></div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--alloy-purple)' }}>{pm.bankName || 'Bank account'}</div>
            <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', marginTop: 2 }}>
              {prettyAcctType(pm.accountType)} <span className="mono">•••• {pm.last4 || '----'}</span>{day ? ` · drafted monthly on the ${day}` : ''}
            </div>
          </div>
        </div>
      ) : (
        <div className="acct-empty">No bank account on file yet.</div>
      )}

      {draft && amountStr ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '13px 16px', background: 'var(--alloy-off, #f8f7fc)', borderRadius: 12, color: 'var(--alloy-purple)' }}>
          <CalIcon />
          <span style={{ fontSize: 14 }}>Next draft <strong>{fmtDate(draft.toISOString())}</strong> · <strong>{amountStr}</strong></span>
        </div>
      ) : null}

      <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 16 }}>
        Need to change this? <span style={{ color: 'var(--alloy-pink)', fontWeight: 600 }}>Contact your Alloy team</span> — bank details can’t be edited here for security.
      </div>
    </section>
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
  const locations = Array.isArray(acct.locations) ? acct.locations : [];

  // Plan & usage — momentum framing (in-motion / delivered / lifetime qualified).
  const now = new Date();
  const curQuarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
  // Same expressions the rest of the portal uses, so these numbers always match:
  //   in motion         = CANONICAL inMotionNow → identical to Dashboard "Playbook"
  //                        + ROI page (dated, not-live projects minus pending tickets)
  //   delivered this qtr = live projects whose due date lands in the current
  //                        quarter → identical to Dashboard "Playbook"
  //   qualified          = wcQualifiedTotal → Leads "qualified all-time" + Dashboard
  const inMotion = inMotionNow(projects);
  const deliveredQtr = deliveredThisQuarter(projects, now);
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
          {locations.length ? (
            <div className="acct-locs-block">
              <div className="acct-locs-lbl">Locations covered</div>
              {locations.map((loc, i) => (
                <div className="acct-loc-row" key={i}>
                  <Pin />
                  <span className="nm">{loc.name}</span>
                  {loc.hq ? <span className="hq">HQ</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="acct-row"><span className="acct-row-lbl">Market</span><span className="acct-row-val">{acct.market || '—'}</span></div>
          )}
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

      {/* ── Payment method on file + autopay (under company profile) ── */}
      {showBilling ? <PaymentMethodCard pm={DATA.paymentMethod} autopay={DATA.autopay} /> : null}

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
