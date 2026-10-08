import { zendeskOrgOptions } from '../../lib/zendeskOrgs.js';
import React from 'react';
import AdminAutopay from '../AdminAutopay.jsx';
import { CLIENT_ROLES } from '../../lib/perms.js';

const { useState } = React;

// The four client-record tabs of the Manage Clients workspace (design handoff).
// All of them edit the same `form` (the account row) and save with the header
// button; Team & access acts immediately (invites are their own rows).

const initials = (s) => String(s || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
const MARKET_COLORS = ['#f5d880', '#a1c8e7', '#aed7d0', '#d9356e', '#604a74'];
export const LOCATION_TAGS = [
  { value: 'active', label: 'Active', cls: 'green' },
  { value: 'onboarding', label: 'Onboarding', cls: 'yellow' },
  { value: 'proposed', label: 'Proposed', cls: '' },
];
const tagOf = (v) => LOCATION_TAGS.find((t) => t.value === v) || LOCATION_TAGS[2];
const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

function Field({ label, hint, error, children, span }) {
  return (
    <label style={{ display: 'block', gridColumn: span ? '1 / -1' : undefined }}>
      <span className="lbl">{label}</span>
      {children}
      {error ? <div className="err">{error}</div> : hint ? <span className="help">{hint}</span> : null}
    </label>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────
export function ProfileTab({ form, set, isNew, onLogo, onDelete, saving, bankOnFile, startOb = true, setStartOb }) {
  return (
    <>
      <div className="card">
        <div className="card-head"><div className="eyebrow">Company</div>{!isNew ? <button type="button" className="link pink" onClick={onDelete} disabled={saving}>Delete client</button> : null}</div>
        <div className="adm-icon-row">
          <span className="adm-icon">{form.logo_url ? <img src={form.logo_url} alt="" /> : initials(form.short_name || form.company)}</span>
          <label className="btn-g" style={{ cursor: isNew ? 'not-allowed' : 'pointer', opacity: isNew ? 0.5 : 1 }}>
            Upload icon<input type="file" accept="image/*" onChange={onLogo} disabled={isNew || saving} style={{ display: 'none' }} />
          </label>
          <span className="help" style={{ margin: 0 }}>Square image — shown top-left of their dashboard.{isNew ? ' Save the client first.' : ''}</span>
        </div>
        <div className="grid2">
          <Field label="Company"><input className="in" value={form.company || ''} onChange={(e) => set('company')(e.target.value)} placeholder="Community Management, LLC" /></Field>
          <Field label="Short name"><input className="in" value={form.short_name || ''} onChange={(e) => set('short_name')(e.target.value)} placeholder="CMGT" /></Field>
          <Field label="Tier"><input className="in" value={form.tier || ''} onChange={(e) => set('tier')(e.target.value)} placeholder="Accelerate" /></Field>
          <Field label="Market"><input className="in" value={form.market || ''} onChange={(e) => set('market')(e.target.value)} placeholder="Baton Rouge, LA" /></Field>
          <Field label="Client since"><input className="in" value={form.since || ''} onChange={(e) => set('since')(e.target.value)} placeholder="Mar 2025" /></Field>
        </div>
      </div>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 4 }}>Goal on their dashboard</div>
        <div className="card-sub" style={{ margin: '0 0 14px' }}>One number the whole team rallies around.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14 }}>
          <Field label="Goal label"><input className="in" value={form.goal_label || ''} onChange={(e) => set('goal_label')(e.target.value)} placeholder="boards signed" /></Field>
          <Field label="Current"><input className="in" type="number" value={form.goal_current ?? 0} onChange={(e) => set('goal_current')(e.target.value === '' ? 0 : Number(e.target.value))} /></Field>
          <Field label="Target"><input className="in" type="number" value={form.goal_target ?? 0} onChange={(e) => set('goal_target')(e.target.value === '' ? 0 : Number(e.target.value))} /></Field>
        </div>
      </div>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 14 }}>Billing</div>
        <div className="adm-toggle-row" onClick={() => set('autopay_required')(form.autopay_required === false)} role="switch" aria-checked={form.autopay_required !== false} data-testid="adm-autopay-toggle">
          <span className={`sw${form.autopay_required !== false ? ' on' : ''}`} />
          <div><div className="t">Require autopay setup</div><div className="d">Nudge owner/accounting users at sign-in until a bank account is on file. {bankOnFile === null ? '' : bankOnFile ? 'A bank account is on file.' : 'No bank account on file yet.'}</div></div>
        </div>
        {!isNew ? <div style={{ marginTop: 6 }}><AdminAutopay accountId={form.id} company={form.company} /></div> : null}
      </div>
      {isNew && setStartOb ? (
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Onboarding</div>
          <div className="adm-toggle-row" onClick={() => setStartOb(!startOb)} role="switch" aria-checked={!!startOb} data-testid="adm-onboarding-toggle">
            <span className={`sw${startOb ? ' on' : ''}`} />
            <div><div className="t">Start their onboarding checklist</div><div className="d">Contacts, platform access, brand files and existing marketing tools (the old intake sheet). Shows in their portal with a to-do badge until you mark it complete in Admin → Onboarding.</div></div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Locations ────────────────────────────────────────────────────────────────
export function LocationsTab({ form, set }) {
  const locs = Array.isArray(form.locations) ? form.locations : [];
  const [editing, setEditing] = useState(null);
  const update = (next) => set('locations')(next);
  const patch = (i, k, v) => update(locs.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const add = () => { update([...locs, { name: '', address: '', status: '', tag: 'proposed', hq: locs.length === 0 }]); setEditing(locs.length); };
  const remove = (i) => { update(locs.filter((_, j) => j !== i)); setEditing(null); };
  const setHQ = (i) => update(locs.map((l, j) => ({ ...l, hq: j === i })));
  return (
    <div className="card">
      <div className="card-head"><div className="eyebrow">Locations covered</div><button type="button" className="btn-g" onClick={add} data-testid="adm-add-location">+ Add location</button></div>
      <div className="card-sub">HQ plus every market they operate in. These feed the proposal, market pages and tracking. Locations the client adds in their onboarding checklist land here automatically (name, address, phone).</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {locs.length === 0 ? <div className="help" style={{ margin: 0 }}>No locations yet.</div> : null}
        {locs.map((l, i) => editing === i ? (
          <div key={i} className="adm-loc-edit" data-testid={`adm-loc-edit-${i}`}>
            <Field label="Name"><input className="in sm" value={l.name || ''} onChange={(e) => patch(i, 'name', e.target.value)} placeholder="Biloxi, MS" autoFocus /></Field>
            <Field label="Address"><input className="in sm" value={l.address || ''} onChange={(e) => patch(i, 'address', e.target.value)} placeholder="Street, City, ST" /></Field>
            <Field label="Phone"><input className="in sm" type="tel" value={l.phone || ''} onChange={(e) => patch(i, 'phone', e.target.value)} placeholder="(555) 010-2030" /></Field>
            <Field label="Location manager"><input className="in sm" value={l.manager || ''} onChange={(e) => patch(i, 'manager', e.target.value)} placeholder="Who runs this office" /></Field>
            <Field label="Hours"><input className="in sm" value={l.hours || ''} onChange={(e) => patch(i, 'hours', e.target.value)} placeholder="Mon–Fri 9am–5pm" /></Field>
            <Field label="Notes" span><input className="in sm" value={l.notes || ''} onChange={(e) => patch(i, 'notes', e.target.value)} placeholder="Main office · satellite with 3 staff" /></Field>
            <Field label="Status"><select className="in sm" value={l.tag || 'proposed'} onChange={(e) => patch(i, 'tag', e.target.value)}>{LOCATION_TAGS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <div className="acts">
              <button type="button" className={`btn-g${l.hq ? '' : ''}`} onClick={() => setHQ(i)} title="Set as headquarters">{l.hq ? '★ HQ' : 'Set HQ'}</button>
              <button type="button" className="btn-g pink" onClick={() => remove(i)}>Remove</button>
              <button type="button" className="btn-d" onClick={() => setEditing(null)}>Done</button>
            </div>
            <Field label="Status note (what the client sees)" span><input className="in sm" value={l.status || ''} onChange={(e) => patch(i, 'status', e.target.value)} placeholder="Page live · GBP verified" /></Field>
          </div>
        ) : (
          <div key={i} className="adm-loc" data-testid={`adm-loc-${i}`}>
            <span className="dot" style={{ background: MARKET_COLORS[i % MARKET_COLORS.length] }} />
            <div style={{ minWidth: 0 }}><div className="n">{l.name || <span style={{ color: 'var(--a-muted)' }}>Unnamed</span>}{l.hq ? <span className="hq">HQ</span> : null}</div><div className="a">{l.address || '—'}{l.phone ? ` · ${l.phone}` : ''}{l.hours ? ` · ${l.hours}` : ''}{l.manager ? ` · ${l.manager}` : ''}{l.source_key ? ' · from onboarding' : ''}</div>{l.notes ? <div className="a" style={{ fontStyle: 'italic' }}>{l.notes}</div> : null}</div>
            <div className="st">{l.status || 'Not started'}</div>
            <span className={`pill ${tagOf(l.tag).cls}`}>{tagOf(l.tag).label}</span>
            <button type="button" className="btn-g" onClick={() => setEditing(i)}>Edit</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Integrations ─────────────────────────────────────────────────────────────
// Zendesk org: a picker over the real org list (admin fn `zendesk_orgs`) instead
// of a pasted id. An existing mapping is never dropped — an id the list doesn't
// contain stays selected and flagged (see src/lib/zendeskOrgs.js); the plain
// input is only shown when no picker was supplied.
function ZendeskOrgField({ value, onChange, picker }) {
  const { options, status, value: v } = zendeskOrgOptions(picker.orgs, value, picker.usedBy);
  const color = status.kind === 'ok' ? 'var(--a-purple)' : status.kind === 'missing' ? '#b4232a' : status.kind === 'offline' ? '#7a5a12' : undefined;
  return (
    <>
      <select className="in sm" value={v} onChange={(e) => onChange(e.target.value)} disabled={picker.orgs === null} data-testid="adm-zendesk-org">
        {options.map((o) => <option key={o.value || '__none'} value={o.value}>{o.label}</option>)}
      </select>
      <span className="help" data-testid="adm-zendesk-org-status" style={color ? { color, fontWeight: status.kind === 'ok' ? 700 : undefined } : undefined}>{status.text}</span>
    </>
  );
}

const INTEGRATIONS = [
  { key: 'monday_board_id', label: 'Monday board ID', placeholder: '1234567890', help: 'Projects, services and action queue source.' },
  { key: 'zendesk_org_id', label: 'Zendesk org ID', placeholder: '', help: 'Scopes the client’s tickets.' },
  { key: 'whatconverts_profile_id', label: 'WhatConverts profile ID', placeholder: '', help: 'Pulls the client’s form leads — comma or space separated.' },
  { key: 'quickbooks_customer_id', label: 'QuickBooks customer ID', placeholder: '', help: 'Open them in QuickBooks, copy nameId from the URL.' },
  { key: 'dash_folder_id', label: 'Dash brand folder', placeholder: 'e.g. Edison', help: 'Top-level Dash folder name — drives the Assets page.' },
  { key: 'dash_upload_url', label: 'Dash upload link', placeholder: 'https://', help: 'Guest-upload link — powers the Upload Assets button.' },
  { key: 'pastel_url', label: 'Pastel website board', placeholder: 'https://', help: 'Client’s Pastel feedback URL — routes website update requests.' },
];
export function IntegrationsTab({ form, set, labelText, setLabelText, wcCheck, zdPicker }) {
  return (
    <>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 14 }}>Connected systems</div>
        <div className="grid220">
          {INTEGRATIONS.map((ig) => (
            <label key={ig.key} className="adm-tile">
              <span className="h"><span>{ig.label}</span><i className={String(form[ig.key] || '').trim() ? 'on' : ''} /></span>
              {ig.key === 'zendesk_org_id' && zdPicker
                ? <ZendeskOrgField value={form[ig.key]} onChange={set(ig.key)} picker={zdPicker} />
                : <input className="in sm" value={form[ig.key] || ''} onChange={(e) => set(ig.key)(e.target.value)} placeholder={ig.placeholder} />}
              <span className="help">{ig.help}</span>
              {ig.key === 'whatconverts_profile_id' ? wcCheck : null}
            </label>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 4 }}>Lead form label fixes</div>
        <div className="card-sub" style={{ margin: '0 0 12px' }}>Only when their form’s inputs aren’t labelled. One per line: what WhatConverts sends = what it should say. Applied on the next lead sync.</div>
        <textarea className="in mono" rows={3} value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder={'e g Fawn Lake = Community name\ne g 240 = Number of homes'} />
      </div>
    </>
  );
}

// ── Team & access ────────────────────────────────────────────────────────────
const ROLE_LABEL = { owner: 'Owner', staff: 'Viewer', accounting: 'Accounting', admin: 'Alloy admin' };
export function TeamTab({ invites, inviteForm, setInviteForm, onAdd, onSend, onRemove, busy, notice }) {
  const canAdd = String(inviteForm.email || '').trim().length > 3;
  return (
    <div className="card">
      <div className="card-head"><div className="eyebrow">Who can see and accept</div><span className="help" style={{ margin: 0, whiteSpace: 'nowrap' }}>Owners can accept · others view only</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {invites.length === 0 ? <div className="help" style={{ margin: 0 }}>No one invited yet.</div> : null}
        {invites.map((inv) => {
          const role = inv.is_staff ? 'Alloy staff' : (ROLE_LABEL[inv.role] || inv.role);
          const state = inv.last_seen_at ? { t: `Viewed ${fmtDay(inv.last_seen_at)}`, cls: '' } : inv.emailed_at ? { t: `Invite sent ${fmtDay(inv.emailed_at)}`, cls: 'dim' } : { t: 'Not emailed yet', cls: 'warn' };
          return (
            <div key={inv.email} className="adm-person" data-testid="adm-person">
              <span className="av">{initials(inv.name || inv.email)}</span>
              <div className="who"><div className="n">{inv.name || inv.email}</div><div className="e">{inv.name ? inv.email : (inv.title || '')}</div></div>
              <span className={`pill ${inv.is_staff ? '' : inv.role === 'owner' ? 'yellow' : ''}`}>{role}</span>
              <span className={`state ${state.cls}`}>{state.t}</span>
              <button type="button" className="btn-g" onClick={() => onSend(inv.email)} disabled={busy} title={inv.emailed_at ? 'Send a fresh sign-in link' : 'Email them their sign-in link now'}>{inv.emailed_at ? 'Resend' : 'Send invite'}</button>
              <button type="button" className="btn-g pink" onClick={() => onRemove(inv.email)} disabled={busy}>Remove</button>
            </div>
          );
        })}
      </div>
      <div className="adm-invite">
        <Field label="Invite email"><input className="in sm" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="owner@client.com" /></Field>
        <Field label="Name"><input className="in sm" value={inviteForm.name} onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} placeholder="Optional" /></Field>
        <Field label="Job title"><input className="in sm" value={inviteForm.title} onChange={(e) => setInviteForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. COO" /></Field>
        <Field label="Role">
          <select className="in sm" value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}>
            {CLIENT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.value === 'staff' ? 'Viewer' : r.label}</option>)}
          </select>
        </Field>
        <button type="button" className="btn-d" onClick={onAdd} disabled={busy || !canAdd} data-testid="adm-invite-add">{inviteForm.send_email !== false ? 'Add & email' : 'Add quietly'}</button>
      </div>
      <div className="adm-invite-opts">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} title="Uncheck to add them without emailing. Send the invite from the list later, or let the proposal email be their first sign-in."><input type="checkbox" checked={inviteForm.send_email !== false} onChange={(e) => setInviteForm((f) => ({ ...f, send_email: e.target.checked }))} /> Email invite now</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} title="Alloy team member — full portfolio access to every client."><input type="checkbox" checked={!!inviteForm.is_staff} onChange={(e) => setInviteForm((f) => ({ ...f, is_staff: e.target.checked }))} /> Alloy staff</label>
      </div>
      {notice ? <div className="note-ok" style={{ marginTop: 10 }}>{notice}</div> : null}
      <div className="help" style={{ marginTop: 10 }}>Anyone added sees this client only. Viewers and accounting read the proposal but only an owner can accept. Removing someone revokes their sign-in.</div>
    </div>
  );
}
