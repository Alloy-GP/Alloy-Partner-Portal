-- Broadcast row changes on the Monday-synced tables so open portals can
-- live-refresh. RLS still applies to realtime, so clients only receive
-- changes for their own account.
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.action_items;
alter publication supabase_realtime add table public.recurring_services;
