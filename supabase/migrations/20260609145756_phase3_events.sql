-- Activity events: the foundation for analytics now, and gamification + LMS
-- later (badge rules and course progress read from here).
create table public.events (
  id          bigint generated always as identity primary key,
  account_id  uuid references public.accounts(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  type        text not null,                 -- login | view | <action> | course_* ...
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index on public.events (account_id, created_at desc);
create index on public.events (type);
create index on public.events (user_id);
create index on public.events (created_at);

-- Auto-stamp the actor + account so the client only sends {type, meta}.
alter table public.events alter column account_id set default public.current_account_id();
alter table public.events alter column user_id   set default auth.uid();

alter table public.events enable row level security;

-- Clients can log their own activity into their own account; staff read all.
create policy "insert own event" on public.events
  for insert to authenticated
  with check (user_id = auth.uid() and account_id = public.current_account_id());
create policy "staff read events" on public.events
  for select to authenticated
  using (public.is_staff());
