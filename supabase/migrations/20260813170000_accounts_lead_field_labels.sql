-- Label repair for client lead forms whose inputs have no real name/label.
--
-- WhatConverts reports the input's PLACEHOLDER as the field name when a form
-- doesn't label its inputs. Landmarc's proposal form arrives as:
--   "e g Fawn Lake"    -> the community name
--   "e g 240"          -> number of homes
--   "you@email com"    -> email
--   "(540) 000-0000"   -> phone
-- Nothing downstream can know what those mean, so the whole lead pipeline
-- degrades at once: no community beside the lead's name, no stat cards on the
-- detail panel, and raw placeholder text shown as the label under "What they
-- submitted". sync-whatconverts renames the labels at ingest (fieldPairs), so a
-- single correction table repairs every consumer — they all key off the label.
--
-- Shape: { "<raw label from WhatConverts>": "<label it should have>" }.
-- Matching is case- and whitespace-insensitive on the key.
alter table public.accounts
  add column if not exists lead_field_labels jsonb not null default '{}'::jsonb;

comment on column public.accounts.lead_field_labels is
  'Raw WhatConverts form-field label -> corrected label, applied at ingest by sync-whatconverts. For client forms whose inputs are unlabelled (WhatConverts then reports the placeholder as the name).';

-- Landmarc's proposal form (the only live client affected — every other client's
-- form labels its inputs properly). The corrected labels deliberately reuse the
-- vocabulary the other clients' forms already send ("Association / community
-- name*", "Number of units*", "Current situation*" — Tidewater/RISE/Edison), so
-- Landmarc's leads light up the SAME company pick, stat cards and fact chips
-- rather than merely being readable.
update public.accounts
set lead_field_labels = jsonb_build_object(
      'e g Fawn Lake',  'Association / community name',
      'e g 240',        'Number of units',
      'you@email com',  'Email',
      '(540) 000-0000', 'Phone',
      'managed',        'Current situation',
      'role',           'Their role'
    )
where short_name = 'Landmarc';
