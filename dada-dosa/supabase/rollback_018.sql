-- ROLLBACK for migration 018 (Phase C functions). Drops only what 018 created.
drop function if exists cash_flow_range(date, date, uuid);
drop function if exists expense_category_branch_range(date, date, uuid);
drop function if exists weekday_branch_sales(date, date, uuid);
