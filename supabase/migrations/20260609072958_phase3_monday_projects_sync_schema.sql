-- Link an account to its Monday board, and make projects idempotently
-- upsertable by Monday item id. Real due dates now that Monday provides them.
alter table public.accounts add column if not exists monday_board_id text;
alter table public.projects  add column if not exists monday_item_id text;
alter table public.projects  add column if not exists due_date date;
alter table public.projects
  add constraint projects_account_monday_item_key unique (account_id, monday_item_id);

update public.accounts set monday_board_id = '18415194993' where short_name = 'RISE';

-- Clear the seeded mock projects for RISE; the Monday sync repopulates them.
delete from public.projects
where account_id = (select id from public.accounts where short_name = 'RISE');
