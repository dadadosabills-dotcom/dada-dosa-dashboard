import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BackupStatus, BranchRangeSummary, CreditorAgeing, DailyBranchSummary, EntryState, ExpenseCategoryTotal, MissingEntry,
  MonthlyBranchSummary, PayrollCostSummary, PendingApproval, TodayEntry, UnusualExpense,
  CashFlowRow, CategoryBranchAmount, WeekdayBranchSales,
} from "./types";

// Typed helpers over the views and functions from migration 016.
// The database does the adding-up, so a phone downloads a handful of summary
// rows instead of thousands of entries. Every helper returns { data, error }
// and never throws, so a screen can show a friendly error state instead of crashing.

export type Result<T> = { data: T; error: null } | { data: null; error: string };

const ok = <T,>(data: T): Result<T> => ({ data, error: null });
const fail = <T,>(message: string): Result<T> => ({ data: null, error: message });

/** Postgres `numeric` can arrive as a string; make sure the named fields are real numbers. */
function numify<T>(row: Record<string, unknown>, keys: readonly string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
  return out as T;
}

const PAGE = 1000; // matches Supabase's usual per-request cap, so we never silently lose rows

/** Read every row of a query, page by page (summary tables are small, but never trust a cap). */
async function selectAll<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<Result<Row[]>> {
  const rows: Row[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return fail(error.message);
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return ok(rows);
}

const DAILY_NUM = ["sales_total", "swiggy", "zomato", "upi", "cash", "sales_entries", "sales_pending", "expenses_operating", "expenses_payroll", "expenses_drawing", "expenses_settlement", "expenses_all", "expenses_pending"] as const;
const MONTHLY_NUM = ["sales_total", "swiggy", "zomato", "upi", "cash", "days_with_sales", "expenses_operating", "expenses_payroll", "expenses_drawing", "expenses_settlement", "expenses_all", "avg_daily_sales", "expense_ratio_pct", "payroll_net", "payroll_cost", "payroll_pct_of_sales", "operating_profit", "profit_after_payroll"] as const;
const RANGE_NUM = ["sales_total", "swiggy", "zomato", "upi", "cash", "sales_entries", "sales_days", "expenses_operating", "expenses_payroll", "expenses_drawing", "expenses_settlement", "expenses_all"] as const;
const AGEING_NUM = ["total_outstanding", "bucket_0_30", "bucket_31_60", "bucket_61_plus", "oldest_open_days", "advance_paid"] as const;
const PAYROLL_NUM = ["payroll_runs", "payable_salary", "gross", "deductions", "advances_recovered", "payroll_net", "payroll_cost", "net_paid", "net_unpaid", "unpaid_runs"] as const;

/** Totals per branch for a date range. Pass branchId to look at one branch. */
export async function getBranchSummaryRange(sb: SupabaseClient, from: string, to: string, branchId?: string | null): Promise<Result<BranchRangeSummary[]>> {
  const { data, error } = await sb.rpc("branch_summary_range", { p_from: from, p_to: to, p_branch: branchId ?? null });
  if (error) return fail(error.message);
  return ok(((data ?? []) as Record<string, unknown>[]).map(r => numify<BranchRangeSummary>(r, RANGE_NUM)));
}

/** One row per branch per day (for trend lines). */
export async function getDailySummary(sb: SupabaseClient, from: string, to: string, branchId?: string | null): Promise<Result<DailyBranchSummary[]>> {
  const res = await selectAll<Record<string, unknown>>((a, b) => {
    let q = sb.from("daily_branch_summary").select("*").gte("date", from).lte("date", to).order("date").range(a, b);
    if (branchId) q = q.eq("branch_id", branchId);
    return q;
  });
  if (res.data === null) return fail(res.error);
  return ok(res.data.map(r => numify<DailyBranchSummary>(r, DAILY_NUM)));
}

/** One row per branch per month. fromMonth / toMonth are any date inside the first / last month wanted. */
export async function getMonthlySummary(sb: SupabaseClient, fromMonth: string, toMonth: string, branchId?: string | null): Promise<Result<MonthlyBranchSummary[]>> {
  const res = await selectAll<Record<string, unknown>>((a, b) => {
    let q = sb.from("monthly_branch_summary").select("*").gte("month", fromMonth.slice(0, 8) + "01").lte("month", toMonth.slice(0, 8) + "01").order("month").range(a, b);
    if (branchId) q = q.eq("branch_id", branchId);
    return q;
  });
  if (res.data === null) return fail(res.error);
  return ok(res.data.map(r => numify<MonthlyBranchSummary>(r, MONTHLY_NUM)));
}

/** Approved expenses grouped by category for a date range, biggest first. */
export async function getExpenseCategoryRange(sb: SupabaseClient, from: string, to: string, branchId?: string | null): Promise<Result<ExpenseCategoryTotal[]>> {
  const { data, error } = await sb.rpc("expense_by_category_range", { p_from: from, p_to: to, p_branch: branchId ?? null });
  if (error) return fail(error.message);
  return ok(((data ?? []) as Record<string, unknown>[]).map(r => numify<ExpenseCategoryTotal>(r, ["amount", "entries"])));
}

/** What you owe each supplier, by age. Owners only; other roles get an empty list. */
export async function getCreditorAgeing(sb: SupabaseClient): Promise<Result<CreditorAgeing[]>> {
  const res = await selectAll<Record<string, unknown>>((a, b) =>
    sb.from("creditor_ageing").select("*").order("total_outstanding", { ascending: false }).range(a, b)
  );
  if (res.data === null) return fail(res.error);
  return ok(res.data.map(r => numify<CreditorAgeing>(r, AGEING_NUM)));
}

/** Payroll cost per branch per month ('YYYY-MM'). */
export async function getPayrollCostSummary(sb: SupabaseClient, fromPeriod: string, toPeriod: string, branchId?: string | null): Promise<Result<PayrollCostSummary[]>> {
  const res = await selectAll<Record<string, unknown>>((a, b) => {
    let q = sb.from("payroll_cost_summary").select("*").gte("period", fromPeriod).lte("period", toPeriod).order("period").range(a, b);
    if (branchId) q = q.eq("branch_id", branchId);
    return q;
  });
  if (res.data === null) return fail(res.error);
  return ok(res.data.map(r => numify<PayrollCostSummary>(r, PAYROLL_NUM)));
}

/** Days (last 35) with no sales entry, for active branches. */
export async function getMissingEntries(sb: SupabaseClient, branchId?: string | null): Promise<Result<MissingEntry[]>> {
  const res = await selectAll<MissingEntry>((a, b) => {
    let q = sb.from("missing_entries").select("*").order("entry_date", { ascending: false }).range(a, b);
    if (branchId) q = q.eq("branch_id", branchId);
    return q;
  });
  return res;
}

/** Everything still waiting for approval, per module and branch. */
export async function getPendingApprovals(sb: SupabaseClient, branchId?: string | null): Promise<Result<PendingApproval[]>> {
  const { data, error } = await sb.rpc("pending_approvals", { p_branch: branchId ?? null });
  if (error) return fail(error.message);
  return ok(((data ?? []) as Record<string, unknown>[]).map(r => numify<PendingApproval>(r, ["pending_count"])));
}

/** Add up per-branch rows into one all-branches total. */
export function sumBranches(rows: BranchRangeSummary[]): Omit<BranchRangeSummary, "branch_id"> {
  const t = { sales_total: 0, swiggy: 0, zomato: 0, upi: 0, cash: 0, sales_entries: 0, sales_days: 0, expenses_operating: 0, expenses_payroll: 0, expenses_drawing: 0, expenses_settlement: 0, expenses_all: 0 };
  for (const r of rows) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r[k];
  return t;
}

// ---- Phase B (needs migration 017) ----

/** What you owed suppliers at the end of a given day (bills minus payments). */
export async function getCreditorBalanceAsOf(sb: SupabaseClient, date: string, branchId?: string | null): Promise<Result<number>> {
  const { data, error } = await sb.rpc("creditor_balance_asof", { p_date: date, p_branch: branchId ?? null });
  if (error) return fail(error.message);
  return ok(Number(data ?? 0));
}

/** Recent expenses far above what is normal for their branch and category. */
export async function getUnusualExpenses(sb: SupabaseClient): Promise<Result<UnusualExpense[]>> {
  const res = await selectAll<Record<string, unknown>>((a, b) =>
    sb.from("unusual_expenses").select("*").order("date", { ascending: false }).range(a, b)
  );
  if (res.data === null) return fail(res.error);
  return ok(res.data.map(r => numify<UnusualExpense>(r, ["amount", "typical_amount", "times_typical"])));
}

/** Nightly backup health. Owners only; returns null when nothing has been recorded. */
export async function getBackupStatus(sb: SupabaseClient): Promise<Result<BackupStatus | null>> {
  const { data, error } = await sb.from("backup_status").select("last_run_at, last_success_at, ok, message").eq("id", 1).maybeSingle();
  if (error) return fail(error.message);
  return ok((data as BackupStatus | null) ?? null);
}

function strongest(states: string[]): EntryState {
  // If a day has several rows, report the "most finished" one: approved > pending > rejected > none.
  if (states.includes("approved")) return "approved";
  if (states.includes("pending")) return "pending";
  if (states.includes("rejected")) return "rejected";
  return "none";
}

/** A staff member's own checklist: today's and yesterday's sales, today's expenses. */
export async function getTodayEntry(sb: SupabaseClient, branchId: string, today: string, yesterday: string): Promise<Result<TodayEntry>> {
  const [s, e] = await Promise.all([
    sb.from("sales").select("date, status, channel_total").eq("branch_id", branchId).in("date", [today, yesterday]),
    sb.from("expenses").select("amount, status").eq("branch_id", branchId).eq("date", today),
  ]);
  if (s.error) return fail(s.error.message);
  if (e.error) return fail(e.error.message);
  const sales = (s.data ?? []) as { date: string; status: string; channel_total: number }[];
  const todays = sales.filter(r => r.date === today);
  const exps = ((e.data ?? []) as { amount: number; status: string }[]).filter(r => r.status !== "rejected");
  return ok({
    today: {
      sales: strongest(todays.map(r => r.status)),
      salesAmount: todays.filter(r => r.status !== "rejected").reduce((a, r) => a + Number(r.channel_total), 0),
      expenseCount: exps.length,
      expenseTotal: exps.reduce((a, r) => a + Number(r.amount), 0),
    },
    yesterday: { sales: strongest(sales.filter(r => r.date === yesterday).map(r => r.status)) },
  });
}

// ---- Phase C (needs migration 018) ----

/** Sales by weekday and branch (dow 1 = Monday ... 7 = Sunday). */
export async function getWeekdayBranchSales(sb: SupabaseClient, from: string, to: string, branchId?: string | null): Promise<Result<WeekdayBranchSales[]>> {
  const { data, error } = await sb.rpc("weekday_branch_sales", { p_from: from, p_to: to, p_branch: branchId ?? null });
  if (error) return fail(error.message);
  return ok(((data ?? []) as Record<string, unknown>[]).map(r => numify<WeekdayBranchSales>(r, ["dow", "sales_total", "days"])));
}

/** Approved expenses by branch and category. */
export async function getCategoryByBranch(sb: SupabaseClient, from: string, to: string, branchId?: string | null): Promise<Result<CategoryBranchAmount[]>> {
  const { data, error } = await sb.rpc("expense_category_branch_range", { p_from: from, p_to: to, p_branch: branchId ?? null });
  if (error) return fail(error.message);
  return ok(((data ?? []) as Record<string, unknown>[]).map(r => numify<CategoryBranchAmount>(r, ["amount"])));
}

/** Money going out, by payment mode (Cash / Bank / Credit) and purpose. */
export async function getCashFlowOut(sb: SupabaseClient, from: string, to: string, branchId?: string | null): Promise<Result<CashFlowRow[]>> {
  const { data, error } = await sb.rpc("cash_flow_range", { p_from: from, p_to: to, p_branch: branchId ?? null });
  if (error) return fail(error.message);
  return ok(((data ?? []) as Record<string, unknown>[]).map(r => numify<CashFlowRow>(r, ["amount", "entries"])));
}
