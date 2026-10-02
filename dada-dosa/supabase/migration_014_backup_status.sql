-- ============================================================
-- Migration 014 (safe-to-rerun) — status of the nightly Google Drive backup.
-- The backup job writes one row here; Admin -> Backup & Restore shows it.
-- Only Admin / SuperAdmin can read it; only the job (service key) writes it.
-- ============================================================
create table if not exists backup_status (
  id int primary key default 1 check (id = 1),
  last_run_at timestamptz,
  last_success_at timestamptz,
  ok boolean not null default false,
  message text,
  data_rows int not null default 0,
  files_copied int not null default 0,
  files_failed int not null default 0
);
alter table backup_status enable row level security;
drop policy if exists "backup status read - admin+" on backup_status;
create policy "backup status read - admin+" on backup_status for select using (current_role_name() in ('superadmin','admin'));
