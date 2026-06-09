# Supabase

Database schema, RLS, and seed data for the Alloy Partner Portal, version-controlled.

- `migrations/` — schema + RLS changes, in apply order. Filenames are `<version>_<name>.sql`; the versions match the migration history recorded in the live project (`aryttfcmleukwstknvio`).
- `seed.sql` — the RISE demo account's content. Runs on `supabase db reset`. Profiles are **not** seeded here — they're created by the `on_auth_user_created` trigger from `account_invites` at first sign-in.
- `config.toml` — links this repo to the remote project.

## One-time setup

```bash
brew install supabase/tap/supabase           # or: npm i -g supabase
supabase login                               # opens browser
supabase link --project-ref aryttfcmleukwstknvio   # asks for the DB password
```

## Everyday use

```bash
supabase migration list                      # local vs remote migration state
supabase db push                             # apply new local migrations to remote
supabase db pull                             # pull remote schema changes into a new migration
supabase migration new <name>                # author a new migration
```

These migrations were applied to the live project before this folder existed, so
the remote already has them — `db push` will report them as in sync. New schema
changes should be added as migration files here and pushed, rather than applied
ad hoc.

## Notes

- Migrations `20260609065042` (native ticket writes) and `20260609065312`
  (revert) cancel out — tickets are sourced from **Zendesk**, so the portal does
  not author them. `tickets` is a read-only cache a future Zendesk sync will fill.
- RLS is account-scoped via `public.current_account_id()`. Verified: a signed-in
  user sees only their account; a user with no membership sees nothing.
- Storage buckets: `avatars` (public, own-folder writes) and `documents`
  (private, account-scoped reads).
