-- ============================================================
-- Dada Dosa — Business Dashboard schema
-- Single tenant, role-based (SuperAdmin > Admin > Superuser > User)
-- Run this in Supabase SQL editor after creating the project.
-- ============================================================

-- 1. Roles enum
create type user_role as enum ('superadmin', 'admin', 'superuser', 'user');
create type entry_status as enum ('pending', 'approved', 'rejected');

-- 2. Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'user',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Sales
create table sales (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  item text not null,
  customer text,
  category text not null default 'General',
  amount numeric(12,2) not null check (amount > 0),
  payment_mode text not null default 'cash', -- cash / upi / card / credit
  created_by uuid not null references profiles(id),
  status entry_status not null default 'pending',
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. Expenses
create table expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  vendor text not null,
  category text not null default 'General', -- ingredients / rent / utilities / maintenance / other
  note text,
  amount numeric(12,2) not null check (amount > 0),
  payment_mode text not null default 'cash',
  created_by uuid not null references profiles(id),
  status entry_status not null default 'pending',
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 5. Employees (payroll master)
create table employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text, -- e.g. cook, counter, delivery
  pay_type text not null default 'monthly', -- monthly / daily
  rate numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6. Attendance (feeds payroll)
create table attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  status text not null, -- present / half / absent / leave
  marked_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

-- 7. Payroll runs
create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  period text not null, -- 'YYYY-MM'
  gross numeric(12,2) not null,
  deductions numeric(12,2) not null default 0,
  net numeric(12,2) generated always as (gross - deductions) stored,
  status text not null default 'unpaid', -- unpaid / paid
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (employee_id, period)
);

-- 8. Creditors (accounts payable — money the business owes)
create table creditors (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- supplier/vendor name
  contact text,
  opening_balance numeric(12,2) not null default 0,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table creditor_transactions (
  id uuid primary key default gen_random_uuid(),
  creditor_id uuid not null references creditors(id) on delete cascade,
  date date not null default current_date,
  type text not null, -- 'bill' (increases what's owed) or 'payment' (reduces it)
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_by uuid not null references profiles(id),
  status entry_status not null default 'pending',
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- 9. Owner drawings
create table drawings (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  owner_name text not null,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_by uuid not null references profiles(id),
  status entry_status not null default 'pending',
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;
alter table employees enable row level security;
alter table attendance enable row level security;
alter table payroll_runs enable row level security;
alter table creditors enable row level security;
alter table creditor_transactions enable row level security;
alter table drawings enable row level security;

-- helper: get current user's role
create or replace function current_role_name()
returns user_role
language sql stable
as $$
  select role from profiles where id = auth.uid();
$$;

-- Everyone who is logged in and active can READ everything
-- (single tenant — all staff see the same business data)
create policy "read all - logged in" on sales for select using (auth.uid() is not null);
create policy "read all - logged in" on expenses for select using (auth.uid() is not null);
create policy "read all - logged in" on employees for select using (auth.uid() is not null);
create policy "read all - logged in" on attendance for select using (auth.uid() is not null);
create policy "read all - logged in" on payroll_runs for select using (auth.uid() is not null);
create policy "read all - logged in" on creditors for select using (auth.uid() is not null);
create policy "read all - logged in" on creditor_transactions for select using (auth.uid() is not null);
create policy "read all - logged in" on drawings for select using (auth.uid() is not null);
create policy "read own profile or if admin+" on profiles for select using (
  auth.uid() = id or current_role_name() in ('superadmin','admin','superuser')
);

-- INSERT: any active logged-in user can create entries (status defaults to pending)
create policy "insert - logged in" on sales for insert with check (auth.uid() is not null and created_by = auth.uid());
create policy "insert - logged in" on expenses for insert with check (auth.uid() is not null and created_by = auth.uid());
create policy "insert - logged in" on creditor_transactions for insert with check (auth.uid() is not null and created_by = auth.uid());
create policy "insert - logged in" on drawings for insert with check (auth.uid() is not null and created_by = auth.uid());
create policy "insert - logged in" on attendance for insert with check (auth.uid() is not null and marked_by = auth.uid());

-- UPDATE (approve/reject/edit): superuser and above only
create policy "approve - superuser+" on sales for update using (current_role_name() in ('superadmin','admin','superuser'));
create policy "approve - superuser+" on expenses for update using (current_role_name() in ('superadmin','admin','superuser'));
create policy "approve - superuser+" on creditor_transactions for update using (current_role_name() in ('superadmin','admin','superuser'));
create policy "approve - superuser+" on drawings for update using (current_role_name() in ('superadmin','admin','superuser'));

-- Employees / payroll / creditors master data: admin and above manage, everyone reads
create policy "manage employees - admin+" on employees for insert with check (current_role_name() in ('superadmin','admin'));
create policy "manage employees update - admin+" on employees for update using (current_role_name() in ('superadmin','admin'));
create policy "manage payroll - admin+" on payroll_runs for insert with check (current_role_name() in ('superadmin','admin'));
create policy "manage payroll update - admin+" on payroll_runs for update using (current_role_name() in ('superadmin','admin'));
create policy "manage creditors - admin+" on creditors for insert with check (current_role_name() in ('superadmin','admin'));

-- DELETE: superadmin only, everywhere
create policy "delete - superadmin only" on sales for delete using (current_role_name() = 'superadmin');
create policy "delete - superadmin only" on expenses for delete using (current_role_name() = 'superadmin');
create policy "delete - superadmin only" on employees for delete using (current_role_name() = 'superadmin');
create policy "delete - superadmin only" on attendance for delete using (current_role_name() = 'superadmin');
create policy "delete - superadmin only" on payroll_runs for delete using (current_role_name() = 'superadmin');
create policy "delete - superadmin only" on creditors for delete using (current_role_name() = 'superadmin');
create policy "delete - superadmin only" on creditor_transactions for delete using (current_role_name() = 'superadmin');
create policy "delete - superadmin only" on drawings for delete using (current_role_name() = 'superadmin');

-- Auto-create a profile row when someone signs up (default role: user)
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
