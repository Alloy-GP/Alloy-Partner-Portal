import { supabase, isSupabaseConfigured } from './supabase.js';

// Thin wrapper over the `zendesk` edge function. The function authorizes by
// the signed-in user's account (Zendesk org) and only ever returns/post public
// comments. Returns null in mock mode (no Supabase configured).
async function call(action, payload = {}) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.functions.invoke('zendesk', {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

export const zdList = () => call('list');
export const zdThread = (id) => call('thread', { id });
export const zdReply = (id, body, status) => call('reply', { id, body, status });
export const zdResolve = (id) => call('resolve', { id });
