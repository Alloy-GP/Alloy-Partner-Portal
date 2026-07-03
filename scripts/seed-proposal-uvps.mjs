// Generates the seed SQL that loads CMGT's canonical UVP library into the
// proposal_uvps table from the single source of truth (src/lib/proposalUVPs.js).
//
//   node scripts/seed-proposal-uvps.mjs            → prints SQL to stdout
//   node scripts/seed-proposal-uvps.mjs | pbcopy   → copy it
//
// The SQL is idempotent (upsert on (account_id, slug)) so re-running refreshes
// content in place without dup errors, and the account is resolved by lookup
// (short_name = 'CMGT') — never a hardcoded generated id (per CLAUDE.md).
import { UVPS } from '../src/lib/proposalUVPs.js';

const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const arr = (a) => `ARRAY[${(a || []).map(q).join(', ')}]::text[]`;

const rows = UVPS.map((u, i) => {
  const cols = [
    i,                                  // position = canonical cap index
    q(u.id),                            // slug
    q(u.title),
    q(u.short),
    q(u.body),
    q(u.icon),
    q(u.category),
    arr(u.tags),
    q(u.proof?.value || ''),
    q(u.proof?.label || ''),
    u.active === false ? 'false' : 'true',
  ];
  return `    (${cols.join(', ')})`;
}).join(',\n');

process.stdout.write(`-- Seed: CMGT canonical UVP library → proposal_uvps (idempotent upsert).
-- Inserts 0 rows (no error) if no account has short_name = 'CMGT'.
insert into public.proposal_uvps
  (account_id, position, slug, title, short, body, icon, category, tags, proof_value, proof_label, active)
select a.id, v.*
from (values
${rows}
) as v(position, slug, title, short, body, icon, category, tags, proof_value, proof_label, active)
cross join (select id from public.accounts where short_name = 'CMGT') a
on conflict (account_id, slug) do update set
  position    = excluded.position,
  title       = excluded.title,
  short       = excluded.short,
  body        = excluded.body,
  icon        = excluded.icon,
  category    = excluded.category,
  tags        = excluded.tags,
  proof_value = excluded.proof_value,
  proof_label = excluded.proof_label,
  active      = excluded.active,
  updated_at  = now();
`);
