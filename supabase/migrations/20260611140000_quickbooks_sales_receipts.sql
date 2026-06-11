-- Most clients bill via QuickBooks Sales Receipts (paid at point of sale, no
-- A/R), not Invoices — only RISE uses true Invoices. Both are downloadable
-- billing documents, so the `invoices` table now holds both, tagged by doc_type.
-- (Table name kept to avoid churn; it's really "billing documents".)
alter table public.invoices
  add column if not exists doc_type text not null default 'invoice'
  check (doc_type in ('invoice','sales_receipt'));

-- Invoice and SalesReceipt have independent id spaces in QBO, so uniqueness
-- must include the type (the same numeric id can exist as both).
alter table public.invoices drop constraint if exists invoices_account_id_qbo_invoice_id_key;
alter table public.invoices
  add constraint invoices_acct_doctype_qboid_key unique (account_id, doc_type, qbo_invoice_id);
