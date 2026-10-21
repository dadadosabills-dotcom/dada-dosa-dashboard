# Phase C — Insights and Reports (behind the `insights_reports` flag, OFF by default)

Needs Phase A (migrations 015, 016) and Phase B (017). This phase adds migration **018**.

## What people see when the flag is ON
A new **Reports** screen at `/dashboard/reports` (owners and branch heads; staff are sent back to the overview).
It uses the same period and branch selector as the overview, remembered on the device. Six tabs:

| Tab | Who | What it answers |
|---|---|---|
| **What changed** | owners, branch heads | Plain sentences, most important first, e.g. *"1st Branch sales fell 18% (₹9,000) compared with same day last week, mostly Swiggy."* Also: costs taking a bigger share of sales, rising dependence on Swiggy/Zomato, a spending category that jumped, salaries high vs sales, best and quietest weekday. |
| **Profit & loss** | owners, branch heads | The whole business in plain words, then one card per branch: sales, running costs, profit before salaries, and (for whole-month views once payroll is processed) salaries and profit after salaries. |
| **Branches** | owners | Branches ranked on one measure at a time: Sales, Average per day, Profit, or Costs as % of sales (lower is better), each with its change vs the comparison period. Tap a branch to look at only that branch. |
| **Patterns** | owners, branch heads | Bar chart of average sales per trading day by weekday; a branch × weekday heatmap ("darker = busier for that branch"); a branch × category heatmap of where running costs go. |
| **Cash flow** | owners, branch heads | Money in by channel; money paid out (cash vs bank; running costs, supplier payments, salaries, drawings); left over; and what was bought on credit and is not paid yet. |
| **Suppliers** | owners | Creditor ageing 0–30 / 31–60 / over 60 days, total owed, per-supplier bar, link to Creditors. |

**How to reach it:** a "Reports" button appears on the new overview when this flag is on (so switch on
`smart_overview` too), or open `/dashboard/reports` directly.

## Files
| Status | File |
|---|---|
| NEW | `supabase/migration_018_reports_functions.sql` (3 functions), `supabase/rollback_018.sql` |
| NEW | `app/dashboard/reports/` — `page.tsx`, `reports-client.tsx`, `insights-view.tsx`, `pnl-view.tsx`, `compare-view.tsx`, `patterns-view.tsx`, `cashflow-view.tsx`, `suppliers-view.tsx` |
| NEW | `lib/analytics/` — `insights.ts`, `report-calc.ts`, `reports-data.ts` |
| EXTENDED (my files from earlier phases) | `lib/analytics/types.ts`, `queries.ts`, `format.ts`, `app/dashboard/smart/smart-overview.tsx` (adds the Reports button) |
| Existing app files changed | **none** (`page.tsx`, `layout.tsx`, `nav.tsx` are NOT touched in this phase) |

## Order to apply
1. Phase A + B migrations (015, 016, 017) if not already run.
2. Run `migration_018_reports_functions.sql` in the Supabase SQL editor (safe to re-run).
3. Copy the files and deploy. Nothing changes yet.
4. `update feature_flags set enabled = true where key = 'insights_reports';`

## Rollback
1. Instant: `update feature_flags set enabled = false where key = 'insights_reports';`. The Reports button disappears and `/dashboard/reports` sends everyone to the overview.
2. Optional: `supabase/rollback_018.sql` (drops only the 3 functions; tested on a copy; data and earlier phases intact).
3. Optional: delete `app/dashboard/reports/` and the `lib/analytics` files listed above.

## Rules used (all approved entries only)
- **Running costs** exclude Salary/Advance Salary, Drawing, and supplier-settlement payments (Phase A rules).
- **Cash flow:** Cash and Bank = money that left; Credit = bought now, paid later. Opening cash/bank balances are not recorded, so this is movement, not balance.
- **Weekday averages** count only days that had sales.
- **Insight thresholds (my defaults):** a branch's sales change of 10% or more (on a base of at least ₹5,000); costs share up 5 points or more; delivery-app share moves 5 points or more; a category up 20% and at least ₹2,000; salaries at 35% of sales or more (whole-month views only); weekday insight needs at least 5 weekdays with 2+ trading days each. Up to 8 shown.
- When the comparison period has no sales, the screen says "Nothing to compare with yet" instead of "Nothing unusual".

## Regression checklist
| Check | Result |
|---|---|
| `tsc --noEmit` / `npm run lint` (0 errors, your 3 original warnings) / `npm run build` | PASS |
| **Real server, ALL flags off:** owner / branch head / staff × Overview, Sales, Expenses, Creditors return the same status, redirect and text as your original build (12/12), with sanity checks proving real pages were served | PASS |
| Reports flag OFF → owner, branch head, staff all sent back to `/dashboard` | PASS |
| Reports flag ON → owner gets all 6 tabs + branch picker; branch head gets 4 tabs, no branch picker, no Suppliers/Branches; staff redirected | PASS |
| Other screens unchanged while Reports is ON | PASS |
| `feature_flags` table missing → Reports route redirects safely | PASS |
| Phase B matrix re-run after this phase (flag on/off per role, classic fallback, size) | PASS (22/22); flag-off overview download +3 kB vs your original |
| Reports over real HTTP + row-level security: every section loads for the owner; the numbers tie together (weekday total = sales; cash-flow in = sales; paid + credit = all approved expenses; category totals = running costs; category shares = 100%); branch head sees only their own branch, no ageing | PASS |
| Insight rules, P&L, cash flow, weekday/category grids, metric ranking | PASS (scenario tests) |
| All 6 views render with realistic, single-branch and empty data; dates `DD-MMM-YYYY`, ₹ lakh/crore; arrows + words, not colour alone | PASS |
| Existing 245 table/column/policy definitions unchanged by 015–018; 018 re-runs safely; rollback tested; data rows untouched | PASS |
| Looking at the screens in a real browser/phone; your live Supabase | NOT RUN |

## Not included, and why
- **Targets vs actual** (budget per branch): there is no targets table, and you haven't given me targets. It needs one new table plus a small screen to enter them. Say the word and send the numbers.
- **Export / share** of a report: Phase D.
- **Sales by category or payment mode:** sales stay as they are (channel only), as you decided.

## Open questions and assumptions
1. Not seen in a real browser. Please open Reports on your phone and a laptop as owner and as branch head.
2. Are the insight thresholds right, or should they be more/less sensitive?
3. The "Branches" tab and heatmaps include every branch that has sales or expenses in the period, including non-selling branches only if they have expenses.
4. Still open from earlier: Supabase *Max rows*, categories "Receipt / Return / Bill Pay / Bank", dating of old supplier opening balances, payroll cost = net + advances.
