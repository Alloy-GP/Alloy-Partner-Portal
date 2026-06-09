-- current_account_id() is only ever needed inside RLS policies evaluated for
-- signed-in users. Keep EXECUTE for authenticated (policies require it),
-- remove it for anon/public so it isn't an exposed RPC endpoint.
revoke execute on function public.current_account_id() from anon, public;
grant  execute on function public.current_account_id() to authenticated;
