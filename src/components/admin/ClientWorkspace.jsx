import React from 'react';
import { listAccounts, createAccount, updateAccount, deleteAccount, listInvites, addInvite, sendInvite, removeInvite, uploadLogo, setDashConfig, wcAccounts } from '../../lib/admin.js';
import { parseLabelMap, formatLabelMap } from '../../lib/leadFieldLabels.js';
import { getEngagementProposal, listLiveProposalStatuses, groupClients } from '../../lib/adminEngagement.js';
import { supabase } from '../../lib/supabase.js';
import { ProfileTab, LocationsTab, IntegrationsTab, TeamTab } from './ClientTabs.jsx';
import ProposalWorkspace from './ProposalWorkspace.jsx';

const { useState, useEffect, useRef } = React;

// ── Manage Clients (design handoff) ──────────────────────────────────────────
// Sticky header (client identity + tab strip + primary action), a narrow
// clients list, the editor for the active tab, and — on the Proposal tab —
// the right rail. The account form saves with the header button; Team and
// Proposal act on their own rows.

const BLANK = {
  company: '', short_name: '', tier: '', market: '', since: '',
  goal_label: 'boards signed', goal_current: 0, goal_target: 0,
  monday_board_id: '', zendesk_org_id: '', whatconverts_profile_id: '', quickbooks_customer_id: '',
  dash_folder_id: '', dash_upload_url: '', pastel_url: '', locations: [], lead_field_labels: {}, autopay_required: true, logo_url: null,
};
const TABS = [['profile', 'Profile'], ['locations', 'Locations'], ['integrations', 'Integrations'], ['team', 'Team & access'], ['proposal', 'Proposal']];
const initials = (s) => String(s || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

// WhatConverts id → account name it really is (the id may be valid but another
// client's, which is how one client's leads were once ingested under another).
function WcIdCheck({ value, names }) {
  const ids = String(value || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!ids.length) return null;
  if (names === null) return <span className="help">Checking with WhatConverts…</span>;
  if (!Object.keys(names).length) return <span className="help" style={{ color: '#7a5a12' }}>Couldn’t reach WhatConverts to verify — check by hand.</span>;
  return <span className="help">{ids.map((id) => <span key={id} style={{ display: 'block' }}><span className="mono">{id}</span> → {names[id] ? <b style={{ color: 'var(--a-purple)' }}>{names[id]}</b> : <b style={{ color: '#b4232a' }}>not an account this token can see</b>}</span>)}</span>;
}

export default function ClientWorkspace({ startNew, selectId }) {
  const [accounts, setAccounts] = useState(null);
  const [statuses, setStatuses] = useState(null); // account_id → live proposal status; null until loaded
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [labelText, setLabelText] = useState('');
  const [invites, setInvites] = useState([]);
  const [wcNames, setWcNames] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('profile');
  const [subTab, setSubTab] = useState('overview');
  const [proposal, setProposal] = useState(undefined); // undefined = loading
  const [bankOnFile, setBankOnFile] = useState(null);
  const [query, setQuery] = useState('');
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', title: '', role: 'owner', is_staff: false, send_email: true });
  const [busyInvite, setBusyInvite] = useState(false);
  const actionsRef = useRef({});
  // Feedback lives in the header next to the action button — never a floating bubble.
  const [feedback, setFeedback] = useState(null); // { kind: 'ok' | 'err', text }
  useEffect(() => { if (feedback && feedback.kind === 'ok') { const t = setTimeout(() => setFeedback(null), 6000); return () => clearTimeout(t); } return undefined; }, [feedback]);
  useEffect(() => { setFeedback(null); }, [tab, selectedId]);
  const [, setActionsTick] = useState(0);
  useEffect(() => { if (error) setFeedback({ kind: 'err', text: error }); }, [error]);

  useEffect(() => { wcAccounts().then((r) => setWcNames(Object.fromEntries((r?.accounts || []).map((a) => [String(a.id), a.name])))).catch(() => setWcNames({})); }, []);
  const refreshStatuses = () => listLiveProposalStatuses().then(setStatuses).catch(() => {});

  const loadAccounts = async (selectAfter, autoSelect = true) => {
    try {
      const res = await listAccounts();
      const list = res.accounts || [];
      setAccounts(list);
      refreshStatuses();
      if (selectAfter) selectAccount(list.find((a) => a.id === selectAfter) || list[0]);
      else if (autoSelect && !selectedId && list[0]) selectAccount(list[0]);
    } catch (e) { setError(String(e.message || e)); setAccounts([]); }
  };
  useEffect(() => { loadAccounts(selectId, !startNew); if (startNew) newClient(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInvites = (id) => listInvites(id).then((r) => setInvites(r.invites || [])).catch(() => setInvites([]));
  const loadProposal = (id) => getEngagementProposal(id).then((v) => { setProposal(v); refreshStatuses(); }).catch(() => setProposal(null));
  const loadBank = (id) => supabase.from('quickbooks_payment_methods').select('id').eq('account_id', id).limit(1).then((r) => setBankOnFile(!!(r.data && r.data.length))).catch(() => setBankOnFile(null));

  const selectAccount = (a) => {
    if (!a) return;
    setSelectedId(a.id); setForm({ ...BLANK, ...a }); setLabelText(formatLabelMap(a.lead_field_labels)); setError(''); setNotice('');
    setProposal(undefined); loadInvites(a.id); loadProposal(a.id); loadBank(a.id);
  };
  const newClient = () => { setSelectedId('new'); setForm(BLANK); setLabelText(''); setInvites([]); setProposal(null); setError(''); setNotice(''); setTab('profile'); };
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = selectedId === 'new';

  const save = async () => {
    if (!String(form.company || '').trim()) { setFeedback({ kind: 'err', text: 'Company name is required.' }); setTab('profile'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const dash = { dash_folder_id: form.dash_folder_id || null, dash_upload_url: form.dash_upload_url || null };
      const payload = { ...form, lead_field_labels: parseLabelMap(labelText) };
      if (isNew) { const r = await createAccount(payload); await setDashConfig(r.account.id, dash); await loadAccounts(r.account.id); }
      else { await updateAccount(selectedId, payload); await setDashConfig(selectedId, dash); await loadAccounts(selectedId); }
      setFeedback({ kind: 'ok', text: 'Saved.' });
    } catch (e) { setFeedback({ kind: 'err', text: String(e.message || e) }); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (isNew || !selectedId) return;
    if (!window.confirm(`Delete "${form.company}"? This removes the client and all of their portal data. This cannot be undone.`)) return;
    setSaving(true);
    try { await deleteAccount(selectedId); setSelectedId(null); setForm(BLANK); setInvites([]); await loadAccounts(); }
    catch (e) { setFeedback({ kind: 'err', text: String(e.message || e) }); } finally { setSaving(false); }
  };
  const onLogo = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file || isNew) return;
    setSaving(true); setError('');
    try { const logo_url = await uploadLogo(selectedId, file); await updateAccount(selectedId, { logo_url }); setForm((f) => ({ ...f, logo_url })); await loadAccounts(selectedId); setFeedback({ kind: 'ok', text: 'Icon updated.' }); }
    catch (e2) { setFeedback({ kind: 'err', text: String(e2.message || e2) }); } finally { setSaving(false); }
  };

  // team
  const addInviteH = async () => {
    const email = inviteForm.email.trim(); if (!email || isNew) return;
    setBusyInvite(true); setNotice(''); setError('');
    try {
      const res = await addInvite(selectedId, inviteForm);
      if (res && res.skipped) setNotice(`${email} added — no email sent. Use “Send invite” when you're ready, or let the proposal email be their first sign-in.`);
      else if (res && res.emailed) setNotice(`Invite email sent to ${email}.`);
      else setError(`${email} was added, but the invite email failed${res?.emailError ? ` — ${res.emailError}` : ''}.`);
      setInviteForm((f) => ({ email: '', name: '', title: '', role: 'owner', is_staff: false, send_email: f.send_email }));
      await loadInvites(selectedId);
    } catch (e) { setError(String(e.message || e)); } finally { setBusyInvite(false); }
  };
  const sendInviteH = async (email) => {
    setBusyInvite(true); setNotice(''); setError('');
    try { const res = await sendInvite(email); if (res && res.emailed) setNotice(`Invite email sent to ${email}.`); else setError(`Invite email to ${email} failed${res?.emailError ? ` — ${res.emailError}` : ''}.`); await loadInvites(selectedId); }
    catch (e) { setError(String(e.message || e)); } finally { setBusyInvite(false); }
  };
  const removeInviteH = async (email) => {
    if (!window.confirm(`Remove ${email}? Their sign-in is revoked.`)) return;
    setBusyInvite(true);
    try { await removeInvite(email); await loadInvites(selectedId); } catch (e) { setError(String(e.message || e)); } finally { setBusyInvite(false); }
  };

  const status = proposal ? proposal.status : null;
  const accepted = status === 'accepted';
  const onProposal = tab === 'proposal';
  const filtered = (accounts || []).filter((a) => !query || `${a.short_name} ${a.company}`.toLowerCase().includes(query.toLowerCase()));
  const groups = groupClients(filtered, statuses);
  const st = statuses || {};
  const badge = accepted ? { t: 'Active', cls: 'green' } : status === 'sent' ? { t: 'Sent', cls: 'yellow' } : status === 'draft' ? { t: 'Draft', cls: '' } : null;
  
  return (
    <div className="adm" data-testid="client-workspace">
      <div className="adm-head">
        <div className="adm-head-top">
          <div className="adm-who">
            <span className="adm-avatar">{form.logo_url ? <img src={form.logo_url} alt="" /> : initials(form.short_name || form.company || 'New')}</span>
            <div style={{ minWidth: 0 }}>
              <div className="eb">Manage clients{form.short_name ? ` · ${form.short_name}` : ''}</div>
              <h1>{isNew ? 'New client' : (form.company || '—')}</h1>
            </div>
          </div>
          <div className="adm-head-acts">
            {feedback ? <span className={feedback.kind === 'ok' ? 'note-ok' : 'err'} style={{ margin: 0, maxWidth: 420, fontSize: 12.5 }} role="status" data-testid="adm-feedback">{feedback.text}</span> : null}
            {onProposal && !isNew
              ? <button type="button" className="btn-p" onClick={() => actionsRef.current.save && actionsRef.current.save()} disabled={!!actionsRef.current.busy || proposal === undefined} data-testid="adm-save">{actionsRef.current.busy ? 'Saving…' : 'Save'}</button>
              : <button type="button" className="btn-p" onClick={save} disabled={saving || !selectedId} data-testid="adm-save">{saving ? 'Saving…' : isNew ? 'Create client' : 'Save changes'}</button>}
          </div>
        </div>
        <div className="adm-tabs" role="tablist">
          {TABS.map(([k, l]) => (
            <button type="button" key={k} role="tab" className={`adm-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)} disabled={isNew && k !== 'profile'} data-testid={`adm-tab-${k}`}>
              {k === 'proposal' && accepted ? 'Plan' : l}{k === 'proposal' && badge ? <span className={`badge ${badge.cls}`}>{badge.t}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-row">
        <div className="adm-left">
          <div className="adm-list" data-testid="adm-clients">
            <div className="adm-list-head"><span>Clients</span><button type="button" onClick={newClient}>+ New</button></div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search clients" />
            {accounts === null ? <div className="help" style={{ padding: '4px 12px 12px' }}>Loading…</div> : groups.map((g) => (
              <React.Fragment key={g.key}>
                {statuses && groups.length > 1 ? <div className="adm-list-sec" data-testid={`adm-group-${g.key}`}>{g.label}<span className="n">{g.accounts.length}</span></div> : null}
                {g.accounts.map((a) => (
                  <button type="button" key={a.id} className={`adm-client${selectedId === a.id ? ' on' : ''}`} onClick={() => selectAccount(a)}>
                    <div style={{ minWidth: 0 }}><div className="s">{a.short_name || a.company}</div><div className="c">{g.key === 'internal' ? 'Alloy team · not a client' : a.company}</div></div>
                    {st[a.id] ? <span className="dot" title={st[a.id] === 'accepted' ? 'Active plan' : st[a.id] === 'sent' ? 'Proposal sent' : 'Draft proposal'} style={{ background: st[a.id] === 'accepted' ? '#aed7d0' : st[a.id] === 'sent' ? '#f5d880' : '#c9c1d6' }} /> : null}
                  </button>
                ))}
              </React.Fragment>
            ))}
            {isNew ? <div className="adm-client on"><div className="s">New client…</div></div> : null}
          </div>

          {!selectedId ? <div className="adm-empty">Pick a client, or start a new one.</div> : (
            <>
              {tab === 'profile' ? <div className="adm-main"><ProfileTab form={{ ...form, id: selectedId }} set={set} isNew={isNew} onLogo={onLogo} onDelete={remove} saving={saving} bankOnFile={bankOnFile} /></div> : null}
              {tab === 'locations' ? <div className="adm-main"><LocationsTab form={form} set={set} /></div> : null}
              {tab === 'integrations' ? <div className="adm-main"><IntegrationsTab form={form} set={set} labelText={labelText} setLabelText={setLabelText} wcCheck={<WcIdCheck value={form.whatconverts_profile_id} names={wcNames} />} /></div> : null}
              {tab === 'team' ? <div className="adm-main"><TeamTab invites={invites} inviteForm={inviteForm} setInviteForm={setInviteForm} onAdd={addInviteH} onSend={sendInviteH} onRemove={removeInviteH} busy={busyInvite} notice={notice} /></div> : null}
              {tab === 'proposal' ? (proposal === undefined ? <div className="adm-empty">Loading…</div> : (
                <ProposalWorkspace
                  accountId={selectedId} company={form.company} shortName={form.short_name} locations={form.locations} invites={invites}
                  view={proposal} subTab={subTab} setSubTab={setSubTab}
                  onChanged={(v) => { if (v === undefined) loadProposal(selectedId); else { setProposal(v); refreshStatuses(); } }}
                  registerActions={(a) => { actionsRef.current = a; setActionsTick((t) => t + 1); }}
                  onFeedback={(kind, text) => setFeedback(text ? { kind, text } : null)}
                />
              )) : null}
            </>
          )}
        </div>
      </div>

    </div>
  );
}
