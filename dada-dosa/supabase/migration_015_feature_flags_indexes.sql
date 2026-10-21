-- ============================================================
-- Migration 015 (safe-to-rerun) — Phase A: feature flags + indexes.
--
-- ADDITIVE ONLY. Creates one new table (feature_flags) and a few
-- indexes. No existing table, column, policy or row is changed.
--
-- feature_flags lets an admin switch new screens on/off from the
-- database (no redeploy). Every flag is seeded OFF. If this table
-- doesn't exist yet, the app treats every flag as OFF.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Feature flags
-- ------------------------------------------------------------
create table if not exists feature_flags (
  key         text primary key,
  enabled     boolean not null default false,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);

alter table feature_flags enable row level security;

-- Everyone logged in must be able to READ flags (the app checks them on every page).
drop policy if exists "flags read - logged in" on feature_flags;
create policy "flags read - logged in" on feature_flags
  for select using (auth.uid() is not null);

-- Only admin and superadmin can switch a flag.
drop policy if exists "flags update - admin+" on feature_flags;
create policy "flags update - admin+" on feature_flags
  for update using (current_role_name() in ('superadmin','admin'))
  with check (current_role_name() in ('superadmin','admin'));

-- No insert/delete policies on purpose: flags are created only by migrations.

-- Seed (all OFF). Re-running never flips a flag you have already switched.
insert into feature_flags (key, description) values
  ('smart_overview',  'Phase B: role-aware home screen with KPI cards, leaderboard and "Needs your attention"'),
  ('insights_reports','Phase C: plain-language insights, P&L, creditor ageing, comparisons'),
  ('quick_tools',     'Phase D: global search, saved views, bulk approve, one-tap export, daily summary share'),
  ('trust_speed',     'Phase E: audit log, data-quality warnings, offline queue')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. Indexes for the new summary queries
--    (plain CREATE INDEX: tables are small and this runs once.
--     Run outside business hours if you prefer.)
-- ------------------------------------------------------------
create index if not exists sales_branch_date_status_idx     on sales (branch_id, date, status);
create index if not exists expenses_branch_date_status_idx  on expenses (branch_id, date, status);
create index if not exists drawings_branch_date_status_idx  on drawings (branch_id, date, status);
create index if not exists ctx_branch_date_status_idx       on creditor_transactions (branch_id, date, status);
create index if not exists ctx_creditor_status_idx          on creditor_transactions (creditor_id, status);
create index if not exists ctx_source_expense_idx           on creditor_transactions (source_expense_id) where source_expense_id is not null;
create index if not exists payroll_runs_branch_period_idx   on payroll_runs (branch_id, period);
create index if not exists attendance_branch_date_idx       on attendance (branch_id, date);
