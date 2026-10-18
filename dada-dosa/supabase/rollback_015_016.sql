-- ============================================================
-- ROLLBACK for Phase A (migrations 015 + 016).
-- Removes ONLY the objects those migrations created. It does not touch
-- sales, expenses, creditors, payroll, drawings or any other existing data.
-- Run this file only if you want the new analytics objects gone.
-- Easier first step: just switch the feature flags OFF — no SQL needed.
-- ============================================================

-- 016 (functions first, then views, in dependency order)
drop function if exists pending_approvals(uuid);
drop function if exists expense_by_category_range(date, date, uuid);
drop function if exists branch_summary_range(date, date, uuid);
drop view if exists missing_entries;
drop view if exists creditor_ageing;
drop view if exists expense_by_category;
drop view if exists monthly_branch_summary;
drop view if exists payroll_cost_summary;
drop view if exists daily_branch_summary;
drop view if exists expenses_classified;
drop function if exists dd_is_owner_role();
drop function if exists dd_today();

-- 015 (indexes are harmless and speed up the existing app too; drop only if you must)
drop index if exists sales_branch_date_status_idx;
drop index if exists expenses_branch_date_status_idx;
drop index if exists drawings_branch_date_status_idx;
drop index if exists ctx_branch_date_status_idx;
drop index if exists ctx_creditor_status_idx;
drop index if exists ctx_source_expense_idx;
drop index if exists payroll_runs_branch_period_idx;
drop index if exists attendance_branch_date_idx;
drop table if exists feature_flags;
