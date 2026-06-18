import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { DATA } from '../data.js';

/**
 * Hero profile photo. When Supabase is configured, clicking uploads the image
 * to the public `avatars` bucket under <uid>/ and saves the URL on the
 * profile. In mock mode it falls back to the localStorage <image-slot>.
 */
function ProfilePhoto() {
  if (!isSupabaseConfigured) {
    return (
      <image-slot id="hero-profile" shape="circle" fit="cover" placeholder="Profile photo" />
    );
  }

  const user = DATA.user || {};
  const [url, setUrl] = useState(user.avatarUrl || null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) upload(file);
    e.target.value = '';
  };

  const upload = async (file) => {
    if (!user.id) {
      console.error('[ProfilePhoto] no user id — cannot upload');
      setFailed(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`; // cache-bust

      const { error: updErr } = await supabase
        .from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (updErr) throw updErr;

      DATA.user.avatarUrl = publicUrl; // keep the shared object in sync
      setUrl(publicUrl);
    } catch (err) {
      console.error('[ProfilePhoto] upload failed:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <label
      style={{
        position: 'relative', display: 'block', width: '100%', height: '100%',
        borderRadius: '50%', overflow: 'hidden', cursor: 'pointer',
        background: 'rgba(255,255,255,0.95)',
      }}
      title="Change photo"
    >
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <span style={{ position: 'absolute', inset: 0, background: '#c4c8ce' }}>
          {/* Standard person silhouette — body circle clipped by the avatar circle. */}
          <svg viewBox="0 0 96 96" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} fill="#eceef1">
            <circle cx="48" cy="37" r="16" />
            <circle cx="48" cy="92" r="28" />
          </svg>
          {/* "+" add badge, bottom-right. */}
          <span style={{
            position: 'absolute', right: '10px', bottom: '10px', width: '24px', height: '24px',
            borderRadius: '50%', background: 'var(--alloy-purple)', border: '2.5px solid #fff',
            color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(40,13,65,0.35)',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
        </span>
      )}
      {busy || failed ? (
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(255,255,255,0.75)',
          fontSize: failed ? '9px' : '12px', textAlign: 'center', padding: '4px',
          color: failed ? 'var(--alloy-pink)' : 'var(--alloy-purple)', fontWeight: 600,
        }}>{busy ? '…' : 'Upload failed'}</span>
      ) : null}
      <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
    </label>
  );
}

export default ProfilePhoto;
