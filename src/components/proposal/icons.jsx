import React from 'react';

// Lucide-style stroke icons used across the proposal page.
const base = (size, extra = {}) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...extra });

export const ArrowRight = ({ size = 16 }) => <svg {...base(size)}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>;
export const Chevron = ({ size = 18 }) => <svg {...base(size, { strokeWidth: 2.8 })}><path d="m6 9 6 6 6-6" /></svg>;
export const Check = ({ size = 12, color, width = 3.2 }) => <svg {...base(size, { stroke: color || 'currentColor', strokeWidth: width })}><path d="M20 6 9 17l-5-5" /></svg>;
export const X = ({ size = 16 }) => <svg {...base(size)}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
export const FileIcon = ({ size = 14 }) => <svg {...base(size, { strokeWidth: 2.2 })}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>;
export const Download = ({ size = 14 }) => <svg {...base(size)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>;
export const External = ({ size = 14, color = '#8a8395' }) => <svg {...base(size, { stroke: color, strokeWidth: 2 })}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>;
export const Stripes = ({ thin = false, onWhite = false, className = '' }) => (
  <div className={`stripes${thin ? ' thin' : ''}${onWhite ? ' on-white' : ''} ${className}`} aria-hidden="true"><i /><i /><i /><i /><i /></div>
);
