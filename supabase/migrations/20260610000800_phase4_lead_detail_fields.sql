-- Per-lead detail for the lead-detail panel: phone, the lead's message, and
-- the context (search keyword / form / landing) of how they arrived.
alter table leads add column if not exists phone   text;
alter table leads add column if not exists message text;
alter table leads add column if not exists context text;
