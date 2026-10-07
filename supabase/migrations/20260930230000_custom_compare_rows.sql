-- Custom comparison rows on a proposal (Admin → Plans & pricing → Comparison
-- rows → "+ Add row"). Staff-authored line items that render in the statement
-- of investment alongside the standard rows, before Monthly investment.
--   [{ id, label, note, cells: { <planKey>: true | false | "text" } }]
-- true = green check, false = dash, string = shown as-is. Additive.

alter table public.engagement_proposals
  add column if not exists custom_rows jsonb not null default '[]'::jsonb;
