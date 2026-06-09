import React from 'react';
import { I } from './icons.jsx';
import { DATA } from '../data.js';

/**
 * Deep-linkable ticket view (/tickets/:id). Today it's a stub fed by the
 * action queue (the Monday-synced ticket) with a link out to the exact
 * Zendesk ticket. Once the Zendesk API integration lands, the full
 * conversation thread renders here in-portal.
 */
function TicketDetailPage({ id, onNav }) {
  const item = (DATA.actionQueue || []).find(
    (a) => String(a.routeId) === String(id) || String(a.zendeskId) === String(id),
  );

  return (
    <div className="content" data-screen-label="Ticket">
      <button className="btn btn-ghost btn-sm" onClick={() => onNav('tickets')} style={{ marginBottom: 14 }}>
        ← Back to tickets
      </button>

      <div className="card card-pad">
        {item ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--alloy-pink)' }}>
              Waiting on you{item.zendeskId ? ` · Ticket #${item.zendeskId}` : ''}
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--alloy-purple)', margin: '6px 0 4px' }}>
              {item.title}
            </h2>
            {item.dueRel ? <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{item.dueRel}</div> : null}

            {item.zendeskUrl ? (
              <a className="btn btn-primary" href={item.zendeskUrl} target="_blank" rel="noreferrer" style={{ marginTop: 18 }}>
                <I.External width={14} height={14} /> Open in Zendesk
              </a>
            ) : null}

            <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--alloy-purple-tint)', borderRadius: 10, fontSize: 13, color: 'var(--alloy-purple)', lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <I.Sparkle width={14} height={14} />
              <span>The full conversation thread will appear here once the Zendesk integration is connected.</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
            This ticket isn’t in your queue right now.
          </div>
        )}
      </div>
    </div>
  );
}

export default TicketDetailPage;
