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

// Pending tickets (status "pending" = waiting on the customer) = the action
// queue / "needs you" signal, shared across dashboard widgets + the bell.
// 60s TTL cache dedupes the simultaneous widget fetches into one network call
// while still refreshing on later visits. Always resolves to an array.
let _pendingCache = { key: null, at: 0, promise: null };
export function pendingTickets(accountId) {
  const key = accountId || (DATA.account && DATA.account.id) || '';
  const fresh = _pendingCache.key === key && _pendingCache.promise && (Date.now() - _pendingCache.at < 60000);
  if (!fresh) {
    _pendingCache = {
      key, at: Date.now(),
      promise: call('list')
        .then((r) => ((r && r.tickets) || []).filter((t) => t.status === 'pending'))
        .catch(() => []),
    };
  }
  return _pendingCache.promise;
}

// opts: { status, uploads: [token], cc: [email] }
export const zdReply = (id, body, opts = {}) =>
  call('reply', { id, body, status: opts.status, uploads: opts.uploads, cc: opts.cc });
export const zdResolve = (id) => call('resolve', { id });
export const zdAddCc = (id, cc) => call('add_cc', { id, cc });

// Read a File as base64 and stage it as a Zendesk upload; returns its token.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
export async function zdUpload(file) {
  const data = await fileToBase64(file);
  const res = await call('upload', { filename: file.name, contentType: file.type || 'application/octet-stream', data });
  return res && res.token;
}
