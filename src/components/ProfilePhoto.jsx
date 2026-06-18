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
        <span
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '4px', textAlign: 'center',
            padding: '6px', color: 'var(--alloy-purple)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '10px', letterSpacing: '.02em', lineHeight: 1.05 }}>Upload photo</span>
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
