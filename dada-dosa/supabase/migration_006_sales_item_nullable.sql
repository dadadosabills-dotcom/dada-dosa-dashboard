-- ============================================================
-- Migration 006 (safe-to-rerun) — the original `sales.item` column
-- was required (not null) from the very first schema, back when
-- Sales was an itemized log. The rebuilt Sales module (Swiggy/
-- Zomato/UPI/Cash channel summary) never fills it in, so every
-- insert — manual or imported — was failing with:
--   null value in column "item" of relation "sales" violates not-null constraint
-- This makes it optional. No data is lost; old itemized rows (if any)
-- keep whatever they already had in this column.
-- ============================================================

alter table sales alter column item drop not null;
