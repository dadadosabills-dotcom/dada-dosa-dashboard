-- ============================================================
-- Migration 010 (safe-to-rerun) — link a login (staff profile) to an
-- employee record, so a staff member's "My Account" page can show
-- THEIR OWN salary advances and payroll deductions.
--
-- Set the link under Admin -> Staff -> "Employee record". If no link
-- is set, the app falls back to matching the staff member's name to
-- an employee with exactly the same name.
-- ============================================================

alter table employees add column if not exists profile_id uuid references profiles(id) on delete set null;
