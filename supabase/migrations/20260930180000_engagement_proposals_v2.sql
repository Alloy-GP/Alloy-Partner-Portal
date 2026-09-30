-- Engagement proposals v2 — the redesigned client proposal page.
--
-- The proposal becomes a statement of investment with 1–3 selectable PLANS, a
-- toggleable comparison grid, the client's legal identity for the service
-- agreement, an ROI calculator with editable defaults, a testimonial video, a
-- validity window, a welcome-call scheduling link, and a DocuSign-grade
-- acceptance record: which plan, who, when, from where, and an exact snapshot
-- of the agreement text they confirmed (hash + full text) so the contract can
-- be reproduced as a document later.
--
-- Additive. The v1 summary columns (monthly_amount, setup_amount, term_months,
-- locations_count) stay and mirror the recommended plan so existing emails and
-- gates keep working while the page moves to plans.

alter table public.engagement_proposals
  add column if not exists ref                      text,                                   -- e.g. CMGT-2026-02
  add column if not exists valid_through            date,                                   -- Accept disabled after this
  add column if not exists client_legal_name        text,
  add column if not exists client_entity_type       text,                                   -- "Louisiana limited liability company"
  add column if not exists client_address           text,                                   -- principal place of business
  add column if not exists plans                    jsonb not null default '[]'::jsonb,     -- [{key,name,tagline,monthly,setup,locations,termMonths,guarantee,exclusive,referralDiscount,recommended}]
  add column if not exists compare_rows             jsonb not null default '{}'::jsonb,     -- {rowKey: bool} — which comparison rows show
  add column if not exists exclusivity_miles        integer not null default 16,
  add column if not exists roi_fee_per_door         numeric(10,2) not null default 14,
  add column if not exists roi_doors_per_community  integer not null default 150,
  add column if not exists testimonial_vimeo_id     text,
  add column if not exists testimonial_caption      text,
  add column if not exists welcome_call_url         text,                                   -- scheduling link shown after acceptance
  add column if not exists prepared_by_name         text,                                   -- staff name stamped at send (clients can't read staff profiles)
  add column if not exists accepted_plan_key        text,
  add column if not exists accepted_ip              text,
  add column if not exists accepted_user_agent      text,
  add column if not exists agreement_snapshot       jsonb,                                  -- {fields, preamble, sections, closing, signer, plan} as confirmed
  add column if not exists agreement_hash           text;                                   -- sha-256 of the snapshot text

create unique index if not exists engagement_proposals_ref_key
  on public.engagement_proposals (ref) where ref is not null;

comment on column public.engagement_proposals.agreement_snapshot is
  'Exact agreement (fields + full text) as shown when the owner confirmed it. With accepted_* this is the signed record; a PDF can be rendered from it later.';
