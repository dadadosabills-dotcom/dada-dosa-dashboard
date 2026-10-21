import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBackupStatus, getBranchSummaryRange, getCreditorAgeing, getCreditorBalanceAsOf, getDailySummary, getMissingEntries,
  getPayrollCostSummary, getPendingApprovals, getUnusualExpenses, type Result,
} from "./queries";
import { addDays, daysInRange, periodOf, type CompareRange, type DateRange, type RangePreset, type YMD } from "./dates";
import type { BackupStatus, BranchRangeSummary, CreditorAgeing, MissingEntry, PendingApproval, UnusualExpense } from "./types";

export type TrendPoint = { date: YMD; sales: number };
export type PayrollPart = { applicable: boolean; cost: number; processed: boolean };

export type OverviewData = {
  summary: Result<{ cur: BranchRangeSummary[]; prev: BranchRangeSummary[] }>;
  owed: Result<{ now: number; before: number }>;
  pending: Result<PendingApproval[]>;
  trend: Result<{ points: TrendPoint[]; from: YMD; to: YMD }>;
  payroll: Result<PayrollPart>;
  missing: Result<MissingEntry[]>;
  unusual: Result<UnusualExpense[]>;
  ageing: Result<CreditorAgeing[]> | null;   // owners only
  backup: Result<BackupStatus | null> | null; // owners only
};

/** A failed request becomes a normal "error" result, so one broken section never blanks the page. */
async function safe<T>(p: Promise<Result<T>>): Promise<Result<T>> {
  try { return await p; } catch (e) { return { data: null, error: e instanceof Error ? e.message : "Something went wrong" }; }
}

/** The payroll months that fully correspond to the chosen range, or null when salaries can't be fairly split by day. */
export function payrollPeriodsFor(preset: RangePreset, range: DateRange): { from: string; to: string } | null {
  if (preset === "this_month" || preset === "last_month") return { from: periodOf(range.from), to: periodOf(range.from) };
  if (preset === "this_fy") return { from: periodOf(range.from), to: periodOf(range.to) };
  return null;
}

/** Trend window: at least 14 days, at most 31, ending where the range ends. */
export function trendWindow(range: DateRange): DateRange {
  const n = daysInRange(range);
  if (n < 14) return { from: addDays(range.to, -13), to: range.to };
  if (n > 31) return { from: addDays(range.to, -30), to: range.to };
  return range;
}

export async function loadOverview(
  sb: SupabaseClient,
  o: { preset: RangePreset; range: DateRange; compare: CompareRange; today: YMD; branchId: string | null; isOwner: boolean }
): Promise<OverviewData> {
  const tw = trendWindow(o.range);
  const periods = payrollPeriodsFor(o.preset, o.range);

  const [summaryCur, summaryPrev, owedNow, owedBefore, pending, trend, payroll, missing, unusual, ageing, backup] = await Promise.all([
    safe(getBranchSummaryRange(sb, o.range.from, o.range.to)),
    safe(getBranchSummaryRange(sb, o.compare.from, o.compare.to)),
    safe(getCreditorBalanceAsOf(sb, o.today, o.branchId)),
    safe(getCreditorBalanceAsOf(sb, o.compare.to, o.branchId)),
    safe(getPendingApprovals(sb)),
    safe(getDailySummary(sb, tw.from, tw.to, o.branchId)),
    periods ? safe(getPayrollCostSummary(sb, periods.from, periods.to, o.branchId)) : Promise.resolve(null),
    safe(getMissingEntries(sb)),
    safe(getUnusualExpenses(sb)),
    o.isOwner ? safe(getCreditorAgeing(sb)) : Promise.resolve(null),
    o.isOwner ? safe(getBackupStatus(sb)) : Promise.resolve(null),
  ]);

  const summary: OverviewData["summary"] =
    summaryCur.data && summaryPrev.data ? { data: { cur: summaryCur.data, prev: summaryPrev.data }, error: null }
      : { data: null, error: summaryCur.error ?? summaryPrev.error ?? "Could not load totals" };

  const owed: OverviewData["owed"] =
    owedNow.data !== null && owedBefore.data !== null ? { data: { now: owedNow.data, before: owedBefore.data }, error: null }
      : { data: null, error: owedNow.error ?? owedBefore.error ?? "Could not load supplier balance" };

  const trendOut: OverviewData["trend"] = trend.data
    ? (() => {
        const byDate = new Map<string, number>();
        for (const r of trend.data) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.sales_total);
        const points: TrendPoint[] = [];
        for (let d = tw.from; d <= tw.to; d = addDays(d, 1)) points.push({ date: d, sales: byDate.get(d) ?? 0 });
        return { data: { points, from: tw.from, to: tw.to }, error: null };
      })()
    : { data: null, error: trend.error };

  const payrollOut: OverviewData["payroll"] =
    payroll === null ? { data: { applicable: false, cost: 0, processed: false }, error: null }
      : payroll.data ? { data: { applicable: true, cost: payroll.data.reduce((a, r) => a + r.payroll_cost, 0), processed: payroll.data.some(r => r.payroll_runs > 0) }, error: null }
        : { data: null, error: payroll.error };

  return { summary, owed, pending, trend: trendOut, payroll: payrollOut, missing, unusual, ageing, backup };
}
