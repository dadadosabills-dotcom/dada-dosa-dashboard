"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { fmtINR, type Branch } from "@/lib/constants";

type Sale = { date: string; swiggy: number; zomato: number; upi: number; cash: number; channel_total: number; status: string; branch_id: string | null };
type Expense = { date: string; amount: number; category: string; status: string; branch_id: string | null };
type CreditorTx = { date: string; creditor_id: string; type: "bill" | "payment"; amount: number; status: string; branch_id: string | null };
type Drawing = { date: string; amount: number; status: string; branch_id: string | null };
type Creditor = { id: string; name: string };

const COLORS = { gold: "#E8C468", pink: "#C2185B", leaf: "#4A7C3E", rust: "#B3432B", cream: "#F6EFDD", muted: "#9A9284" };
const CHART_COLORS = [COLORS.gold, COLORS.pink, COLORS.leaf, "#7A9CC6", COLORS.rust, "#B08BC7", COLORS.muted, "#D98E5B"];
const notRejected = (s: string) => s !== "rejected";

type Period = "this-month" | "month" | "year" | "all";

function monthBounds(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);
  return [start, end];
}
function yearBounds(y: string): [string, string] {
  return [`${y}-01-01`, `${y}-12-31`];
}
function fmtMonthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}
function fmtDayLabel(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function OverviewClient({
  profileName, role, branchName, branches, canPickBranch, sales, expenses, creditorTx, drawings, creditors,
}: {
  profileName: string; role: string; branchName: string | null; branches: Branch[]; canPickBranch: boolean;
  sales: Sale[]; expenses: Expense[]; creditorTx: CreditorTx[]; drawings: Drawing[]; creditors: Creditor[];
}) {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const creditorName = useMemo(() => new Map(creditors.map(c => [c.id, c.name])), [creditors]);

  // ---------- Fixed "this month" cards (kept exactly as before) ----------
  const thisMonthSales = sales.filter(s => notRejected(s.status) && s.date >= thisMonthStart).reduce((a, b) => a + Number(b.channel_total), 0);
  const thisMonthExpenses = expenses.filter(e => notRejected(e.status) && e.date >= thisMonthStart).reduce((a, b) => a + Number(b.amount), 0);
  const thisMonthNet = thisMonthSales - thisMonthExpenses;
  const owedNow = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of creditorTx) {
      if (!notRejected(t.status)) continue;
      map.set(t.creditor_id, (map.get(t.creditor_id) ?? 0) + (t.type === "bill" ? Number(t.amount) : -Number(t.amount)));
    }
    return [...map.values()].reduce((a, b) => a + b, 0);
  }, [creditorTx]);

  const fixedCards = [
    { label: "Sales this month", value: fmtINR(thisMonthSales) },
    { label: "Expenses this month", value: fmtINR(thisMonthExpenses) },
    { label: thisMonthNet >= 0 ? "Net profit" : "Net loss", value: fmtINR(Math.abs(thisMonthNet)), accent: thisMonthNet >= 0 ? "text-leaf" : "text-rust" },
    { label: "Owed to creditors", value: fmtINR(owedNow) },
  ];

  // ---------- Pending approvals (not date-scoped — always show everything waiting) ----------
  const pending = {
    sales: sales.filter(s => s.status === "pending").length,
    expenses: expenses.filter(e => e.status === "pending").length,
    creditors: creditorTx.filter(t => t.status === "pending").length,
    drawings: drawings.filter(d => d.status === "pending").length,
  };
  const totalPending = pending.sales + pending.expenses + pending.creditors + pending.drawings;
  const canApprove = ["superuser", "admin", "superadmin"].includes(role);

  // ---------- Top outstanding creditors (current, all-time) ----------
  const topCreditors = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of creditorTx) {
      if (!notRejected(t.status)) continue;
      map.set(t.creditor_id, (map.get(t.creditor_id) ?? 0) + (t.type === "bill" ? Number(t.amount) : -Number(t.amount)));
    }
    return [...map.entries()]
      .map(([id, balance]) => ({ name: creditorName.get(id) ?? "Unknown", balance }))
      .filter(c => c.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
  }, [creditorTx, creditorName]);

  // ================= Analytics section (interactive) =================
  const [period, setPeriod] = useState<Period>("this-month");
  const [selMonth, setSelMonth] = useState(now.toISOString().slice(0, 7));
  const [selYear, setSelYear] = useState(String(now.getFullYear()));
  const [branchFilter, setBranchFilter] = useState("all");

  const [rangeStart, rangeEnd]: [string | null, string | null] = useMemo(() => {
    if (period === "this-month") return [thisMonthStart, null];
    if (period === "month") return monthBounds(selMonth);
    if (period === "year") return yearBounds(selYear);
    return [null, null];
  }, [period, selMonth, selYear, thisMonthStart]);

  const inRange = (d: string) => (!rangeStart || d >= rangeStart) && (!rangeEnd || d <= rangeEnd);
  const inBranch = (b: string | null) => branchFilter === "all" || b === branchFilter;

  const fSales = useMemo(() => sales.filter(s => notRejected(s.status) && inRange(s.date) && inBranch(s.branch_id)), [sales, rangeStart, rangeEnd, branchFilter]);
  const fExpenses = useMemo(() => expenses.filter(e => notRejected(e.status) && inRange(e.date) && inBranch(e.branch_id)), [expenses, rangeStart, rangeEnd, branchFilter]);

  const salesTotal = fSales.reduce((a, b) => a + Number(b.channel_total), 0);
  const expenseTotal = fExpenses.reduce((a, b) => a + Number(b.amount), 0);
  const net = salesTotal - expenseTotal;
  const owedAsOf = useMemo(() => {
    const cutoff = rangeEnd ?? new Date().toISOString().slice(0, 10);
    const map = new Map<string, number>();
    for (const t of creditorTx) {
      if (!notRejected(t.status) || t.date > cutoff || !inBranch(t.branch_id)) continue;
      map.set(t.creditor_id, (map.get(t.creditor_id) ?? 0) + (t.type === "bill" ? Number(t.amount) : -Number(t.amount)));
    }
    return [...map.values()].reduce((a, b) => a + b, 0);
  }, [creditorTx, rangeEnd, branchFilter]);

  // Trend: daily when the window is a single month (or less), monthly otherwise
  const dailyGranularity = period === "this-month" || period === "month";
  const trendData = useMemo(() => {
    const buckets = new Map<string, { sales: number; expenses: number }>();
    const keyOf = (d: string) => (dailyGranularity ? d : d.slice(0, 7));
    for (const s of fSales) {
      const k = keyOf(s.date);
      const b = buckets.get(k) ?? { sales: 0, expenses: 0 };
      b.sales += Number(s.channel_total);
      buckets.set(k, b);
    }
    for (const e of fExpenses) {
      const k = keyOf(e.date);
      const b = buckets.get(k) ?? { sales: 0, expenses: 0 };
      b.expenses += Number(e.amount);
      buckets.set(k, b);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ label: dailyGranularity ? fmtDayLabel(k) : fmtMonthLabel(k), Sales: Math.round(v.sales), Expenses: Math.round(v.expenses) }));
  }, [fSales, fExpenses, dailyGranularity]);

  const channelData = useMemo(() => {
    const t = { Swiggy: 0, Zomato: 0, UPI: 0, Cash: 0 };
    for (const s of fSales) { t.Swiggy += Number(s.swiggy); t.Zomato += Number(s.zomato); t.UPI += Number(s.upi); t.Cash += Number(s.cash); }
    return Object.entries(t).map(([name, value]) => ({ name, value: Math.round(value) })).filter(d => d.value > 0);
  }, [fSales]);

  const categoryData = useMemo(() => {
    const t = new Map<string, number>();
    for (const e of fExpenses) t.set(e.category, (t.get(e.category) ?? 0) + Number(e.amount));
    const sorted = [...t.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 7).map(([name, value]) => ({ name, value: Math.round(value) }));
    const rest = sorted.slice(7).reduce((a, [, v]) => a + v, 0);
    if (rest > 0) top.push({ name: "Other", value: Math.round(rest) });
    return top;
  }, [fExpenses]);

  const branchCompare = useMemo(() => {
    if (!canPickBranch || branchFilter !== "all") return [];
    const byBranch = new Map<string, { sales: number; expenses: number }>();
    for (const s of fSales) {
      if (!s.branch_id) continue;
      const b = byBranch.get(s.branch_id) ?? { sales: 0, expenses: 0 };
      b.sales += Number(s.channel_total);
      byBranch.set(s.branch_id, b);
    }
    for (const e of fExpenses) {
      if (!e.branch_id) continue;
      const b = byBranch.get(e.branch_id) ?? { sales: 0, expenses: 0 };
      b.expenses += Number(e.amount);
      byBranch.set(e.branch_id, b);
    }
    const nameOf = new Map(branches.map(b => [b.id, b.name]));
    return [...byBranch.entries()]
      .map(([id, v]) => ({ name: nameOf.get(id) ?? "—", Sales: Math.round(v.sales), Expenses: Math.round(v.expenses) }))
      .sort((a, b) => b.Sales - a.Sales);
  }, [fSales, fExpenses, canPickBranch, branchFilter, branches]);

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-cream">Overview</h1>
        <p className="text-muted text-sm mt-1">
          Welcome back, {profileName.split(" ")[0]}.
          {branchName && <span className="text-gold"> — {branchName}</span>}
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {fixedCards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-[11px] text-muted uppercase tracking-wide">{c.label}</p>
            <p className={`font-mono text-xl mt-2 ${c.accent ?? "text-cream"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {canApprove && totalPending > 0 && (
        <div className="card p-4 mb-8">
          <p className="text-sm text-cream mb-2">{totalPending} entr{totalPending === 1 ? "y" : "ies"} pending your approval</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {pending.sales > 0 && <Link href="/dashboard/sales" className="text-gold hover:underline">Sales ({pending.sales})</Link>}
            {pending.expenses > 0 && <Link href="/dashboard/expenses" className="text-gold hover:underline">Expenses ({pending.expenses})</Link>}
            {pending.creditors > 0 && <Link href="/dashboard/creditors" className="text-gold hover:underline">Creditors ({pending.creditors})</Link>}
            {pending.drawings > 0 && <Link href="/dashboard/drawings" className="text-gold hover:underline">Drawings ({pending.drawings})</Link>}
          </div>
        </div>
      )}

      {/* ---------------- Analytics ---------------- */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-display text-lg text-cream">Analytics</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="text-sm">
            <option value="this-month">This month</option>
            <option value="month">Pick a month</option>
            <option value="year">Pick a year</option>
            <option value="all">All time</option>
          </select>
          {period === "month" && <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} className="text-sm" />}
          {period === "year" && (
            <input type="number" value={selYear} onChange={e => setSelYear(e.target.value)} className="text-sm w-24" min="2000" max="2100" />
          )}
          {canPickBranch && (
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="text-sm">
              <option value="all">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Sales" value={fmtINR(salesTotal)} />
        <StatCard label="Expenses" value={fmtINR(expenseTotal)} />
        <StatCard label={net >= 0 ? "Net profit" : "Net loss"} value={fmtINR(Math.abs(net))} accent={net >= 0 ? "text-leaf" : "text-rust"} />
        <StatCard label="Owed to creditors (as of period end)" value={fmtINR(owedAsOf)} />
      </div>

      {trendData.length > 0 ? (
        <div className="card p-4 mb-6">
          <p className="text-sm text-cream mb-3">Sales vs Expenses{dailyGranularity ? " (daily)" : " (monthly)"}</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.pink} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLORS.pink} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#332F27" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#9A9284" fontSize={11} tickLine={false} axisLine={{ stroke: "#332F27" }} />
              <YAxis stroke="#9A9284" fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "#161513", border: "1px solid #332F27", borderRadius: 4, fontSize: 12 }}
                labelStyle={{ color: "#F6EFDD" }}
                formatter={(v: number) => fmtINR(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9A9284" }} />
              <Area type="monotone" dataKey="Sales" stroke={COLORS.gold} fill="url(#salesGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Expenses" stroke={COLORS.pink} fill="url(#expGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card p-4 mb-6 text-center text-muted text-sm">No sales or expense data in this period yet.</div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-sm text-cream mb-3">Sales by channel</p>
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={channelData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {channelData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#161513", border: "1px solid #332F27", borderRadius: 4, fontSize: 12 }} formatter={(v: number) => fmtINR(v)} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#9A9284" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-muted text-sm text-center py-10">No sales in this period.</p>}
        </div>

        <div className="card p-4">
          <p className="text-sm text-cream mb-3">Top expense categories</p>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#332F27" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" stroke="#9A9284" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" stroke="#9A9284" fontSize={11} width={110} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#161513", border: "1px solid #332F27", borderRadius: 4, fontSize: 12 }} formatter={(v: number) => fmtINR(v)} />
                <Bar dataKey="value" fill={COLORS.pink} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-muted text-sm text-center py-10">No expenses in this period.</p>}
        </div>
      </div>

      {branchCompare.length > 0 && (
        <div className="card p-4 mb-6">
          <p className="text-sm text-cream mb-3">Sales vs Expenses by branch</p>
          <ResponsiveContainer width="100%" height={Math.max(220, branchCompare.length * 34)}>
            <BarChart data={branchCompare} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid stroke="#332F27" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="#9A9284" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="name" stroke="#9A9284" fontSize={11} width={90} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#161513", border: "1px solid #332F27", borderRadius: 4, fontSize: 12 }} formatter={(v: number) => fmtINR(v)} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#9A9284" }} />
              <Bar dataKey="Sales" fill={COLORS.gold} radius={[0, 3, 3, 0]} />
              <Bar dataKey="Expenses" fill={COLORS.pink} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {topCreditors.length > 0 && (
        <div className="card p-4">
          <p className="text-sm text-cream mb-3">Largest outstanding creditors (current)</p>
          <div className="space-y-2">
            {topCreditors.map(c => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span className="text-muted">{c.name}</span>
                <span className="font-mono text-rust">{fmtINR(c.balance)}</span>
              </div>
            ))}
          </div>
          <Link href="/dashboard/creditors" className="text-gold text-xs hover:underline mt-3 inline-block">View all creditors →</Link>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11px] text-muted uppercase tracking-wide">{label}</p>
      <p className={`font-mono text-xl mt-2 ${accent ?? "text-cream"}`}>{value}</p>
    </div>
  );
}