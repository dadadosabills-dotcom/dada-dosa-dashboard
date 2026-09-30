"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtINR, type Branch } from "@/lib/constants";
import { exportToExcel, parseSheetTable, pickField, pickRaw, toDateString, toNumber, makeBranchResolver } from "@/lib/excel";
import { insertInChunks, bump, describeProblems } from "@/lib/bulk";
import { NoBranchNotice } from "../no-branch-notice";

export type Sale = {
  id: string;
  date: string;
  swiggy: number;
  zomato: number;
  upi: number;
  cash: number;
  channel_total: number;
  status: "pending" | "approved" | "rejected";
  created_by: string;
  branch_id: string | null;
  profiles: { full_name: string } | null;
  branches: { name: string } | null;
};

const saleKey = (s: { date: string; branch_id: string | null; swiggy: any; zomato: any; upi: any; cash: any }) =>
  `${s.date}|${s.branch_id}|${Number(s.swiggy)}|${Number(s.zomato)}|${Number(s.upi)}|${Number(s.cash)}`;

export function SalesClient({
  initialSales,
  role,
  userId,
  userBranchId,
  branches,
  canPickBranch,
}: {
  initialSales: Sale[];
  role: string;
  userId: string;
  userBranchId: string | null;
  branches: Branch[];
  canPickBranch: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const canApprove = ["superuser", "admin", "superadmin"].includes(role);
  const canDelete = role === "superadmin";
  const noBranch = !canPickBranch && !userBranchId;

  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    swiggy: "",
    zomato: "",
    upi: "",
    cash: "",
    branch_id: userBranchId ?? (branches[0]?.id ?? ""),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string[] | null>(null);

  const visible = useMemo(
    () => (branchFilter === "all" ? initialSales : initialSales.filter(s => s.branch_id === branchFilter)),
    [initialSales, branchFilter]
  );
  const total = visible.filter(s => s.status !== "rejected").reduce((a, b) => a + Number(b.channel_total), 0);
  const formTotal = (Number(form.swiggy) || 0) + (Number(form.zomato) || 0) + (Number(form.upi) || 0) + (Number(form.cash) || 0);

  async function addSale(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.branch_id) return;
    if (formTotal <= 0) {
      setError("Enter at least one channel amount above zero.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("sales").insert({
      date: form.date,
      swiggy: Number(form.swiggy) || 0,
      zomato: Number(form.zomato) || 0,
      upi: Number(form.upi) || 0,
      cash: Number(form.cash) || 0,
      created_by: userId,
      branch_id: form.branch_id,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ ...form, swiggy: "", zomato: "", upi: "", cash: "" });
    router.refresh();
  }

  async function setStatus(id: string, status: "approved" | "rejected") {
    await supabase.from("sales").update({ status, approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this sales entry? This can't be undone.")) return;
    await supabase.from("sales").delete().eq("id", id);
    router.refresh();
  }

  function handleExport() {
    const rows = visible.map(s => ({
      Date: s.date,
      Branch: s.branches?.name ?? "",
      Swiggy: Number(s.swiggy),
      Zomato: Number(s.zomato),
      UPI: Number(s.upi),
      Cash: Number(s.cash),
      Total: Number(s.channel_total),
      Status: s.status,
    }));
    exportToExcel(rows, `sales-export-${new Date().toISOString().slice(0, 10)}`);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const { rows, headerFound } = await parseSheetTable(file, [["date"], ["swiggy", "zomato", "upi", "cash"]]);
      if (!headerFound) {
        setImportMsg(["Couldn't find the header row. The sheet needs these columns: Date, Branch, Swiggy, Zomato, UPI, Cash."]);
        setImporting(false);
        return;
      }

      const resolveBranch = makeBranchResolver(branches, canPickBranch, userBranchId);
      const problems = new Map<string, number>();
      const candidates: { date: string; branch_id: string; swiggy: number; zomato: number; upi: number; cash: number }[] = [];

      for (const row of rows) {
        const date = toDateString(pickRaw(row, "date"));
        if (!date) { bump(problems, "date missing or unreadable"); continue; }
        const swiggy = toNumber(pickRaw(row, "swiggy"));
        const zomato = toNumber(pickRaw(row, "zomato"));
        const upi = toNumber(pickRaw(row, "upi"));
        const cash = toNumber(pickRaw(row, "cash"));
        if (swiggy + zomato + upi + cash <= 0) { bump(problems, "all four amounts are zero"); continue; }
        const { id, problem } = resolveBranch(pickField(row, "branch"));
        if (!id) { bump(problems, problem ?? "branch problem"); continue; }
        candidates.push({ date, branch_id: id, swiggy, zomato, upi, cash });
      }

      // Skip rows already in the system, so importing the same file twice doesn't double the sales.
      const existingCount = new Map<string, number>();
      if (candidates.length) {
        const sorted = candidates.map(c => c.date).sort();
        const { data: existing } = await supabase
          .from("sales")
          .select("date, branch_id, swiggy, zomato, upi, cash")
          .gte("date", sorted[0])
          .lte("date", sorted[sorted.length - 1])
          .limit(5000);
        (existing ?? []).forEach((s: any) => existingCount.set(saleKey(s), (existingCount.get(saleKey(s)) ?? 0) + 1));
      }
      const approveNow = canPickBranch; // admin imports are historical records — no need to approve one by one
      const now = new Date().toISOString();
      const toInsert: any[] = [];
      let duplicates = 0;
      for (const c of candidates) {
        const k = saleKey(c);
        const n = existingCount.get(k) ?? 0;
        if (n > 0) { existingCount.set(k, n - 1); duplicates++; continue; }
        toInsert.push({
          ...c,
          created_by: userId,
          ...(approveNow ? { status: "approved", approved_by: userId, approved_at: now } : {}),
        });
      }

      const res = toInsert.length ? await insertInChunks(supabase, "sales", toInsert) : { inserted: 0, error: null };
      const lines = [`Imported ${res.inserted} of ${rows.length} rows${approveNow ? " (marked approved)" : " (waiting for approval)"}.`];
      if (duplicates) lines.push(`Skipped ${duplicates} that were already in the system.`);
      if (problems.size) lines.push(`Skipped because: ${describeProblems(problems)}.`);
      if (res.error) lines.push(`Stopped early: ${res.error}`);
      setImportMsg(lines);
      if (res.inserted) router.refresh();
    } catch (err: any) {
      setImportMsg([`Couldn't read that file: ${err?.message ?? err}`]);
    }
    setImporting(false);
  }

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-5xl">
      <header className="flex items-baseline justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-cream">Sales</h1>
          <p className="text-muted text-sm mt-1">{visible.length} daily entries</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canPickBranch && (
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="text-sm">
              <option value="all">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button onClick={handleExport} className="btn-ghost text-sm">Export</button>
          <label className={`btn-ghost text-sm ${noBranch || importing ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
            {importing ? "Importing…" : "Import"}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing || noBranch} className="hidden" />
          </label>
          <p className="font-mono text-lg text-gold">{fmtINR(total)}</p>
        </div>
      </header>

      {noBranch && <NoBranchNotice />}
      {importMsg && (
        <div className="card p-3 mb-4 text-xs text-muted space-y-1">
          {importMsg.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}

      <form onSubmit={addSale} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
        <div className="col-span-1">
          <label className="block text-[11px] text-muted mb-1">Date</label>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full" />
        </div>
        {canPickBranch && (
          <div className="col-span-1">
            <label className="block text-[11px] text-muted mb-1">Branch</label>
            <select value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })} className="w-full" required>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div className="col-span-1">
          <label className="block text-[11px] text-muted mb-1">Swiggy</label>
          <input type="number" step="0.01" min="0" value={form.swiggy} onChange={e => setForm({ ...form, swiggy: e.target.value })} placeholder="0" className="w-full" />
        </div>
        <div className="col-span-1">
          <label className="block text-[11px] text-muted mb-1">Zomato</label>
          <input type="number" step="0.01" min="0" value={form.zomato} onChange={e => setForm({ ...form, zomato: e.target.value })} placeholder="0" className="w-full" />
        </div>
        <div className="col-span-1">
          <label className="block text-[11px] text-muted mb-1">UPI</label>
          <input type="number" step="0.01" min="0" value={form.upi} onChange={e => setForm({ ...form, upi: e.target.value })} placeholder="0" className="w-full" />
        </div>
        <div className="col-span-1">
          <label className="block text-[11px] text-muted mb-1">Cash</label>
          <input type="number" step="0.01" min="0" value={form.cash} onChange={e => setForm({ ...form, cash: e.target.value })} placeholder="0" className="w-full" />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block text-[11px] text-muted mb-1">Total</label>
          <p className="font-mono text-cream py-2">{fmtINR(formTotal)}</p>
        </div>
        <div className="col-span-2 md:col-span-7">
          <button type="submit" disabled={submitting || noBranch} className="btn-primary w-full md:w-auto disabled:opacity-50">
            {submitting ? "Adding…" : "Add day's sales"}
          </button>
        </div>
        {error && <p className="col-span-full text-rust text-xs">{error}</p>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
              <th className="px-4 py-3 font-medium">Date</th>
              {canPickBranch && <th className="px-4 py-3 font-medium">Branch</th>}
              <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Swiggy</th>
              <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Zomato</th>
              <th className="px-4 py-3 font-medium text-right hidden md:table-cell">UPI</th>
              <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Cash</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted text-sm">No sales entries yet — add today's above.</td></tr>
            )}
            {visible.map(s => (
              <tr key={s.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(s.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                {canPickBranch && <td className="px-4 py-3 text-muted">{s.branches?.name ?? "—"}</td>}
                <td className="px-4 py-3 text-right font-mono text-muted hidden md:table-cell">{fmtINR(Number(s.swiggy))}</td>
                <td className="px-4 py-3 text-right font-mono text-muted hidden md:table-cell">{fmtINR(Number(s.zomato))}</td>
                <td className="px-4 py-3 text-right font-mono text-muted hidden md:table-cell">{fmtINR(Number(s.upi))}</td>
                <td className="px-4 py-3 text-right font-mono text-muted hidden md:table-cell">{fmtINR(Number(s.cash))}</td>
                <td className="px-4 py-3 text-right font-mono text-cream">{fmtINR(Number(s.channel_total))}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {canApprove && s.status === "pending" && (
                    <>
                      <button onClick={() => setStatus(s.id, "approved")} className="text-leaf text-xs mr-3 hover:underline">Approve</button>
                      <button onClick={() => setStatus(s.id, "rejected")} className="text-rust text-xs mr-3 hover:underline">Reject</button>
                    </>
                  )}
                  {canDelete && (
                    <button onClick={() => remove(s.id)} className="text-muted text-xs hover:text-rust hover:underline">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "text-gold bg-gold/10",
    approved: "text-leaf bg-leaf/10",
    rejected: "text-rust bg-rust/10",
  };
  return <span className={`text-[11px] px-2 py-0.5 rounded ${styles[status]}`}>{status}</span>;
}
