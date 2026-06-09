-- Map an account to its Zendesk organization (the canonical unit for "this
-- client's tickets"). Domain mapping in Zendesk files users into the org, so
-- the org id is all the portal needs to list/authorize a client's tickets.
alter table public.accounts add column if not exists zendesk_org_id text;
