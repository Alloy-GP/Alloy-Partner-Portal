-- Alloy staff can read any client's workspace (clients stay scoped to their
-- own via existing policies). Writes still go through gated functions.
create policy "staff read" on public.accounts              for select to authenticated using (public.is_staff());
create policy "staff read" on public.profiles              for select to authenticated using (public.is_staff());
create policy "staff read" on public.recurring_services    for select to authenticated using (public.is_staff());
create policy "staff read" on public.projects              for select to authenticated using (public.is_staff());
create policy "staff read" on public.leads                 for select to authenticated using (public.is_staff());
create policy "staff read" on public.tickets               for select to authenticated using (public.is_staff());
create policy "staff read" on public.activity              for select to authenticated using (public.is_staff());
create policy "staff read" on public.weekly_snapshots      for select to authenticated using (public.is_staff());
create policy "staff read" on public.weekly_snapshot_items for select to authenticated using (public.is_staff());
create policy "staff read" on public.roadmap_quarters      for select to authenticated using (public.is_staff());
create policy "staff read" on public.roadmap_focuses       for select to authenticated using (public.is_staff());
create policy "staff read" on public.roi                   for select to authenticated using (public.is_staff());
create policy "staff read" on public.kpis                  for select to authenticated using (public.is_staff());
create policy "staff read" on public.account_badges        for select to authenticated using (public.is_staff());
create policy "staff read" on public.action_items          for select to authenticated using (public.is_staff());
