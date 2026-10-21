-- ============================================================
-- Migration 005 (safe-to-rerun) — deleting an expense now also
-- removes the creditor bill/payment or salary advance that the
-- expense created. Without this, deleting such an expense fails
-- with a foreign-key error.
-- ============================================================

alter table creditor_transactions drop constraint if exists creditor_transactions_source_expense_id_fkey;
alter table creditor_transactions
  add constraint creditor_transactions_source_expense_id_fkey
  foreign key (source_expense_id) references expenses(id) on delete cascade;

alter table salary_advances drop constraint if exists salary_advances_source_expense_id_fkey;
alter table salary_advances
  add constraint salary_advances_source_expense_id_fkey
  foreign key (source_expense_id) references expenses(id) on delete cascade;
