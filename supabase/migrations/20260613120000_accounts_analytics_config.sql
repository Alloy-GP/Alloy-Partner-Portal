-- Per-account analytics wiring for the Performance page.
-- website: primary domain for Ahrefs Site Explorer / Site Audit / Brand Radar.
-- analytics_config: { ahrefsRankProjectId, ahrefsAuditProjectId, brandRadarReportId, ga4PropertyId, googleAdsCustomerId }
alter table public.accounts add column if not exists website text;
alter table public.accounts add column if not exists analytics_config jsonb not null default '{}'::jsonb;
comment on column public.accounts.website is 'Primary domain (e.g. example.com) for Ahrefs Site Explorer / Site Audit / Brand Radar.';
comment on column public.accounts.analytics_config is 'Per-source analytics config: ahrefsRankProjectId, ahrefsAuditProjectId, brandRadarReportId, ga4PropertyId, googleAdsCustomerId.';
