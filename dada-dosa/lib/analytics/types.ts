// Typed shapes for the analytics views and functions created in migration 016.
// All money values are plain JS numbers (rupees). Rows are already filtered
// by the database to what the signed-in user is allowed to see.

/** One row per branch per day — view `daily_branch_summary`. */
export type DailyBranchSummary = {
  branch_id: string | null;
  date: string; // YYYY-MM-DD
  sales_total: number;
  swiggy: number;
  zomato: number;
  upi: number;
  cash: number;
  sales_entries: number;
  sales_pending: number;
  expenses_operating: number;   // everyday running costs
  expenses_payroll: number;     // categories Salary + Advance Salary
  expenses_drawing: number;     // category Drawing
  expenses_settlement: number;  // payments to suppliers for earlier Credit bills
  expenses_all: number;
  expenses_pending: number;
};

/** One row per branch per month — view `monthly_branch_summary`. */
export type MonthlyBranchSummary = {
  branch_id: string | null;
  month: string; // first day of month, YYYY-MM-DD
  sales_total: number;
  swiggy: number;
  zomato: number;
  upi: number;
  cash: number;
  days_with_sales: number;
  expenses_operating: number;
  expenses_payroll: number;
  expenses_drawing: number;
  expenses_settlement: number;
  expenses_all: number;
  avg_daily_sales: number | null;
  expense_ratio_pct: number | null;
  payroll_net: number;
  payroll_cost: number;
  payroll_pct_of_sales: number | null;
  operating_profit: number;       // sales - operating expenses
  profit_after_payroll: number;   // operating profit - payroll cost
};

/** Totals for a date range — RPC `branch_summary_range`. */
export type BranchRangeSummary = {
  branch_id: string | null;
  sales_total: number;
  swiggy: number;
  zomato: number;
  upi: number;
  cash: number;
  sales_entries: number;
  sales_days: number;
  expenses_operating: number;
  expenses_payroll: number;
  expenses_drawing: number;
  expenses_settlement: number;
  expenses_all: number;
};

export type ExpenseKind = "operating" | "payroll" | "drawing" | "settlement";

/** RPC `expense_by_category_range`. */
export type ExpenseCategoryTotal = {
  category: string;
  kind: ExpenseKind;
  amount: number;
  entries: number;
};

/** View `creditor_ageing` (admin / superadmin only). */
export type CreditorAgeing = {
  creditor_id: string;
  creditor_name: string;
  total_outstanding: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_plus: number;
  oldest_open_date: string | null;
  oldest_open_days: number | null;
  advance_paid: number; // paid more than billed
};

/** View `payroll_cost_summary`. */
export type PayrollCostSummary = {
  branch_id: string | null;
  period: string; // YYYY-MM
  payroll_runs: number;
  payable_salary: number;
  gross: number;
  deductions: number;
  advances_recovered: number;
  payroll_net: number;
  payroll_cost: number; // net + advances recovered
  net_paid: number;
  net_unpaid: number;
  unpaid_runs: number;
};

/** View `missing_entries` — a day with no sales entry for an active branch. */
export type MissingEntry = {
  branch_id: string;
  branch_name: string;
  entry_date: string;
  is_today: boolean;
};

export type PendingModule = "sales" | "expenses" | "creditors" | "drawings";

/** RPC `pending_approvals`. */
export type PendingApproval = {
  module: PendingModule;
  branch_id: string | null;
  pending_count: number;
  oldest_date: string | null;
};
