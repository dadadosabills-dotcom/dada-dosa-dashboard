-- ============================================================
-- Migration 013 (safe-to-rerun) — a staff member can VIEW and DOWNLOAD
-- their own employee documents (joining form, ID proof) on "My Account".
-- They still cannot upload or delete; only Admin / SuperAdmin can.
--
-- "Their own" = the employee record linked to their login (Admin ->
-- Staff -> Employee record), or, if none is linked, the employee with
-- exactly the same name.
-- ============================================================

create or replace function my_employee_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select e.id
  from employees e
  join profiles p on p.id = auth.uid()
  where e.profile_id = auth.uid()
     or (
       not exists (select 1 from employees x where x.profile_id = auth.uid())
       and lower(trim(e.name)) = lower(trim(p.full_name))
     );
$$;
revoke all on function my_employee_ids() from public;
grant execute on function my_employee_ids() to authenticated;

drop policy if exists "emp docs read - own" on employee_documents;
create policy "emp docs read - own" on employee_documents for select using (
  employee_id in (select my_employee_ids())
);

drop policy if exists "employee-documents read - own" on storage.objects;
create policy "employee-documents read - own" on storage.objects for select using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] in (select x::text from my_employee_ids() as x)
);
