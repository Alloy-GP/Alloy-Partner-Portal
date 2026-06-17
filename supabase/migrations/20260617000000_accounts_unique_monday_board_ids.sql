-- Guardrail: a Monday board may belong to at most ONE account. Prevents the
-- cross-tenant collision that occurred when Tidewater + Landmarc were both
-- pointed at the same projects board by manual Admin-form entry. Each of the
-- three board-id fields routes a distinct board's data into the portal, so a
-- shared id would cross-pollinate two clients' data. (service_group_id is NOT
-- constrained — Monday group ids are board-scoped and legitimately repeat.)
create unique index if not exists accounts_monday_board_id_uniq
  on public.accounts (monday_board_id)
  where monday_board_id is not null and monday_board_id <> '';

create unique index if not exists accounts_monday_roadmap_board_id_uniq
  on public.accounts (monday_roadmap_board_id)
  where monday_roadmap_board_id is not null and monday_roadmap_board_id <> '';

create unique index if not exists accounts_monday_program_board_id_uniq
  on public.accounts (monday_program_board_id)
  where monday_program_board_id is not null and monday_program_board_id <> '';
