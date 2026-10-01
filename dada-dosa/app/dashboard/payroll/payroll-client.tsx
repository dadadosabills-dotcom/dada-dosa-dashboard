"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtINR, type Branch } from "@/lib/constants";
import { exportToExcel, norm } from "@/lib/excel";

export type Employee = { id: string; name: string; role: string | null; total_salary: number; active: boolean; branch_id: string | null; branches: { name: string } | null };
export type Advance = {
  id: string; employee_id: string; date: string; amount: number; remaining: number; branch_id: string | null; source_expense_id: string | null;
  employees: { name: string } | null; branches: { name: string } | null; expenses: { status: string } | null;
};
export type PayrollRun = {
  id: string; employee_id: string; period: string;
  total_presence: number; total_absence: number; overtime: number; w_off: number; total_days: number;
  per_day_salary: number; payable_salary: number; advances_deducted: number;
  food_bill: number; missing_bill: number; bank_deduction: number; pf: number; shoes: number; fine: number; uniform: number; extra: number;
  gross: number; deductions: number; net: number; status: string; branch_id: string | null;
};

type Tab = "run" | "advances" | "employees" | "history";
const TAB_LABEL: Record<Tab, string> = { run: "Run payroll", advances: "Salary advances", employees: "Employees", history: "History" };

export function PayrollClient({
  employees, advances, runs, role, userId, userBranchId, branches, canManage, canPickBranch,
}: {
  employees: Employee[]; advances: Advance[]; runs: PayrollRun[];
  role: string; userId: string; userBranchId: string | null; branches: Branch[]; canManage: boolean; canPickBranch: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("run");

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-cream">Payroll</h1>
        <p className="text-muted text-sm mt-1">Monthly salary, attendance, advances and deductions — matches your payroll sheet</p>
      </header>

      <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto">
        {(["run", "advances", "employees", "history"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t ? "border-gold text-gold" : "border-transparent text-muted hover:text-cream"}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "employees" && (
        <EmployeesTab employees={employees} branches={branches} canManage={canManage} canPickBranch={canPickBranch} userBranchId={userBranchId} router={router} supabase={supabase} />
      )}
      {tab === "run" && (
        <RunPayrollTab employees={employees} advances={advances} canManage={canManage} userId={userId} router={router} supabase={supabase} />
      )}
      {tab === "advances" && <AdvancesTab advances={advances} />}
      {tab === "history" && <HistoryTab runs={runs} employees={employees} />}
    </main>
  );
}

// ---------------- Employees ----------------
function EmployeesTab({ employees, branches, canManage, canPickBranch, userBranchId, router, supabase }: any) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", total_salary: "", branch_id: userBranchId ?? (branches[0]?.id ?? "") });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ role: "", total_salary: "" });
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.total_salary || !form.branch_id) return;
    const { error } = await supabase.from("employees").insert({
      name: form.name, role: form.role || null, pay_type: "monthly",
      total_salary: Number(form.total_salary), branch_id: form.branch_id,
    });
    if (error) { setError(error.message); return; }
    setForm({ name: "", role: "", total_salary: "", branch_id: form.branch_id });
    setShowNew(false);
    router.refresh();
  }

  async function saveEdit(id: string) {
    const { error } = await supabase.from("employees").update({
      role: edit.role || null, total_salary: Number(edit.total_salary) || 0,
    }).eq("id", id);
    if (error) { setError(error.message); return; }
    setEditingId(null);
    router.refresh();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from("employees").update({ active: !active }).eq("id", id);
    router.refresh();
  }

  const missingSalary = employees.filter((e: Employee) => e.active && Number(e.total_salary) === 0).length;

  return (
    <div>
      {canManage && (
        <div className="mb-6">
          {!showNew ? (
            <button onClick={() => setShowNew(true)} className="btn-ghost text-sm">+ Add employee</button>
          ) : (
            <form onSubmit={add} className="card p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full" required />
              <input value={form.role} onChange={(e: any) => setForm({ ...form, role: e.target.value })} placeholder="Designation" className="w-full" />
              {canPickBranch && (
                <select value={form.branch_id} onChange={(e: any) => setForm({ ...form, branch_id: e.target.value })} className="w-full">
                  {branches.map((b: Branch) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <input type="number" value={form.total_salary} onChange={(e: any) => setForm({ ...form, total_salary: e.target.value })} placeholder="Total monthly salary" className="w-full" required />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1">Save</button>
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost">Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
      {error && <p className="text-rust text-xs mb-3">{error}</p>}
      {canManage && missingSalary > 0 && (
        <p className="text-gold text-xs mb-3">
          {missingSalary} employee{missingSalary > 1 ? "s have" : " has"} no monthly salary set yet (created from imported advances). Click Edit to set it — payroll uses it.
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Designation</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Branch</th>
              <th className="px-4 py-3 font-medium text-right">Total salary</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No employees yet.</td></tr>}
            {employees.map((emp: Employee) => {
              const editing = editingId === emp.id;
              return (
                <tr key={emp.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-cream">{emp.name}{!emp.active && <span className="ml-2 text-[10px] text-muted">(inactive)</span>}</td>
                  <td className="px-4 py-3 text-muted hidden md:table-cell">
                    {editing ? <input value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })} className="w-full text-sm" placeholder="Designation" /> : (emp.role ?? "—")}
                  </td>
                  <td className="px-4 py-3 text-muted hidden md:table-cell">{emp.branches?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-cream">
                    {editing
                      ? <input type="number" value={edit.total_salary} onChange={e => setEdit({ ...edit, total_salary: e.target.value })} className="w-28 text-sm text-right" />
                      : fmtINR(Number(emp.total_salary))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canManage && (editing ? (
                      <>
                        <button onClick={() => saveEdit(emp.id)} className="text-leaf text-xs mr-3 hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-muted text-xs hover:underline">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(emp.id); setEdit({ role: emp.role ?? "", total_salary: String(emp.total_salary ?? "") }); }} className="text-xs text-gold mr-3 hover:underline">Edit</button>
                        <button onClick={() => toggleActive(emp.id, emp.active)} className="text-xs text-muted hover:text-gold hover:underline">
                          {emp.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Salary advances ----------------
function AdvancesTab({ advances }: { advances: Advance[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => advances.filter(a => !q || norm(a.employees?.name).includes(norm(q))), [advances, q]);
  const given = shown.reduce((s, a) => s + Number(a.amount), 0);
  const outstanding = shown.reduce((s, a) => s + Number(a.remaining), 0);

  function handleExport() {
    exportToExcel(
      shown.map(a => ({
        Date: a.date,
        Employee: a.employees?.name ?? "",
        Branch: a.branches?.name ?? "",
        "Advance Given": Number(a.amount),
        Outstanding: Number(a.remaining),
        Status: Number(a.remaining) > 0 ? "Outstanding" : "Deducted",
      })),
      `salary-advances-${new Date().toISOString().slice(0, 10)}`
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div className="flex gap-6">
          <div>
            <p className="text-[11px] text-muted uppercase tracking-wide">Advance given</p>
            <p className="font-mono text-lg text-cream">{fmtINR(given)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted uppercase tracking-wide">Still to deduct</p>
            <p className="font-mono text-lg text-gold">{fmtINR(outstanding)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employee" className="text-sm w-44" />
          <button onClick={handleExport} className="btn-ghost text-sm">Export</button>
        </div>
      </div>
      <p className="text-muted text-xs mb-3">
        Added automatically whenever an expense is logged under &ldquo;Advance Salary&rdquo;. What&apos;s still outstanding is deducted from that employee&apos;s next payroll run, oldest first.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium hidden md:table-cell">Branch</th>
              <th className="px-4 py-3 font-medium text-right">Advance</th>
              <th className="px-4 py-3 font-medium text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">No salary advances yet.</td></tr>}
            {shown.map(a => (
              <tr key={a.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(a.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                <td className="px-4 py-3 text-cream">{a.employees?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">{a.branches?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono text-cream">{fmtINR(Number(a.amount))}</td>
                <td className={`px-4 py-3 text-right font-mono ${Number(a.remaining) > 0 ? "text-gold" : "text-muted"}`}>{fmtINR(Number(a.remaining))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Run payroll ----------------
function RunPayrollTab({ employees, advances, canManage, userId, router, supabase }: any) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [f, setF] = useState({
    presence: "", absence: "", overtime: "0", wOff: "",
    foodBill: "0", missingBill: "0", bank: "0", pf: "0", shoes: "0", fine: "0", uniform: "0", extra: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const employee = employees.find((e: Employee) => e.id === employeeId);

  const presence = Number(f.presence) || 0;
  const absence = Number(f.absence) || 0;
  const wOff = Number(f.wOff) || 0;
  const totalDays = presence + absence + wOff || 30;
  const totalSalary = Number(employee?.total_salary ?? 0);
  const perDaySalary = totalDays > 0 ? totalSalary / totalDays : 0;
  const payableSalary = perDaySalary * (presence + wOff);
  const overtime = Number(f.overtime) || 0;
  const extra = Number(f.extra) || 0;
  const gross = payableSalary + overtime + extra;

  const outstandingAdvances = useMemo(
    () => advances
      .filter((a: Advance) => a.employee_id === employeeId && Number(a.remaining) > 0)
      .sort((a: Advance, b: Advance) => a.date.localeCompare(b.date)),
    [advances, employeeId]
  );
  const totalAdvance = outstandingAdvances.reduce((s: number, a: Advance) => s + Number(a.remaining), 0);
  const advancesApplied = Math.min(totalAdvance, Math.max(gross, 0));

  const otherDeductions = (Number(f.foodBill) || 0) + (Number(f.missingBill) || 0) + (Number(f.bank) || 0) + (Number(f.pf) || 0) + (Number(f.shoes) || 0) + (Number(f.fine) || 0) + (Number(f.uniform) || 0);
  const totalDeductions = advancesApplied + otherDeductions;
  const balance = gross - totalDeductions;

  if (!canManage) {
    return <p className="text-muted text-sm">Only Admin/SuperAdmin can run payroll.</p>;
  }

  async function runPayroll() {
    if (!employee) return;
    setError(null);
    setRunning(true);

    const { data: run, error: runError } = await supabase
      .from("payroll_runs")
      .insert({
        employee_id: employee.id, period,
        total_presence: presence, total_absence: absence, overtime, w_off: wOff, total_days: totalDays,
        per_day_salary: perDaySalary, payable_salary: payableSalary,
        food_bill: Number(f.foodBill) || 0, missing_bill: Number(f.missingBill) || 0, bank_deduction: Number(f.bank) || 0,
        pf: Number(f.pf) || 0, shoes: Number(f.shoes) || 0, fine: Number(f.fine) || 0, uniform: Number(f.uniform) || 0, extra,
        gross, deductions: totalDeductions, advances_deducted: advancesApplied,
        status: "unpaid", created_by: userId, branch_id: employee.branch_id,
      })
      .select("id")
      .single();

    if (runError) { setRunning(false); setError(runError.message); return; }

    let remaining = advancesApplied;
    for (const adv of outstandingAdvances) {
      if (remaining <= 0) break;
      const apply = Math.min(remaining, Number(adv.remaining));
      await supabase.from("payroll_run_advances").insert({ payroll_run_id: run.id, salary_advance_id: adv.id, amount_applied: apply });
      await supabase.from("salary_advances").update({ remaining: Number(adv.remaining) - apply }).eq("id", adv.id);
      remaining -= apply;
    }

    setRunning(false);
    setDone(`Payroll run created for ${employee.name} — ${period}: ${fmtINR(balance)} balance.`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div>
          <label className="block text-[11px] text-muted mb-1">Employee</label>
          <select value={employeeId} onChange={e => { setEmployeeId(e.target.value); setDone(null); }} className="w-full">
            {employees.filter((e: Employee) => e.active).map((e: Employee) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-1">Period</label>
          <input type="month" value={period} onChange={e => { setPeriod(e.target.value); setDone(null); }} className="w-full" />
        </div>
      </div>

      <p className="text-[11px] text-muted uppercase tracking-wide mb-2">Attendance</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <NumField label="Presence (days)" value={f.presence} onChange={(v: string) => setF({ ...f, presence: v })} />
        <NumField label="Absence (days)" value={f.absence} onChange={(v: string) => setF({ ...f, absence: v })} />
        <NumField label="W/OFF (days)" value={f.wOff} onChange={(v: string) => setF({ ...f, wOff: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <NumField label="Overtime (amount)" value={f.overtime} onChange={(v: string) => setF({ ...f, overtime: v })} />
        <NumField label="Extra (amount)" value={f.extra} onChange={(v: string) => setF({ ...f, extra: v })} />
      </div>

      <p className="text-[11px] text-muted uppercase tracking-wide mb-2">Deductions</p>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <NumField label="Food bill" value={f.foodBill} onChange={(v: string) => setF({ ...f, foodBill: v })} />
        <NumField label="Missing bill" value={f.missingBill} onChange={(v: string) => setF({ ...f, missingBill: v })} />
        <NumField label="Bank" value={f.bank} onChange={(v: string) => setF({ ...f, bank: v })} />
        <NumField label="PF" value={f.pf} onChange={(v: string) => setF({ ...f, pf: v })} />
        <NumField label="Shoes" value={f.shoes} onChange={(v: string) => setF({ ...f, shoes: v })} />
        <NumField label="Fine" value={f.fine} onChange={(v: string) => setF({ ...f, fine: v })} />
        <NumField label="Uniform" value={f.uniform} onChange={(v: string) => setF({ ...f, uniform: v })} />
      </div>

      <div className="card p-4 space-y-2 mb-4">
        <Row label="Total salary (monthly)" value={fmtINR(totalSalary)} />
        <Row label="Total days" value={totalDays.toFixed(1)} />
        <Row label="Per day salary" value={fmtINR(perDaySalary)} />
        <Row label="Payable salary" value={fmtINR(payableSalary)} />
        <Row label="Overtime + Extra" value={fmtINR(overtime + extra)} />
        <Row label="Gross" value={fmtINR(gross)} bold />
        <Row label="Outstanding advance" value={fmtINR(totalAdvance)} />
        <Row label="Advance deducted this run" value={`− ${fmtINR(advancesApplied)}`} accent="rust" />
        <Row label="Other deductions" value={`− ${fmtINR(otherDeductions)}`} accent="rust" />
        <div className="border-t border-line pt-2">
          <Row label="Balance" value={fmtINR(balance)} bold accent="leaf" />
        </div>
      </div>

      {error && <p className="text-rust text-xs mb-3">{error}</p>}
      {done && <p className="text-leaf text-xs mb-3">{done}</p>}

      <button onClick={runPayroll} disabled={running || !employee} className="btn-primary w-full">
        {running ? "Running…" : "Run payroll for this period"}
      </button>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-muted mb-1">{label}</label>
      <input type="number" step="0.01" value={value} onChange={e => onChange(e.target.value)} className="w-full" />
    </div>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  const colorClass = accent === "rust" ? "text-rust" : accent === "leaf" ? "text-leaf" : "text-cream";
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-mono ${colorClass} ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

// ---------------- History ----------------
function HistoryTab({ runs, employees }: { runs: PayrollRun[]; employees: Employee[] }) {
  const nameFor = (id: string) => employees.find(e => e.id === id)?.name ?? "—";

  function handleExport() {
    const rows = runs.map(r => ({
      Period: r.period,
      Employee: nameFor(r.employee_id),
      Presence: r.total_presence,
      Absence: r.total_absence,
      "W/OFF": r.w_off,
      Overtime: Number(r.overtime),
      "Per Day Salary": Number(r.per_day_salary),
      "Payable Salary": Number(r.payable_salary),
      Advance: Number(r.advances_deducted),
      "Food Bill": Number(r.food_bill),
      "Missing Bill": Number(r.missing_bill),
      Bank: Number(r.bank_deduction),
      PF: Number(r.pf),
      Shoes: Number(r.shoes),
      Fine: Number(r.fine),
      Uniform: Number(r.uniform),
      Extra: Number(r.extra),
      Gross: Number(r.gross),
      Deductions: Number(r.deductions),
      Balance: Number(r.net),
    }));
    exportToExcel(rows, `payroll-export-${new Date().toISOString().slice(0, 10)}`);
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={handleExport} className="btn-ghost text-sm">Export</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Presence</th>
              <th className="px-4 py-3 font-medium text-right">Gross</th>
              <th className="px-4 py-3 font-medium text-right">Deductions</th>
              <th className="px-4 py-3 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">No payroll runs yet.</td></tr>}
            {runs.map(r => (
              <tr key={r.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-cream">{r.period}</td>
                <td className="px-4 py-3 text-muted">{nameFor(r.employee_id)}</td>
                <td className="px-4 py-3 text-right font-mono text-muted hidden md:table-cell">{r.total_presence}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtINR(Number(r.gross))}</td>
                <td className="px-4 py-3 text-right font-mono text-rust">{fmtINR(Number(r.deductions))}</td>
                <td className="px-4 py-3 text-right font-mono text-leaf">{fmtINR(Number(r.net))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
