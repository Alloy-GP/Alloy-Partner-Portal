import React from 'react';
import { DATA } from '../data.js';

/**
 * The client's square brand icon (set per account in Admin). Falls back to an
 * initials square when no logo is set. Sizing comes from the passed className
 * (e.g. .ds-brand-mark = 42px, .rise-hero-mark-img = 16/40px).
 */
function CompanyMark({ className, size = 42 }) {
  const url = DATA.account && DATA.account.logoUrl;
  const label = ((DATA.account && (DATA.account.shortName || DATA.account.company)) || '')
    .slice(0, 2).toUpperCase();

  if (url) {
    return <img className={className} src={url} alt="" style={{ objectFit: 'cover', borderRadius: '22%' }} />;
  }
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: 'grid', placeItems: 'center', borderRadius: '22%',
        background: 'var(--alloy-purple-tint)', color: 'var(--alloy-purple)',
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: `${Math.round(size * 0.4)}px`, lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

export default CompanyMark;
