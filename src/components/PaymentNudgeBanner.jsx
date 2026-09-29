import React from 'react';

// Persistent autopay banner — shown on every screen while a billing-role
// client has no bank on file (App.jsx decides via shouldNudgePayment). Same
// visual system as the dashboard's notification cards. No dismiss on purpose:
// the modal has "Remind me later"; the banner is the obvious, always-there path.
const BankIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f5d880" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21h18M4 10h16M5 10l7-5 7 5M6 10v8M10 10v8M14 10v8M18 10v8" />
  </svg>
);

export default function PaymentNudgeBanner({ onOpen }) {
  return (
    <div className="notif-celebrate notif-payment pm-nudge" role="region" aria-label="Set up autopay" data-testid="pm-nudge-banner">
      <svg className="notif-decor" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="95" cy="30" r="40" fill="none" stroke="#fff" strokeWidth="3" />
        <circle cx="95" cy="30" r="20" fill="none" stroke="#f5d880" strokeWidth="3" />
      </svg>
      <div className="notif-icon"><BankIcon /></div>
      <div className="notif-text">
        <div className="notif-kicker">Action required</div>
        <div className="notif-title">Add a bank account to activate autopay</div>
      </div>
      <button type="button" className="notif-cta" onClick={onOpen}>Set up autopay</button>
    </div>
  );
}
