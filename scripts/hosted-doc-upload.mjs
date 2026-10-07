#!/usr/bin/env node
// Upload (create or replace) a hosted document — the standalone HTML served
// password-gated at growth.alloygp.co/p/<slug>. Also prints the opens report.
//
//   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/hosted-doc-upload.mjs \
//       --slug cmgt-2026-03 --file ./proposal.html \
//       [--title "Growth partnership proposal · CMGT"] [--password "…"] [--expires 2026-10-31]
//
//   node scripts/hosted-doc-upload.mjs --opens          # opens per document
//
// Goes through the Supabase Management API SQL endpoint (the same token the
// Supabase MCP / CLI use), so it needs no DB password and no service-role key.
// The HTML is sent dollar-quoted, so any content is safe to embed. `--password`
// is required the first time a slug is created; later uploads keep the existing
// password unless you pass a new one.

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const REF = 'aryttfcmleukwstknvio';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

// Dollar-quote with a tag that is guaranteed not to appear in the payload.
function dq(s) {
  let tag;
  do { tag = `$q${randomBytes(4).toString('hex')}$`; } while (s.includes(tag));
  return `${tag}${s}${tag}`;
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function main() {
  if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN is not set.'); process.exit(1); }

  if (flag('opens')) {
    const rows = await sql('select slug, title, opens, viewers, first_open, last_open, wrong_password, accepted, last_accepted, accepted_by, expires_at from public.hosted_doc_opens order by last_open desc nulls last');
    console.table(rows);
    return;
  }

  const slug = (arg('slug') || '').trim().toLowerCase();
  const file = arg('file');
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) { console.error('--slug must be 2–64 chars: a-z, 0-9, hyphens'); process.exit(1); }
  if (!file) { console.error('--file <path.html> is required'); process.exit(1); }
  const html = readFileSync(file, 'utf8');
  const title = arg('title') || '';
  const password = arg('password') || '';
  const expires = arg('expires') || '';

  const existing = await sql(`select id from public.hosted_docs where slug = ${lit(slug)}`);
  if (!existing.length && !password) { console.error(`"${slug}" does not exist yet — pass --password to create it.`); process.exit(1); }

  const q = existing.length
    ? `update public.hosted_docs set
         html = ${dq(html)},
         title = coalesce(nullif(${lit(title)}, ''), title),
         password = coalesce(nullif(${lit(password)}, ''), password),
         expires_at = ${expires ? lit(expires) + '::timestamptz' : 'expires_at'}
       where slug = ${lit(slug)}
       returning slug, title, length(html) as bytes, expires_at, updated_at`
    : `insert into public.hosted_docs (slug, title, password, html, expires_at)
       values (${lit(slug)}, ${lit(title)}, ${lit(password)}, ${dq(html)}, ${expires ? lit(expires) + '::timestamptz' : 'null'})
       returning slug, title, length(html) as bytes, expires_at, created_at`;

  const rows = await sql(q);
  console.log(existing.length ? 'Replaced:' : 'Created:', rows[0]);
  console.log(`→ https://growth.alloygp.co/p/${slug}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
