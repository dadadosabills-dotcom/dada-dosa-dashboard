"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtINR, type Branch } from "@/lib/constants";
import { NoBranchNotice } from "../no-branch-notice";
import { exportToExcel } from "@/lib/excel";

export type Drawing = {
  id: string;
  date: string;
  owner_name: string;
  amount: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_by: string;
  branch_id: string | null;
  profiles: { full_name: string } | null;
  branches: { name: string } | null;
};

export function DrawingsClient({
  initialDrawings,
  role,
  userId,
  userBranchId,
  branches,
  canPickBranch,
}: {
  initialDrawings: Drawing[];
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
    owner_name: "",
    amount: "",
    note: "",
    branch_id: userBranchId ?? (branches[0]?.id ?? ""),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => (branchFilter === "all" ? initialDrawings : initialDrawings.filter(d => d.branch_id === branchFilter)),
    [initialDrawings, branchFilter]
  );
  const total = visible.filter(d => d.status !== "rejected").reduce((a, b) => a + Number(b.amount), 0);

  const byOwner = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of visible) {
      if (d.status === "rejected") continue;
      map[d.owner_name] = (map[d.owner_name] ?? 0) + Number(d.amount);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [visible]);

  async function addDrawing(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.owner_name || !form.amount || !form.branch_id) return;
    setSubmitting(true);
    const { error } = await supabase.from("drawings").insert({
      date: form.date,
      owner_name: form.owner_name,
      amount: Number(form.amount),
      note: form.note || null,
      created_by: userId,
      branch_id: form.branch_id,
    });
    setSubmitting(false);
    if (error) { setError(error.message); return; }
    setForm({ ...form, amount: "", note: "" });
    router.refresh();
  }

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { data } = await supabase.from("drawings").update({ status, approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id).select("source_expense_id");
    // A drawing created from an expense: keep that expense (and anything it created) in step.
    const src = data?.[0]?.source_expense_id as string | null | undefined;
    if (src) {
      await supabase.from("expenses").update({ status, approved_by: userId, approved_at: new Date().toISOString() }).eq("id", src);
      await supabase.from("creditor_transactions").update({ status, approved_by: userId }).eq("source_expense_id", src);
    }
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this drawing record? This can't be undone.")) return;
    await supabase.from("drawings").delete().eq("id", id);
    router.refresh();
  }

  function handleExport() {
    const rows = visible.map(d => ({
      Date: d.date,
      Owner: d.owner_name,
      Amount: Number(d.amount),
      Branch: d.branches?.name ?? "",
      Note: d.note ?? "",
      Status: d.status,
    }));
    exportToExcel(rows, `drawings-export-${new Date().toISOString().slice(0, 10)}`);
  }

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-5xl">
      <header className="flex items-baseline justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-cream">Drawings</h1>
          <p className="text-muted text-sm mt-1">{visible.length} records</p>
        </div>
        <div className="flex items-center gap-3">
          {canPickBranch && (
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="text-sm">
              <option value="all">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <p className="font-mono text-lg text-pink">{fmtINR(total)}</p>
        </div>
      </header>

      {noBranch && <NoBranchNotice />}
      <div className="flex justify-end mb-3">
        <button onClick={handleExport} className="btn-ghost text-sm">Export</button>
      </div>

      {byOwner.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {byOwner.map(([name, amt]) => (
            <div key={name} className="card px-3 py-2 text-sm">
              <span className="text-cream">{name}</span>
              <span className="text-muted ml-2 font-mono">{fmtINR(amt)}</span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addDrawing} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
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
        <div className="col-span-2">
          <label className="block text-[11px] text-muted mb-1">Owner name</label>
          <input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} placeholder="Who took it" className="w-full" required />
        </div>
        <div className="col-span-1">
          <label className="block text-[11px] text-muted mb-1">Amount</label>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="w-full" required />
        </div>
        <div className="col-span-1">
          <label className="block text-[11px] text-muted mb-1">Note</label>
          <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Optional" className="w-full" />
        </div>
        <div className="col-span-2 md:col-span-1">
          <button type="submit" disabled={submitting || noBranch} className="btn-primary w-full disabled:opacity-50">
            {submitting ? "Adding…" : "Add"}
          </button>
        </div>
        {error && <p className="col-span-full text-rust text-xs">{error}</p>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              {canPickBranch && <th className="px-4 py-3 font-medium hidden md:table-cell">Branch</th>}
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">No drawings yet.</td></tr>
            )}
            {visible.map(d => (
              <tr key={d.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                <td className="px-4 py-3 text-cream">{d.owner_name}{d.note && <p className="text-muted text-xs mt-0.5">{d.note}</p>}</td>
                {canPickBranch && <td className="px-4 py-3 text-muted hidden md:table-cell">{d.branches?.name ?? "—"}</td>}
                <td className="px-4 py-3 text-right font-mono text-cream">{fmtINR(Number(d.amount))}</td>
                <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {canApprove && d.status === "pending" && (
                    <>
                      <button onClick={() => setStatus(d.id, "approved")} className="text-leaf text-xs mr-3 hover:underline">Approve</button>
                      <button onClick={() => setStatus(d.id, "rejected")} className="text-rust text-xs mr-3 hover:underline">Reject</button>
                    </>
                  )}
                  {canDelete && <button onClick={() => remove(d.id)} className="text-muted text-xs hover:text-rust hover:underline">Delete</button>}
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
