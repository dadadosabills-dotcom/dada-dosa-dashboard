# Phase B — Smart Overview (behind the `smart_overview` flag, OFF by default)

Needs Phase A (migrations 015 and 016) to be applied first.

## What people see when the flag is ON

| Role | Home screen |
|---|---|
| **Staff** (`user`) | **"Today's entry"** checklist: *Yesterday's sales* (only if missing), *Today's sales* (Not done / Waiting / Done / Fix it) and *Today's expenses*, each with one big button. Staff also get an **Overview** link in their menu. |
| **Branch head** (`superuser`) | Their own branch only: 5 headline numbers, "Needs your attention", daily sales line, profit snapshot, sales-by-channel bar. |
| **Owner** (`admin`, `superadmin`) | Everything above for **all branches or one**, plus a **branch ranking** (tap a branch to look at only that branch) and **backup / overdue-supplier** alerts. |

**Headline numbers** (labels follow the chosen period, e.g. "Sales today", "Expenses this month"):
Sales · Expenses (running costs) · Profit (before salaries) · You owe suppliers · Waiting for approval.
Each shows a green/red arrow and a plain sentence ("12% lower than same day last week"). Expenses and
"you owe" turn red when they go **up**. Tapping a number opens its module.

**One date range + one branch** (Today, Yesterday, 7 days, This month, Last month, This year, Custom), sticky at
the top, remembered on this device.

**Needs your attention** (tap a line to see exactly what, tap again to go fix it):
- entries waiting for approval (red if the oldest has waited 3+ days)
- branches that haven't entered sales (last 7 days; today only counts after 9 PM India time)
- suppliers owed for bills older than 30 days (red if over 60 days) — owners
- expenses far above normal (2× the usual for that branch + category, at least ₹1,000)
- backup not recorded, failed, or older than 36 hours — owners

Empty, loading and error states are all designed: skeleton placeholders, "All clear", and "Couldn't load X — your data
is safe — Try again" per section, so one failing part never blanks the page.

## Before / after
- **Before:** one long Overview page that downloads every entry to the phone, with the same view for everyone; staff were sent straight to Sales.
- **After (flag ON):** a short page that answers "how are we doing?" in 5 seconds from server-side totals; staff get a to-do list instead of a redirect. **Classic** stays one tap away ("Use the classic overview", or `/dashboard?view=classic`).
- Screenshots were **not** possible from my environment (no browser) — see "Not verified" below.

## Files
| Status | File |
|---|---|
| NEW | `supabase/migration_017_overview_helpers.sql` — view `unusual_expenses`, function `creditor_balance_asof` |
| NEW | `supabase/rollback_017.sql` |
| NEW | `app/dashboard/smart/` — `smart-overview.tsx`, `staff-today.tsx`, `lazy-entry.tsx`, `ui.tsx`, `filters-bar.tsx`, `attention-panel.tsx`, `leaderboard.tsx`, `trend-chart.tsx`, `pnl-card.tsx`, `channel-mix.tsx` |
| NEW | `lib/analytics/` — `format.ts` (₹ lakh/crore), `tone.ts` (colours), `attention.ts`, `use-filters.ts`, `overview-data.ts` |
| EXTENDED (my Phase A files) | `lib/analytics/types.ts`, `lib/analytics/queries.ts` |
| CHANGED (existing) | `app/dashboard/page.tsx` (+23 lines), `app/dashboard/layout.tsx` (+7), `app/dashboard/nav.tsx` (+12) |

The three existing-file changes: `page.tsx` checks the flag and shows the new screen, otherwise runs exactly as before;
`layout.tsx` and `nav.tsx` add an optional `staffOverview` flag (default `false` = identical to today) so staff get an Overview link only when the flag is on.
Originals are in `rollback_originals/`.

## Order to apply
1. Phase A migrations 015 → 016 (if not already run).
2. Run `migration_017_overview_helpers.sql`. Safe to re-run.
3. Copy the files, deploy. Nothing changes yet.
4. When ready: `update feature_flags set enabled = true where key = 'smart_overview';`
   (The flag is for everyone at once, not per person — switch it on at a quiet time and check as owner, branch head and staff.)

## Rollback
1. **Instant, no redeploy:** `update feature_flags set enabled = false where key = 'smart_overview';` — everyone is back on the classic overview.
2. Optional: run `supabase/rollback_017.sql` (drops only the view and function from 017; tested on a copy, all data and Phase A objects intact).
3. Optional: restore `page.tsx`, `layout.tsx`, `nav.tsx` from `rollback_originals/` and delete `app/dashboard/smart/`.

## Regression checklist
| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS — exit 0; only your 3 original warnings |
| `npm run build` | PASS — same 16 routes |
| **Real server, flag OFF:** owner / branch head / staff × Overview, Sales, Expenses return the same status, redirect and text as your original build | PASS (9/9) |
| **Flag ON:** owner → new overview; branch head → new overview with own branch; staff → checklist + Overview link | PASS |
| `?view=classic` with flag ON equals the original page (owner, branch head); staff still redirected to Sales | PASS |
| Sales page unchanged with flag ON | PASS |
| `feature_flags` table missing (015 not run) → everyone gets the original behaviour | PASS |
| Download size of `/dashboard` with flag OFF vs original | PASS — +3 kB raw JS (about 1 kB compressed). The new screens load lazily only when the flag is on |
| Data helpers over real HTTP + row-level security: owner sees all sections; branch head sees only own branch and no ageing/backup; staff checklist correct; signed-out denied | PASS |
| Numbers against hand calculation (approved only, pending/rejected excluded, supplier balance, payroll cost, unusual-expense rule incl. ₹1,000 floor and "no history" case) | PASS |
| Alert rules: severity by age, branch filter, 9 PM rule, 7-day window, overdue buckets, stale/failed/missing backup, ordering | PASS (unit tests) |
| All screen components render with realistic and empty data; arrows + words (not colour alone); dates `DD-MMM-YYYY`; ₹ lakh/crore | PASS |
| Existing tables, columns and 245 policies unchanged by 015–017; data rows untouched; 017 re-runs safely; rollback tested | PASS |
| **Not verified:** looking at the screens in a real browser/phone; click-through of your modules against your real Supabase | NOT RUN — see below |

## Colour and accessibility
Your base green and red measure about 3.7:1 and 3.3:1 on the dark panels — below the 4.5:1 needed for small text.
The new screen uses brighter tones (green `#7CC47F`, red `#FF8F7A`, amber `#F2C14E`) that measure 8:1 or better on
your panels. Meaning is never colour alone: every status has an arrow or a word (Urgent / Check, Done / Waiting / Not done).
Tap targets are at least 44 px. Your app is dark-only; I did not add a light theme.

## Assumptions and open questions
1. **Not verified visually.** I could not open a browser here. Please look at it on your phone and on a laptop as owner, branch head and staff before leaving the flag on for the team.
2. **"Profit" = sales − running costs, before salaries.** Salaries are only subtracted for whole-month views (This month, Last month, This year) and only once payroll has been processed; otherwise it says "Not processed yet" rather than showing a misleading profit. (Phase A decisions still apply: payroll cost = net + advances recovered.)
3. **No targets yet.** There is no targets table, so branch heads don't see "target vs actual". Give me monthly sales targets per branch and I'll add them in Phase C.
4. **"You owe suppliers"** is bills minus payments to the chosen date, including opening balances for owners. It may differ slightly from the Creditors page if some supplier has been overpaid. Please compare once.
5. **Alert thresholds are my defaults** (unusual = 2× the usual and ≥ ₹1,000; missing sales = last 7 days; overdue = 30+ days; backup stale = 36 h). Tell me if you want different numbers.
6. **"Remembered across modules":** the period and branch are remembered on this device for the new overview. The Sales, Expenses, etc. screens don't read it yet, because they are deliberately untouched. Phase D adds the shared filter bar.
7. **Flag is global,** not per person.
8. **Still open from Phase A:** Supabase *Max rows* setting, whether "Receipt / Return / Bill Pay / Bank" expense categories should count as running costs, and the dating of old supplier opening balances.
