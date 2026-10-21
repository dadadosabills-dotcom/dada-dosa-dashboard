-- ROLLBACK for migration 017 (Phase B helpers). Drops only the objects 017 created.
drop function if exists creditor_balance_asof(date, uuid);
drop view if exists unusual_expenses;
