-- ============================================================
-- Migration 002 (safe-to-rerun version) — Branches, expense
-- detail fields, hourly payroll + salary advances, branch-aware RLS.
--
-- This version can be run more than once without erroring: every
-- statement checks whether its target already exists first. If a
-- previous attempt got partway through and failed, just run this
-- whole file again — it picks up wherever it left off.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Branches
-- ------------------------------------------------------------
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into branches (name)
select v.name from (values
  ('1st Branch'), ('2nd Branch'), ('3rd Branch'), ('4th Branch'),
  ('5th Branch'), ('6th Branch'), ('7th Branch'), ('8th Branch'),
  ('9th Branch'), ('10th Branch'),
  ('Office'), ('Home'), ('Production'), ('The 100')
) as v(name)
on conflict (name) do nothing;

alter table branches enable row level security;

drop policy if exists "read branches - logged in" on branches;
create policy "read branches - logged in" on branches for select using (auth.uid() is not null);

drop policy if exists "manage branches - admin+" on branches;
create policy "manage branches - admin+" on branches for insert with check (current_role_name() in ('superadmin','admin'));

drop policy if exists "manage branches update - admin+" on branches;
create policy "manage branches update - admin+" on branches for update using (current_role_name() in ('superadmin','admin'));

drop policy if exists "delete branches - superadmin" on branches;
create policy "delete branches - superadmin" on branches for delete using (current_role_name() = 'superadmin');

-- ------------------------------------------------------------
-- 2. branch_id on every entry table + profiles
-- ------------------------------------------------------------
alter table profiles add column if not exists branch_id uuid references branches(id);
alter table sales add column if not exists branch_id uuid references branches(id);
alter table expenses add column if not exists branch_id uuid references branches(id);
alter table creditor_transactions add column if not exists branch_id uuid references branches(id);
alter table drawings add column if not exists branch_id uuid references branches(id);
alter table attendance add column if not exists branch_id uuid references branches(id);
alter table payroll_runs add column if not exists branch_id uuid references branches(id);
alter table employees add column if not exists branch_id uuid references branches(id);

-- ------------------------------------------------------------
-- 3. Expenses — GST flag, receipt link, voucher number, bank name
-- ------------------------------------------------------------
alter table expenses add column if not exists gst_bill boolean not null default false;
alter table expenses add column if not exists receipt_url text;
alter table expenses add column if not exists voucher_number text;
alter table expenses add column if not exists bank_name text;

-- ------------------------------------------------------------
-- 4. Employees — hourly pay + attendance clock in/out
-- ------------------------------------------------------------
alter table employees add column if not exists hourly_rate numeric(12,2) not null default 0;
alter table attendance add column if not exists check_in time;
alter table attendance add column if not exists check_out time;

-- Generated columns can't use "add column if not exists" combined with
-- "generated always as" safely across Postgres versions if it already
-- exists, so check for it explicitly first.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'attendance' and column_name = 'hours'
  ) then
    alter table attendance add column hours numeric(6,2) generated always as (
      case
        when check_in is not null and check_out is not null and check_out > check_in
        then round(extract(epoch from (check_out - check_in)) / 3600.0, 2)
        else 0
      end
    ) stored;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. Salary advances
-- ------------------------------------------------------------
create table if not exists salary_advances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  remaining numeric(12,2) not null,
  branch_id uuid references branches(id),
  source_expense_id uuid references expenses(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table salary_advances enable row level security;

drop policy if exists "read advances - logged in" on salary_advances;
create policy "read advances - logged in" on salary_advances for select using (auth.uid() is not null);

drop policy if exists "insert advances - logged in" on salary_advances;
create policy "insert advances - logged in" on salary_advances for insert with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists "update advances - admin+" on salary_advances;
create policy "update advances - admin+" on salary_advances for update using (current_role_name() in ('superadmin','admin'));

drop policy if exists "delete advances - superadmin" on salary_advances;
create policy "delete advances - superadmin" on salary_advances for delete using (current_role_name() = 'superadmin');

alter table payroll_runs add column if not exists advances_deducted numeric(12,2) not null default 0;

create table if not exists payroll_run_advances (
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  salary_advance_id uuid not null references salary_advances(id) on delete cascade,
  amount_applied numeric(12,2) not null,
  primary key (payroll_run_id, salary_advance_id)
);
alter table payroll_run_advances enable row level security;

drop policy if exists "read payroll_run_advances - logged in" on payroll_run_advances;
create policy "read payroll_run_advances - logged in" on payroll_run_advances for select using (auth.uid() is not null);

drop policy if exists "manage payroll_run_advances - admin+" on payroll_run_advances;
create policy "manage payroll_run_advances - admin+" on payroll_run_advances for insert with check (current_role_name() in ('superadmin','admin'));

-- ------------------------------------------------------------
-- 6. Branch-aware RLS
-- ------------------------------------------------------------
create or replace function current_branch_id()
returns uuid
language sql stable
as $$
  select branch_id from profiles where id = auth.uid();
$$;

drop policy if exists "read all - logged in" on sales;
drop policy if exists "read all - logged in" on expenses;
drop policy if exists "read all - logged in" on attendance;
drop policy if exists "read all - logged in" on creditor_transactions;
drop policy if exists "read all - logged in" on drawings;

drop policy if exists "read - own branch or admin+" on sales;
create policy "read - own branch or admin+" on sales for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
drop policy if exists "read - own branch or admin+" on expenses;
create policy "read - own branch or admin+" on expenses for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
drop policy if exists "read - own branch or admin+" on attendance;
create policy "read - own branch or admin+" on attendance for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
drop policy if exists "read - own branch or admin+" on creditor_transactions;
create policy "read - own branch or admin+" on creditor_transactions for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);
drop policy if exists "read - own branch or admin+" on drawings;
create policy "read - own branch or admin+" on drawings for select using (
  current_role_name() in ('superadmin','admin') or branch_id = current_branch_id()
);

drop policy if exists "insert - logged in" on sales;
drop policy if exists "insert - logged in" on expenses;
drop policy if exists "insert - logged in" on creditor_transactions;
drop policy if exists "insert - logged in" on drawings;
drop policy if exists "insert - logged in" on attendance;

drop policy if exists "insert - own branch or admin+" on sales;
create policy "insert - own branch or admin+" on sales for insert with check (
  auth.uid() is not null and created_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);
drop policy if exists "insert - own branch or admin+" on expenses;
create policy "insert - own branch or admin+" on expenses for insert with check (
  auth.uid() is not null and created_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);
drop policy if exists "insert - own branch or admin+" on creditor_transactions;
create policy "insert - own branch or admin+" on creditor_transactions for insert with check (
  auth.uid() is not null and created_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);
drop policy if exists "insert - own branch or admin+" on drawings;
create policy "insert - own branch or admin+" on drawings for insert with check (
  auth.uid() is not null and created_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);
drop policy if exists "insert - own branch or admin+" on attendance;
create policy "insert - own branch or admin+" on attendance for insert with check (
  auth.uid() is not null and marked_by = auth.uid()
  and (current_role_name() in ('superadmin','admin') or branch_id = current_branch_id())
);

drop policy if exists "approve - superuser+" on sales;
drop policy if exists "approve - superuser+" on expenses;
drop policy if exists "approve - superuser+" on creditor_transactions;
drop policy if exists "approve - superuser+" on drawings;

drop policy if exists "approve - own branch superuser, any admin+" on sales;
create policy "approve - own branch superuser, any admin+" on sales for update using (
  current_role_name() in ('superadmin','admin')
  or (current_role_name() = 'superuser' and branch_id = current_branch_id())
);
drop policy if exists "approve - own branch superuser, any admin+" on expenses;
create policy "approve - own branch superuser, any admin+" on expenses for update using (
  current_role_name() in ('superadmin','admin')
  or (current_role_name() = 'superuser' and branch_id = current_branch_id())
);
drop policy if exists "approve - own branch superuser, any admin+" on creditor_transactions;
create policy "approve - own branch superuser, any admin+" on creditor_transactions for update using (
  current_role_name() in ('superadmin','admin')
  or (current_role_name() = 'superuser' and branch_id = current_branch_id())
);
drop policy if exists "approve - own branch superuser, any admin+" on drawings;
create policy "approve - own branch superuser, any admin+" on drawings for update using (
  current_role_name() in ('superadmin','admin')
  or (current_role_name() = 'superuser' and branch_id = current_branch_id())
);

drop policy if exists "update profiles - admin+ or self" on profiles;
create policy "update profiles - admin+ or self" on profiles for update using (
  auth.uid() = id or current_role_name() in ('superadmin','admin')
);

-- ------------------------------------------------------------
-- 7. Receipt uploads — Supabase Storage bucket + policies
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', true)
  on conflict (id) do nothing;

drop policy if exists "receipts - read if logged in" on storage.objects;
create policy "receipts - read if logged in" on storage.objects for select using (
  bucket_id = 'receipts' and auth.uid() is not null
);
drop policy if exists "receipts - upload if logged in" on storage.objects;
create policy "receipts - upload if logged in" on storage.objects for insert with check (
  bucket_id = 'receipts' and auth.uid() is not null
);
