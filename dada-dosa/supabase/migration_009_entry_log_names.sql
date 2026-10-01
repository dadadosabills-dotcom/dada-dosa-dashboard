-- ============================================================
-- Migration 009 (safe-to-rerun) — entry log names.
--
-- The Sales and Expenses log shows who entered each record and who
-- approved it. Plain staff (role "user") could previously only read
-- their OWN profile row, so the names of other people (e.g. the
-- superior who approved their entry) came back blank for them.
-- This lets every signed-in staff member read profile rows so those
-- names show. (Profiles hold name, role, phone and branch only.)
-- ============================================================

drop policy if exists "read names - logged in" on profiles;
create policy "read names - logged in" on profiles for select using (auth.uid() is not null);
