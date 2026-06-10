import { supabase, isSupabaseConfigured } from './supabase.js';
import { DATA } from '../data.js';

// Thin wrapper over the `qualify-lead` edge function. Writes a qualification
// back to WhatConverts (source of truth) and mirrors it onto our row. We send
// the active account id; the function re-validates the lead belongs to it
// (clients only their own account, staff any). Returns null in mock mode.
//
// opts: { quotable: 'yes'|'no'|'pending', quoteValue?, salesValue? }
export async function qualifyLead(wcLeadId, opts = {}) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.functions.invoke('qualify-lead', {
    body: {
      accountId: DATA.account?.id,
      wcLeadId,
      quotable: opts.quotable,
      quoteValue: opts.quoteValue,
      salesValue: opts.salesValue,
    },
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data && data.lead;
}
