-- ============================================================
-- Migration 012 (safe-to-rerun)
--  1. drawings.source_expense_id — a "Drawing" expense now creates its
--     own row in Drawings; deleting the expense deletes that row too,
--     and approving/rejecting the expense updates it.
--  2. Employee documents — joining form, identity proof and other files
--     for each employee (Payroll -> Employees). Admin and SuperAdmin can
--     view, upload and delete. Files sit in a PRIVATE bucket and open
--     through short-lived links.
-- ============================================================

-- 1. Drawings linked to the expense that created them --------------------
alter table drawings add column if not exists source_expense_id uuid references expenses(id) on delete cascade;
create index if not exists drawings_source_expense_idx on drawings(source_expense_id);

-- 2. Employee documents --------------------------------------------------
create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  kind text not null check (kind in ('joining_form', 'identity_proof', 'other')),
  name text not null,
  storage_path text not null,
  size bigint not null default 0,
  mime_type text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists employee_documents_emp_idx on employee_documents(employee_id);

alter table employee_documents enable row level security;
drop policy if exists "emp docs read - admin+" on employee_documents;
create policy "emp docs read - admin+" on employee_documents for select using (current_role_name() in ('superadmin','admin'));
drop policy if exists "emp docs insert - admin+" on employee_documents;
create policy "emp docs insert - admin+" on employee_documents for insert with check (current_role_name() in ('superadmin','admin'));
drop policy if exists "emp docs delete - admin+" on employee_documents;
create policy "emp docs delete - admin+" on employee_documents for delete using (current_role_name() in ('superadmin','admin'));

insert into storage.buckets (id, name, public) values ('employee-documents', 'employee-documents', false)
  on conflict (id) do update set public = false;

drop policy if exists "employee-documents read - admin+" on storage.objects;
create policy "employee-documents read - admin+" on storage.objects for select using (
  bucket_id = 'employee-documents' and current_role_name() in ('superadmin','admin')
);
drop policy if exists "employee-documents upload - admin+" on storage.objects;
create policy "employee-documents upload - admin+" on storage.objects for insert with check (
  bucket_id = 'employee-documents' and current_role_name() in ('superadmin','admin')
);
drop policy if exists "employee-documents delete - admin+" on storage.objects;
create policy "employee-documents delete - admin+" on storage.objects for delete using (
  bucket_id = 'employee-documents' and current_role_name() in ('superadmin','admin')
);
