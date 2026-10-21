"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildInsights } from "@/lib/analytics/insights";
import { fmtDate } from "@/lib/analytics/dates";
import { loadReports, type ReportsData } from "@/lib/analytics/reports-data";
import { sumBranches } from "@/lib/analytics/queries";
import { cashFlowSummary, categoryMatrix, metricRows, pnlRows, weekdayMatrix } from "@/lib/analytics/report-calc";
import { useGlobalFilters } from "@/lib/analytics/use-filters";
import type { Branch } from "@/lib/constants";
import { FiltersBar } from "../smart/filters-bar";
import { EmptyNote, SectionError, Skeleton } from "../smart/ui";
import { CashFlowView } from "./cashflow-view";
import { CompareView } from "./compare-view";
import { InsightsView } from "./insights-view";
import { PatternsView } from "./patterns-view";
import { PnlView } from "./pnl-view";
import { SuppliersView } from "./suppliers-view";

type Tab = "insights" | "pnl" | "branches" | "patterns" | "cash" | "suppliers";
const TAB_LABEL: Record<Tab, string> = { insights: "What changed", pnl: "Profit & loss", branches: "Branches", patterns: "Patterns", cash: "Cash flow", suppliers: "Suppliers" };

type Props = { role: "admin" | "superadmin" | "superuser"; branches: Branch[]; ownBranchId: string | null; ownBranchName: string | null };

export default function ReportsClient({ role, branches, ownBranchId, ownBranchName }: Props) {
  const isOwner = role === "admin" || role === "superadmin";
  const sb = useMemo(() => createClient(), []);
  const f = useGlobalFilters(branches.map(b => b.id), isOwner ? null : ownBranchId);
  const [tab, setTab] = useState<Tab>("insights");
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  const tabs: Tab[] = isOwner ? ["insights", "pnl", "branches", "patterns", "cash", "suppliers"] : ["insights", "pnl", "patterns", "cash"];

  useEffect(() => {
    if (!f.hydrated) return;
    const id = ++latest.current;
    setLoading(true);
    loadReports(sb, { preset: f.preset, range: f.range, compare: f.compare, branchId: f.branchId, isOwner })
      .then(d => { if (id === latest.current) setData(d); })
      .finally(() => { if (id === latest.current) setLoading(false); });
  }, [sb, f.hydrated, f.preset, f.range, f.compare, f.branchId, isOwner, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  const names = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);
  const scoped = <T extends { branch_id: string | null }>(rows: T[]) => (f.branchId ? rows.filter(r => r.branch_id === f.branchId) : rows);

  const insights = useMemo(() => data?.cur.data && data.prev.data ? buildInsights({
    cur: data.cur.data, prev: data.prev.data, names, selectedBranch: f.branchId, compareLabel: f.compare.label,
    weekday: data.weekday.data, catCur: data.catCur.data, catPrev: data.catPrev.data,
    payroll: data.payroll.data ? { applicable: data.payroll.data.applicable, processed: data.payroll.data.processed, cost: f.branchId ? data.payroll.data.byBranch.get(f.branchId) ?? 0 : data.payroll.data.total } : null,
  }) : null, [data, names, f.branchId, f.compare.label]);

  const pnl = useMemo(() => {
    if (!data?.cur.data || !data.payroll.data) return null;
    const p = data.payroll.data;
    return pnlRows(scoped(data.cur.data), names, p.applicable && p.processed ? p.byBranch : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, names, f.branchId]);

  const section = (err: string | null | undefined, what: string, ready: boolean, node: () => React.ReactNode) =>
    !data ? <Skeleton className="h-48" /> : err ? <SectionError what={what} onRetry={refresh} detail={err} /> : ready ? node() : <Skeleton className="h-48" />;

  const unmigrated = data && !data.cur.data && /does not exist|could not find the function|schema cache|permission denied/i.test(data.cur.error ?? "");

  return (
    <div className="w-full max-w-[1760px]">
      <Link href="/dashboard" className="text-xs text-muted hover:text-cream inline-flex items-center min-h-[44px]">← Back to overview</Link>
      <h1 className="font-display text-[28px] tracking-tight text-cream">Reports</h1>
      <p className="text-sm text-muted mt-1">{isOwner ? (f.branchId ? `${names.get(f.branchId) ?? "One branch"}` : "All branches") : ownBranchName ?? "Your branch"} · {fmtDate(f.range.from)}{f.range.from !== f.range.to ? ` to ${fmtDate(f.range.to)}` : ""}</p>

      <FiltersBar preset={f.preset} onPreset={f.setPreset} range={f.range} custom={f.custom} onCustom={f.setCustom}
        branches={branches} branchId={f.branchId} onBranch={f.setBranchId} showBranchPicker={isOwner} stickyClass={isOwner ? "top-0" : "top-[3.25rem] md:top-0"} />

      {unmigrated ? (
        <div className="card p-4 mt-4 border-[#F2C14E]/40" role="alert">
          <p className="text-sm text-[#F2C14E]">Reports aren&apos;t set up in the database yet.</p>
          <p className="text-xs text-muted mt-1">Ask the person who manages the app to run the latest database updates (migrations 016, 017 and 018).</p>
        </div>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto mt-4 border-b border-line" role="tablist" aria-label="Report">
            {tabs.map(t => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`shrink-0 min-h-[48px] px-3.5 text-sm border-b-2 -mb-px ${tab === t ? "border-gold text-cream font-semibold" : "border-transparent text-muted hover:text-cream"}`}>{TAB_LABEL[t]}</button>
            ))}
          </div>

          <div className={`mt-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            {tab === "insights" && (
              <>
                <p className="text-xs text-muted mb-3">Compared with {f.compare.label} ({fmtDate(f.compare.from)}{f.compare.from !== f.compare.to ? ` to ${fmtDate(f.compare.to)}` : ""}).</p>
                {section(data?.cur.error ?? data?.prev.error, "what changed", !!insights, () => <InsightsView insights={insights ?? []} compareLabel={f.compare.label} hasComparison={sumBranches(scoped(data?.prev.data ?? [])).sales_total > 0} />)}
              </>
            )}
            {tab === "pnl" && section(data?.cur.error ?? data?.payroll.error, "the profit and loss", !!pnl && !!data?.payroll.data, () => pnl && data?.payroll.data && (
              pnl.total.sales === 0 && pnl.total.running === 0
                ? <EmptyNote title="No approved sales or expenses in this period" hint="Pick a longer period, or approve the entries that are waiting." href="/dashboard" action="See what is waiting" />
                : <PnlView rows={pnl.rows} total={pnl.total} payroll={{ applicable: data.payroll.data.applicable, processed: data.payroll.data.processed }} />
            ))}
            {tab === "branches" && section(data?.cur.error ?? data?.prev.error, "the branch comparison", !!data?.cur.data && !!data?.prev.data, () => data?.cur.data && data.prev.data && (
              <CompareView build={m => metricRows(m, data.cur.data ?? [], data.prev.data ?? [], names)} compareLabel={f.compare.label} onPick={f.setBranchId} picked={f.branchId} />
            ))}
            {tab === "patterns" && section(data?.weekday.error ?? data?.catByBranch.error, "the patterns", !!data?.weekday.data && !!data?.catByBranch.data, () => data?.weekday.data && data.catByBranch.data && (
              <PatternsView weekday={weekdayMatrix(data.weekday.data, names, f.branchId)} categories={categoryMatrix(f.branchId ? data.catByBranch.data.filter(r => r.branch_id === f.branchId) : data.catByBranch.data, names)} />
            ))}
            {tab === "cash" && section(data?.cur.error ?? data?.cashOut.error, "the cash flow", !!data?.cur.data && !!data?.cashOut.data, () => data?.cur.data && data.cashOut.data && (
              <CashFlowView s={cashFlowSummary(sumBranches(scoped(data.cur.data)), data.cashOut.data)} />
            ))}
            {tab === "suppliers" && isOwner && section(data?.ageing?.error, "the supplier ageing", !!data?.ageing?.data, () => data?.ageing?.data && <SuppliersView rows={data.ageing.data} />)}
          </div>
          <p className="text-[11px] text-muted mt-8 mb-4">Approved entries only. Switch the period or branch above and every report follows.</p>
        </>
      )}
    </div>
  );
}
