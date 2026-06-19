-- Subtasks (Monday subitems) for Playbook project rows: an expandable
-- "X/Y subtasks" checklist. Stored as [{ label, state }] where
-- state ∈ done | active | todo. sync-monday populates it per item.
alter table public.projects
  add column if not exists subtasks jsonb not null default '[]'::jsonb;
