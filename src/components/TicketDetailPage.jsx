import React from 'react';
import TicketThread from './TicketThread.jsx';

/**
 * Deep-linkable ticket view (/tickets/:id). Renders the live Zendesk thread
 * for the given ticket id. The zendesk function authorizes that the ticket
 * belongs to the signed-in user's account, so an arbitrary id just errors.
 */
function TicketDetailPage({ id, onNav }) {
  return (
    <div className="content" data-screen-label="Ticket">
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onNav('tickets')}>
          ← Back to inbox
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onNav('projects')}>
          Work in motion →
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', background: '#fff', minHeight: 560 }}>
        <TicketThread id={id} />
      </div>
    </div>
  );
}

export default TicketDetailPage;
