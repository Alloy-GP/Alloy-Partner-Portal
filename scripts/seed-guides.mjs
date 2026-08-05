#!/usr/bin/env node
// One-off seed: load the four example guide documents into the `guides` table.
// The Alloy Q&A guide is GLOBAL (account_id null); the three Edison shoot sheets
// are scoped to the Edison account. Idempotent-ish: deletes any prior rows with
// the same title first. Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = (k) => (readFileSync('.env.local', 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim() || '';
const admin = createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

const EDISON = '0672a818-8470-4b6f-bfb0-db53896d7758';
const A = '.context/attachments';
const rows = [
  { account_id: null, category: 'Video', sort: 0,
    title: 'How to record Expert Q&A Clips',
    description: 'Short educational videos where you answer a handful of questions on one topic. Filmed on a phone, in about an hour.',
    file: `${A}/BHjzFI/alloy-q&a-video-recording-guide.html` },
  { account_id: EDISON, category: 'Shoot sheets', sort: 1,
    title: 'Accounting · Vol. One · Clip 01 — Shoot Sheet',
    description: 'Questions and talking points for your first accounting Q&A clip.',
    file: `${A}/33KwjW/edison-video-01-shoot-sheet.html` },
  { account_id: EDISON, category: 'Shoot sheets', sort: 2,
    title: 'Accounting · Vol. One · Clip 02 — Shoot Sheet',
    description: 'Questions and talking points for your second accounting Q&A clip.',
    file: `${A}/Pu1AOr/edison-video-02-shoot-sheet.html` },
  { account_id: EDISON, category: 'Shoot sheets', sort: 3,
    title: 'Accounting · Vol. One · Clip 03 — Shoot Sheet',
    description: 'Questions and talking points for your third accounting Q&A clip.',
    file: `${A}/Rysroq/edison-video-03-shoot-sheet.html` },
];

for (const r of rows) {
  const html = readFileSync(r.file, 'utf8');
  await admin.from('guides').delete().eq('title', r.title);
  const { error } = await admin.from('guides').insert({
    account_id: r.account_id, title: r.title, description: r.description,
    category: r.category, html, sort: r.sort,
  });
  console.log(error ? `FAIL ${r.title}: ${error.message}` : `ok  ${r.title} (${(html.length / 1024).toFixed(0)}KB)`);
}
console.log('done');
