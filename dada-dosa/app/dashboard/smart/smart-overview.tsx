"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compareValues } from "@/lib/analytics/compare";
import { buildAttention } from "@/lib/analytics/attention";
import { fmtDate, type RangePreset } from "@/lib/analytics/dates";
import { fmtINRCompact, plural } from "@/lib/analytics/format";
import { loadOverview, type OverviewData } from "@/lib/analytics/overview-data";
import { sumBranches } from "@/lib/analytics/queries";
import { useGlobalFilters } from "@/lib/analytics/use-filters";
import { getFlags } from "@/lib/flags";
import { fmtINR, type Branch } from "@/lib/constants";
import { AttentionPanel } from "./attention-panel";
import { ChannelMix } from "./channel-mix";
import { FiltersBar } from "./filters-bar";
import { Leaderboard, type LeaderRow } from "./leaderboard";
import { PnlCard } from "./pnl-card";
import { TrendChart } from "./trend-chart";
import { EmptyNote, Kpi, KpiSkeletons, SectionError, SectionTitle, Skeleton } from "./ui";

const WHEN: Record<RangePreset, string> = {
  today: "today", yesterday: "yesterday", last7: "in the last 7 days", this_month: "this month",
  last_month: "last month", this_fy: "this financial year", custom: "in this period",
};

const istHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(d)) % 24;

type Props = {
  role: "admin" | "superadmin" | "superuser";
  name: string;
  branches: Branch[];
  ownBranchId: string | null;
  ownBranchName: string | null;
};

/** Role-aware home: owners see every branch; a branch head sees their own branch. */
export default function SmartOverview({ role, name, branches, ownBranchId, ownBranchName }: Props) {
  const isOwner = role === "admin" || role === "superadmin";
  const sb = useMemo(() => createClient(), []);
  const f = useGlobalFilters(branches.map(b => b.id), isOwner ? null : ownBranchId);

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [showReports, setShowReports] = useState(false);
  const latest = useRef(0);

  // The Reports button appears only when the `insights_reports` flag is on.
  useEffect(() => { getFlags(sb).then(fl => setShowReports(fl.insights_reports)); }, [sb]);

  useEffect(() => {
    if (!f.hydrated) return;
    const id = ++latest.current;
    setLoading(true);
    loadOverview(sb, { preset: f.preset, range: f.range, compare: f.compare, today: f.today, branchId: f.branchId, isOwner })
      .then(d => { if (id === latest.current) { setData(d); setUpdatedAt(new Date()); } })
      .finally(() => { if (id === latest.current) setLoading(false); });
  }, [sb, f.hydrated, f.preset, f.range, f.compare, f.today, f.branchId, isOwner, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  const nameOf = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);
  const when = WHEN[f.preset];
  const scopeName = f.branchId ? nameOf.get(f.branchId) ?? ownBranchName : null;
  const hello = (() => { const h = istHour(new Date()); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();

  // ---- numbers for the chosen branch + period ----
  const sel = <T extends { branch_id: string | null }>(rows: T[]) => (f.branchId ? rows.filter(r => r.branch_id === f.branchId) : rows);
  const totals = data?.summary.data ? { cur: sumBranches(sel(data.summary.data.cur)), prev: sumBranches(sel(data.summary.data.prev)) } : null;

  const pendingRows = data?.pending.data ? data.pending.data.filter(p => !f.branchId || p.branch_id === f.branchId) : null;
  const pendingCount = pendingRows ? pendingRows.reduce((a, r) => a + r.pending_count, 0) : null;
  const oldestPending = pendingRows?.reduce<string | null>((m, r) => (r.oldest_date && (!m || r.oldest_date < m) ? r.oldest_date : m), null) ?? null;
  const oldestDays = oldestPending ? Math.round((Date.parse(f.today) - Date.parse(oldestPending)) / 86400000) : 0;

  const attention = useMemo(() => {
    if (!data) return null;
    return buildAttention({
      today: f.today, hourIST: istHour(new Date()), nowMs: Date.now(), branchNames: nameOf, selectedBranch: f.branchId,
      pending: data.pending.data, missing: data.missing.data, unusual: data.unusual.data,
      ageing: data.ageing ? data.ageing.data : null,
      backup: data.backup ? data.backup.data : undefined,
    });
  }, [data, f.today, f.branchId, nameOf]);

  const leaderRows: LeaderRow[] = useMemo(() => {
    if (!data?.summary.data) return [];
    const prev = new Map(data.summary.data.prev.map(r => [r.branch_id, r.sales_total]));
    return data.summary.data.cur
      .filter(r => r.branch_id && nameOf.has(r.branch_id) && r.sales_total > 0)
      .map(r => ({ id: r.branch_id as string, name: nameOf.get(r.branch_id as string) as string, sales: r.sales_total, prev: prev.get(r.branch_id) ?? 0 }));
  }, [data, nameOf]);

  const looksUnmigrated = (e: string | null) => !!e && /does not exist|could not find the function|schema cache|permission denied/i.test(e);
  const setupProblem = data && !data.summary.data && looksUnmigrated(data.summary.error);

  return (
    <div className="max-w-5xl">
      <p className="text-xs text-muted">{fmtDate(f.today)}</p>
      <h1 className="font-display text-2xl text-cream mt-1">{hello}, {name.split(" ")[0]}</h1>
      <p className="text-sm text-muted mt-1">
        {isOwner ? (scopeName ? `How ${scopeName} is doing` : "How all your branches are doing") : `How ${ownBranchName ?? "your branch"} is doing`}
      </p>
      {showReports && (
        <Link href="/dashboard/reports" className="btn-ghost inline-block mt-3 min-h-[44px] leading-[26px]">Reports: what changed, profit &amp; loss, patterns →</Link>
      )}

      <FiltersBar
        preset={f.preset} onPreset={f.setPreset} range={f.range} custom={f.custom} onCustom={f.setCustom}
        branches={branches} branchId={f.branchId} onBranch={f.setBranchId} showBranchPicker={isOwner}
        stickyClass={isOwner ? "top-0" : "top-[3.25rem] md:top-0"}
      />

      {setupProblem ? (
        <div className="card p-4 mt-4 border-[#F2C14E]/40" role="alert">
          <p className="text-sm text-[#F2C14E]">The new overview isn&apos;t set up in the database yet.</p>
          <p className="text-xs text-muted mt-1">Ask the person who manages the app to run the latest database updates (migrations 016 and 017). Meanwhile you can use the classic view.</p>
          <Link href="/dashboard?view=classic" className="btn-primary inline-block mt-3 min-h-[44px] leading-[28px]">Open classic view</Link>
        </div>
      ) : (
        <>
          {/* ---------- headline numbers ---------- */}
          <SectionTitle hint={updatedAt ? `Updated ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(updatedAt)}` : undefined}>
            The numbers that matter
          </SectionTitle>
          {!data ? <KpiSkeletons /> : data.summary.error || !totals ? (
            <SectionError what="the totals" onRetry={refresh} detail={data.summary.error ?? undefined} />
          ) : (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
              <Kpi
                label={`Sales ${when}`} value={fmtINRCompact(totals.cur.sales_total)} fullValue={fmtINR(totals.cur.sales_total)}
                change={compareValues(totals.cur.sales_total, totals.prev.sales_total, f.compare.label, true)} href="/dashboard/sales"
              />
              <Kpi
                label={`Expenses ${when}`} value={fmtINRCompact(totals.cur.expenses_operating)} fullValue={fmtINR(totals.cur.expenses_operating)}
                change={compareValues(totals.cur.expenses_operating, totals.prev.expenses_operating, f.compare.label, false)} href="/dashboard/expenses"
              />
              {(() => {
                const profit = totals.cur.sales_total - totals.cur.expenses_operating;
                const prevProfit = totals.prev.sales_total - totals.prev.expenses_operating;
                return (
                  <Kpi
                    label={`${profit < 0 ? "Loss" : "Profit"} ${when} (before salaries)`} value={fmtINRCompact(Math.abs(profit))} fullValue={fmtINR(profit)}
                    change={compareValues(profit, prevProfit, f.compare.label, true)} href="#profit"
                  />
                );
              })()}
              {data.owed.data ? (
                <Kpi
                  label={isOwner && !f.branchId ? "You owe suppliers" : "You owe suppliers (this branch)"} value={fmtINRCompact(data.owed.data.now)} fullValue={fmtINR(data.owed.data.now)}
                  change={compareValues(data.owed.data.now, data.owed.data.before, `on ${fmtDate(f.compare.to)}`, false)}
                  href={isOwner ? "/dashboard/creditors" : undefined}
                />
              ) : <Kpi label="You owe suppliers" value="—" caption="Couldn't load this number" tone="warn" />}
              {pendingCount !== null ? (
                <Kpi
                  label="Waiting for approval" value={String(pendingCount)} href="#attention"
                  tone={pendingCount === 0 ? "good" : oldestDays >= 3 ? "bad" : "warn"}
                  caption={pendingCount === 0 ? "Nothing waiting" : oldestDays >= 1 ? `Oldest has waited ${plural(oldestDays, "day", "days")}` : "All entered today"}
                />
              ) : <Kpi label="Waiting for approval" value="—" caption="Couldn't load this number" tone="warn" />}
            </div>
          )}

          {/* ---------- needs attention ---------- */}
          <SectionTitle hint="Counts everything, not just this period">Needs your attention</SectionTitle>
          {!data ? <Skeleton className="h-24" /> : <AttentionPanel items={attention ?? []} />}

          {/* ---------- trend ---------- */}
          <SectionTitle hint={data?.trend.data ? `${fmtDate(data.trend.data.from)} to ${fmtDate(data.trend.data.to)}` : undefined}>Sales each day</SectionTitle>
          {!data ? <Skeleton className="h-[214px]" /> : data.trend.error ? <SectionError what="the sales chart" onRetry={refresh} /> :
            data.trend.data && data.trend.data.points.some(p => p.sales > 0) ? <TrendChart points={data.trend.data.points} /> :
            <EmptyNote title="No sales entered for these days" hint="Once sales are entered and approved, the daily line shows here." href="/dashboard/sales" action="Enter sales" />}

          {/* ---------- leaderboard (owners, all-branch view) ---------- */}
          {isOwner && (
            <>
              <SectionTitle hint="Tap a branch to look at only that branch">Which branches sell the most {when}</SectionTitle>
              {!data ? <Skeleton className="h-40" /> : data.summary.error ? <SectionError what="the branch ranking" onRetry={refresh} /> :
                leaderRows.length > 0 ? <Leaderboard rows={leaderRows} selectedId={f.branchId} onSelect={f.setBranchId} compareLabel={f.compare.label} /> :
                <EmptyNote title="No approved sales in this period" hint="Pick a longer period, or approve the sales entries that are waiting." href="#attention" action="See what is waiting" />}
            </>
          )}

          {/* ---------- profit snapshot ---------- */}
          <div id="profit" />
          <SectionTitle hint={scopeName ?? (isOwner ? "All branches" : undefined)}>Profit snapshot {when}</SectionTitle>
          {!data || !totals ? <Skeleton className="h-56" /> : data.payroll.error ? <SectionError what="the profit snapshot" onRetry={refresh} /> : data.payroll.data && (
            <PnlCard sales={totals.cur.sales_total} running={totals.cur.expenses_operating} drawings={totals.cur.expenses_drawing} payroll={data.payroll.data} />
          )}

          {/* ---------- channel mix ---------- */}
          {totals && totals.cur.sales_total > 0 && (
            <>
              <SectionTitle>Where the sales come from</SectionTitle>
              <ChannelMix swiggy={totals.cur.swiggy} zomato={totals.cur.zomato} upi={totals.cur.upi} cash={totals.cur.cash} />
            </>
          )}

          <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <button onClick={refresh} className="btn-ghost min-h-[44px]" disabled={loading}>{loading ? "Refreshing…" : "Refresh numbers"}</button>
            <Link href="/dashboard?view=classic" className="underline underline-offset-2 hover:text-cream min-h-[44px] inline-flex items-center">Use the classic overview</Link>
          </div>
        </>
      )}
    </div>
  );
}
