# Phase A — Data layer (invisible to users)

**What users see:** nothing. No screen reads the new data yet. Phase A adds fast, safe
summary queries and a feature-flag switch that Phases B–E will use.

## Files
| Status | File | Purpose |
|---|---|---|
| NEW | `supabase/migration_015_feature_flags_indexes.sql` | `feature_flags` table (4 flags, all OFF) + 8 indexes |
| NEW | `supabase/migration_016_analytics_views.sql` | 7 views + 3 functions (see below) |
| NEW | `supabase/rollback_015_016.sql` | Removes only what 015/016 created |
| NEW | `lib/flags.ts` | Reads flags; everything is OFF if the table is missing or errors |
| NEW | `lib/analytics/types.ts` | Typed rows for every view/function |
| NEW | `lib/analytics/queries.ts` | Typed query helpers (paged, never throw) |
| NEW | `lib/analytics/dates.ts` | India-time date ranges + fair "compare with" periods |
| NEW | `lib/analytics/compare.ts` | "12% lower than same day last week" + green/red tone |
| NEW | `.eslintrc.json` | Makes `npm run lint` runnable (it stopped at a setup prompt before) |
| CHANGED | `package.json`, `package-lock.json` | + `eslint`, `eslint-config-next` (dev-only) |

No existing screen, route, prop, export, table, column, policy or old migration was edited.

## Order to apply
1. Copy the files into the repo (the zip mirrors the repo layout) and run `npm install`.
2. Supabase → SQL editor: run `migration_015_feature_flags_indexes.sql`, then `migration_016_analytics_views.sql`.
   Both are safe to re-run. Needs PostgreSQL 15+ (Supabase's default); 016 stops with a clear message otherwise.
3. Deploy. Nothing changes on screen.

## What the SQL adds
| Object | Gives you |
|---|---|
| `expenses_classified` | each expense tagged `operating` / `payroll` / `drawing` / `settlement` |
| `daily_branch_summary` | per branch per day: sales (by channel), expenses by kind, pending counts |
| `monthly_branch_summary` | per branch per month: avg daily sales, expense ratio %, payroll % of sales, profit |
| `expense_by_category` | approved expenses per branch/day/category/payment mode |
| `creditor_ageing` | per supplier: 0–30 / 31–60 / 61+ day buckets (oldest bills paid first) — owners only |
| `payroll_cost_summary` | per branch per month: net, real cost, paid vs unpaid |
| `missing_entries` | days (last 35) with no sales entry for each active branch |
| `branch_summary_range()` | totals per branch for any date range (server-side add-up) |
| `expense_by_category_range()` | category totals for any date range |
| `pending_approvals()` | pending count and oldest date per module and branch |

**Rules kept:** sales/expense totals count approved entries only; creditor balances ignore
rejected entries (as the Creditors page does); "today" is India time; every view uses
`security_invoker`, so each person sees only what the database already lets them see.

**How "profit" is split (your approved default):**
`Sales − running costs`, with payroll and drawings shown on separate lines.
Salary / Advance Salary expense rows and Drawing rows are not counted as running costs, and
Cash/Bank payments that the app turned into supplier payments are not counted twice.

## Using the new views from the SQL editor
The SQL editor runs as the database owner, so it has no signed-in user. Views that depend on
the user's role (`creditor_ageing`, `payroll_cost_summary`, `missing_entries`) will look empty
there. To test them as yourself:
```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<your profiles.id>';
select * from creditor_ageing;
select * from missing_entries;
rollback;
```
`daily_branch_summary`, `monthly_branch_summary`, `expense_by_category` work directly.

## Switching a feature on/off later (no redeploy)
```sql
update feature_flags set enabled = true  where key = 'smart_overview';  -- ON
update feature_flags set enabled = false where key = 'smart_overview';  -- OFF
```
Re-running migration 015 never resets a flag you have switched.

## Rollback
1. Easiest: nothing to roll back — no screen uses Phase A yet.
2. To remove the new objects: run `supabase/rollback_015_016.sql`. It drops only the views,
   functions, indexes and `feature_flags`. Sales, expenses, creditors, payroll, drawings and all
   other data are untouched (tested on a copy).
3. Code: delete `lib/flags.ts`, `lib/analytics/`, `.eslintrc.json` (and the two dev packages if you wish).

## Regression checklist
| Check | Result |
|---|---|
| `npm run build` | PASS (same 16 routes) |
| `npm run lint` | PASS — 0 errors; 3 existing warnings in `overview-client.tsx` left as they were |
| `tsc --noEmit` | PASS |
| Bundle size of every existing page vs before | PASS — identical (e.g. Overview 111 kB) |
| Existing source files modified | PASS — none (only `package.json` / lock: 2 dev packages) |
| Existing tables/columns/RLS policies (245 definitions) before vs after | PASS — identical |
| Existing data rows | PASS — untouched by migrations |
| 015 + 016 re-run safely | PASS |
| Flag survives re-running 015; staff can read but not change flags | PASS |
| Rollback removes only new objects, data intact | PASS |
| Figures vs hand calculation (pending/rejected excluded, supplier payment not double counted, oldest-first ageing, advance paid) | PASS |
| Role visibility: owner all / superuser own branch / staff own branch / ageing owner-only / signed-out denied | PASS |
| Date logic: India midnight boundary, all presets, month-end, financial year, compare periods | PASS |
| Live click-through of every module against your real Supabase (login, sales, expenses→creditor sync, advance→payroll, Excel import/export, approvals, backup/restore) | NOT RUN — I have no access to your project. Phase A adds no code path to these, but please do a 5-minute smoke test before the next phase. |

## Assumptions & open questions
1. **Row cap.** Check Supabase → Settings → API → *Max rows*. If it is 1000, the Classic Overview may already under-count once you have more rows (it asks for 20,000). The new helpers page through results, so they are not affected.
2. **Payroll cost.** I used `payroll_cost = net + advances recovered`, not `net` alone, because advances were already paid earlier as "Advance Salary" expenses; `net` alone would drop them from profit. Both columns exist; tell me if you prefer `net`.
3. **Ageing date of opening balances.** There is no "as of" date on opening balances, so they are dated by when the supplier record was created. If suppliers were added recently with old balances, they will show as 0–30 days. A fix needs a new column (your approval).
4. **Categories "Receipt", "Return", "Bill Pay", "Bank"** stay in running costs. Tell me if any should be excluded.
5. **Missing entries** start from each branch's first sales entry; days a branch is closed show as missing. Branches that never had sales (e.g. Office, Home) never appear.
6. **Existing exposure (not changed):** `payroll_runs` and `salary_advances` can be read by any signed-in user through the API (original "read all" policies). The new payroll view is stricter. A hardening migration would be a separate change needing your approval.
7. **Timezone bug in Classic Overview** ("this month" start) left untouched, as agreed; new views use India dates.
8. **Lint:** one purely stylistic rule (`react/no-unescaped-entities`) is off so four harmless quote characters in `admin-client.tsx` don't fail the build.
9. My build check used mocked Google Fonts (my test environment is offline). Vercel is unaffected.
