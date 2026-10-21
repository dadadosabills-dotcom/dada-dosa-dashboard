-- ============================================================
-- Migration 007 (safe-to-rerun) — same issue as migration 006:
-- `sales.amount` was required in the original itemized design and
-- is never filled in by the new Swiggy/Zomato/UPI/Cash form.
-- ============================================================

alter table sales alter column amount drop not null;
