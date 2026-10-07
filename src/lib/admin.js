import { supabase, isSupabaseConfigured } from './supabase.js';

// Thin wrapper over the staff-only `admin` edge function.
async function call(action, payload = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...payload } });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

// Dash mapping (folder id + guest-upload link) — separate staff-only function.
export async function setDashConfig(id, fields) {
  const { data, error } = await supabase.functions.invoke('set-dash-config', { body: { id, ...fields } });
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
export const snapshotQueue = () => call('snapshot_queue');
export const updateSnapshot = (id, fields) => call('update_snapshot', { id, ...fields });
export const regenerateSnapshot = (accountId) => call('regenerate_snapshot', { account_id: accountId });
export const approveSnapshot = (id) => call('approve_snapshot', { id });
// Newsletter intake (staff): open a round for selected clients, track + close.
export const listNewsletterRequests = () => call('newsletter_list');
export const openNewsletterRound = (accountIds, title, dueDate) =>
  call('newsletter_open', { accountIds, title, due_date: dueDate || null });
export const closeNewsletterRequest = (id) => call('newsletter_close', { id });
export const deleteNewsletterRequest = (id) => call('newsletter_delete', { id });
// Onboarding checklist (staff): per-client overview + lifecycle. `items` are
// the materialized template rows (templateRows() in src/lib/onboarding.js) —
// the function stamps account_id. start = also "add new template items".
export const onboardingOverview = () => call('onboarding_overview');
export const startOnboarding = (accountId, items) => call('onboarding_start', { account_id: accountId, items });
export const resetOnboarding = (accountId, items) => call('onboarding_reset', { account_id: accountId, items });
export const completeOnboarding = (accountId, complete = true) => call('onboarding_complete', { account_id: accountId, complete });
export const removeOnboarding = (accountId) => call('onboarding_remove', { account_id: accountId });

// Resolve WhatConverts account ids to their real names, so Admin can show a
// staffer whose account a typed id belongs to before it starts pulling leads.
export const wcAccounts = () => call('wc_accounts', {});
// `send_email: false` adds the person quietly (no email yet) — used for a new
// client whose first email should be the proposal, or to invite later.
export const addInvite = (accountId, invite) =>
  call('add_invite', { account_id: accountId, redirectTo: window.location.origin, ...invite });
// Email (or re-email) the sign-in invite to someone already on the account.
export const sendInvite = (email) => call('send_invite', { email, redirectTo: window.location.origin });
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
