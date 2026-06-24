import React from 'react';
import { I } from './icons.jsx';
import {
  listAccounts, createAccount, updateAccount, deleteAccount,
  listInvites, addInvite, removeInvite, uploadLogo, setDashConfig,
} from '../lib/admin.js';
import AdminAnalytics from './AdminAnalytics.jsx';
import SyncHealth from './SyncHealth.jsx';
import { CLIENT_ROLES } from '../lib/perms.js';

const { useState, useEffect } = React;

const BLANK = {
  company: '', short_name: '', tier: '', market: '', since: '',
  goal_label: 'boards signed', goal_current: 0, goal_target: 0,
  monday_board_id: '', zendesk_org_id: '', whatconverts_profile_id: '', quickbooks_customer_id: '',
  dash_folder_id: '', dash_upload_url: '', pastel_url: '',
  locations: [],
};

function Field({ label, value, onChange, placeholder, type = 'text', hint }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 }}>{label}</span>
      <input
        className="input" type={type} value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
      {hint ? <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-muted)', marginTop: 3 }}>{hint}</span> : null}
    </label>
  );
}

function AdminScreen({ startNew, selectId }) {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null); // account id, or 'new'
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [invites, setInvites] = useState([]);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'owner', is_staff: false });
  const [busyInvite, setBusyInvite] = useState(false);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('clients');

  const loadAccounts = async (selectAfter, autoSelect = true) => {
    try {
      const res = await listAccounts();
      const list = res.accounts || [];
      setAccounts(list);
      if (selectAfter) selectAccount(list.find((a) => a.id === selectAfter) || list[0]);
      else if (autoSelect && !selectedId && list[0]) selectAccount(list[0]);
    } catch (e) { setError(String(e.message || e)); setAccounts([]); }
  };
  // On open: jump to the new-client form, or a requested client, else the first.
  useEffect(() => {
    loadAccounts(selectId, !startNew); // don't auto-select first when adding
    if (startNew) newClient();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectAccount = (a) => {
    if (!a) return;
    setSelectedId(a.id);
    setForm({ ...BLANK, ...a });
    setError('');
    listInvites(a.id).then((r) => setInvites(r.invites || [])).catch(() => setInvites([]));
  };

  const newClient = () => { setSelectedId('new'); setForm(BLANK); setInvites([]); setError(''); };
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  // Locations editor (HQ + every market they operate in).
  const locs = Array.isArray(form.locations) ? form.locations : [];
  const updateLocs = (next) => setForm((f) => ({ ...f, locations: next }));
  const addLoc = () => updateLocs([...locs, { name: '', hq: locs.length === 0 }]);
  const removeLoc = (i) => updateLocs(locs.filter((_, idx) => idx !== i));
  const setLocName = (i, name) => updateLocs(locs.map((l, idx) => (idx === i ? { ...l, name } : l)));
  const setHQ = (i) => updateLocs(locs.map((l, idx) => ({ ...l, hq: idx === i })));

  const save = async () => {
    if (!form.company.trim()) { setError('Company name is required.'); return; }
    setSaving(true); setError('');
    try {
      const dash = { dash_folder_id: form.dash_folder_id || null, dash_upload_url: form.dash_upload_url || null };
      if (selectedId === 'new') {
        const r = await createAccount(form);
        await setDashConfig(r.account.id, dash);
        await loadAccounts(r.account.id);
      } else {
        await updateAccount(selectedId, form);
        await setDashConfig(selectedId, dash);
        await loadAccounts(selectedId);
      }
    } catch (e) { setError(String(e.message || e)); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (selectedId === 'new' || !selectedId) return;
    if (!window.confirm(`Delete "${form.company}"? This removes the client and all of their portal data. This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteAccount(selectedId);
      setSelectedId(null); setForm(BLANK); setInvites([]);
      await loadAccounts();
    } catch (e) { setError(String(e.message || e)); } finally { setSaving(false); }
  };

  const addInviteH = async () => {
    const email = inviteForm.email.trim();
    if (!email || selectedId === 'new') return;
    setBusyInvite(true); setNotice(''); setError('');
    try {
      const res = await addInvite(selectedId, inviteForm);
      if (res && res.emailed) {
        setNotice(`Invite email sent to ${email}.`);
      } else {
        setError(`${email} was added, but the invite email failed to send${res?.emailError ? ` — ${res.emailError}` : ''}. They can still sign in at ${window.location.host}.`);
      }
      setInviteForm({ email: '', name: '', role: 'owner', is_staff: false });
      const r = await listInvites(selectedId); setInvites(r.invites || []);
    } catch (e) { setError(String(e.message || e)); } finally { setBusyInvite(false); }
  };

  const removeInviteH = async (email) => {
    setBusyInvite(true);
    try {
      await removeInvite(email);
      const r = await listInvites(selectedId); setInvites(r.invites || []);
    } catch (e) { setError(String(e.message || e)); } finally { setBusyInvite(false); }
  };

  const onLogo = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || selectedId === 'new') return;
    setSaving(true); setError('');
    try {
      const logo_url = await uploadLogo(selectedId, file);
      await updateAccount(selectedId, { logo_url });
      setForm((f) => ({ ...f, logo_url }));
      await loadAccounts(selectedId);
    } catch (e2) { setError(String(e2.message || e2)); } finally { setSaving(false); }
  };

  const isNew = selectedId === 'new';

  return (
    <div className="content" data-screen-label="Admin">
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['clients', 'analytics', 'health'].map((id) => (
          <button key={id} onClick={() => setTab(id)} className="btn btn-sm"
            style={{ background: tab === id ? 'var(--alloy-purple)' : 'transparent', color: tab === id ? '#fff' : 'var(--alloy-purple)', padding: '6px 14px', textTransform: 'capitalize' }}>
            {id}
          </button>
        ))}
      </div>

      {tab === 'health' ? <SyncHealth /> : tab === 'analytics' ? <AdminAnalytics /> : (
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        {/* Accounts list */}
        <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--alloy-purple)', flex: 1 }}>Clients</span>
            <button className="btn btn-primary btn-sm" onClick={newClient}><I.Plus width={12} height={12} /> New</button>
          </div>
          <div>
            {accounts === null ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--fg-muted)' }}>Loading…</div>
            ) : accounts.length === 0 && !isNew ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--fg-muted)' }}>No clients yet.</div>
            ) : accounts.map((a) => (
              <button key={a.id} onClick={() => selectAccount(a)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: selectedId === a.id ? 'var(--alloy-purple-tint)' : '#fff' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--alloy-purple)' }}>{a.short_name || a.company}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{a.company}</div>
              </button>
            ))}
            {isNew ? (
              <div style={{ padding: '12px 14px', background: 'var(--alloy-purple-tint)', fontSize: 13, fontWeight: 700, color: 'var(--alloy-purple)' }}>New client…</div>
            ) : null}
          </div>
        </div>

        {/* Editor */}
        <div>
          {selectedId ? (
            <div className="card card-pad">
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--alloy-purple)', flex: 1 }}>
                  {isNew ? 'New client' : (form.short_name || form.company)}
                </div>
                {!isNew ? <button className="btn btn-ghost btn-sm" onClick={remove} style={{ color: 'var(--alloy-pink)' }}>Delete</button> : null}
              </div>

              {error ? <div style={{ background: 'var(--alloy-pink-tint)', color: 'var(--alloy-pink)', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>{error}</div> : null}

              {/* Company icon */}
              {isNew ? (
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginBottom: 14 }}>Save the client first, then you can upload a company icon.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--alloy-purple-tint)', color: 'var(--alloy-purple)', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                      {(form.short_name || form.company || '').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    {form.logo_url ? 'Change icon' : 'Upload icon'}
                    <input type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} />
                  </label>
                  <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>Square image — shown top-left of their dashboard.</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Company" value={form.company} onChange={set('company')} placeholder="RISE Association Management Group" />
                <Field label="Short name" value={form.short_name} onChange={set('short_name')} placeholder="RISE" />
                <Field label="Tier" value={form.tier} onChange={set('tier')} placeholder="Accelerate" />
                <Field label="Market" value={form.market} onChange={set('market')} placeholder="Austin–Round Rock TX" />
                <Field label="Client since" value={form.since} onChange={set('since')} placeholder="Mar 2025" />
                <div />
              </div>

              <div className="section-title" style={{ marginTop: 18 }}><span className="pip" />Locations covered <span style={{ fontWeight: 500, color: 'var(--fg-muted)', textTransform: 'none', letterSpacing: 0 }}>· HQ + every market they operate in</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {locs.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>No locations yet — add their HQ first.</div>
                ) : locs.map((loc, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input className="input" value={loc.name || ''} placeholder="Houston TX" onChange={(e) => setLocName(i, e.target.value)} style={{ flex: 1, boxSizing: 'border-box' }} />
                    <button type="button" className={`btn btn-sm ${loc.hq ? 'btn-dark' : 'btn-secondary'}`} onClick={() => setHQ(i)} title="Set as headquarters">{loc.hq ? '★ HQ' : 'Set HQ'}</button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeLoc(i)} aria-label="Remove location">✕</button>
                  </div>
                ))}
                <div><button type="button" className="btn btn-secondary btn-sm" onClick={addLoc}>+ Add location</button></div>
              </div>

              <div className="section-title" style={{ marginTop: 18 }}><span className="pip" />Goal (shown on their dashboard)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <Field label="Goal label" value={form.goal_label} onChange={set('goal_label')} placeholder="boards signed" />
                <Field label="Current" type="number" value={form.goal_current} onChange={set('goal_current')} />
                <Field label="Target" type="number" value={form.goal_target} onChange={set('goal_target')} />
              </div>

              <div className="section-title" style={{ marginTop: 18 }}><span className="pip" />Integrations</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Monday board ID" value={form.monday_board_id} onChange={set('monday_board_id')} hint="Projects/services/action queue source" />
                <Field label="Zendesk org ID" value={form.zendesk_org_id} onChange={set('zendesk_org_id')} hint="Scopes the client's tickets" />
                <Field label="WhatConverts profile ID" value={form.whatconverts_profile_id} onChange={set('whatconverts_profile_id')} hint="Pulls the client's leads" />
                <Field label="QuickBooks customer ID" value={form.quickbooks_customer_id} onChange={set('quickbooks_customer_id')} hint="QBO customer — open them in QuickBooks, copy nameId from the URL" />
                <Field label="Dash brand folder" value={form.dash_folder_id} onChange={set('dash_folder_id')} hint="The brand's top-level Dash folder NAME (e.g. Edison) — drives the Assets page" />
                <Field label="Dash upload link" value={form.dash_upload_url} onChange={set('dash_upload_url')} hint="Guest-upload link — powers the Upload Assets button" />
                <Field label="Pastel website board" value={form.pastel_url} onChange={set('pastel_url')} hint="Client's Pastel feedback URL — routes 'Website update' requests here" />
              </div>

              <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : (isNew ? 'Create client' : 'Save changes')}</button>
              </div>

              {/* Team / access */}
              {!isNew ? (
                <>
                  <div className="section-title" style={{ marginTop: 24 }}><span className="pip" />Team &amp; access</div>
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                    {invites.length === 0 ? (
                      <div style={{ padding: 14, fontSize: 13, color: 'var(--fg-muted)' }}>No one invited yet.</div>
                    ) : invites.map((inv) => (
                      <div key={inv.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{inv.email}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{inv.name ? `${inv.name} · ` : ''}{inv.role}{inv.is_staff ? ' · staff' : ''}</div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeInviteH(inv.email)} disabled={busyInvite} style={{ color: 'var(--alloy-pink)' }}>Remove</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 2, minWidth: 180 }}>
                      <Field label="Invite email" value={inviteForm.email} onChange={(v) => setInviteForm((f) => ({ ...f, email: v }))} placeholder="owner@client.com" />
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <Field label="Name" value={inviteForm.name} onChange={(v) => setInviteForm((f) => ({ ...f, name: v }))} placeholder="Optional" />
                    </div>
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 }}>Role</span>
                      <select className="input" value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}>
                        {CLIENT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--alloy-purple)', whiteSpace: 'nowrap' }} title="Alloy team member — full portfolio access to every client. Leave off for client users.">
                      <input type="checkbox" checked={!!inviteForm.is_staff} onChange={(e) => setInviteForm((f) => ({ ...f, is_staff: e.target.checked }))} />
                      Alloy staff
                    </label>
                    <button className="btn btn-secondary" onClick={addInviteH} disabled={busyInvite || !inviteForm.email.trim()}>Add</button>
                  </div>
                  {notice ? (
                    <div style={{ marginTop: 8, background: 'var(--alloy-green-tint)', color: 'var(--dark-green, #2c6e62)', fontSize: 12.5, padding: '8px 12px', borderRadius: 8 }}>{notice}</div>
                  ) : null}
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 8 }}>
                    Adding someone emails them an invite link; they sign in and only see this client's data. Removing them revokes access.
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="card card-pad" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Select a client, or create a new one.</div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

export default AdminScreen;
