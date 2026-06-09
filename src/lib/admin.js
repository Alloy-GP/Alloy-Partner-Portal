import { supabase, isSupabaseConfigured } from './supabase.js';

// Thin wrapper over the staff-only `admin` edge function.
async function call(action, payload = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...payload } });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

export const listAccounts = () => call('list_accounts');
export const createAccount = (fields) => call('create_account', fields);
export const updateAccount = (id, fields) => call('update_account', { id, ...fields });
export const deleteAccount = (id) => call('delete_account', { id });
export const listInvites = (accountId) => call('list_invites', { account_id: accountId });
export const addInvite = (accountId, invite) =>
  call('add_invite', { account_id: accountId, redirectTo: window.location.origin, ...invite });
export const removeInvite = (email) => call('remove_invite', { email });
