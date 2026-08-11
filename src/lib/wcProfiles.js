// Labelling a lead's WhatConverts source profile.
//
// leads.wc_account_id is a bare id ("115145"). accounts.wc_profile_names maps
// those to names ("CMGT Landing"). Kept as pure logic because the fallback chain
// is the whole point: an unnamed profile must still render something useful
// rather than an empty chip, and ids arrive as both strings and numbers
// depending on which layer produced them.

// Comma/space-separated whatconverts_profile_id → array of ids.
export function parseProfileIds(raw) {
  return String(raw ?? '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

// (id, nameMap) → display label. Falls back to the raw id when unnamed, and to
// '' when there's no id at all (so callers can skip rendering entirely).
export function wcProfileLabel(id, names) {
  const key = String(id ?? '').trim();
  if (!key) return '';
  const name = names && typeof names === 'object' ? names[key] : null;
  const clean = String(name ?? '').trim();
  return clean || key;
}

// True when the label is a real name rather than the id echoed back — lets the
// UI show "CMGT Landing · 115145" when named, and just the id when not, instead
// of printing "115145 · 115145".
export function hasProfileName(id, names) {
  const key = String(id ?? '').trim();
  if (!key) return false;
  const name = names && typeof names === 'object' ? names[key] : null;
  return !!String(name ?? '').trim();
}

// Every configured profile for an account, labelled — for "CMGT uses 3 profiles"
// style summaries and for staff config screens.
export function profileList(profileIdRaw, names) {
  return parseProfileIds(profileIdRaw).map((id) => ({
    id,
    label: wcProfileLabel(id, names),
    named: hasProfileName(id, names),
  }));
}
