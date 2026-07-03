-- New-stage inbox (handoff #19): a lead in the New bucket is "new" (never opened)
-- until a CAM opens its match-analysis drill-in, at which point it becomes
-- "reviewed". Track who opened it and when so the inbox can show provenance
-- ("Opened by Amanda · 2d ago") and split the bucket into Just-arrived / Reviewed.
alter table proposals
  add column if not exists opened_at timestamptz,
  add column if not exists opened_by text;
