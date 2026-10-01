import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';
import { rowToItem, newCustomItem, nextSort } from './onboarding.js';

// Client-side writes for the onboarding checklist. Clients own their rows under
// RLS (see migration 20261001120000), so these go straight to the table — no
// edge function. Every call also mutates DATA.onboarding in place (optimistic)
// so the nav badge + dashboard card update without a reload. In mock mode
// (no Supabase) the mutation is local only.

const who = () => (DATA.user && (DATA.user.name || DATA.user.email)) || '';
const items = () => {
  if (!DATA.onboarding) DATA.onboarding = { startedAt: null, completedAt: null, items: [] };
  if (!Array.isArray(DATA.onboarding.items)) DATA.onboarding.items = [];
  return DATA.onboarding.items;
};

// patch: { status?, fields?, label?, alloyStatus? } — alloyStatus is staff-only
// (the DB trigger rejects it from a client JWT).
export async function updateOnboardingItem(id, patch) {
  const it = items().find((x) => x.id === id);
  if (it) Object.assign(it, patch);
  if (!isSupabaseConfigured) return it;
  const row = { updated_by: who() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.fields !== undefined) row.fields = patch.fields;
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.alloyStatus !== undefined) row.alloy_status = patch.alloyStatus || null;
  const { error } = await supabase.from('onboarding_items').update(row).eq('id', id);
  if (error) throw error;
  return it;
}

export async function addOnboardingItem({ section, label = '' }) {
  const accountId = DATA.account && DATA.account.id;
  const draft = newCustomItem({ accountId, section, label, sort: nextSort(items(), section) });
  let it;
  if (!isSupabaseConfigured) {
    it = rowToItem({ ...draft, id: draft.key, created_at: new Date().toISOString() });
  } else {
    const { data, error } = await supabase.from('onboarding_items').insert(draft).select().single();
    if (error) throw error;
    it = rowToItem(data);
  }
  items().push(it);
  return it;
}

export async function removeOnboardingItem(id) {
  const list = items();
  const idx = list.findIndex((x) => x.id === id);
  if (idx >= 0) list.splice(idx, 1);
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('onboarding_items').delete().eq('id', id);
  if (error) throw error;
}
