import React from 'react';
import { DATA } from '../data.js';

// Plain-language privacy summary, grounded in how this portal actually works:
// magic-link auth, per-account data isolation (RLS), and data that flows from
// the same tools we already use to run your account. Not a legal contract — a
// clear explanation. For the binding terms, your Alloy agreement governs.
function PrivacyScreen() {
  const co = (DATA.account && (DATA.account.company || DATA.account.shortName)) || 'your firm';
  const updated = 'June 2026';

  const sections = [
    {
      h: 'What this portal is',
      b: [
        `This is ${co}'s private window into the growth work Alloy runs for you — your leads, projects, roadmap, support requests, and billing, in one place. It only ever shows your own account's information.`,
      ],
    },
    {
      h: 'How you sign in',
      b: [
        'Sign-in is by a one-time magic link sent to your email — there are no passwords for you to set, store, or have stolen. Clicking the link signs you in; the link is single-use and expires shortly after it’s sent.',
      ],
    },
    {
      h: 'What you can see — and what you can’t',
      b: [
        'Every page is scoped to your account at the database level. You see your firm’s data; other firms cannot see yours, and you cannot see theirs. Access is granted only by invitation from your Alloy team and can be removed at any time.',
      ],
    },
    {
      h: 'Where the information comes from',
      b: [
        'The portal doesn’t collect new data about you — it surfaces the work already happening in the tools we use to run your account:',
      ],
      list: [
        ['Projects & roadmap', 'the work board your Alloy team manages'],
        ['Leads & call tracking', 'the inquiries your marketing generates'],
        ['Support requests', 'the messages you send your Alloy team'],
        ['Billing & invoices', 'your plan, invoices, and payment status'],
      ],
    },
    {
      h: 'Who can access your data',
      b: [
        'The people you (or your Alloy team) invite to this account, and the Alloy team members who run your engagement. That’s it.',
      ],
    },
    {
      h: 'What we don’t do',
      b: [
        'We do not sell your data, rent it, or use it for advertising. It exists to run your account and show you your results — nothing else.',
      ],
    },
    {
      h: 'The services that power the portal',
      b: [
        'Like any modern software, the portal relies on a few trusted infrastructure providers that process data on our behalf: application hosting and delivery, the secure database and authentication that store your account data, and an email provider that delivers sign-in links and your weekly snapshots. Each is bound to handle data only as needed to provide its service.',
      ],
    },
    {
      h: 'Your controls',
      b: [
        'You can manage your email notification preferences from your profile, and you can ask your Alloy team to update or remove your access at any time. When access is removed, your sign-in is fully revoked.',
      ],
    },
  ];

  return (
    <div className="content privacy-screen">
      <div className="privacy-doc">
        <header className="privacy-head">
          <div className="privacy-kicker">Privacy</div>
          <h1>How your information is handled</h1>
          <p className="privacy-lede">
            Straightforward answers about what this portal stores, where it comes from, and who can see it.
          </p>
          <div className="privacy-updated">Last updated · {updated}</div>
        </header>

        {sections.map((s) => (
          <section key={s.h} className="privacy-section">
            <h2>{s.h}</h2>
            {s.b.map((p, i) => <p key={i}>{p}</p>)}
            {s.list ? (
              <ul className="privacy-list">
                {s.list.map(([t, d]) => (
                  <li key={t}><strong>{t}</strong> — {d}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <footer className="privacy-contact">
          <h2>Questions?</h2>
          <p>
            Reach your Alloy team anytime at{' '}
            <a href="mailto:hello@alloygp.co">hello@alloygp.co</a>. For the binding
            terms of our work together, your Alloy partnership agreement governs.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default PrivacyScreen;
