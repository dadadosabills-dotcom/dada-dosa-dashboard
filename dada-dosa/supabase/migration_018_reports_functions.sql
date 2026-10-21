-- ============================================================
-- Migration 018 (safe-to-rerun) — Phase C: functions for the Reports screens.
-- ADDITIVE ONLY: three functions. Run AFTER migration_016.
-- Like Phase A/B they are SECURITY INVOKER, so each person only gets
-- numbers for the branches they are already allowed to see.
-- Approved entries only (the same rule as everywhere else).
-- ============================================================

-- 1. Sales per weekday per branch (dow: 1 = Monday ... 7 = Sunday).
--    `days` counts only days that actually had sales, so averages are fair.
create or replace function weekday_branch_sales(p_from date, p_to date, p_branch uuid default null)
returns table (branch_id uuid, dow int, sales_total numeric, days int)
language sql stable set search_path = public as $$
  select d.branch_id,
         extract(isodow from d.date)::int,
         coalesce(sum(d.sales_total), 0),
         (count(*) filter (where d.sales_total > 0))::int
  from daily_branch_summary d
  where d.date between p_from and p_to
    and (p_branch is null or d.branch_id = p_branch)
  group by d.branch_id, extract(isodow from d.date)
$$;

-- 2. Approved expenses per branch and category (with their `kind`), for "where each branch spends".
create or replace function expense_category_branch_range(p_from date, p_to date, p_branch uuid default null)
returns table (branch_id uuid, category text, kind text, amount numeric)
language sql stable set search_path = public as $$
  select e.branch_id, e.category, e.kind, sum(e.amount)
  from expense_by_category e
  where e.date between p_from and p_to
    and (p_branch is null or e.branch_id = p_branch)
  group by e.branch_id, e.category, e.kind
$$;

-- 3. Money going out, by how it was paid (Cash / Bank / Credit) and what it was for.
--    Credit = bought on credit, not paid yet. Cash and Bank = money that left.
create or replace function cash_flow_range(p_from date, p_to date, p_branch uuid default null)
returns table (payment_mode text, kind text, amount numeric, entries int)
language sql stable set search_path = public as $$
  select e.payment_mode::text, e.kind, sum(e.amount), count(*)::int
  from expenses_classified e
  where e.status = 'approved'
    and e.date between p_from and p_to
    and (p_branch is null or e.branch_id = p_branch)
  group by e.payment_mode, e.kind
$$;

revoke all on function weekday_branch_sales(date, date, uuid), expense_category_branch_range(date, date, uuid),
                       cash_flow_range(date, date, uuid) from public, anon;
grant execute on function weekday_branch_sales(date, date, uuid), expense_category_branch_range(date, date, uuid),
                          cash_flow_range(date, date, uuid) to authenticated;
