import React from 'react';
import { fmtWhen } from '../lib/engagementGate.js';

// One message in the proposal thread. Colour says WHO (Alloy = purple, client =
// light); side says whose screen it is (`mine` sits right). Shared by the
// client proposal page and Admin.
export function ThreadMessage({ m, mine }) {
  const who = m.role === 'staff' ? `${m.name || 'Alloy'} · Alloy` : (m.name || 'Client');
  return (
    <div className={`eg-msg ${m.role === 'staff' ? 'is-staff' : 'is-client'}${mine ? ' is-mine' : ''}`} data-role={m.role}>
      <div className="eg-msg-meta">{who}{m.at && fmtWhen(m.at) ? ` · ${fmtWhen(m.at)}` : ''}</div>
      <div className="eg-msg-body">{m.message}</div>
    </div>
  );
}

export default ThreadMessage;
