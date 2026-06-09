import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';

// Thin wrapper over the `zendesk` edge function. The function authorizes by the
// account being viewed (Zendesk org) and only ever returns/posts public
// comments. We send the active account id so staff viewing a client get THAT
// client's org — never their own. The function re-validates: clients can only
// ever request their own account, staff may request any. Returns null in mock
// mode (no Supabase configured).
async function call(action, payload = {}) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.functions.invoke('zendesk', {
    body: { action, accountId: DATA.account?.id, ...payload },
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

export const zdList = () => call('list');
export const zdThread = (id) => call('thread', { id });
export const zdReply = (id, body, status) => call('reply', { id, body, status });
export const zdResolve = (id) => call('resolve', { id });
