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

  const pick = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) upload(file);
    e.target.value = '';
  };

  const upload = async (file) => {
    if (!user.id) return;
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`; // cache-bust

      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      DATA.user.avatarUrl = publicUrl; // keep the shared object in sync
      setUrl(publicUrl);
    } catch {
      /* swallow — keep placeholder on failure */
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
        <span
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: '20px', color: 'var(--alloy-purple)',
          }}
        >
          {user.initials || ''}
        </span>
      )}
      {busy ? (
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(255,255,255,0.6)',
          fontSize: '10px', color: 'var(--alloy-purple)', fontWeight: 600,
        }}>…</span>
      ) : null}
      <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
    </label>
  );
}

export default ProfilePhoto;
