-- ============================================================
-- Migration 004 (safe-to-rerun) — fix "infinite recursion
-- detected in policy for relation profiles".
--
-- current_role_name() and current_branch_id() look up your row in
-- `profiles`, but that lookup was itself subject to the RLS policy
-- on `profiles` — which calls current_role_name() again — forever.
-- Marking these functions SECURITY DEFINER makes their internal
-- lookup bypass RLS (safe here: they only ever return the caller's
-- own role/branch, derived from auth.uid(), never anyone else's).
-- ============================================================

create or replace function current_role_name()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function current_branch_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select branch_id from profiles where id = auth.uid();
$$;
