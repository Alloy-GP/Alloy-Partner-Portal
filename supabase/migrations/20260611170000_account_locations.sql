-- Per-account markets/locations for the Account page Company Profile card.
-- Array of { name, hq? }; the hq:true entry is the headquarters. Replaces the
-- single free-text `market` field for clients that operate in several markets.
alter table public.accounts add column if not exists locations jsonb not null default '[]'::jsonb;

-- Seed RISE (Houston HQ + the markets it covers), per the design handoff.
update public.accounts set locations = '[
  {"name":"Houston TX","hq":true},
  {"name":"Austin TX"},
  {"name":"San Antonio TX"},
  {"name":"League City TX"}
]'::jsonb
where short_name = 'RISE';
