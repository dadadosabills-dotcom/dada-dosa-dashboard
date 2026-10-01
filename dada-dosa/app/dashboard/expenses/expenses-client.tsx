"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EntryLog } from "../entry-log";
import { EXPENSE_CATEGORIES, PAYMENT_MODES, fmtINR, type Branch } from "@/lib/constants";
import { exportToExcel, parseSheetTable, pickField, pickRaw, toDateString, toNumber, makeBranchResolver, norm } from "@/lib/excel";
import { insertInChunks, bump, describeProblems } from "@/lib/bulk";
import { syncExpenseSideEffects, describeSync, type SyncExpense } from "@/lib/expense-sync";
import { NoBranchNotice } from "../no-branch-notice";

export type Expense = {
  id: string;
  date: string;
  particulars: string | null;
  vendor: string;
  category: string;
  note: string | null;
  amount: number;
  payment_mode: string;
  bank_name: string | null;
  gst_bill: boolean;
  receipt_url: string | null;
  voucher_number: string | null;
  status: "pending" | "approved" | "rejected";
  created_by: string;
  branch_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string | null;
  profiles: { full_name: string } | null;
  approver: { full_name: string } | null;
  branches: { name: string } | null;
};

type Employee = { id: string; name: string; branch_id: string | null };

const expenseKey = (e: { date: string; vendor: string; amount: any; branch_id: string | null; category: string }) =>
  `${e.date}|${norm(e.vendor)}|${Number(e.amount)}|${e.branch_id}|${norm(e.category)}`;

function matchCategory(raw: string): string {
  const k = norm(raw);
  if (!k) return "Uncategorised";
  return EXPENSE_CATEGORIES.find(c => norm(c) === k) ?? raw.replace(/\s+/g, " ").trim();
}
function matchMode(raw: string): string {
  const k = norm(raw);
  if (!k) return "Cash";
  return PAYMENT_MODES.find(m => norm(m) === k) ?? raw.trim();
}

export function ExpensesClient({
  initialExpenses,
  role,
  userId,
  userBranchId,
  branches,
  canPickBranch,
  employees,
}: {
  initialExpenses: Expense[];
  role: string;
  userId: string;
  userBranchId: string | null;
  branches: Branch[];
  canPickBranch: boolean;
  employees: Employee[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const canApprove = ["superuser", "admin", "superadmin"].includes(role);
  // A superuser can't approve an expense they entered themselves.
  const canApproveRow = (e: Expense) => canApprove && (role !== "superuser" || e.created_by !== userId);
  const canDelete = role === "superadmin";
  const isStaff = role === "user"; // staff: no log, no totals, only their own waiting entries
  const noBranch = !canPickBranch && !userBranchId;

  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    particulars: "",
    vendor: "",
    category: EXPENSE_CATEGORIES[0],
    note: "",
    amount: "",
    payment_mode: "Cash",
    bank_name: "",
    gst_bill: false,
    voucher_number: "",
    employee_id: "",
    branch_id: userBranchId ?? (branches[0]?.id ?? ""),
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string[] | null>(null);

  const branchName = useMemo(() => new Map(branches.map(b => [b.id, b.name])), [branches]);
  const visible = useMemo(
    () => (branchFilter === "all" ? initialExpenses : initialExpenses.filter(e => e.branch_id === branchFilter)),
    [initialExpenses, branchFilter]
  );
  const total = visible.filter(e => e.status === "approved").reduce((a, b) => a + Number(b.amount), 0);
  const isAdvance = form.category === "Advance Salary";
  const selectedEmployee = employees.find(e => e.id === form.employee_id);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const vendor = isAdvance ? (selectedEmployee?.name ?? "") : form.vendor.trim();
    if (!form.particulars || !vendor || !form.amount || !form.branch_id) return;
    if (isAdvance && !form.employee_id) {
      setError("Pick which employee this advance is for — it's what shows up under Payroll → Salary advances.");
      return;
    }
    setSubmitting(true);

    let receipt_url: string | null = null;
    if (receiptFile) {
      const path = `${form.branch_id}/${Date.now()}-${receiptFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from("receipts").upload(path, receiptFile);
      if (uploadError) {
        setSubmitting(false);
        setError(`Receipt upload failed: ${uploadError.message}`);
        return;
      }
      receipt_url = supabase.storage.from("receipts").getPublicUrl(uploadData.path).data.publicUrl;
    }

    const id = crypto.randomUUID();
    const amount = Number(form.amount);
    const { error: insertError } = await supabase.from("expenses").insert({
      id,
      date: form.date,
      particulars: form.particulars,
      vendor,
      category: form.category,
      note: form.note || null,
      amount,
      payment_mode: form.payment_mode,
      bank_name: form.payment_mode === "Bank" ? (form.bank_name || null) : null,
      gst_bill: form.gst_bill,
      voucher_number: form.voucher_number || null,
      receipt_url,
      created_by: userId,
      branch_id: form.branch_id,
    });

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    // Credit -> creditor bill; Cash/Bank to an existing creditor -> payment; Advance Salary -> Payroll advance
    const sync = await syncExpenseSideEffects(
      supabase,
      [{ id, date: form.date, vendor, category: form.category, particulars: form.particulars, amount, payment_mode: form.payment_mode, branch_id: form.branch_id, employee_id: form.employee_id || null }],
      { userId, canCreateEmployees: canPickBranch, approve: false }
    );
    const lines = describeSync(sync);
    setInfo(["Saved.", ...lines]);

    setSubmitting(false);
    setForm({ ...form, particulars: "", vendor: "", note: "", amount: "", voucher_number: "", gst_bill: false, employee_id: "" });
    setReceiptFile(null);
    router.refresh();
  }

  async function setStatus(id: string, status: "approved" | "rejected") {
    await supabase.from("expenses").update({ status, approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
    // keep any creditor bill/payment this expense created in step with it
    await supabase.from("creditor_transactions").update({ status, approved_by: userId }).eq("source_expense_id", id);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this expense? Any creditor entry or salary advance it created is deleted too. This can't be undone.")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) setError(error.message);
    router.refresh();
  }

  function handleExport() {
    const rows = visible.map(exp => ({
      Date: exp.date,
      Particulars: exp.particulars ?? "",
      "Party Name": exp.vendor,
      Regarding: exp.category,
      Amount: Number(exp.amount),
      Branch: exp.branches?.name ?? "",
      "Payment Mode": exp.payment_mode,
      "Bank Name": exp.bank_name ?? "",
      Remarks: exp.note ?? "",
      "Voucher No.": exp.voucher_number ?? "",
      "GST Bill": exp.gst_bill ? "Yes" : "No",
      Status: exp.status,
      "Entered by": exp.profiles?.full_name ?? "",
      "Approved / rejected by": exp.approver?.full_name ?? "",
      "Approved / rejected at": exp.approved_at ?? "",
    }));
    exportToExcel(rows, `expenses-export-${new Date().toISOString().slice(0, 10)}`);
  }

  async function handleImport(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const { rows, headerFound } = await parseSheetTable(file, [["date"], ["party name", "vendor"], ["amount"]]);
      if (!headerFound) {
        setImportMsg(["Couldn't find the header row. The sheet needs these columns: Date, Particulars, Party Name, Regarding, Amount, Branch, Payment Mode (and optionally Bank Name, Remarks, Voucher No., Bill/Voucher, GST Bill)."]);
        setImporting(false);
        return;
      }

      const resolveBranch = makeBranchResolver(branches, canPickBranch, userBranchId);
      const problems = new Map<string, number>();
      const candidates: any[] = [];

      for (const row of rows) {
        const date = toDateString(pickRaw(row, "date"));
        if (!date) { bump(problems, "date missing or unreadable"); continue; }
        const vendor = pickField(row, "party name", "vendor").replace(/\s+/g, " ");
        if (!vendor) { bump(problems, "party name is blank"); continue; }
        const amount = toNumber(pickRaw(row, "amount"));
        if (!(amount > 0)) { bump(problems, "amount is blank or zero"); continue; }
        const { id: branch_id, problem } = resolveBranch(pickField(row, "branch"));
        if (!branch_id) { bump(problems, problem ?? "branch problem"); continue; }

        const payment_mode = matchMode(pickField(row, "payment mode"));
        const link = pickField(row, "bill/voucher", "receipt", "receipt link");
        const gst = norm(pickField(row, "gst bill", "gst"));
        candidates.push({
          date,
          particulars: pickField(row, "particulars") || vendor,
          vendor,
          category: matchCategory(pickField(row, "regarding", "category")),
          note: pickField(row, "remarks", "note") || null,
          amount,
          payment_mode,
          bank_name: norm(payment_mode) === "bank" ? (pickField(row, "bank name") || null) : null,
          gst_bill: gst === "yes" || gst === "true" || gst === "y",
          voucher_number: pickField(row, "voucher no.", "voucher no", "voucher number") || null,
          receipt_url: /^https?:\/\//i.test(link) ? link : null,
          branch_id,
        });
      }

      // Skip rows already in the system so importing the same file twice doesn't double everything.
      const existingCount = new Map<string, number>();
      if (candidates.length) {
        const dates = candidates.map(c => c.date).sort();
        const { data: existing } = await supabase
          .from("expenses")
          .select("date, vendor, amount, branch_id, category")
          .gte("date", dates[0])
          .lte("date", dates[dates.length - 1])
          .limit(5000);
        (existing ?? []).forEach((x: any) => existingCount.set(expenseKey(x), (existingCount.get(expenseKey(x)) ?? 0) + 1));
      }

      const approveNow = canPickBranch; // admin imports are historical records — no one-by-one approval
      const now = new Date().toISOString();
      const toInsert: any[] = [];
      let duplicates = 0;
      for (const c of candidates) {
        const k = expenseKey(c);
        const n = existingCount.get(k) ?? 0;
        if (n > 0) { existingCount.set(k, n - 1); duplicates++; continue; }
        toInsert.push({
          ...c,
          id: crypto.randomUUID(),
          created_by: userId,
          ...(approveNow ? { status: "approved", approved_by: userId, approved_at: now } : {}),
        });
      }

      const res = toInsert.length ? await insertInChunks(supabase, "expenses", toInsert) : { inserted: 0, error: null };
      const saved = toInsert.slice(0, res.inserted);

      const lines = [`Imported ${res.inserted} of ${rows.length} rows${approveNow ? " (marked approved)" : " (waiting for approval)"}.`];
      if (duplicates) lines.push(`Skipped ${duplicates} that were already in the system.`);
      if (problems.size) lines.push(`Skipped because: ${describeProblems(problems)}.`);
      if (res.error) lines.push(`Stopped early: ${res.error}`);

      if (saved.length) {
        const forSync: SyncExpense[] = saved.map(s => ({
          id: s.id, date: s.date, vendor: s.vendor, category: s.category, particulars: s.particulars,
          amount: s.amount, payment_mode: s.payment_mode, branch_id: s.branch_id,
        }));
        const sync = await syncExpenseSideEffects(supabase, forSync, { userId, canCreateEmployees: canPickBranch, approve: approveNow });
        lines.push(...describeSync(sync));
        router.refresh();
      }
      setImportMsg(lines);
    } catch (err: any) {
      setImportMsg([`Couldn't read that file: ${err?.message ?? err}`]);
    }
    setImporting(false);
  }

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-6xl">
      <header className="flex items-baseline justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-cream">Expenses</h1>
          <p className="text-muted text-sm mt-1">{isStaff ? `${visible.length} waiting for approval` : `${visible.length} records`}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canPickBranch && (
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="text-sm">
              <option value="all">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {!isStaff && <button onClick={handleExport} className="btn-ghost text-sm">Export</button>}
          <label className={`btn-ghost text-sm ${noBranch || importing ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
            {importing ? "Importing…" : "Import"}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing || noBranch} className="hidden" />
          </label>
          {!isStaff && <p className="font-mono text-lg text-pink" title="Approved expenses only">{fmtINR(total)}</p>}
        </div>
      </header>

      {noBranch && <NoBranchNotice />}
      {importMsg && (
        <div className="card p-3 mb-4 text-xs text-muted space-y-1">
          {importMsg.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}

      <form onSubmit={addExpense} className="card p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] text-muted mb-1">Date</label>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full" />
        </div>
        {canPickBranch && (
          <div>
            <label className="block text-[11px] text-muted mb-1">Branch</label>
            <select value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })} className="w-full" required>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[11px] text-muted mb-1">Particulars</label>
          <input value={form.particulars} onChange={e => setForm({ ...form, particulars: e.target.value })} placeholder="e.g. Gas Bill" className="w-full" required />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-1">Regarding (category)</label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value, employee_id: "" })} className="w-full">
            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {isAdvance ? (
          <div className="col-span-2">
            <label className="block text-[11px] text-gold mb-1">Advance for employee</label>
            <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full" required>
              <option value="">Select employee</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}{emp.branch_id && branchName.get(emp.branch_id) ? ` (${branchName.get(emp.branch_id)})` : ""}
                </option>
              ))}
            </select>
            {employees.length === 0 && (
              <p className="text-[11px] text-muted mt-1">No employees yet — an admin adds them under Payroll → Employees (or imports the sheet, which creates them).</p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-[11px] text-muted mb-1">Party name</label>
            <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor / paid to" className="w-full" required />
          </div>
        )}

        <div>
          <label className="block text-[11px] text-muted mb-1">Amount</label>
          <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="w-full" required />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-1">Payment mode</label>
          <select value={form.payment_mode} onChange={e => setForm({ ...form, payment_mode: e.target.value })} className="w-full">
            {PAYMENT_MODES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        {form.payment_mode === "Bank" && (
          <div>
            <label className="block text-[11px] text-muted mb-1">Bank name</label>
            <input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. Saraswat Bank" className="w-full" />
          </div>
        )}
        <div>
          <label className="block text-[11px] text-muted mb-1">Voucher number</label>
          <input value={form.voucher_number} onChange={e => setForm({ ...form, voucher_number: e.target.value })} placeholder="Written on the voucher" className="w-full" />
        </div>

        <div className="col-span-2">
          <label className="block text-[11px] text-muted mb-1">Remarks</label>
          <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Optional additional notes" className="w-full" />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-1">Receipt / voucher photo</label>
          <input type="file" accept="image/*,application/pdf" onChange={e => setReceiptFile(e.target.files?.[0] ?? null)} className="w-full text-xs" />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input type="checkbox" id="gst" checked={form.gst_bill} onChange={e => setForm({ ...form, gst_bill: e.target.checked })} className="!w-auto" />
          <label htmlFor="gst" className="text-sm text-cream">GST bill</label>
        </div>

        <div className="col-span-2 md:col-span-4">
          <button type="submit" disabled={submitting || noBranch} className="btn-primary w-full md:w-auto disabled:opacity-50">
            {submitting ? "Adding…" : "Add expense"}
          </button>
        </div>
        {error && <p className="col-span-full text-rust text-xs">{error}</p>}
        {info && (
          <div className="col-span-full text-xs text-leaf space-y-0.5">
            {info.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Category</th>
              {canPickBranch && <th className="px-4 py-3 font-medium hidden md:table-cell">Branch</th>}
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Voucher</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {!isStaff && <th className="px-4 py-3 font-medium">Log</th>}
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted text-sm">No expenses yet — add the first one above.</td></tr>
            )}
            {visible.map(exp => (
              <tr key={exp.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(exp.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                <td className="px-4 py-3 text-cream">
                  {exp.particulars ?? exp.vendor}
                  {exp.gst_bill && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold">GST</span>}
                  {exp.payment_mode === "Credit" && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-rust/10 text-rust">Credit</span>}
                  <p className="text-muted text-xs mt-0.5">{exp.vendor}{exp.note ? ` · ${exp.note}` : ""}</p>
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">{exp.category}</td>
                {canPickBranch && <td className="px-4 py-3 text-muted hidden md:table-cell">{exp.branches?.name ?? "—"}</td>}
                <td className="px-4 py-3 text-muted hidden lg:table-cell">
                  {exp.voucher_number ?? "—"}
                  {exp.receipt_url && (
                    <a href={exp.receipt_url} target="_blank" rel="noreferrer" className="block text-gold text-xs hover:underline">Receipt</a>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-cream">{fmtINR(Number(exp.amount))}</td>
                <td className="px-4 py-3"><StatusBadge status={exp.status} /></td>
                {!isStaff && <td className="px-4 py-3 min-w-[150px]">
                  <EntryLog status={exp.status} createdBy={exp.profiles?.full_name} createdAt={exp.created_at} approvedBy={exp.approver?.full_name} approvedAt={exp.approved_at} />
                </td>}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {canApproveRow(exp) && exp.status === "pending" && (
                    <>
                      <button onClick={() => setStatus(exp.id, "approved")} className="text-leaf text-xs mr-3 hover:underline">Approve</button>
                      <button onClick={() => setStatus(exp.id, "rejected")} className="text-rust text-xs mr-3 hover:underline">Reject</button>
                    </>
                  )}
                  {canDelete && (
                    <button onClick={() => remove(exp.id)} className="text-muted text-xs hover:text-rust hover:underline">Delete</button>
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
