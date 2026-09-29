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

## Excel import / export

- **Export** is on every module. **Import** is on Sales and Expenses.
- The importer finds the header row itself, so the `demo001.xlsx` template (with "FOR SALES" / "FOR EXPENSES" title rows) works as-is, and so does the Google-Form `Master_Sheet.xlsx`.
- Re-importing the same file is safe: rows already in the system are skipped.
- Imports by an Admin/SuperAdmin are marked approved automatically; imports by anyone else wait for approval and only accept rows for their own branch.
- Expenses follow three rules, both when added by hand and when imported:
  - **Credit** payment mode adds a bill to the creditor with that Party Name (created if new).
  - **Cash/Bank** to a Party Name that already exists as a creditor adds a payment, reducing what you owe.
  - **Advance Salary** adds a salary advance for that employee (Payroll → Salary advances), deducted from their next payroll run. Admin imports create missing employees at ₹0 salary — set the salary under Payroll → Employees.
