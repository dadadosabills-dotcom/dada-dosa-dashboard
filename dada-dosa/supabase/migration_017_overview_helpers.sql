-- ============================================================
-- Migration 017 (safe-to-rerun) — Phase B: helpers for the Smart Overview.
-- ADDITIVE ONLY: one view + one function. Run AFTER migration_016.
-- Both are security_invoker / RLS-aware, like the Phase A views.
-- ============================================================

-- ------------------------------------------------------------
-- 1. unusual_expenses — recent running-cost entries that are far above what is
--    normal for that branch and category.
--    Rule: entered in the last 7 days (approved or still pending), at least
--    Rs 1,000, and at least 2x the MEDIAN approved amount of the same branch +
--    category over the 60 days before that — and only when there are 5 or more
--    earlier entries to compare with (so new categories are not flagged).
-- ------------------------------------------------------------
create or replace view unusual_expenses with (security_invoker = true) as
with base as (
  select e.branch_id, e.category,
         count(*) as n,
         percentile_cont(0.5) within group (order by e.amount)::numeric as typical_amount
  from expenses_classified e
  where e.kind = 'operating'
    and e.status = 'approved'
    and e.date between dd_today() - 66 and dd_today() - 7
  group by e.branch_id, e.category
)
select r.id, r.date, r.branch_id, r.vendor, r.category, r.amount, r.status,
       round(b.typical_amount, 0) as typical_amount,
       round(r.amount / nullif(b.typical_amount, 0), 1) as times_typical
from expenses_classified r
join base b on b.branch_id = r.branch_id and b.category = r.category
where r.kind = 'operating'
  and r.status in ('approved', 'pending')
  and r.date >= dd_today() - 6
  and b.n >= 5
  and r.amount >= 1000
  and r.amount >= 2 * b.typical_amount;

-- ------------------------------------------------------------
-- 2. creditor_balance_asof — what you owed suppliers at the end of a given day:
--    bills minus payments up to that date (rejected entries ignored).
--    Supplier opening balances are included only for owners looking at all
--    branches, because an opening balance does not belong to any one branch.
-- ------------------------------------------------------------
create or replace function creditor_balance_asof(p_date date, p_branch uuid default null)
returns numeric
language sql stable set search_path = public as $$
  select
    coalesce((
      select sum(case when t.type = 'bill' then t.amount else -t.amount end)
      from creditor_transactions t
      where t.status <> 'rejected'
        and t.date <= p_date
        and (p_branch is null or t.branch_id = p_branch)
    ), 0)
    + case when p_branch is null and dd_is_owner_role() then
        coalesce((select sum(c.opening_balance) from creditors c where c.created_at::date <= p_date), 0)
      else 0 end
$$;

-- ------------------------------------------------------------
-- 3. Permissions: signed-in users only
-- ------------------------------------------------------------
revoke all on unusual_expenses from public, anon;
grant select on unusual_expenses to authenticated;
revoke all on function creditor_balance_asof(date, uuid) from public, anon;
grant execute on function creditor_balance_asof(date, uuid) to authenticated;
