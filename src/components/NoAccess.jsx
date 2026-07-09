import React from 'react';
import './Login.css';

/**
 * Shown when someone is signed in but isn't a member of any account
 * (no invite). Their auth user exists, but they can't see any data.
 */
function NoAccess({ email, onSignOut }) {
  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true" />
      <div className="login-card">
        <img
          className="login-logo"
          src="/assets/alloy-logo-full-color.svg"
          alt="Alloy Growth Partners"
        />
        <h1>You're signed in</h1>
        <p className="login-sub">
          {email ? <><strong>{email}</strong> isn't </> : "This account isn't "}
          linked to a portal yet. Your Alloy team needs to grant access — reach
          out and we'll get you set up.
        </p>
        <button type="button" className="login-submit" onClick={onSignOut}>
          Sign out
        </button>
        <div className="login-foot">
          Questions? Email <a href="mailto:team@alloygp.co">team@alloygp.co</a>
        </div>
      </div>
    </div>
  );
}

export default NoAccess;
