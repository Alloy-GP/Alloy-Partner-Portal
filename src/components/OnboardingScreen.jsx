import React from 'react';
import { useNavigate } from 'react-router-dom';
import { I } from './icons.jsx';
import { DATA } from '../data.js';
import { SECTIONS, STATUSES, statusMeta, fieldsFor, groupBySection, onboardingProgress, isFreeform } from '../lib/onboarding.js';
import { can } from '../lib/perms.js';
import { updateOnboardingItem, addOnboardingItem, removeOnboardingItem } from '../lib/onboardingData.js';
import { track } from '../lib/track.js';

// Onboarding checklist — the in-portal replacement for the Google Sheet Alloy
// used to email each new client. Four sections (contacts · access · resources
// · marketing), one autosaving row per line item. Clients set the status and
// fill the details; Alloy staff get an extra "Alloy" column to confirm access
// (the sheet's "Alloy Confirm"). Gated by canSeeOnboarding (App.jsx + nav).

const { useState, useEffect, useRef } = React;

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg>
);

function SaveDot({ state }) {
  if (state === 'idle') return null;
  const txt = state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : 'Not saved — try again';
  return <span className={`ob-save ${state}`} role="status">{txt}</span>;
}

// Debounced autosave for one row. Field edits coalesce (700ms); a status change
// flushes immediately together with anything pending; unmount flushes too.
function useAutosave(id) {
  const [save, setSave] = useState('idle');
  const timer = useRef(null);
  const pending = useRef(null);
  const persist = async (patch) => {
    clearTimeout(timer.current);
    const body = { ...(pending.current || {}), ...(patch || {}) };
    pending.current = null;
    if (!Object.keys(body).length) return;
    setSave('saving');
    try {
      await updateOnboardingItem(id, body);
      setSave('saved');
      setTimeout(() => setSave((s) => (s === 'saved' ? 'idle' : s)), 1600);
    } catch { setSave('error'); }
  };
  const queue = (patch) => {
    pending.current = { ...(pending.current || {}), ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(), 700);
  };
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pending.current) updateOnboardingItem(id, pending.current).catch(() => {});
  }, [id]);
  return { save, persist, queue };
}

function ProgressRing({ pct, size = 96, stroke = 9 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ob-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--alloy-light-gray)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy=".35em" textAnchor="middle" className="ob-ring-txt">{pct}%</text>
    </svg>
  );
}

function ItemRow({ item, staff, onRemove, pay }) {
  const isPay = item.kind === 'payment';
  const [open, setOpen] = useState(false);
  const [localStatus, setStatus] = useState(item.status);
  // The bank step's status is derived (loadData / onSaved mutate the item), so
  // read it live instead of from row state that would go stale.
  const status = isPay ? item.status : localStatus;
  const [alloy, setAlloy] = useState(item.alloyStatus || '');
  const [label, setLabel] = useState(item.label || '');
  const [fields, setFields] = useState(item.fields || {});
  const [show, setShow] = useState(false);
  const { save, persist, queue } = useAutosave(item.id);

  const meta = statusMeta(status);
  const specs = fieldsFor(item.kind);
  const filled = specs.filter((f) => String(fields[f.k] || '').trim()).length;

  const changeStatus = (v) => {
    setStatus(v);
    persist({ status: v });
    track('onboarding_status', { key: item.key, status: v });
    // Opening the details on a "done"-ish pick nudges the client to leave the
    // login/link we'll need; N/A and Optional need nothing more.
    if (!open && v !== 'na' && v !== 'optional') setOpen(true);
  };
  const changeAlloy = (v) => { setAlloy(v); persist({ alloyStatus: v || null }); };
  const setField = (k, v) => { const next = { ...fields, [k]: v }; setFields(next); queue({ fields: next }); };

  return (
    <div className={`ob-item${open ? ' open' : ''}`} data-key={item.key}>
      <div className="ob-item-row">
        <button type="button" className="ob-item-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="ob-chev"><Chevron /></span>
          <span className="ob-item-text">
            {item.custom ? (
              <input className="ob-label-input" value={label} placeholder="Tool or platform name"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { setLabel(e.target.value); queue({ label: e.target.value }); }} />
            ) : <span className="ob-item-label">{item.label}</span>}
            {item.hint ? <span className="ob-item-hint">{item.hint}</span> : null}
            {!open && filled ? <span className="ob-item-filled">{filled} {filled === 1 ? 'detail' : 'details'} added</span> : null}
          </span>
        </button>
        <SaveDot state={save} />
        {isPay ? (
          <>
            {status !== 'complete' && status !== 'na' && pay && pay.onAdd ? (
              <button type="button" className="btn btn-primary btn-sm ob-pay-cta" onClick={pay.onAdd}>Add bank account</button>
            ) : null}
            <span className={`ob-status ob-static tone-${meta.tone}`} data-testid="ob-pay-status">{meta.label}</span>
          </>
        ) : (
          <select className={`ob-status tone-${meta.tone}`} value={status} onChange={(e) => changeStatus(e.target.value)} aria-label={`Status for ${item.label || 'item'}`}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
        {staff ? (
          <select className={`ob-status ob-confirm tone-${alloy ? statusMeta(alloy).tone : 'muted'}`} value={alloy}
            onChange={(e) => changeAlloy(e.target.value)} aria-label="Alloy confirm" title="Alloy confirm — staff only">
            <option value="">Alloy: —</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>Alloy: {s.label}</option>)}
          </select>
        ) : (alloy === 'complete' ? (
          <span className="ob-confirmed" title="Your Alloy team has confirmed access"><I.Check width={12} height={12} /> Alloy confirmed</span>
        ) : null)}
        {onRemove ? <button type="button" className="ob-x" onClick={onRemove} aria-label="Remove this item"><I.Close width={12} height={12} /></button> : null}
      </div>
      {open && isPay ? (
        <div className="ob-details">
          {status === 'complete' ? (
            <div className="ob-status-help">
              {pay && pay.pm ? <>Bank on file: <strong>{pay.pm.bankName || 'Bank account'}</strong> <span className="mono">•••• {pay.pm.last4 || '----'}</span>. </> : 'A bank account is on file. '}
              Autopay is set up — anything to change goes through your Alloy team (bank details can’t be edited here for security).
            </div>
          ) : status === 'na' ? (
            <div className="ob-status-help">Not needed for your account — Alloy bills you another way.</div>
          ) : (
            <div className="ob-status-help">
              {pay && pay.onAdd
                ? 'One short form: bank name, routing and account numbers, and an authorization for the monthly draft. The numbers go straight to Intuit — nothing is stored in this checklist.'
                : pay && pay.canBilling
                  ? 'Open Account Details to add the bank account.'
                  : 'An owner or accounting user on your team needs to add this — it needs billing access.'}
            </div>
          )}
        </div>
      ) : open ? (
        <div className="ob-details">
          <div className="ob-status-help">{meta.help}</div>
          <div className="ob-fields">
            {specs.map((f) => (
              <label key={f.k} className={`ob-field${f.type === 'textarea' ? ' wide' : ''}`}>
                <span className="ob-field-label">{f.label}</span>
                {f.type === 'textarea' ? (
                  <textarea className="input" rows={2} value={fields[f.k] || ''} placeholder={f.placeholder || ''} onChange={(e) => setField(f.k, e.target.value)} />
                ) : f.type === 'password' ? (
                  <span className="ob-pw">
                    <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={fields[f.k] || ''}
                      placeholder="Only if an admin invite isn’t possible" onChange={(e) => setField(f.k, e.target.value)} />
                    <button type="button" className={`ob-eye${show ? ' on' : ''}`} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                      <I.Eye width={14} height={14} />
                    </button>
                  </span>
                ) : (
                  <input className="input" type={f.type === 'url' ? 'text' : f.type} inputMode={f.type === 'url' ? 'url' : undefined}
                    value={fields[f.k] || ''} placeholder={f.placeholder || ''} onChange={(e) => setField(f.k, e.target.value)} />
                )}
              </label>
            ))}
          </div>
          {item.updatedBy ? <div className="ob-item-meta">Last updated by {item.updatedBy}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function ContactRow({ item, onRemove }) {
  const [name, setName] = useState(item.label || '');
  const [fields, setFields] = useState(item.fields || {});
  const { save, queue } = useAutosave(item.id);
  const setField = (k, v) => { const next = { ...fields, [k]: v }; setFields(next); queue({ fields: next }); };
  return (
    <div className="ob-contact">
      <input className="input" placeholder="Full name" value={name} aria-label="Full name"
        onChange={(e) => { setName(e.target.value); queue({ label: e.target.value }); }} />
      <input className="input" placeholder="Title / role" value={fields.title || ''} aria-label="Title or role" onChange={(e) => setField('title', e.target.value)} />
      <input className="input" type="email" placeholder="Email" value={fields.email || ''} aria-label="Email" onChange={(e) => setField('email', e.target.value)} />
      <input className="input" type="tel" placeholder="Phone" value={fields.phone || ''} aria-label="Phone" onChange={(e) => setField('phone', e.target.value)} />
      <span className="ob-contact-end">
        <SaveDot state={save} />
        {onRemove ? <button type="button" className="ob-x" onClick={onRemove} aria-label="Remove contact"><I.Close width={12} height={12} /></button> : null}
      </span>
    </div>
  );
}

// A location: name · address · phone. Saved like any row; a DB trigger merges
// it into accounts.locations so Alloy's admin, proposal and listings pick it up.
function LocationRow({ item, onRemove }) {
  const [name, setName] = useState(item.label || '');
  const [fields, setFields] = useState(item.fields || {});
  const { save, queue } = useAutosave(item.id);
  const setField = (k, v) => { const next = { ...fields, [k]: v }; setFields(next); queue({ fields: next }); };
  return (
    <div className="ob-location">
      <div className="ob-location-main">
        <label className="ob-field"><span className="ob-field-label">Location</span>
          <input className="input" placeholder="e.g. Austin, TX" value={name} onChange={(e) => { setName(e.target.value); queue({ label: e.target.value }); }} /></label>
        <label className="ob-field"><span className="ob-field-label">Address</span>
          <input className="input" placeholder="Street, City, ST ZIP" value={fields.address || ''} onChange={(e) => setField('address', e.target.value)} /></label>
        <label className="ob-field"><span className="ob-field-label">Phone</span>
          <input className="input" type="tel" placeholder="(555) 010-2030" value={fields.phone || ''} onChange={(e) => setField('phone', e.target.value)} /></label>
        <span className="ob-contact-end">
          <SaveDot state={save} />
          {onRemove ? <button type="button" className="ob-x" onClick={onRemove} aria-label="Remove location"><I.Close width={12} height={12} /></button> : null}
        </span>
      </div>
      <div className="ob-location-more">
        <label className="ob-field"><span className="ob-field-label">Location manager</span>
          <input className="input" placeholder="Who runs this office" value={fields.manager || ''} onChange={(e) => setField('manager', e.target.value)} /></label>
        <label className="ob-field"><span className="ob-field-label">Hours</span>
          <input className="input" placeholder="Mon–Fri 9am–5pm" value={fields.hours || ''} onChange={(e) => setField('hours', e.target.value)} /></label>
        <label className="ob-field"><span className="ob-field-label">Notes</span>
          <input className="input" placeholder="e.g. Main office · satellite with 3 staff" value={fields.notes || ''} onChange={(e) => setField('notes', e.target.value)} /></label>
      </div>
    </div>
  );
}

export default function OnboardingScreen({ onNav, onAddPayment }) {
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const [err, setErr] = useState('');

  const ob = DATA.onboarding || { startedAt: null, completedAt: null, items: [] };
  const items = ob.items || [];
  const staff = !!(DATA.user && DATA.user.isStaff);
  const groups = groupBySection(items);
  const prog = onboardingProgress(items);
  const uploadUrl = (DATA.account && DATA.account.dashUploadUrl) || 'https://dam.alloygp.co';
  const company = (DATA.account && (DATA.account.shortName || DATA.account.company)) || 'your team';
  const done = !!ob.completedAt;
  const left = prog.total - prog.resolved;
  // Bank step context: the modal trigger (null when this user can't add one
  // or a bank is on file), what's on file, and whether they have billing access.
  const pay = { onAdd: onAddPayment || null, pm: DATA.paymentMethod || null, canBilling: can(DATA.user, 'billing') };

  const add = async (section) => {
    setErr('');
    try { await addOnboardingItem({ section }); bump(); }
    catch (e) { setErr(String((e && e.message) || e)); }
  };
  const remove = async (id) => {
    setErr('');
    try { await removeOnboardingItem(id); bump(); }
    catch (e) { setErr(String((e && e.message) || e)); }
  };

  const headline = done
    ? 'You’re all set — thank you'
    : prog.total === 0
      ? 'Your checklist is on its way'
      : left === 0
        ? 'Everything’s in — Alloy is confirming access'
        : `${left} ${left === 1 ? 'item' : 'items'} to go`;
  const sub = done
    ? 'Onboarding is complete. Your checklist stays here for reference — update it any time something changes.'
    : prog.total === 0
      ? 'Your Alloy team is setting it up. Check back shortly.'
      : 'Work through each section at your own pace — everything saves as you go. Where you can, invite admin@alloygp.co as an administrator instead of sharing a password. Mark anything you can’t find as “Stuck” and we’ll sort it with you.';

  return (
    <div className="content ob-page" data-screen-label="Onboarding">
      {staff ? (
        <div className="ob-staff">
          <I.Eye width={15} height={15} />
          <span>Staff view — use the <strong>Alloy</strong> column to confirm each item as you get in. {company} sees “Alloy confirmed” once you mark it complete.</span>
          <span className="grow" />
          <button type="button" onClick={() => navigate('/admin/onboarding')}>Manage in Admin →</button>
        </div>
      ) : null}

      <section className={`card ob-hero${done ? ' done' : ''}`}>
        <ProgressRing pct={done ? 100 : prog.pct} />
        <div className="ob-hero-text">
          <div className="kicker">{done ? 'Onboarding complete' : 'Getting started'}</div>
          <h2>{headline}</h2>
          <p>{sub}</p>
          {prog.total ? (
            <div className="ob-hero-stats">
              <span className={`ob-stat${prog.resolved === prog.total ? ' ok' : ''}`}>{prog.resolved} of {prog.total} handled</span>
              {prog.stuck ? <span className="ob-stat stuck">{prog.stuck} stuck — we’re on it</span> : null}
              {prog.confirmed ? <span className="ob-stat ok"><I.Check width={12} height={12} /> {prog.confirmed} confirmed by Alloy</span> : null}
            </div>
          ) : null}
        </div>
        <div className="ob-hero-cta">
          <a className="btn btn-primary" href={uploadUrl} target="_blank" rel="noopener noreferrer"><I.Upload width={14} height={14} /> Upload files</a>
          <button type="button" className="btn btn-secondary" onClick={() => onNav && onNav('tickets')}>Ask a question</button>
        </div>
      </section>

      {err ? <div className="ob-err">{err}</div> : null}

      {SECTIONS.map((sec) => {
        const list = groups[sec.id] || [];
        const isContacts = sec.id === 'contacts';
        const isLocations = sec.id === 'locations';
        const sp = isFreeform(sec.id) ? null : onboardingProgress(list);
        return (
          <section key={sec.id} className="card ob-section" id={`ob-${sec.id}`}>
            <div className="ob-sec-head">
              <div>
                <span className="kicker">{sec.kicker}</span>
                <h3>{sec.title}</h3>
                <p className="ob-sec-blurb">{sec.blurb}</p>
              </div>
              {sp ? (
                <span className={`ob-sec-count${sp.total && sp.resolved === sp.total ? ' ok' : ''}`}>{sp.resolved} / {sp.total}</span>
              ) : <span className="ob-sec-count">{list.length} {isLocations ? (list.length === 1 ? 'location' : 'locations') : (list.length === 1 ? 'person' : 'people')}</span>}
            </div>
            {isLocations ? (
              <>
                {list.length === 0 ? <div className="ob-empty">No locations yet — add your main office first.</div> : null}
                {list.map((it) => <LocationRow key={it.id} item={it} onRemove={() => remove(it.id)} />)}
                <button type="button" className="ob-add" onClick={() => add('locations')}>+ Add a location</button>
              </>
            ) : isContacts ? (
              <>
                {list.length ? (
                  <div className="ob-contact-head" aria-hidden="true"><span>Full name</span><span>Title / role</span><span>Email</span><span>Phone</span><span /></div>
                ) : <div className="ob-empty">No one added yet — start with whoever runs point on marketing.</div>}
                {list.map((it) => <ContactRow key={it.id} item={it} onRemove={() => remove(it.id)} />)}
                <button type="button" className="ob-add" onClick={() => add('contacts')}>+ Add a contact</button>
              </>
            ) : (
              <>
                {list.length === 0 ? <div className="ob-empty">Nothing here yet.</div> : null}
                {list.map((it) => <ItemRow key={it.id} item={it} staff={staff} pay={pay} onRemove={it.custom ? () => remove(it.id) : null} />)}
                {sec.id === 'marketing' ? <button type="button" className="ob-add" onClick={() => add('marketing')}>+ Add another tool you use</button> : null}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
