import { supabase } from './supabase.js';

// Persist a user's notification preferences to their own profile. RLS allows a
// user to update only their own row, and only the notification_prefs column is
// granted (see migration), so this is safe to call straight from the client.
export async function saveNotificationPrefs(userId, prefs) {
  if (!userId || !supabase) return;
  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: prefs })
    .eq('id', userId);
  if (error) throw error;
}
