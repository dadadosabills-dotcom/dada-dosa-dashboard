-- ============================================================
-- Migration 011 (safe-to-rerun)
--  1. drawing_parties(): list of party names already added under
--     Drawings, readable by every signed-in user (names only), so the
--     Expenses "Drawing" dropdown works for staff too.
--  2. Branch Documents: folders + files.
--       - Admin and SuperAdmin can open and download.
--       - ONLY SuperAdmin can create/rename/delete folders and upload/delete files.
--     Files live in a PRIVATE storage bucket and are opened through
--     short-lived signed links, never public URLs.
-- ============================================================

-- 1. Drawing parties ---------------------------------------------------
create or replace function drawing_parties()
returns table(name text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct trim(owner_name) as name
  from drawings
  where auth.uid() is not null and trim(owner_name) <> ''
  order by 1;
$$;
revoke all on function drawing_parties() from public;
grant execute on function drawing_parties() to authenticated;

-- 2. Documents ---------------------------------------------------------
create table if not exists document_folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references document_folders(id) on delete cascade,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references document_folders(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size bigint not null default 0,
  mime_type text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table document_folders enable row level security;
alter table documents enable row level security;

drop policy if exists "docs folders read - admin+" on document_folders;
create policy "docs folders read - admin+" on document_folders for select using (current_role_name() in ('superadmin','admin'));
drop policy if exists "docs folders insert - superadmin" on document_folders;
create policy "docs folders insert - superadmin" on document_folders for insert with check (current_role_name() = 'superadmin');
drop policy if exists "docs folders update - superadmin" on document_folders;
create policy "docs folders update - superadmin" on document_folders for update using (current_role_name() = 'superadmin');
drop policy if exists "docs folders delete - superadmin" on document_folders;
create policy "docs folders delete - superadmin" on document_folders for delete using (current_role_name() = 'superadmin');

drop policy if exists "docs read - admin+" on documents;
create policy "docs read - admin+" on documents for select using (current_role_name() in ('superadmin','admin'));
drop policy if exists "docs insert - superadmin" on documents;
create policy "docs insert - superadmin" on documents for insert with check (current_role_name() = 'superadmin');
drop policy if exists "docs update - superadmin" on documents;
create policy "docs update - superadmin" on documents for update using (current_role_name() = 'superadmin');
drop policy if exists "docs delete - superadmin" on documents;
create policy "docs delete - superadmin" on documents for delete using (current_role_name() = 'superadmin');

-- 3. Private storage bucket ---------------------------------------------
insert into storage.buckets (id, name, public) values ('branch-documents', 'branch-documents', false)
  on conflict (id) do update set public = false;

drop policy if exists "branch-documents read - admin+" on storage.objects;
create policy "branch-documents read - admin+" on storage.objects for select using (
  bucket_id = 'branch-documents' and current_role_name() in ('superadmin','admin')
);
drop policy if exists "branch-documents upload - superadmin" on storage.objects;
create policy "branch-documents upload - superadmin" on storage.objects for insert with check (
  bucket_id = 'branch-documents' and current_role_name() = 'superadmin'
);
drop policy if exists "branch-documents delete - superadmin" on storage.objects;
create policy "branch-documents delete - superadmin" on storage.objects for delete using (
  bucket_id = 'branch-documents' and current_role_name() = 'superadmin'
);
