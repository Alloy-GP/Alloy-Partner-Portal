import React from 'react';
import { I } from './icons.jsx';
import { Icon } from './board-proposal.jsx';
import { UVPS, UVP_CATEGORIES } from '../lib/proposalUVPs.js';
import { getLeads } from '../lib/proposalMockData.js';
import { DATA } from '../data.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

// ============================================================================
// UVP Library — the management surface for the proposal backbone.
//
// Shows the CAM's full UVP library (the capabilities every proposal matches
// against), grouped by category, with usage ("matched in N proposals") so it's
// clear how each strength is pulling its weight. Editing is live in this session
// (seeded from the canonical proposalUVPs.js); persisting per-client + flowing
// edits into every proposal is the database step.
// ============================================================================

const { useState } = React;

// How many leads in the pipeline have a concern matched to this UVP (by index).
function usageCount(uvpIndex) {
  return getLeads().filter((l) => (l.links || []).some((caps) => caps.includes(uvpIndex))).length;
}

const CAT_LABEL = { operations: 'Operations', financial: 'Financial', tech: 'Technology', credibility: 'Credibility', values: 'Values', service: 'Service', transition: 'Transition', people: 'People' };

// When the portal is wired to Supabase AND we're viewing a real account, the
// library reads + writes the proposal_uvps table (RLS-scoped to that account).
// In mock dev (no env) it stays session-local, seeded from the canonical list.
const canPersist = () => isSupabaseConfigured && !!DATA.account?.id;

const slugify = (s, taken) => {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'uvp';
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
};

// Card (proposalUVPs shape) → proposal_uvps columns. Inserts carry account_id
// + position + slug; updates patch content only (position never changes —
// append + retire, never reorder).
const insertRow = (c, position) => ({
  account_id: DATA.account.id, position, slug: c.id,
  title: c.title, short: c.short || '', body: c.body || '',
  icon: c.icon || 'sparkles', category: c.category || 'operations',
  tags: c.tags || [], proof_value: c.proof?.value || '', proof_label: c.proof?.label || '',
  active: c.active !== false,
});
const updatePatch = (c) => ({
  title: c.title, short: c.short || '', body: c.body || '',
  icon: c.icon || 'sparkles', category: c.category || 'operations',
  tags: c.tags || [], proof_value: c.proof?.value || '', proof_label: c.proof?.label || '',
  active: c.active !== false,
});

function EditModal({ uvp, onClose, onSave }) {
  const [f, setF] = useState({ ...uvp, tags: (uvp.tags || []).join(', '), proofValue: uvp.proof?.value || '', proofLabel: uvp.proof?.label || '' });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = () => {
    onSave({
      ...uvp,
      title: f.title.trim(), short: f.short.trim(), body: f.body.trim(), category: f.category,
      icon: f.icon.trim() || uvp.icon,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      proof: (f.proofValue.trim() || f.proofLabel.trim()) ? { value: f.proofValue.trim(), label: f.proofLabel.trim() } : null,
      active: f.active,
    });
    onClose();
  };
  return (
    <div className="ps-scrim" onClick={onClose}>
      <div className="ps-modal uvp-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ps-modal-head">
          <span className="t">{uvp._new ? 'New UVP' : 'Edit UVP'}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>The board sees this on the proposal</span>
          <button className="x" onClick={onClose}><I.Close width={15} height={15} /></button>
        </div>
        <div className="uvp-edit-body">
          <label className="uvp-f-label">Title</label>
          <input className="uvp-f-input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Team-based pod model" autoFocus />
          <label className="uvp-f-label">One-liner <span>· match-detail blurb</span></label>
          <input className="uvp-f-input" value={f.short} onChange={(e) => set('short', e.target.value)} />
          <label className="uvp-f-label">Body <span>· the paragraph on the proposal</span></label>
          <textarea className="uvp-f-area" value={f.body} onChange={(e) => set('body', e.target.value)} />
          <div className="uvp-f-row">
            <div style={{ flex: 1 }}>
              <label className="uvp-f-label">Category</label>
              <select className="uvp-f-input" value={f.category} onChange={(e) => set('category', e.target.value)}>
                {UVP_CATEGORIES.map((cat) => <option key={cat} value={cat}>{CAT_LABEL[cat] || cat}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="uvp-f-label">Icon <span>· lucide name</span></label>
              <input className="uvp-f-input" value={f.icon} onChange={(e) => set('icon', e.target.value)} placeholder="users" />
            </div>
          </div>
          <label className="uvp-f-label">Matching tags <span>· comma-separated; drives pain→UVP matching</span></label>
          <input className="uvp-f-input" value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="communication, responsiveness, modern" />
          <label className="uvp-f-label">Proof point <span>· the canonical evidence</span></label>
          <div className="uvp-f-row">
            <input className="uvp-f-input" style={{ flex: '0 0 120px' }} value={f.proofValue} onChange={(e) => set('proofValue', e.target.value)} placeholder="97%" />
            <input className="uvp-f-input" style={{ flex: 1 }} value={f.proofLabel} onChange={(e) => set('proofLabel', e.target.value)} placeholder="Call timeliness rate" />
          </div>
          <label className="uvp-f-check"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active — available to match new proposals</label>
          <div className="uvp-f-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!f.title.trim()} onClick={save}>Save UVP</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UVPLibrary() {
  const live = canPersist();
  // Live → this account's saved library (DATA.proposalUvps, cap-ordered).
  // Mock/empty → the canonical seed. _i = canonical cap index (drives usage).
  const seed = (live && DATA.proposalUvps?.length) ? DATA.proposalUvps : UVPS;
  const [uvps, setUvps] = useState(() => seed.map((u, i) => ({ ...u, _i: u._position ?? i })));
  const [editId, setEditId] = useState(null);
  const [saveState, setSaveState] = useState(null); // null | 'saving' | 'saved' | { error }
  const editing = editId === '__new__' ? { id: '', title: '', short: '', body: '', category: UVP_CATEGORIES[0], icon: 'sparkles', tags: [], proof: null, active: true, _new: true } : uvps.find((u) => u.id === editId);

  // Optimistic local update first (snappy in both modes), then persist when live.
  const save = async (next) => {
    const taken = new Set(uvps.map((u) => u.id));
    let card;
    if (next._new) {
      const position = uvps.length;
      card = { ...next, id: slugify(next.title, taken), _new: undefined, _i: position, _position: position };
      setUvps((p) => [...p, card]);
    } else {
      card = { ...next };
      setUvps((p) => p.map((u) => (u.id === next.id ? { ...u, ...next } : u)));
    }
    if (!live) return;
    setSaveState('saving');
    try {
      if (next._new) {
        const { data, error } = await supabase.from('proposal_uvps')
          .insert(insertRow(card, card._position)).select('id').single();
        if (error) throw error;
        setUvps((p) => p.map((u) => (u.id === card.id ? { ...u, _dbId: data.id } : u)));
      } else {
        const qy = supabase.from('proposal_uvps').update(updatePatch(card));
        const { error } = await (card._dbId
          ? qy.eq('id', card._dbId)
          : qy.eq('account_id', DATA.account.id).eq('slug', card.id));
        if (error) throw error;
      }
      setSaveState('saved');
    } catch (e) {
      setSaveState({ error: e.message || 'Save failed' });
    }
  };

  const byCat = UVP_CATEGORIES.map((cat) => ({ cat, items: uvps.filter((u) => u.category === cat) })).filter((g) => g.items.length);
  const activeCount = uvps.filter((u) => u.active).length;

  return (
    <div className="uvp-lib">
      <div className="uvp-lib-head">
        <div>
          <div className="uvp-lib-eyebrow">UVP Library · CMGT</div>
          <h2 className="uvp-lib-title">Your strengths — the backbone of every proposal.</h2>
          <p className="uvp-lib-sub">Every proposal matches a board's pain points to these capabilities. {activeCount} active · proof points and prose flow straight into the board-facing document.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditId('__new__')}><I.Plus width={14} height={14} /> Add UVP</button>
      </div>

      <div className="uvp-lib-note" data-state={saveState?.error ? 'error' : saveState}>
        {live ? (
          <>Saved to {DATA.account?.shortName || 'this'} library — edits persist and flow into new proposals.
            {saveState === 'saving' && <em> · Saving…</em>}
            {saveState === 'saved' && <em> · Saved ✓</em>}
            {saveState?.error && <em> · Save failed: {saveState.error}</em>}
          </>
        ) : (
          <>Edits are live in this session. Per-client editing that persists and flows into every proposal arrives with the database — this is that editor's seed.</>
        )}
      </div>

      {byCat.map(({ cat, items }) => (
        <div key={cat} className="uvp-lib-cat">
          <div className="uvp-lib-cat-label">{CAT_LABEL[cat] || cat} <span>{items.length}</span></div>
          <div className="uvp-lib-grid">
            {items.map((u) => {
              const used = usageCount(u._i);
              return (
                <div key={u.id} className="uvp-card" data-inactive={!u.active}>
                  <div className="uvp-card-top">
                    <span className="uvp-card-ic"><Icon name={u.icon} size={18} color="var(--alloy-purple)" /></span>
                    <div className="uvp-card-title">{u.title}</div>
                    <button className="uvp-card-edit" title="Edit" onClick={() => setEditId(u.id)}><I.Edit width={14} height={14} /></button>
                  </div>
                  <div className="uvp-card-short">{u.short}</div>
                  <div className="uvp-card-body">{u.body}</div>
                  <div className="uvp-card-tags">{u.tags.map((t) => <span key={t} className="uvp-tag">{t}</span>)}</div>
                  <div className="uvp-card-foot">
                    {u.proof && <span className="uvp-card-proof"><b>{u.proof.value}</b> {u.proof.label}</span>}
                    <span className="uvp-card-usage">{used === 0 ? 'Not yet matched' : `Matched in ${used} ${used === 1 ? 'proposal' : 'proposals'}`}</span>
                    {!u.active && <span className="uvp-card-retired">Retired</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {editing && <EditModal uvp={editing} onClose={() => setEditId(null)} onSave={save} />}
    </div>
  );
}
