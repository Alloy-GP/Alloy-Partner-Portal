// Standalone proposal page: the REAL ProposalPage, mounted on the JSON in the
// <script id="proposal-data" type="application/json"> block of the built HTML.
// No Supabase, no sign-in; acceptance is routed to the portal (standalone mode).
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../src/styles/17-proposal.css';
import { DATA, applyData } from '../../src/data.js';
import { engagementRowToView } from '../../src/lib/engagementGate.js';
import ProposalPage from '../../src/components/proposal/ProposalPage.jsx';

function readConfig() {
  const el = document.getElementById('proposal-data');
  try { return JSON.parse(el ? el.textContent : '{}'); } catch (e) { console.error('proposal-data is not valid JSON', e); return {}; }
}

const cfg = readConfig();
const account = cfg.account || {};
// `proposal` is shaped like an engagement_proposals ROW (snake_case), so a row
// copied from the database works as-is; engagementRowToView normalises it.
const row = { id: 'standalone', status: 'sent', version: 1, ...(cfg.proposal || {}) };

applyData({
  ...DATA,
  user: { id: 'reader', name: '', email: '', role: 'owner', isStaff: false },
  account: { id: 'standalone', company: account.company || 'your company', shortName: account.shortName || account.short_name || account.company || '', locations: account.locations || [] },
  team: [],
  engagement: engagementRowToView(row),
});

document.title = `${row.title || 'Growth partnership proposal'} · Alloy Growth Partners`;
ReactDOM.createRoot(document.getElementById('root')).render(<ProposalPage standalone />);
