# Dada Dosa — Business Dashboard

Next.js 14 (App Router) + Supabase (Postgres + Auth) + Tailwind. PWA —
installable on phone home screen, no app store. Single business, 14
branches, 4 staff roles.

## What's built

- Auth: sign-in + self-signup (new staff sign up, then an admin assigns
  their role and branch — see "Onboarding staff" below)
- Dashboard shell: sidebar nav on desktop, bottom tab bar on mobile
- Branch-aware everywhere: every entry (Sales, Expenses, Creditor
  transactions, Drawings, Attendance) is tagged to a branch. User/Superuser
  only see and log entries for their own branch. Admin/SuperAdmin see and
  filter across all 14.
- **Sales** — add entry, approve/reject (Superuser+ own branch, Admin+
  anywhere), delete (SuperAdmin only)
- **Expenses** — full 26-category list from your actual sheet, GST bill
  flag, receipt/voucher photo upload, manually-entered voucher number, bank
  name field (shown when payment mode is Bank). Logging a "Advance Salary"
  expense also creates a salary-advance record tied to an employee, which
  Payroll auto-deducts later.
- **Payroll** — Employees (hourly rate, branch), Attendance (check-in/
  check-out times, hours computed automatically), Run Payroll (gross =
  hours × rate, minus any outstanding salary advances, oldest first),
  History
- **Creditors** — supplier list with running balance, bill/payment log per
  supplier, branch-tagged transactions
- **Drawings** — free-text owner name per entry (supports multiple owners),
  per-owner running totals
- **Admin** (Admin/SuperAdmin only) — assign staff role + branch,
  activate/deactivate staff, add/deactivate branches

## Design choice worth knowing about

Creditors (the supplier master record — name, contact, opening balance)
is **not** branch-tagged, since the same supplier can bill multiple
branches. The individual bill/payment **transactions** under each supplier
are branch-tagged instead. If you actually want separate supplier lists
per branch, tell me and I'll split it — it's a small change.

## Setup — fresh install

1. **Create a Supabase project** — supabase.com, free tier.
2. **Run the schema** — SQL editor → paste `supabase/schema.sql` → run.
3. **Run the branch migration** — same SQL editor → paste
   `supabase/migration_002_branches_modules.sql` → run. This adds the
   `branches` table (seeded with your 14), branch_id on every entry table,
   the new Expenses fields, hourly attendance + salary advances, and
   rewrites Row Level Security to be branch-aware.
4. **Get your keys** — Project Settings → API → Project URL + `anon` key.
5. **Set env vars** — copy `.env.local.example` to `.env.local`, fill in
   the two values.
6. **Install and run**:
   ```
   npm install
   npm run dev
   ```
7. **Create your first user** — go to `/signup` in the running app, create
   your account, then in Supabase's Table Editor open `profiles` and set
   your own row's `role` to `superadmin`. Every user after that you can
   promote from inside the app's Admin screen instead.

## Setup — upgrading an existing install (you already ran schema.sql)

Just run `supabase/migration_002_branches_modules.sql` in the SQL editor,
then redeploy the app code. Existing rows in Sales/Expenses/Creditors/
Drawings will have `branch_id = null` until edited — decide whether to
backfill them manually in the Table Editor (a one-time `update ... set
branch_id = '<id>' where branch_id is null`, split however your old data
maps to branches) or just leave them as historical/unassigned.

## Onboarding staff

There's no way to create login accounts from inside the app without
exposing a Supabase service-role key to the browser (a real security
hole), so the flow is: staff create their own account at `/signup`, which
lands them as role `user` with no branch — they can't see or log anything
yet. An Admin or SuperAdmin then goes to the **Admin** tab, assigns their
role and branch, and they're live.

## Deploying to Vercel

1. Push to a GitHub repo.
2. Import it in Vercel (vercel.com → New Project).
3. Add the two env vars from `.env.local` in Vercel's project settings.
4. Deploy.

## What "PWA" gets you here

`manifest.json` + icons are wired in. Android Chrome offers "Add to Home
Screen" automatically; iOS Safari → Share → "Add to Home Screen" — same
result, native-looking icon, no browser chrome.

## Known gaps / next steps

- Payroll run writes (payroll_runs, payroll_run_advances, salary_advances
  update) happen as separate sequential calls, not a single database
  transaction — fine for one admin running payroll at a time, but if you
  ever need concurrent payroll runs this should move to a Postgres
  function (RPC) instead.
- No CSV export or date-range filtering yet on any module — only a branch
  filter.
- No offline support — if a branch has no signal, entries won't save
  until connectivity returns.
- Supabase generated types (`supabase gen types typescript`) still aren't
  wired up — every query result is manually typed. Worth doing before this
  gets much bigger.

## SQL files — run in this order (each in its own fresh SQL Editor query)

1. `supabase/schema.sql`
2. `supabase/migration_002_branches_modules_safe.sql`
3. `supabase/migration_003_sheet_alignment.sql`
4. `supabase/migration_004_fix_rls_recursion.sql`
5. `supabase/migration_005_expense_links.sql`
6. `supabase/migration_006_sales_item_nullable.sql`
7. `supabase/migration_007_sales_amount_nullable.sql`
8. `supabase/migration_008_backup_restore.sql` (only needed to use **Restore**; downloading a backup works without it)
9. `supabase/migration_009_entry_log_names.sql` (lets staff see names in profiles; harmless to run)
10. `supabase/migration_010_employee_profile_link.sql` (links a login to an employee record for the staff "My Account" page)

## Excel import / export

- **Export** is on every module. **Import** is on Sales and Expenses.
- The importer finds the header row itself, so the `demo001.xlsx` template (with "FOR SALES" / "FOR EXPENSES" title rows) works as-is, and so does the Google-Form `Master_Sheet.xlsx`.
- Re-importing the same file is safe: rows already in the system are skipped.
- Imports by an Admin/SuperAdmin are marked approved automatically; imports by anyone else wait for approval and only accept rows for their own branch.
- Expenses follow three rules, both when added by hand and when imported:
  - **Credit** payment mode adds a bill to the creditor with that Party Name (created if new).
  - **Cash/Bank** to a Party Name that already exists as a creditor adds a payment, reducing what you owe.
  - **Advance Salary** adds a salary advance for that employee (Payroll → Salary advances), deducted from their next payroll run. Admin imports create missing employees at ₹0 salary — set the salary under Payroll → Employees.

## Approvals, staff access and the entry log

- **Totals count approved entries only.** A Sales or Expenses entry stays out of every total (page header and Overview) until a superior approves it. Rejected entries never count.
- **Plain staff (role "user")** have three tabs: **Sales**, **Expenses** and **My Account**. Other pages send them back to Sales.
  - On Sales and Expenses they see **only the entries they entered that are still waiting for approval** (rejected ones also stay visible, marked "rejected", so they know to re-enter). Once a superior approves an entry it disappears from their list.
  - They see **no log** (who entered / approved), **no totals** (Sales: no header total, Total column or live total; Expenses: no header total) and **no Export**.
  - **My Account** shows the total advance they have taken, how much of it is still to be deducted, each advance, and their salary deductions per month (advance recovered, food bill, missing bill, bank, PF, shoes, fine, uniform). Advances still waiting for approval aren't counted. **Sign out lives here** — there is no sign-out button elsewhere for staff.
  - To show a person their own figures, link their login to their employee record under **Admin → Staff → Employee record** (needs migration 010). If you don't, the app falls back to an employee with exactly the same name.
- **Entry log** (everyone above staff): each Sales/Expenses row has a Log column — *Entered by* (name and time) and *Approved/Rejected by* (name and time), or "Awaiting approval". Exports include the same names.
- A **superuser** can approve entries for their own branch but not ones they entered themselves; Admin/SuperAdmin can approve any.
- **Sign out on phones:** for everyone except plain staff, a top bar with the signed-in name and a Sign out button appears on mobile.

## Backup & Restore (Admin → Backup & Restore)

- **Download full backup** (Admin and SuperAdmin) saves one Excel file: a `README` sheet plus one sheet for every table — branches, staff, employees, sales, expenses, drawings, creditors and their bills/payments, attendance, payroll runs, salary advances. It pages past Supabase's 1,000-row limit, so nothing is cut off.
- **Restore** (SuperAdmin only) reads that same file back. You see a preview with row counts first. Rows that are missing are **added**, rows that already exist are **updated** to the backup's values, and **nothing is ever deleted** — so running it twice is harmless.
- Restoring needs `supabase/migration_008_backup_restore.sql` run once. It lets a SuperAdmin insert/update rows that other staff created (the normal rules only let people insert their own). Nobody else gets new powers, and it doesn't allow deleting.
- **Not in the file:** login accounts (Supabase Auth owns those) and the receipt photos (only their links are saved). If you restore into a brand-new project, staff must sign up again; their old entries are attributed to the SuperAdmin doing the restore.
- The file can be opened in Excel, but don't rename sheets or column headings. Columns Excel/Postgres calculate themselves (`channel_total`, `hours`, `net`) are ignored on restore.
- The same file format is understood by the **offline version** of the app, so you can move data between the two.

## Overview analytics

The four "this month" cards at the top always stay fixed to the current month (per your earlier preference). Below them is a separate **Analytics** section with its own controls:
- Period: This month / a specific month / a specific year / all time
- Branch filter (Admin/SuperAdmin only — everyone else sees their own branch)
- A Sales-vs-Expenses trend chart (daily within a month, monthly otherwise)
- Sales-by-channel and top-expense-category breakdowns
- A per-branch Sales vs Expenses comparison (shown when an Admin/SuperAdmin has "All branches" selected)
- Largest outstanding creditors, and a pending-approvals summary with links to each module

Everything in this section is computed in the browser from data already loaded, so changing the period or branch is instant — no reloading.
