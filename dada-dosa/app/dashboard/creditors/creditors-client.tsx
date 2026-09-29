"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_MODES, fmtINR, type Branch } from "@/lib/constants";
import { exportToExcel } from "@/lib/excel";
import { NoBranchNotice } from "../no-branch-notice";

export type Creditor = { id: string; name: string; contact: string | null; opening_balance: number; created_at: string };
export type CreditorTx = {
  id: string;
  creditor_id: string;
  date: string;
  type: "bill" | "payment";
  amount: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  created_by: string;
  branch_id: string | null;
  profiles: { full_name: string } | null;
  branches: { name: string } | null;
};

export function CreditorsClient({
  creditors,
  transactions,
  role,
  userId,
  userBranchId,
  branches,
  canPickBranch,
}: {
  creditors: Creditor[];
  transactions: CreditorTx[];
  role: string;
  userId: string;
  userBranchId: string | null;
  branches: Branch[];
  canPickBranch: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const canManageMaster = ["admin", "superadmin"].includes(role);
  const canApprove = ["superuser", "admin", "superadmin"].includes(role);
  const canDelete = role === "superadmin";
  const noBranch = !canPickBranch && !userBranchId;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNewCreditor, setShowNewCreditor] = useState(false);
  const [newCreditor, setNewCreditor] = useState({ name: "", contact: "", opening_balance: "0" });
  const [txForm, setTxForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "bill" as "bill" | "payment",
    amount: "",
    note: "",
    branch_id: userBranchId ?? (branches[0]?.id ?? ""),
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const balances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of creditors) map[c.id] = Number(c.opening_balance);
    for (const t of transactions) {
      if (t.status === "rejected") continue;
      map[t.creditor_id] = (map[t.creditor_id] ?? 0) + (t.type === "bill" ? Number(t.amount) : -Number(t.amount));
    }
    return map;
  }, [creditors, transactions]);

  const totalOwed = Object.values(balances).reduce((a, b) => a + b, 0);

  async function addCreditor(e: React.FormEvent) {
    e.preventDefault();
    if (!newCreditor.name) return;
    const { error } = await supabase.from("creditors").insert({
      name: newCreditor.name,
      contact: newCreditor.contact || null,
      opening_balance: Number(newCreditor.opening_balance || 0),
      created_by: userId,
    });
    if (error) { setError(error.message); return; }
    setNewCreditor({ name: "", contact: "", opening_balance: "0" });
    setShowNewCreditor(false);
    router.refresh();
  }

  async function addTx(creditorId: string) {
    setError(null);
    if (!txForm.amount || !txForm.branch_id) return;
    setSubmitting(true);
    const { error } = await supabase.from("creditor_transactions").insert({
      creditor_id: creditorId,
      date: txForm.date,
      type: txForm.type,
      amount: Number(txForm.amount),
      note: txForm.note || null,
      branch_id: txForm.branch_id,
      created_by: userId,
    });
    setSubmitting(false);
    if (error) { setError(error.message); return; }
    setTxForm({ ...txForm, amount: "", note: "" });
    router.refresh();
  }

  async function setStatus(id: string, status: "approved" | "rejected") {
    await supabase.from("creditor_transactions").update({ status, approved_by: userId }).eq("id", id);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this transaction? This can't be undone.")) return;
    await supabase.from("creditor_transactions").delete().eq("id", id);
    router.refresh();
  }

  function handleExport() {
    const rows = transactions.map(t => ({
      Date: t.date,
      Creditor: creditors.find(c => c.id === t.creditor_id)?.name ?? "",
      Type: t.type,
      Amount: Number(t.amount),
      Branch: t.branches?.name ?? "",
      Note: t.note ?? "",
      Status: t.status,
    }));
    exportToExcel(rows, `creditors-export-${new Date().toISOString().slice(0, 10)}`);
  }

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-5xl">
      <header className="flex items-baseline justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-cream">Creditors</h1>
          <p className="text-muted text-sm mt-1">{creditors.length} suppliers</p>
        </div>
        <p className="font-mono text-lg text-gold">{fmtINR(totalOwed)} owed</p>
      </header>

      {noBranch && <NoBranchNotice />}
      <div className="flex justify-end mb-3">
        <button onClick={handleExport} className="btn-ghost text-sm">Export</button>
      </div>

      {canManageMaster && (
        <div className="mb-6">
          {!showNewCreditor ? (
            <button onClick={() => setShowNewCreditor(true)} className="btn-ghost text-sm">+ Add creditor</button>
          ) : (
            <form onSubmit={addCreditor} className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <input value={newCreditor.name} onChange={e => setNewCreditor({ ...newCreditor, name: e.target.value })} placeholder="Supplier name" className="w-full" required />
              <input value={newCreditor.contact} onChange={e => setNewCreditor({ ...newCreditor, contact: e.target.value })} placeholder="Contact (optional)" className="w-full" />
              <input type="number" value={newCreditor.opening_balance} onChange={e => setNewCreditor({ ...newCreditor, opening_balance: e.target.value })} placeholder="Opening balance" className="w-full" />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1">Save</button>
                <button type="button" onClick={() => setShowNewCreditor(false)} className="btn-ghost">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
      {error && <p className="text-rust text-xs mb-4">{error}</p>}

      <div className="space-y-3">
        {creditors.length === 0 && <p className="text-muted text-sm">No creditors yet.</p>}
        {creditors.map(c => {
          const isOpen = expanded === c.id;
          const txs = transactions.filter(t => t.creditor_id === c.id);
          const balance = balances[c.id] ?? 0;
          return (
            <div key={c.id} className="card p-4">
              <button className="w-full flex items-center justify-between text-left" onClick={() => setExpanded(isOpen ? null : c.id)}>
                <div>
                  <p className="text-cream">{c.name}</p>
                  {c.contact && <p className="text-muted text-xs">{c.contact}</p>}
                </div>
                <p className={`font-mono ${balance > 0 ? "text-rust" : "text-leaf"}`}>{fmtINR(balance)}</p>
              </button>

              {isOpen && (
                <div className="mt-4 pt-4 border-t border-line">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 items-end">
                    <input type="date" value={txForm.date} onChange={e => setTxForm({ ...txForm, date: e.target.value })} className="w-full text-sm" />
                    {canPickBranch && (
                      <select value={txForm.branch_id} onChange={e => setTxForm({ ...txForm, branch_id: e.target.value })} className="w-full text-sm">
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    )}
                    <select value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value as "bill" | "payment" })} className="w-full text-sm">
                      <option value="bill">Bill (owe more)</option>
                      <option value="payment">Payment (paid down)</option>
                    </select>
                    <input type="number" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} placeholder="Amount" className="w-full text-sm" />
                    <input value={txForm.note} onChange={e => setTxForm({ ...txForm, note: e.target.value })} placeholder="Note" className="w-full text-sm" />
                    <button onClick={() => addTx(c.id)} disabled={submitting || noBranch} className="btn-primary text-sm col-span-2 md:col-span-1 disabled:opacity-50">
                      {submitting ? "Adding…" : "Add"}
                    </button>
                  </div>

                  <table className="w-full text-sm">
                    <tbody>
                      {txs.length === 0 && <tr><td className="text-muted text-xs py-2">No transactions yet.</td></tr>}
                      {txs.map(t => (
                        <tr key={t.id} className="border-t border-line/60">
                          <td className="py-2 pr-2 text-muted whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                          <td className="py-2 pr-2">
                            <span className={t.type === "bill" ? "text-rust" : "text-leaf"}>{t.type === "bill" ? "Bill" : "Payment"}</span>
                            {canPickBranch && <span className="text-muted text-xs ml-2">({t.branches?.name ?? "—"})</span>}
                          </td>
                          <td className="py-2 pr-2 text-cream text-xs">{t.note}</td>
                          <td className="py-2 pr-2 text-right font-mono">{fmtINR(Number(t.amount))}</td>
                          <td className="py-2 pr-2"><StatusBadge status={t.status} /></td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {canApprove && t.status === "pending" && (
                              <>
                                <button onClick={() => setStatus(t.id, "approved")} className="text-leaf text-xs mr-2 hover:underline">Approve</button>
                                <button onClick={() => setStatus(t.id, "rejected")} className="text-rust text-xs mr-2 hover:underline">Reject</button>
                              </>
                            )}
                            {canDelete && <button onClick={() => remove(t.id)} className="text-muted text-xs hover:text-rust hover:underline">Delete</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
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
