import type { BranchRangeSummary, CashFlowRow, CategoryBranchAmount, WeekdayBranchSales } from "./types";

// Pure calculations behind the Reports screens (no database, easy to test).

export type PnlRow = {
  id: string | null; name: string;
  sales: number; running: number; before: number;
  salaries: number | null;   // null = not applicable / not processed
  after: number | null;
  marginPct: number | null;  // profit before salaries as % of sales
  drawings: number;
};

export function pnlRows(cur: BranchRangeSummary[], names: Map<string, string>, payrollByBranch: Map<string | null, number> | null): { rows: PnlRow[]; total: PnlRow } {
  const mk = (id: string | null, name: string, r: { s: number; e: number; d: number }, sal: number | null): PnlRow => {
    const before = r.s - r.e;
    return { id, name, sales: r.s, running: r.e, before, salaries: sal, after: sal === null ? null : before - sal, marginPct: r.s > 0 ? Math.round((before / r.s) * 1000) / 10 : null, drawings: r.d };
  };
  const rows = cur
    .filter(r => r.sales_total > 0 || r.expenses_operating > 0)
    .map(r => mk(r.branch_id, (r.branch_id && names.get(r.branch_id)) || "Unassigned", { s: r.sales_total, e: r.expenses_operating, d: r.expenses_drawing }, payrollByBranch ? payrollByBranch.get(r.branch_id) ?? 0 : null))
    .sort((a, b) => b.sales - a.sales);
  const sum = rows.reduce((a, r) => ({ s: a.s + r.sales, e: a.e + r.running, d: a.d + r.drawings, p: a.p + (r.salaries ?? 0) }), { s: 0, e: 0, d: 0, p: 0 });
  return { rows, total: mk(null, "All branches", sum, payrollByBranch ? sum.p : null) };
}

export type CashFlowSummary = {
  inTotal: number; channels: { name: string; v: number }[];
  paid: { running: number; salaries: number; drawings: number; suppliers: number };
  paidTotal: number;
  onCredit: number;   // bought on credit, not paid yet
  net: number;        // money in - money paid out
  cashPaid: number; bankPaid: number;
};

/** Cash/Bank = money that left. Credit = bought now, paid later. */
export function cashFlowSummary(totals: { swiggy: number; zomato: number; upi: number; cash: number }, out: CashFlowRow[]): CashFlowSummary {
  const paid = { running: 0, salaries: 0, drawings: 0, suppliers: 0 };
  let onCredit = 0, cashPaid = 0, bankPaid = 0;
  for (const r of out) {
    if (r.payment_mode === "Credit") { onCredit += r.amount; continue; }
    if (r.payment_mode === "Cash") cashPaid += r.amount; else bankPaid += r.amount;
    if (r.kind === "operating") paid.running += r.amount;
    else if (r.kind === "payroll") paid.salaries += r.amount;
    else if (r.kind === "drawing") paid.drawings += r.amount;
    else paid.suppliers += r.amount;
  }
  const paidTotal = paid.running + paid.salaries + paid.drawings + paid.suppliers;
  const channels = [{ name: "Swiggy", v: totals.swiggy }, { name: "Zomato", v: totals.zomato }, { name: "UPI", v: totals.upi }, { name: "Cash", v: totals.cash }];
  const inTotal = channels.reduce((a, c) => a + c.v, 0);
  return { inTotal, channels, paid, paidTotal, onCredit, net: inTotal - paidTotal, cashPaid, bankPaid };
}

export type WeekdayMatrix = { overall: (number | null)[]; rows: { id: string | null; name: string; avg: (number | null)[] }[] };

/** Average sales per trading day, for each weekday (index 0 = Monday ... 6 = Sunday). */
export function weekdayMatrix(rows: WeekdayBranchSales[], names: Map<string, string>, selected: string | null): WeekdayMatrix {
  const per = new Map<string | null, { s: number[]; d: number[] }>();
  const all = { s: Array(7).fill(0) as number[], d: Array(7).fill(0) as number[] };
  for (const r of rows) {
    if (r.dow < 1 || r.dow > 7) continue;
    const x = per.get(r.branch_id) ?? { s: Array(7).fill(0), d: Array(7).fill(0) };
    x.s[r.dow - 1] += r.sales_total; x.d[r.dow - 1] += r.days; per.set(r.branch_id, x);
    if (!selected || r.branch_id === selected) { all.s[r.dow - 1] += r.sales_total; all.d[r.dow - 1] += r.days; }
  }
  const avg = (s: number[], d: number[]) => s.map((v, i) => (d[i] > 0 ? v / d[i] : null));
  return {
    overall: avg(all.s, all.d),
    rows: [...per.entries()].map(([id, x]) => ({ id, name: (id && names.get(id)) || "Unassigned", avg: avg(x.s, x.d) }))
      .sort((a, b) => Math.max(...b.avg.map(v => v ?? 0)) - Math.max(...a.avg.map(v => v ?? 0))),
  };
}

export type CategoryMatrix = { columns: string[]; rows: { id: string | null; name: string; total: number; share: number[] }[] };

/** Each branch's running costs split into the top categories (+ Other), as % of that branch's total. */
export function categoryMatrix(rows: CategoryBranchAmount[], names: Map<string, string>, topN = 5): CategoryMatrix {
  const op = rows.filter(r => r.kind === "operating");
  const byCat = new Map<string, number>();
  for (const r of op) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([c]) => c);
  const hasOther = byCat.size > top.length;
  const columns = hasOther ? [...top, "Other"] : top;
  const per = new Map<string | null, number[]>();
  for (const r of op) {
    const v = per.get(r.branch_id) ?? Array(columns.length).fill(0);
    const idx = top.indexOf(r.category);
    v[idx >= 0 ? idx : columns.length - 1] += r.amount;
    per.set(r.branch_id, v);
  }
  return {
    columns,
    rows: [...per.entries()].map(([id, v]) => {
      const total = v.reduce((a, b) => a + b, 0);
      return { id, name: (id && names.get(id)) || "Unassigned", total, share: v.map(x => (total > 0 ? (x / total) * 100 : 0)) };
    }).filter(r => r.total > 0).sort((a, b) => b.total - a.total),
  };
}

export type CompareMetric = "sales" | "perDay" | "profit" | "costRatio";
export const METRIC_LABEL: Record<CompareMetric, string> = { sales: "Sales", perDay: "Average per day", profit: "Profit (before salaries)", costRatio: "Costs as % of sales" };

export type MetricRow = { id: string | null; name: string; value: number; prev: number | null };

/** One number per branch for the chosen comparison. For costRatio, lower is better. */
export function metricRows(metric: CompareMetric, cur: BranchRangeSummary[], prev: BranchRangeSummary[], names: Map<string, string>): MetricRow[] {
  const val = (r: BranchRangeSummary): number | null =>
    metric === "sales" ? r.sales_total
    : metric === "perDay" ? (r.sales_days > 0 ? r.sales_total / r.sales_days : null)
    : metric === "profit" ? r.sales_total - r.expenses_operating
    : r.sales_total > 0 ? (r.expenses_operating / r.sales_total) * 100 : null;
  const prevMap = new Map(prev.map(r => [r.branch_id, val(r)]));
  return cur
    .map(r => ({ r, v: val(r) }))
    .filter((x): x is { r: BranchRangeSummary; v: number } => x.v !== null && (x.r.sales_total > 0 || x.r.expenses_operating > 0))
    .map(x => ({ id: x.r.branch_id, name: (x.r.branch_id && names.get(x.r.branch_id)) || "Unassigned", value: x.v, prev: prevMap.get(x.r.branch_id) ?? null }))
    .sort((a, b) => (metric === "costRatio" ? a.value - b.value : b.value - a.value));
}
