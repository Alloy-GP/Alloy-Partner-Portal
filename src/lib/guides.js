import { DATA } from '../data.js';
import { supabase, isSupabaseConfigured } from './supabase.js';

// Guides ride the ticket flow: a guide declares a trigger `tag`, and any ticket
// carrying that Zendesk tag shows the guide as a button on its card. No separate
// nav, no per-ticket linking.

// The guide (if any) that a ticket's tags should surface. Prefers a guide scoped
// to this client over a global one when both match the same tag.
export function guideForTags(tags) {
  const t = tags || [];
  const matches = (DATA.guides || []).filter((g) => g.tag && t.includes(g.tag));
  if (!matches.length) return null;
  return matches.find((g) => g.scope === 'client') || matches[0];
}

// Open a guide's self-contained HTML in a new tab. Lazy-fetches by id so nothing
// heavy loads until it's clicked.
export async function openGuide(id) {
  if (!isSupabaseConfigured || !id) return;
  const { data } = await supabase.from('guides').select('html').eq('id', id).maybeSingle();
  if (!data || !data.html) return;
  const url = URL.createObjectURL(new Blob([data.html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
