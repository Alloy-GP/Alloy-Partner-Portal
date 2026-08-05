import React from 'react';
import { I } from './icons.jsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

const { useState, useEffect, useRef } = React;

// Guide reader popup — opened from a ticket card's guide button. Renders the
// guide's self-contained HTML in an isolated iframe, with Open-in-new-tab +
// Print. `guide` is the metadata ({ id, title, scope }); html is lazy-fetched.
export default function GuideModal({ guide, onClose }) {
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState('');
  const frameRef = useRef(null);

  useEffect(() => {
    if (!guide) return;
    if (!isSupabaseConfigured) { setErr('not configured'); return; }
    let cancelled = false;
    setHtml(null); setErr('');
    supabase.from('guides').select('html').eq('id', guide.id).maybeSingle()
      .then(({ data, error }) => { if (cancelled) return; if (error) setErr(String(error.message || error)); else setHtml((data && data.html) || ''); });
    return () => { cancelled = true; };
  }, [guide]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!guide) return null;

  const openTab = () => {
    if (!html) return;
    const u = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(u, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  };
  const print = () => { try { frameRef.current && frameRef.current.contentWindow.print(); } catch { /* ignore */ } };

  return (
    <div className="nr-scrim" onClick={onClose} style={{ padding: 24, zIndex: 90, background: 'rgba(16,9,26,0.78)' }}>
      <div role="dialog" aria-modal="true" aria-label={guide.title} onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1000px, 96vw)', height: '92vh', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(26,15,38,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <I.Book width={16} height={16} style={{ color: 'var(--alloy-purple)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--alloy-purple)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{guide.title}</span>
          <button className="btn btn-ghost btn-sm" onClick={print} disabled={!html}>Print</button>
          <button className="btn btn-secondary btn-sm" onClick={openTab} disabled={!html}>Open in new tab <I.External width={12} height={12} /></button>
          <button className="nr-close" onClick={onClose} aria-label="Close"><I.Close width={14} height={14} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: '#fff' }}>
          {err ? (
            <div style={{ padding: 20, color: 'var(--alloy-pink)', fontSize: 13 }}>Couldn’t load this guide. {err}</div>
          ) : html === null ? (
            <div style={{ padding: 20, color: 'var(--fg-muted)', fontSize: 13 }}>Loading guide…</div>
          ) : (
            <iframe ref={frameRef} srcDoc={html} title={guide.title} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
          )}
        </div>
      </div>
    </div>
  );
}
