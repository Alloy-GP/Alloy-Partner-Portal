// Hosted docs — pure helpers behind the password-gated document page at
// /p/<slug> (src/components/hosted-doc.jsx). No React, no Supabase, so it is
// unit-tested in hostedDoc.test.js.

// /p/<slug> — slug is lowercase letters, digits, hyphens (2–64 chars), mirroring
// the hosted_docs.slug check constraint. Trailing slash tolerated; case-folded.
export const DOC_PATH_RE = /^\/p\/([a-z0-9][a-z0-9-]{1,63})\/?$/i;

export function parseDocSlug(pathname) {
  const m = String(pathname || '').match(DOC_PATH_RE);
  return m ? m[1].toLowerCase() : null;
}

// Where the page remembers the password it already proved, so a reload in the
// same tab doesn't re-prompt. Per slug; sessionStorage (dies with the tab).
export const passwordStorageKey = (slug) => `hosted-doc-pw:${slug}`;

// Per-device anonymous viewer id (stable across reloads on the same browser),
// so the opens view can count distinct devices. Storage is injected so this is
// testable; falls back to 'anon' when storage is unavailable (private mode).
export const VIEWER_KEY_STORAGE = 'hosted-doc-viewer';
export function viewerKey(storage, random = Math.random, now = Date.now) {
  try {
    let k = storage.getItem(VIEWER_KEY_STORAGE);
    if (!k) {
      k = 'v-' + random().toString(36).slice(2, 10) + now().toString(36);
      storage.setItem(VIEWER_KEY_STORAGE, k);
    }
    return k;
  } catch {
    return 'anon';
  }
}

// Reader-facing copy for each gate failure the edge fn can return.
export function unlockErrorMessage(code) {
  switch (code) {
    case 'wrong_password': return 'That password didn’t work. Check it and try again.';
    case 'not_found': return 'This link isn’t active. Check the address you were sent.';
    case 'expired': return 'This document is no longer available.';
    default: return 'Something went wrong. Please try again.';
  }
}

// Accept relay. A hosted document's own Accept button posts this message to
// the gate page (window.parent); the gate re-posts it to the hosted-doc edge fn
// with the password it already proved, which logs an `accepted` event and
// emails Alloy. Only these fields pass through, trimmed and capped — the doc is
// trusted content, but the values are whatever the reader typed.
export const ACCEPT_MESSAGE_TYPE = 'hosted-doc:accept';
export const ACCEPT_FIELDS = ['name', 'title', 'option', 'optionDetail', 'price', 'terms'];
export function acceptPayloadFromMessage(data) {
  if (!data || typeof data !== 'object' || data.type !== ACCEPT_MESSAGE_TYPE) return null;
  const out = {};
  for (const k of ACCEPT_FIELDS) out[k] = String(data[k] ?? '').trim().slice(0, 600);
  return out;
}
