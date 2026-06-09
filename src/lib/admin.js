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
export const getAnalytics = () => call('analytics');
export const getPortfolio = () => call('portfolio');
export const listInvites = (accountId) => call('list_invites', { account_id: accountId });
// Weekly snapshots (staff review queue)
export const listSnapshots = (accountId) => call('list_snapshots', { account_id: accountId });
export const pendingSnapshots = () => call('pending_snapshots');
export const updateSnapshot = (id, fields) => call('update_snapshot', { id, ...fields });
export const approveSnapshot = (id) => call('approve_snapshot', { id });
export const addInvite = (accountId, invite) =>
  call('add_invite', { account_id: accountId, redirectTo: window.location.origin, ...invite });
export const removeInvite = (email) => call('remove_invite', { email });

// Upload a client's square logo to the public `logos` bucket (staff only),
// return its public URL (cache-busted). Caller saves it via updateAccount.
export async function uploadLogo(accountId, file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${accountId}.${ext}`;
  const { error } = await supabase.storage.from('logos').upload(path, file, {
    upsert: true, contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}
