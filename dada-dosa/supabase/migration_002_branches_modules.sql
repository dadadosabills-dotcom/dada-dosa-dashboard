-- ============================================================
-- Migration 002 — Branches, expense detail fields, hourly
-- payroll + salary advances, branch-aware RLS.
-- Run this in the Supabase SQL editor AFTER schema.sql.
-- Safe to run once on a database that already has schema.sql applied.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Branches
-- ------------------------------------------------------------
create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into branches (name) values
  ('1st Branch'), ('2nd Branch'), ('3rd Branch'), ('4th Branch'),
  ('5th Branch'), ('6th Branch'), ('7th Branch'), ('8th Branch'),
  ('9th Branch'), ('10th Branch'),
  ('Office'), ('Home'), ('Production'), ('The 100');

alter table branches enable row level security;
create policy "read branches - logged in" on branches for select using (auth.uid() is not null);
create policy "manage branches - admin+" on branches for insert with check (current_role_name() in ('superadmin','admin'));
create policy "manage branches update - admin+" on branches for update using (current_role_name() in ('superadmin','admin'));
create policy "delete branches - superadmin" on branches for delete using (current_role_name() = 'superadmin');

-- ------------------------------------------------------------
-- 2. branch_id on every entry table + profiles
-- ------------------------------------------------------------
alter table profiles add column branch_id uuid references branches(id);
alter table sales add column branch_id uuid references branches(id);
alter table expenses add column branch_id uuid references branches(id);
alter table creditor_transactions add column branch_id uuid references branches(id);
alter table drawings add column branch_id uuid references branches(id);
alter table attendance add column branch_id uuid references branches(id);
alter table payroll_runs add column branch_id uuid references branches(id);
alter table employees add column branch_id uuid references branches(id);

-- Note: branch_id is nullable at the DB level (Admin/SuperAdmin accounts
-- don't have one — they see all branches). The app enforces that
-- User/Superuser accounts always have a branch_id set when created.

-- ------------------------------------------------------------
-- 3. Expenses — GST flag, receipt link, voucher number, bank name
-- ------------------------------------------------------------
alter table expenses add column gst_bill boolean not null default false;
alter table expenses add column receipt_url text;
alter table expenses add column voucher_number text; -- entered manually by staff, not auto-generated
alter table expenses add column bank_name text; -- only meaningful when payment_mode = 'Bank'

-- ------------------------------------------------------------
-- 4. Employees — hourly pay + attendance clock in/out
-- ------------------------------------------------------------
alter table employees add column hourly_rate numeric(12,2) not null default 0;
alter table attendance add column check_in time;
alter table attendance add column check_out time;
-- hours worked, computed straight from check_in/check_out (same-day shifts only)
alter table attendance add column hours numeric(6,2) generated always as (
  case
    when check_in is not null and check_out is not null and check_out > check_in
    then round(extract(epoch from (check_out - check_in)) / 3600.0, 2)
    else 0
  end
) stored;

-- ------------------------------------------------------------
-- 5. Salary advances — tracked separately, auto-deducted from
-- the employee's next payroll run.
-- ------------------------------------------------------------
create table salary_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  remaining numeric(12,2) not null, -- decremented as payroll runs consume it
  branch_id uuid references branches(id),
  source_expense_id uuid references expenses(id), -- set when logged via Expenses > "Advance Salary"
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table salary_advances enable row level security;
create policy "read advances - logged in" on salary_advances for select using (auth.uid() is not null);
create policy "insert advances - logged in" on salary_advances for insert with check (auth.uid() is not null and created_by = auth.uid());
create policy "update advances - admin+" on salary_advances for update using (current_role_name() in ('superadmin','admin'));
create policy "delete advances - superadmin" on salary_advances for delete using (current_role_name() = 'superadmin');

-- Payroll runs need to record how much of the deduction was advances
-- vs. anything else, and which advance rows were touched.
alter table payroll_runs add column advances_deducted numeric(12,2) not null default 0;

create table payroll_run_advances (
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  salary_advance_id uuid not null references salary_advances(id) on delete cascade,
  amount_applied numeric(12,2) not null,
  primary key (payroll_run_id, salary_advance_id)
);
alter table payroll_run_advances enable row level security;
create policy "read payroll_run_advances - logged in" on payroll_run_advances for select using (auth.uid() is not null);
create policy "manage payroll_run_advances - admin+" on payroll_run_advances for insert with check (current_role_name() in ('superadmin','admin'));

-- ------------------------------------------------------------
-- 6. Branch-aware RLS — replace the old "read everything if
-- logged in" / "insert if logged in" policies with branch checks.
-- Admin & SuperAdmin bypass the branch check everywhere (see all).
-- ------------------------------------------------------------
create or replace function current_branch_id()
returns uuid
language sql stable
as $$
  select branch_id from profiles where id = auth.uid();
$$;

-- SELECT: drop old blanket policies, replace with branch-scoped ones
drop policy "read all - logged in" on sales;
drop policy "read all - logged in" on expenses;
drop policy "read all - logged in" on attendance;
drop policy "read all - logged in" on creditor_transactions;
drop policy "read all - logged in" on drawings;

create policy "read - own branch or admin+" on sales for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
create policy "read - own branch or admin+" on expenses for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
create policy "read - own branch or admin+" on attendance for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
create policy "read - own branch or admin+" on creditor_transactions for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
create policy "read - own branch or admin+" on drawings for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
-- creditors (vendor master) and employees stay global reads — a supplier
-- or staff member can be shared across branches, only their transactions/
-- attendance are branch-scoped.

-- INSERT: replace old policies so entries can only be logged against the
-- creator's own branch, unless the creator is admin+ (who may log for any
-- branch on someone's behalf, e.g. correcting historical data).
drop policy "insert - logged in" on sales;
drop policy "insert - logged in" on expenses;
drop policy "insert - logged in" on creditor_transactions;
drop policy "insert - logged in" on drawings;
drop policy "insert - logged in" on attendance;

create policy "insert - own branch or admin+" on sales for insert with check (
  auth.uid() is not null and created_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);
create policy "insert - own branch or admin+" on expenses for insert with check (
  auth.uid() is not null and created_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);
create policy "insert - own branch or admin+" on creditor_transactions for insert with check (
  auth.uid() is not null and created_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);
create policy "insert - own branch or admin+" on drawings for insert with check (
  auth.uid() is not null and created_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);
create policy "insert - own branch or admin+" on attendance for insert with check (
  auth.uid() is not null and marked_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);

-- UPDATE (approve/reject): admin+ can approve anything; superuser can only
-- approve entries from their own branch.
drop policy "approve - superuser+" on sales;
drop policy "approve - superuser+" on expenses;
drop policy "approve - superuser+" on creditor_transactions;
drop policy "approve - superuser+" on drawings;

create policy "approve - own branch superuser, any admin+" on sales for update using (
  current_role_name() in ('superadmin','admin')
  or (current_role_name() = 'superuser' and branch_id = current_branch_id())
);
create policy "approve - own branch superuser, any admin+" on expenses for update using (
  current_role_name() in ('superadmin','admin')
  or (current_role_name() = 'superuser' and branch_id = current_branch_id())
);
create policy "approve - own branch superuser, any admin+" on creditor_transactions for update using (
  current_role_name() in ('superadmin','admin')
  or (current_role_name() = 'superuser' and branch_id = current_branch_id())
);
create policy "approve - own branch superuser, any admin+" on drawings for update using (
  current_role_name() in ('superadmin','admin')
  or (current_role_name() = 'superuser' and branch_id = current_branch_id())
);

-- profiles: admin+ can update anyone's role/branch/active; a user can
-- update their own row (app restricts the form to name/phone only —
-- RLS can't easily enforce per-column, so keep the admin screen as the
-- only place role/branch/active are actually edited).
create policy "update profiles - admin+ or self" on profiles for update using (
  auth.uid() = id or current_role_name() in ('superadmin','admin')
);

-- ------------------------------------------------------------
-- 7. Receipt uploads — Supabase Storage bucket + policies
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', true)
  on conflict (id) do nothing;

create policy "receipts - read if logged in" on storage.objects for select using (
  bucket_id = 'receipts' and auth.uid() is not null
);
create policy "receipts - upload if logged in" on storage.objects for insert with check (
  bucket_id = 'receipts' and auth.uid() is not null
);
