-- ============================================================
-- Migration 003 (safe-to-rerun) — Sales becomes a daily
-- channel summary, Payroll becomes monthly-salary based
-- matching the real payroll sheet, Expenses gets a Particulars
-- field, and "All Branch" is added as a branch option.
-- ============================================================

-- ------------------------------------------------------------
-- 1. "All Branch" option — for costs/entries that apply
-- business-wide rather than to one location.
-- ------------------------------------------------------------
insert into branches (name)
select 'All Branch'
where not exists (select 1 from branches where name = 'All Branch');

-- ------------------------------------------------------------
-- 2. Sales — daily channel summary (Swiggy/Zomato/UPI/Cash per
-- branch per day) instead of itemized per-order entries.
-- Old columns (item, customer, category, payment_mode) are left
-- in place but unused by the new UI, so no data is destroyed.
-- ------------------------------------------------------------
alter table sales add column if not exists swiggy numeric(12,2) not null default 0;
alter table sales add column if not exists zomato numeric(12,2) not null default 0;
alter table sales add column if not exists upi numeric(12,2) not null default 0;
alter table sales add column if not exists cash numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'sales' and column_name = 'channel_total'
  ) then
    alter table sales add column channel_total numeric(12,2) generated always as (
      coalesce(swiggy,0) + coalesce(zomato,0) + coalesce(upi,0) + coalesce(cash,0)
    ) stored;
  end if;
end $$;

-- Multiple entries per branch per day are allowed (e.g. a correction after
-- a mistake, or a second submission later in the day) — the app sums them
-- for the day's total rather than enforcing one row per branch per day,
-- since regular staff can't edit a submitted row once it's in (same
-- add-then-approve pattern as every other module).

-- ------------------------------------------------------------
-- 3. Expenses — Particulars field (short required description,
-- separate from Party Name / vendor and Regarding / category).
-- ------------------------------------------------------------
alter table expenses add column if not exists particulars text;

-- ------------------------------------------------------------
-- 4. Employees — monthly salary instead of (or alongside) hourly.
-- ------------------------------------------------------------
alter table employees add column if not exists total_salary numeric(12,2) not null default 0;

-- ------------------------------------------------------------
-- 5. Payroll runs — full set of columns matching the real sheet.
-- gross/deductions/net stay as originally defined (net is a
-- generated column = gross - deductions); the app now computes
-- gross and deductions from these new fields before inserting.
-- ------------------------------------------------------------
alter table payroll_runs add column if not exists total_presence numeric(6,2) not null default 0;
alter table payroll_runs add column if not exists total_absence numeric(6,2) not null default 0;
alter table payroll_runs add column if not exists overtime numeric(12,2) not null default 0; -- amount, not hours
alter table payroll_runs add column if not exists w_off numeric(6,2) not null default 0;
alter table payroll_runs add column if not exists total_days numeric(6,2) not null default 30;
alter table payroll_runs add column if not exists per_day_salary numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists payable_salary numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists food_bill numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists missing_bill numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists bank_deduction numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists pf numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists shoes numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists fine numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists uniform numeric(12,2) not null default 0;
alter table payroll_runs add column if not exists extra numeric(12,2) not null default 0;

-- ------------------------------------------------------------
-- 6. Creditors — link expenses to the creditor transaction they
-- auto-created, so edits/undo are traceable.
-- ------------------------------------------------------------
alter table creditor_transactions add column if not exists source_expense_id uuid references expenses(id);

-- Any logged-in staff member can now create a creditor record (needed so
-- logging a Credit-mode expense can auto-create the supplier if it's new).
-- Admin+ still required to edit or delete existing creditor master rows.
drop policy if exists "manage creditors - admin+" on creditors;
drop policy if exists "insert creditors - logged in" on creditors;
create policy "insert creditors - logged in" on creditors for insert with check (auth.uid() is not null);
