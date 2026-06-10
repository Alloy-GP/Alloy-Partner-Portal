-- Surface who the lead is: email + company alongside the contact name.
alter table leads add column if not exists email   text;
alter table leads add column if not exists company text;
