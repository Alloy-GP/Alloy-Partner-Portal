// Generates the seed SQL that loads CMGT's 6 demo boards into the proposals
// table from the mock pipeline source (src/lib/proposalMockData.js LEADS_RAW).
//
//   node scripts/seed-proposals.mjs            → prints SQL to stdout
//
// Idempotent (upsert on (account_id, lead_key)); resolves CMGT by short_name
// lookup (never a hardcoded id). lead_key keeps the same demo ids so the baked
// LLM matches + Close telemetry still resolve at enrich time.
import { LEADS_RAW } from '../src/lib/proposalMockData.js';

const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const arr = (a) => `ARRAY[${(a || []).map(q).join(', ')}]::text[]`;
const bool = (b) => (b ? 'true' : 'false');
// typed null so VALUES infers integer (all-null column would otherwise be text)
const intOrNull = (n) => (n == null ? 'null::integer' : String(Math.round(n)));

const rows = LEADS_RAW.map((s, i) => {
  const cols = [
    q(s.id),                 // lead_key
    i,                       // sort
    q(s.community),
    q(s.contact),
    q(s.contactRole),
    q(s.firstName),
    q(s.city),
    s.homes || 0,            // homes
    q(s.email),
    q(s.phone),
    q(s.metaType),
    q(s.metaStatus),
    q(s.dues),
    q(s.engageTimeline),
    q(s.budget),
    q(s.quote),
    q(s.received),
    q(s.status),
    bool(s.priority),
    bool(s.disq),
    q(s.disqReason),
    q(s.owner),
    q(s.linkExpires),
    arr(s.selectedPains),
    q('full'),               // tier_id
    s.perHome || 0,          // per_home
    intOrNull(s.quoteValue), // quote_value (null → derived at load)
  ];
  return `    (${cols.join(', ')})`;
}).join(',\n');

process.stdout.write(`-- Seed: CMGT 6 demo boards → proposals (idempotent upsert).
insert into public.proposals
  (account_id, lead_key, sort, community, contact, contact_role, first_name, city, homes,
   email, phone, meta_type, meta_status, dues, engage_timeline, budget, quote, received,
   status, priority, disq, disq_reason, owner, link_expires, selected_pains, tier_id, per_home, quote_value)
select a.id, v.*
from (values
${rows}
) as v(lead_key, sort, community, contact, contact_role, first_name, city, homes,
       email, phone, meta_type, meta_status, dues, engage_timeline, budget, quote, received,
       status, priority, disq, disq_reason, owner, link_expires, selected_pains, tier_id, per_home, quote_value)
cross join (select id from public.accounts where short_name = 'CMGT') a
on conflict (account_id, lead_key) do update set
  sort=excluded.sort, community=excluded.community, contact=excluded.contact,
  contact_role=excluded.contact_role, first_name=excluded.first_name, city=excluded.city,
  homes=excluded.homes, email=excluded.email, phone=excluded.phone, meta_type=excluded.meta_type,
  meta_status=excluded.meta_status, dues=excluded.dues, engage_timeline=excluded.engage_timeline,
  budget=excluded.budget, quote=excluded.quote, received=excluded.received, status=excluded.status,
  priority=excluded.priority, disq=excluded.disq, disq_reason=excluded.disq_reason, owner=excluded.owner,
  link_expires=excluded.link_expires, selected_pains=excluded.selected_pains, tier_id=excluded.tier_id,
  per_home=excluded.per_home, quote_value=excluded.quote_value, updated_at=now();
`);
