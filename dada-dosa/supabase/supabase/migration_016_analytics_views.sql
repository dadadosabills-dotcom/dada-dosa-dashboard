-- ============================================================
-- Migration 016 (safe-to-rerun) — Phase A: analytics data layer.
--
-- ADDITIVE ONLY: new views + functions. No table, column, policy or
-- row is changed. Nothing in the app reads these until a feature flag
-- (migration 015) is switched on.
--
-- Run AFTER migration_015.
--
-- VISIBILITY: every view is `security_invoker`, so Postgres applies
-- the CALLER's row-level-security to the underlying tables (staff and
-- superusers see their own branch only; admin/superadmin see all).
-- Views over payroll / creditors add an extra filter on top, so they
-- are never MORE open than before.
--
-- BUSINESS RULES kept:
--   * sales and expense totals count APPROVED entries only
--   * creditor balances ignore REJECTED entries (same as the Creditors page)
--   * dates for "today" use India time (Asia/Kolkata)
--
-- HOW EXPENSES ARE SPLIT (column `kind`):
--   operating  = everyday running costs (the cost side of profit)
--   payroll    = categories "Salary" and "Advance Salary" (payroll is costed
--                from payroll_runs instead, so it is not counted twice)
--   drawing    = category "Drawing" (owner drawings are not a business cost)
--   settlement = a Cash/Bank expense that the app turned into a PAYMENT to a
--                supplier (the cost was already counted when the Credit bill
--                was entered, so counting it again would double it)
-- ============================================================

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Migration 016 needs PostgreSQL 15 or newer (security_invoker views). Nothing was changed.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 0. Small helpers
-- ------------------------------------------------------------
create or replace function dd_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- true for admin / superadmin (the "owner" roles)
create or replace function dd_is_owner_role() returns boolean
language sql stable as $$ select coalesce(current_role_name() in ('superadmin','admin'), false) $$;

-- ------------------------------------------------------------
-- 1. expenses_classified — each expense tagged with its `kind`
-- ------------------------------------------------------------
create or replace view expenses_classified with (security_invoker = true) as
select
  e.id, e.date, e.branch_id, e.vendor, e.category, e.payment_mode, e.amount, e.status,
  case
    when lower(btrim(e.category)) = 'drawing' then 'drawing'
    when lower(btrim(e.category)) in ('salary', 'advance salary') then 'payroll'
    when exists (
      select 1 from creditor_transactions ct
      where ct.source_expense_id = e.id and ct.type = 'payment'
    ) then 'settlement'
    else 'operating'
  end as kind
from expenses e;

-- ------------------------------------------------------------
-- 2. daily_branch_summary — one row per branch per day
-- ------------------------------------------------------------
create or replace view daily_branch_summary with (security_invoker = true) as
select
  x.branch_id,
  x.date,
  sum(x.sales_total)                      as sales_total,
  sum(x.swiggy)                           as swiggy,
  sum(x.zomato)                           as zomato,
  sum(x.upi)                              as upi,
  sum(x.cash)                             as cash,
  sum(x.sales_entries)::int               as sales_entries,
  sum(x.sales_pending)::int               as sales_pending,
  sum(x.exp_operating)                    as expenses_operating,
  sum(x.exp_payroll)                      as expenses_payroll,
  sum(x.exp_drawing)                      as expenses_drawing,
  sum(x.exp_settlement)                   as expenses_settlement,
  sum(x.exp_operating + x.exp_payroll + x.exp_drawing + x.exp_settlement) as expenses_all,
  sum(x.exp_pending)::int                 as expenses_pending
from (
  select
    s.branch_id, s.date,
    case when s.status = 'approved' then coalesce(s.channel_total, 0) else 0 end::numeric as sales_total,
    case when s.status = 'approved' then coalesce(s.swiggy, 0) else 0 end::numeric        as swiggy,
    case when s.status = 'approved' then coalesce(s.zomato, 0) else 0 end::numeric        as zomato,
    case when s.status = 'approved' then coalesce(s.upi, 0) else 0 end::numeric           as upi,
    case when s.status = 'approved' then coalesce(s.cash, 0) else 0 end::numeric          as cash,
    (s.status = 'approved')::int as sales_entries,
    (s.status = 'pending')::int  as sales_pending,
    0::numeric as exp_operating, 0::numeric as exp_payroll, 0::numeric as exp_drawing, 0::numeric as exp_settlement,
    0 as exp_pending
  from sales s
  union all
  select
    e.branch_id, e.date,
    0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, 0,
    case when e.status = 'approved' and e.kind = 'operating'  then e.amount else 0 end::numeric,
    case when e.status = 'approved' and e.kind = 'payroll'    then e.amount else 0 end::numeric,
    case when e.status = 'approved' and e.kind = 'drawing'    then e.amount else 0 end::numeric,
    case when e.status = 'approved' and e.kind = 'settlement' then e.amount else 0 end::numeric,
    (e.status = 'pending')::int
  from expenses_classified e
) x
group by x.branch_id, x.date;

-- ------------------------------------------------------------
-- 3. payroll_cost_summary — one row per branch per month ('YYYY-MM')
--    payroll_net  = what is paid out in the run (after advances recovered)
--    payroll_cost = payroll_net + advances recovered = the real salary cost,
--                   because advances were already paid earlier as expenses.
--    Visible to admin/superadmin for all branches, others for their own branch only
--    (stricter than the payroll_runs table itself).
-- ------------------------------------------------------------
create or replace view payroll_cost_summary with (security_invoker = true) as
select
  p.branch_id,
  p.period,
  count(*)::int                                                as payroll_runs,
  coalesce(sum(p.payable_salary), 0)                           as payable_salary,
  coalesce(sum(p.gross), 0)                                    as gross,
  coalesce(sum(p.deductions), 0)                               as deductions,
  coalesce(sum(p.advances_deducted), 0)                        as advances_recovered,
  coalesce(sum(p.net), 0)                                      as payroll_net,
  coalesce(sum(p.net + p.advances_deducted), 0)                as payroll_cost,
  coalesce(sum(p.net) filter (where p.status = 'paid'), 0)     as net_paid,
  coalesce(sum(p.net) filter (where p.status <> 'paid'), 0)    as net_unpaid,
  (count(*) filter (where p.status <> 'paid'))::int            as unpaid_runs
from payroll_runs p
where dd_is_owner_role() or p.branch_id = current_branch_id()
group by p.branch_id, p.period;

-- ------------------------------------------------------------
-- 4. monthly_branch_summary — one row per branch per month
-- ------------------------------------------------------------
create or replace view monthly_branch_summary with (security_invoker = true) as
with m as (
  select
    d.branch_id,
    date_trunc('month', d.date)::date as month,
    sum(d.sales_total)          as sales_total,
    sum(d.swiggy)               as swiggy,
    sum(d.zomato)               as zomato,
    sum(d.upi)                  as upi,
    sum(d.cash)                 as cash,
    (count(*) filter (where d.sales_total > 0))::int as days_with_sales,
    sum(d.expenses_operating)   as expenses_operating,
    sum(d.expenses_payroll)     as expenses_payroll,
    sum(d.expenses_drawing)     as expenses_drawing,
    sum(d.expenses_settlement)  as expenses_settlement,
    sum(d.expenses_all)         as expenses_all
  from daily_branch_summary d
  group by d.branch_id, date_trunc('month', d.date)::date
)
select
  m.*,
  case when m.days_with_sales > 0 then round(m.sales_total / m.days_with_sales, 2) end as avg_daily_sales,
  case when m.sales_total > 0 then round(100 * m.expenses_operating / m.sales_total, 1) end as expense_ratio_pct,
  coalesce(p.payroll_net, 0)  as payroll_net,
  coalesce(p.payroll_cost, 0) as payroll_cost,
  case when m.sales_total > 0 then round(100 * coalesce(p.payroll_cost, 0) / m.sales_total, 1) end as payroll_pct_of_sales,
  m.sales_total - m.expenses_operating as operating_profit,
  m.sales_total - m.expenses_operating - coalesce(p.payroll_cost, 0) as profit_after_payroll
from m
left join payroll_cost_summary p
  on p.branch_id = m.branch_id and p.period = to_char(m.month, 'YYYY-MM');

-- ------------------------------------------------------------
-- 5. expense_by_category — approved expenses, per branch/day/category
-- ------------------------------------------------------------
create or replace view expense_by_category with (security_invoker = true) as
select
  e.branch_id, e.date, e.category, e.payment_mode, e.kind,
  sum(e.amount)   as amount,
  count(*)::int   as entries
from expenses_classified e
where e.status = 'approved'
group by e.branch_id, e.date, e.category, e.payment_mode, e.kind;

-- ------------------------------------------------------------
-- 6. creditor_ageing — what you owe each supplier, by age of the bill.
--    There are no due dates, so payments are applied to the OLDEST bills
--    first (the opening balance counts as the oldest). Age = days since
--    the bill date. Rejected entries are ignored (as on the Creditors page).
--    Admin/superadmin only: a branch user sees only part of a supplier's
--    history, so a branch-level ageing would be misleading.
-- ------------------------------------------------------------
create or replace view creditor_ageing with (security_invoker = true) as
with items as (
  select c.id as creditor_id, c.created_at::date as item_date, c.opening_balance as amt,
         0 as seq_ord, c.created_at as created_ord
  from creditors c
  where c.opening_balance > 0
  union all
  select t.creditor_id, t.date, t.amount, 1, t.created_at
  from creditor_transactions t
  where t.type = 'bill' and t.status <> 'rejected'
),
cum as (
  select i.*,
         sum(i.amt) over (partition by i.creditor_id order by i.item_date, i.seq_ord, i.created_ord
                          rows between unbounded preceding and current row) as cum_end
  from items i
),
paid as (
  select t.creditor_id, sum(t.amount) as paid
  from creditor_transactions t
  where t.type = 'payment' and t.status <> 'rejected'
  group by t.creditor_id
),
open_items as (
  select c.creditor_id, c.item_date, c.amt,
         greatest(0, c.cum_end - greatest(c.cum_end - c.amt, coalesce(p.paid, 0))) as open_amt
  from cum c
  left join paid p on p.creditor_id = c.creditor_id
),
agg as (
  select o.creditor_id,
         sum(o.amt) as total_billed,
         sum(o.open_amt) as total_open,
         coalesce(sum(o.open_amt) filter (where dd_today() - o.item_date <= 30), 0) as b_0_30,
         coalesce(sum(o.open_amt) filter (where dd_today() - o.item_date between 31 and 60), 0) as b_31_60,
         coalesce(sum(o.open_amt) filter (where dd_today() - o.item_date > 60), 0) as b_61_plus,
         min(o.item_date) filter (where o.open_amt > 0) as oldest_open_date
  from open_items o
  group by o.creditor_id
)
select
  cr.id   as creditor_id,
  cr.name as creditor_name,
  coalesce(a.total_open, 0)  as total_outstanding,
  coalesce(a.b_0_30, 0)      as bucket_0_30,
  coalesce(a.b_31_60, 0)     as bucket_31_60,
  coalesce(a.b_61_plus, 0)   as bucket_61_plus,
  a.oldest_open_date,
  case when a.oldest_open_date is not null then dd_today() - a.oldest_open_date end as oldest_open_days,
  greatest(0, coalesce(p.paid, 0) - coalesce(a.total_billed, 0)) as advance_paid
from creditors cr
left join agg a on a.creditor_id = cr.id
left join paid p on p.creditor_id = cr.id
where dd_is_owner_role()
  and (coalesce(a.total_open, 0) > 0 or greatest(0, coalesce(p.paid, 0) - coalesce(a.total_billed, 0)) > 0);

-- ------------------------------------------------------------
-- 7. missing_entries — days (last 35) with NO sales entry, per active branch.
--    Starts from each branch's first-ever sales entry, so a new branch is
--    not flagged for days before it opened. Today is included and flagged
--    with is_today, because it is simply "not entered yet" until evening.
--    Branch users see their own branch only.
-- ------------------------------------------------------------
create or replace view missing_entries with (security_invoker = true) as
with first_sale as (
  select s.branch_id, min(s.date) as first_date
  from sales s
  where s.status <> 'rejected' and s.branch_id is not null
  group by s.branch_id
)
select
  b.id   as branch_id,
  b.name as branch_name,
  g.d::date as entry_date,
  (g.d::date = dd_today()) as is_today
from branches b
join first_sale f on f.branch_id = b.id
cross join lateral generate_series(
  greatest(f.first_date, dd_today() - 34)::timestamp,
  dd_today()::timestamp,
  interval '1 day'
) as g(d)
where b.active
  and b.name <> 'All Branch'
  and (dd_is_owner_role() or b.id = current_branch_id())
  and not exists (
    select 1 from sales s
    where s.branch_id = b.id and s.date = g.d::date and s.status <> 'rejected'
  );

-- ------------------------------------------------------------
-- 8. RPCs: aggregate a date range on the server (so phones never
--    download thousands of rows). SECURITY INVOKER (the default), so
--    the caller's row-level-security still applies.
-- ------------------------------------------------------------
create or replace function branch_summary_range(p_from date, p_to date, p_branch uuid default null)
returns table (
  branch_id uuid,
  sales_total numeric, swiggy numeric, zomato numeric, upi numeric, cash numeric,
  sales_entries int, sales_days int,
  expenses_operating numeric, expenses_payroll numeric, expenses_drawing numeric,
  expenses_settlement numeric, expenses_all numeric
)
language sql stable set search_path = public as $$
  select d.branch_id,
         coalesce(sum(d.sales_total), 0), coalesce(sum(d.swiggy), 0), coalesce(sum(d.zomato), 0),
         coalesce(sum(d.upi), 0), coalesce(sum(d.cash), 0),
         coalesce(sum(d.sales_entries), 0)::int,
         (count(*) filter (where d.sales_total > 0))::int,
         coalesce(sum(d.expenses_operating), 0), coalesce(sum(d.expenses_payroll), 0),
         coalesce(sum(d.expenses_drawing), 0), coalesce(sum(d.expenses_settlement), 0),
         coalesce(sum(d.expenses_all), 0)
  from daily_branch_summary d
  where d.date between p_from and p_to
    and (p_branch is null or d.branch_id = p_branch)
  group by d.branch_id
  order by 2 desc
$$;

create or replace function expense_by_category_range(p_from date, p_to date, p_branch uuid default null)
returns table (category text, kind text, amount numeric, entries int)
language sql stable set search_path = public as $$
  select e.category, e.kind, sum(e.amount), sum(e.entries)::int
  from expense_by_category e
  where e.date between p_from and p_to
    and (p_branch is null or e.branch_id = p_branch)
  group by e.category, e.kind
  order by 3 desc
$$;

-- Everything still waiting for approval (not date-limited, like the Classic Overview).
create or replace function pending_approvals(p_branch uuid default null)
returns table (module text, branch_id uuid, pending_count int, oldest_date date)
language sql stable set search_path = public as $$
  select 'sales'::text, s.branch_id, count(*)::int, min(s.date) from sales s
    where s.status = 'pending' and (p_branch is null or s.branch_id = p_branch) group by s.branch_id
  union all
  select 'expenses', e.branch_id, count(*)::int, min(e.date) from expenses e
    where e.status = 'pending' and (p_branch is null or e.branch_id = p_branch) group by e.branch_id
  union all
  select 'creditors', t.branch_id, count(*)::int, min(t.date) from creditor_transactions t
    where t.status = 'pending' and (p_branch is null or t.branch_id = p_branch) group by t.branch_id
  union all
  select 'drawings', w.branch_id, count(*)::int, min(w.date) from drawings w
    where w.status = 'pending' and (p_branch is null or w.branch_id = p_branch) group by w.branch_id
$$;

-- ------------------------------------------------------------
-- 9. Permissions: signed-in users only (never the anonymous role)
-- ------------------------------------------------------------
revoke all on expenses_classified, daily_branch_summary, payroll_cost_summary, monthly_branch_summary,
              expense_by_category, creditor_ageing, missing_entries from public, anon;
grant select on expenses_classified, daily_branch_summary, payroll_cost_summary, monthly_branch_summary,
                expense_by_category, creditor_ageing, missing_entries to authenticated;

revoke all on function branch_summary_range(date, date, uuid), expense_by_category_range(date, date, uuid),
                       pending_approvals(uuid) from public, anon;
grant execute on function branch_summary_range(date, date, uuid), expense_by_category_range(date, date, uuid),
                          pending_approvals(uuid), dd_today(), dd_is_owner_role() to authenticated;
