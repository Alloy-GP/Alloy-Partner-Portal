import { supabase, isSupabaseConfigured } from './supabase.js';

/**
 * Returns a short-lived signed URL for a file in the private `documents`
 * bucket, or null if Supabase isn't configured or the file doesn't exist.
 *
 * Path convention: `<account_id>/reports/weekly-...pdf` — RLS only lets a
 * user sign URLs for files under their own account_id folder.
 *
 * Usage (on a download click):
 *   const url = await getDocumentUrl(snapshot.pdf_path);
 *   if (url) window.open(url, '_blank');
 *
 * NOTE: the seeded `pdf_path` values (e.g. "reports/weekly-...pdf") are
 * placeholders — no files are uploaded yet. Upload PDFs to
 * documents/<account_id>/... and store that path to make downloads live.
 */
export async function getDocumentUrl(path, expiresInSeconds = 60) {
  if (!isSupabaseConfigured || !path) return null;
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}
