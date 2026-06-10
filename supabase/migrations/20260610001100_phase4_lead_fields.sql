-- Full form submission for each lead: the raw {name, value} pairs the customer
-- filled in (incl. dropdown selections like "what they need"). The single
-- `message` column keeps only one free-text field; this preserves everything
-- so the detail panel can show the dropdown choice and all answers.
alter table leads add column if not exists fields jsonb;
