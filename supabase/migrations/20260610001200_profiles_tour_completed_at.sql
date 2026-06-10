-- First-run dashboard tour: stamp when a user has seen (or dismissed) the guided
-- tour so it auto-runs only once. Replayable on demand from the profile menu.
-- The existing "update own profile" policy (id = auth.uid()) already lets a
-- client write this on their own row.
alter table profiles add column if not exists tour_completed_at timestamptz;
