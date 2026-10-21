import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBranchSummaryRange, getCashFlowOut, getCategoryByBranch, getCreditorAgeing, getExpenseCategoryRange,
  getPayrollCostSummary, getWeekdayBranchSales, type Result,
} from "./queries";
import { payrollPeriodsFor } from "./overview-data";
import type { CompareRange, DateRange, RangePreset } from "./dates";
import type {
  BranchRangeSummary, CashFlowRow, CategoryBranchAmount, CreditorAgeing, ExpenseCategoryTotal, WeekdayBranchSales,
} from "./types";

export type PayrollByBranch = { applicable: boolean; processed: boolean; byBranch: Map<string | null, number>; total: number };

export type ReportsData = {
  cur: Result<BranchRangeSummary[]>;
  prev: Result<BranchRangeSummary[]>;
  catCur: Result<ExpenseCategoryTotal[]>;
  catPrev: Result<ExpenseCategoryTotal[]>;
  catByBranch: Result<CategoryBranchAmount[]>;
  weekday: Result<WeekdayBranchSales[]>;
  cashOut: Result<CashFlowRow[]>;
  payroll: Result<PayrollByBranch>;
  ageing: Result<CreditorAgeing[]> | null; // owners only
};

async function safe<T>(p: Promise<Result<T>>): Promise<Result<T>> {
  try { return await p; } catch (e) { return { data: null, error: e instanceof Error ? e.message : "Something went wrong" }; }
}

export async function loadReports(
  sb: SupabaseClient,
  o: { preset: RangePreset; range: DateRange; compare: CompareRange; branchId: string | null; isOwner: boolean }
): Promise<ReportsData> {
  const periods = payrollPeriodsFor(o.preset, o.range);
  const [cur, prev, catCur, catPrev, catByBranch, weekday, cashOut, payrollRaw, ageing] = await Promise.all([
    safe(getBranchSummaryRange(sb, o.range.from, o.range.to)),
    safe(getBranchSummaryRange(sb, o.compare.from, o.compare.to)),
    safe(getExpenseCategoryRange(sb, o.range.from, o.range.to, o.branchId)),
    safe(getExpenseCategoryRange(sb, o.compare.from, o.compare.to, o.branchId)),
    safe(getCategoryByBranch(sb, o.range.from, o.range.to)),
    safe(getWeekdayBranchSales(sb, o.range.from, o.range.to)),
    safe(getCashFlowOut(sb, o.range.from, o.range.to, o.branchId)),
    periods ? safe(getPayrollCostSummary(sb, periods.from, periods.to)) : Promise.resolve(null),
    o.isOwner ? safe(getCreditorAgeing(sb)) : Promise.resolve(null),
  ]);

  const payroll: ReportsData["payroll"] =
    payrollRaw === null ? { data: { applicable: false, processed: false, byBranch: new Map(), total: 0 }, error: null }
      : payrollRaw.data ? (() => {
          const byBranch = new Map<string | null, number>();
          for (const r of payrollRaw.data) byBranch.set(r.branch_id, (byBranch.get(r.branch_id) ?? 0) + r.payroll_cost);
          return { data: { applicable: true, processed: payrollRaw.data.some(r => r.payroll_runs > 0), byBranch, total: [...byBranch.values()].reduce((a, b) => a + b, 0) }, error: null };
        })()
        : { data: null, error: payrollRaw.error };

  return { cur, prev, catCur, catPrev, catByBranch, weekday, cashOut, payroll, ageing };
}
