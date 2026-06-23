-- Debounce sign-in code sends per email. The login OTP rotates on every
-- generateLink call, so a double-tap on "send" (or an impatient re-request)
-- invalidates the code the user is holding. We record the last send time and
-- skip regeneration within a short window, so one request = one stable code.
create table if not exists public.login_throttle (
  email text primary key,
  sent_at timestamptz not null default now()
);
alter table public.login_throttle enable row level security;
-- No policies: only the service role (edge function) touches this table.
