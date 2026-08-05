import React from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { listAccounts } from '../lib/admin.js';

const { useState, useEffect } = React;

// Admin → Guides: author the HTML guide documents shown on clients' Guides page.
// Global guides (no client) show to everyone; a client-scoped guide shows only to
// that client. Staff write directly via RLS (guides_* policies = is_staff()).

const BLANK = { id: null, account_id: '', title: '', description: '', category: 'Guides', html: '', tag: '' };

function fieldLabel(text) {
  return <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)', marginBottom: 4 }}>{text}</span>;
}

export default function AdminGuides() {
  const [guides, setGuides] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [sel, setSel] = useState(null);        // 'new' | guide id | null
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.from('guides').select('id, account_id, title, description, category, tag, sort').order('sort');
    if (error) { setError(String(error.message || error)); setGuides([]); return; }
    setGuides(data || []);
  };
  useEffect(() => {
    load();
    listAccounts().then((r) => setAccounts((r.accounts || []).filter((a) => a.tier !== 'internal').sort((a, b) => String(a.company).localeCompare(String(b.company))))).catch(() => {});
  }, []);

  const acctName = (id) => { const a = accounts.find((x) => x.id === id); return a ? (a.short_name || a.company) : id; };

  const openNew = () => { setSel('new'); setForm(BLANK); setError(''); setNotice(''); };
  const openEdit = async (g) => {
    setSel(g.id); setError(''); setNotice('');
    setForm({ ...BLANK, ...g, account_id: g.account_id || '' });
    // lazy-load the html
    const { data } = await supabase.from('guides').select('html').eq('id', g.id).maybeSingle();
    setForm((f) => ({ ...f, html: (data && data.html) || '' }));
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) { setError('Give the guide a title.'); return; }
    if (!form.html.trim()) { setError('Paste the guide’s HTML.'); return; }
    setBusy(true); setError(''); setNotice('');
    const row = {
      account_id: form.account_id || null,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim() || 'Guides',
      tag: form.tag.trim() || null,
      html: form.html,
    };
    try {
      if (sel === 'new') {
        const { error } = await supabase.from('guides').insert(row);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('guides').update(row).eq('id', sel);
        if (error) throw error;
      }
      setNotice('Saved.');
      await load();
      if (sel === 'new') setSel(null);
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  const del = async () => {
    if (sel === 'new' || !sel) return;
    if (!window.confirm(`Delete “${form.title}”? This can’t be undone.`)) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase.from('guides').delete().eq('id', sel);
      if (error) throw error;
      setSel(null); setForm(BLANK); await load();
    } catch (e) { setError(String(e.message || e)); } finally { setBusy(false); }
  };

  if (guides === null) return <div className="card card-pad" style={{ color: 'var(--fg-muted)' }}>Loading guides…</div>;

  const globals = guides.filter((g) => !g.account_id);
  const clientGuides = guides.filter((g) => g.account_id);

  const ListItem = (g) => (
    <button key={g.id} onClick={() => openEdit(g)}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: sel === g.id ? 'var(--alloy-purple-tint)' : '#fff' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--alloy-purple)' }}>{g.title || '(untitled)'}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{g.category}{g.account_id ? ` · ${acctName(g.account_id)}` : ' · Global'}</div>
    </button>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
      {/* List */}
      <div className="card" style={{ padding: 0, alignSelf: 'start' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--alloy-purple)', flex: 1 }}>Guides</span>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ New</button>
        </div>
        <div style={{ padding: '8px 14px 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)' }}>Global · {globals.length}</div>
        {globals.map(ListItem)}
        <div style={{ padding: '10px 14px 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--fg-muted)' }}>Client-specific · {clientGuides.length}</div>
        {clientGuides.map(ListItem)}
        {guides.length === 0 ? <div style={{ padding: 14, fontSize: 12.5, color: 'var(--fg-muted)' }}>No guides yet.</div> : null}
      </div>

      {/* Editor */}
      <div>
        {!sel ? (
          <div className="card card-pad" style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Pick a guide to edit, or create a new one. Paste a full self-contained HTML document — it renders in an isolated frame on the client’s Guides page.</div>
        ) : (
          <div className="card card-pad">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--alloy-purple)', flex: 1 }}>{sel === 'new' ? 'New guide' : (form.title || 'Guide')}</div>
              {sel !== 'new' ? <button className="btn btn-ghost btn-sm" onClick={del} disabled={busy} style={{ color: 'var(--alloy-pink)' }}>Delete</button> : null}
            </div>
            {error ? <div style={{ background: 'var(--alloy-pink-tint)', color: 'var(--alloy-pink)', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 12 }}>{error}</div> : null}
            {notice ? <div style={{ background: 'var(--alloy-green-tint)', color: 'var(--dark-green, #2c6e62)', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 12 }}>{notice}</div> : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>{fieldLabel('Title')}<input className="input" value={form.title} onChange={set('title')} placeholder="How to record Expert Q&A Clips" style={{ width: '100%', boxSizing: 'border-box' }} /></label>
              <label>{fieldLabel('Category')}<input className="input" value={form.category} onChange={set('category')} placeholder="Video, Getting started…" style={{ width: '100%', boxSizing: 'border-box' }} /></label>
              <label>{fieldLabel('Who sees it')}
                <select className="input" value={form.account_id} onChange={set('account_id')} style={{ width: '100%', boxSizing: 'border-box' }}>
                  <option value="">🌐 Global — every client</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.short_name || a.company}</option>)}
                </select>
              </label>
              <label>{fieldLabel('Short description')}<input className="input" value={form.description} onChange={set('description')} placeholder="One line shown on the card" style={{ width: '100%', boxSizing: 'border-box' }} /></label>
              <label style={{ gridColumn: '1 / -1' }}>{fieldLabel('Show on tickets tagged')}
                <input className="input" value={form.tag} onChange={set('tag')} placeholder="video" style={{ width: '100%', boxSizing: 'border-box' }} />
                <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 3, display: 'block' }}>Any Zendesk ticket with this tag shows a button to this guide on its card. Leave blank for none.</span>
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              {fieldLabel('Guide HTML (full document)')}
              <textarea className="input" value={form.html} onChange={set('html')} rows={16}
                placeholder="<!DOCTYPE html><html>…</html>"
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, lineHeight: 1.5, resize: 'vertical' }} />
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4 }}>{(form.html.length / 1024).toFixed(0)}KB · renders in an isolated iframe on the client’s Guides page.</div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : (sel === 'new' ? 'Create guide' : 'Save changes')}</button>
              {form.html.trim() ? (
                <button className="btn btn-secondary" onClick={() => { const u = URL.createObjectURL(new Blob([form.html], { type: 'text/html' })); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); }}>Preview ↗</button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
