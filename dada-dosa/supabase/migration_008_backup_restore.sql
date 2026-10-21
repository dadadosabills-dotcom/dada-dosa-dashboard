-- ============================================================
-- Migration 008 (safe-to-rerun) — Backup & Restore.
--
-- The Admin → Backup & Restore tab can load a full Excel backup
-- back into the database. Restoring writes rows that were
-- originally created by OTHER staff members, which the normal
-- "you can only insert your own rows" policies rightly refuse.
--
-- This adds one extra policy per table that lets a SUPERADMIN
-- (and only a superadmin) insert / update rows (never delete) regardless of who
-- created them. Nobody else gets any new power, and no existing
-- policy is changed. Policies combine with OR, so everything
-- that worked before still works exactly the same.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'branches', 'profiles', 'employees', 'creditors', 'expenses', 'sales', 'drawings',
    'creditor_transactions', 'attendance', 'payroll_runs', 'salary_advances', 'payroll_run_advances'
  ]
  loop
    execute format('drop policy if exists "restore insert - superadmin" on %I', t);
    execute format(
      'create policy "restore insert - superadmin" on %I for insert with check (current_role_name() = ''superadmin'')', t);
    execute format('drop policy if exists "restore update - superadmin" on %I', t);
    execute format(
      'create policy "restore update - superadmin" on %I for update using (current_role_name() = ''superadmin'') with check (current_role_name() = ''superadmin'')', t);
  end loop;
end $$;
