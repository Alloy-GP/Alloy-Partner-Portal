// Editing `accounts.lead_field_labels` — the correction table that repairs raw
// WhatConverts form-field labels at ingest (see sync-whatconverts/fieldPairs).
//
// Stored as JSON ({ raw label: corrected label }), but staff edit it as plain
// lines in the Admin form:
//
//   e g Fawn Lake = Community name
//   e g 240 = Number of homes
//
// Kept as pure logic (and unit-tested) because the round-trip is the whole
// point: a label can legitimately contain "=" (WhatConverts placeholders are
// arbitrary form text), so the split must be on the FIRST separator only — and
// a bad line must be dropped rather than corrupt the map, since this text is
// hand-typed and one typo would otherwise silently unmap a client's whole form.

// "raw = corrected" lines → { raw: corrected }. Blank lines and lines missing
// either half are skipped. Later duplicates win (last edit is the intent).
export function parseLabelMap(text) {
  const out = {};
  for (const line of String(text ?? '').split('\n')) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    const from = line.slice(0, i).trim();
    const to = line.slice(i + 1).trim();
    if (from && to) out[from] = to;
  }
  return out;
}

// { raw: corrected } → "raw = corrected" lines, for the textarea. Non-object
// input (null, an array, a stray string) formats as empty rather than throwing.
export function formatLabelMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return '';
  return Object.entries(map)
    .filter(([from, to]) => String(from).trim() && String(to ?? '').trim())
    .map(([from, to]) => `${from} = ${to}`)
    .join('\n');
}
