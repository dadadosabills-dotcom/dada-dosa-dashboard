"use client";

import { useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtINR, type Branch } from "@/lib/constants";
import { exportToExcel, norm, parseSheetTable, pickField, pickRaw, toNumber, makeBranchResolver } from "@/lib/excel";
import { downloadTemplate } from "@/lib/templates";
import { compressImage } from "@/lib/image";
import { buildSlip, downloadSlipExcel, downloadSlipPdf, type SlipRun } from "@/lib/salary-slip";

export type Employee = { id: string; name: string; role: string | null; total_salary: number; active: boolean; branch_id: string | null; branches: { name: string } | null };
export type Advance = {
  id: string; employee_id: string; date: string; amount: number; remaining: number; branch_id: string | null; source_expense_id: string | null;
  employees: { name: string } | null; branches: { name: string } | null; expenses: { status: string } | null;
};
export type EmployeeDoc = { id: string; employee_id: string; kind: "joining_form" | "identity_proof" | "other"; name: string; storage_path: string; size: number; mime_type: string | null; created_at: string };
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
  employees, advances, runs, role, userId, userBranchId, branches, canManage, canPickBranch, docs, docsReady,
}: {
  employees: Employee[]; advances: Advance[]; runs: PayrollRun[]; docs: EmployeeDoc[]; docsReady: boolean;
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
        <EmployeesTab employees={employees} branches={branches} canManage={canManage} canPickBranch={canPickBranch} userBranchId={userBranchId} router={router} supabase={supabase} docs={docs} docsReady={docsReady} userId={userId} />
      )}
      {tab === "run" && (
        <RunPayrollTab employees={employees} advances={advances} runs={runs} branches={branches} canManage={canManage} userId={userId} router={router} supabase={supabase} />
      )}
      {tab === "advances" && <AdvancesTab advances={advances} />}
      {tab === "history" && <HistoryTab runs={runs} employees={employees} branches={branches} />}
    </main>
  );
}

// ---------------- Employees ----------------
const DOC_KINDS: { kind: EmployeeDoc["kind"]; label: string }[] = [
  { kind: "joining_form", label: "Joining form" },
  { kind: "identity_proof", label: "Identity proof" },
  { kind: "other", label: "Other" },
];
const DOC_BUCKET = "employee-documents";
const safeFile = (n: string) => n.replace(/[^\w.\- ()]+/g, "_");
const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function EmployeesTab({ employees, branches, canManage, canPickBranch, userBranchId, router, supabase, docs, docsReady, userId }: any) {
  const [openDocs, setOpenDocs] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string[] | null>(null);

  async function handleImport(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      const { rows, headerFound } = await parseSheetTable(file, [["name", "employee name", "employee"], ["monthly salary", "total salary", "salary"]]);
      if (!headerFound) {
        setImportMsg(["Couldn't find the header row. The sheet needs these columns: Name, Designation, Branch, Monthly Salary. Use the Template button for the right layout."]);
        setImporting(false);
        return;
      }
      const resolveBranch = makeBranchResolver(branches, canPickBranch, userBranchId);
      const byName = new Map<string, Employee>(employees.map((e: Employee) => [norm(e.name), e]));
      const seen = new Set<string>();
      const problems = new Map<string, number>();
      const bump = (k: string) => problems.set(k, (problems.get(k) ?? 0) + 1);
      const toInsert: any[] = [];
      let updated = 0, failed = 0;

      for (const row of rows) {
        const name = pickField(row, "name", "employee name", "employee").replace(/\s+/g, " ");
        if (!name) { bump("name is blank"); continue; }
        if (seen.has(norm(name))) { bump("same name twice in the file"); continue; }
        seen.add(norm(name));
        const salaryRaw = pickRaw(row, "monthly salary", "total salary", "salary");
        const salary = toNumber(salaryRaw);
        const role = pickField(row, "designation", "role", "position");
        const { id: branch_id, problem } = resolveBranch(pickField(row, "branch"));
        const existing = byName.get(norm(name));
        if (existing) {
          const patch: Record<string, any> = {};
          if (salaryRaw !== "" && salary > 0) patch.total_salary = salary;
          if (role) patch.role = role;
          if (branch_id) patch.branch_id = branch_id;
          if (Object.keys(patch).length) {
            const { error } = await supabase.from("employees").update(patch).eq("id", existing.id);
            if (error) failed++; else updated++;
          }
          continue;
        }
        if (!branch_id) { bump(problem ?? "branch problem"); continue; }
        if (!(salary > 0)) { bump("monthly salary is blank or zero"); continue; }
        toInsert.push({ name, role: role || null, pay_type: "monthly", total_salary: salary, branch_id });
      }

      let added = 0;
      if (toInsert.length) {
        const { error } = await supabase.from("employees").insert(toInsert);
        if (error) setImportMsg([`Couldn't add the new employees: ${error.message}`]);
        else added = toInsert.length;
      }
      const lines = [`Added ${added} new employee${added === 1 ? "" : "s"}, updated ${updated} existing.`];
      if (failed) lines.push(`${failed} update${failed > 1 ? "s" : ""} failed.`);
      if (problems.size) lines.push(`Skipped because: ${[...problems.entries()].map(([k, n]) => `${n} × ${k}`).join(", ")}.`);
      lines.push("Next: open Documents on each person to attach their joining form and identity proof.");
      setImportMsg(prev => prev ?? lines);
      router.refresh();
    } catch (err: any) {
      setImportMsg([`Couldn't read that file: ${err?.message ?? err}`]);
    }
    setImporting(false);
  }

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
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => setShowNew(true)} className="btn-ghost text-sm">+ Add employee</button>
              <label className={`btn-ghost text-sm ${importing ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
                {importing ? "Importing…" : "Import employee list"}
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing} className="hidden" />
              </label>
              <button type="button" onClick={() => downloadTemplate("employees")} className="text-xs text-muted hover:text-gold hover:underline">Template</button>
            </div>
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
      {importMsg && (
        <div className="card p-3 mb-4 text-xs text-muted space-y-1">{importMsg.map((l, i) => <p key={i}>{l}</p>)}</div>
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
                <Fragment key={emp.id}>
                <tr className="border-b border-line/60 last:border-0">
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
                        <button onClick={() => toggleActive(emp.id, emp.active)} className="text-xs text-muted hover:text-gold hover:underline mr-3">
                          {emp.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </>
                    ))}
                    {canManage && (
                      <button onClick={() => setOpenDocs(openDocs === emp.id ? null : emp.id)} className="text-xs text-gold hover:underline">
                        Documents ({docs.filter((d: EmployeeDoc) => d.employee_id === emp.id).length})
                      </button>
                    )}
                  </td>
                </tr>
                {openDocs === emp.id && canManage && (
                  <tr className="border-b border-line/60 bg-panel2/40">
                    <td colSpan={5} className="px-4 py-4">
                      <EmployeeDocsPanel employeeId={emp.id} docs={docs.filter((d: EmployeeDoc) => d.employee_id === emp.id)} docsReady={docsReady} supabase={supabase} router={router} userId={userId} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeDocsPanel({ employeeId, docs, docsReady, supabase, router, userId }: any) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(kind: EmployeeDoc["kind"], files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(kind); setError(null);
    const problems: string[] = [];
    for (const original of Array.from(files)) {
      const file = await compressImage(original);
      const path = `${employeeId}/${kind}/${crypto.randomUUID()}-${safeFile(file.name)}`;
      const up = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) { problems.push(`${file.name}: ${up.error.message}`); continue; }
      const { error } = await supabase.from("employee_documents").insert({
        employee_id: employeeId, kind, name: file.name, storage_path: path, size: file.size, mime_type: file.type || null, uploaded_by: userId,
      });
      if (error) { await supabase.storage.from(DOC_BUCKET).remove([path]); problems.push(`${file.name}: ${error.message}`); }
    }
    setBusy(null);
    if (problems.length) setError(problems.join(" · "));
    router.refresh();
  }

  async function open(d: EmployeeDoc, download: boolean) {
    setError(null);
    const win = download ? null : window.open("", "_blank");
    const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(d.storage_path, 120, download ? { download: d.name } : undefined);
    if (error || !data?.signedUrl) { win?.close(); setError(error?.message ?? "Couldn't open the file."); return; }
    if (download) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = d.name; document.body.appendChild(a); a.click(); a.remove(); }
    else if (win) win.location.href = data.signedUrl;
  }

  async function remove(d: EmployeeDoc) {
    if (!confirm(`Delete "${d.name}"? This can't be undone.`)) return;
    const rm = await supabase.storage.from(DOC_BUCKET).remove([d.storage_path]);
    if (rm.error) { setError(rm.error.message); return; }
    await supabase.from("employee_documents").delete().eq("id", d.id);
    router.refresh();
  }

  if (!docsReady) {
    return <p className="text-rust text-xs">Documents aren&apos;t set up yet — run <span className="num">supabase/migration_012_drawing_sync_employee_docs.sql</span> in Supabase, then refresh.</p>;
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {DOC_KINDS.map(({ kind, label }) => {
        const list = docs.filter((d: EmployeeDoc) => d.kind === kind);
        return (
          <div key={kind}>
            <p className="text-[11px] text-muted uppercase tracking-wide mb-2">{label}</p>
            {list.length === 0 && <p className="text-muted text-xs mb-2">None uploaded.</p>}
            <ul className="space-y-1.5 mb-2">
              {list.map((d: EmployeeDoc) => (
                <li key={d.id} className="text-xs">
                  <span className="text-cream break-all">{d.name}</span> <span className="text-muted">({kb(Number(d.size))})</span>
                  <span className="block mt-0.5">
                    {/^(image\/|application\/pdf)/.test(d.mime_type ?? "") && <button onClick={() => open(d, false)} className="text-gold hover:underline mr-3">View</button>}
                    <button onClick={() => open(d, true)} className="text-gold hover:underline mr-3">Download</button>
                    <button onClick={() => remove(d)} className="text-muted hover:text-rust hover:underline">Delete</button>
                  </span>
                </li>
              ))}
            </ul>
            <label className={`btn-ghost text-xs inline-block ${busy ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
              {busy === kind ? "Uploading…" : `+ Upload ${label.toLowerCase()}`}
              <input type="file" multiple accept="image/*,application/pdf,.doc,.docx" className="hidden" onChange={e => { upload(kind, e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        );
      })}
      {error && <p className="text-rust text-xs md:col-span-3">{error}</p>}
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
function RunPayrollTab({ employees, advances, runs, branches, canManage, userId, router, supabase }: any) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [f, setF] = useState({
    presence: "", absence: "", overtime: "0", wOff: "",
    foodBill: "0", missingBill: "0", bank: "0", pf: "0", shoes: "0", fine: "0", uniform: "0", extra: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [justRan, setJustRan] = useState<SlipRun | null>(null);

  const employee = employees.find((e: Employee) => e.id === employeeId);
  const branchLabel = (id: string | null) => branches.find((b: Branch) => b.id === id)?.name ?? "";
  // A payroll run already exists for this employee + month (only one is allowed per month).
  const existingRun: PayrollRun | undefined = runs.find((r: PayrollRun) => r.employee_id === employeeId && r.period === period);
  const slipOf = (r: SlipRun) => buildSlip(r, { name: employee?.name ?? "", role: employee?.role ?? null, total_salary: Number(employee?.total_salary ?? 0) }, branchLabel(employee?.branch_id ?? null));

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

  async function runPayroll(replace = false) {
    if (!employee) return;
    setError(null); setDone(null); setJustRan(null);
    setRunning(true);

    let advList: Advance[] = outstandingAdvances;

    if (replace && existingRun) {
      // 1. Give back the advance amounts the old run had deducted.
      const { data: applied } = await supabase.from("payroll_run_advances").select("salary_advance_id, amount_applied").eq("payroll_run_id", existingRun.id);
      for (const a of applied ?? []) {
        const { data: adv } = await supabase.from("salary_advances").select("remaining").eq("id", a.salary_advance_id).maybeSingle();
        if (adv) await supabase.from("salary_advances").update({ remaining: Number(adv.remaining) + Number(a.amount_applied) }).eq("id", a.salary_advance_id);
      }
      // 2. Remove the old run, then read the advances fresh (they changed).
      const { error: delErr } = await supabase.from("payroll_runs").delete().eq("id", existingRun.id);
      if (delErr) { setRunning(false); setError(`Couldn't replace the earlier run: ${delErr.message}`); return; }
      const { data: fresh } = await supabase
        .from("salary_advances")
        .select("id, employee_id, date, amount, remaining, branch_id, source_expense_id, expenses(status)")
        .eq("employee_id", employee.id)
        .gt("remaining", 0)
        .order("date", { ascending: true });
      advList = (fresh ?? [])
        .map((a: any) => ({ ...a, expenses: Array.isArray(a.expenses) ? (a.expenses[0] ?? null) : a.expenses }))
        .filter((a: Advance) => a.expenses?.status !== "rejected");
    }

    const freshTotal = advList.reduce((s2: number, a: Advance) => s2 + Number(a.remaining), 0);
    const applyTotal = Math.min(freshTotal, Math.max(gross, 0));
    const deductionsNow = applyTotal + otherDeductions;
    const net = gross - deductionsNow;

    const { data: run, error: runError } = await supabase
      .from("payroll_runs")
      .insert({
        employee_id: employee.id, period,
        total_presence: presence, total_absence: absence, overtime, w_off: wOff, total_days: totalDays,
        per_day_salary: perDaySalary, payable_salary: payableSalary,
        food_bill: Number(f.foodBill) || 0, missing_bill: Number(f.missingBill) || 0, bank_deduction: Number(f.bank) || 0,
        pf: Number(f.pf) || 0, shoes: Number(f.shoes) || 0, fine: Number(f.fine) || 0, uniform: Number(f.uniform) || 0, extra,
        gross, deductions: deductionsNow, advances_deducted: applyTotal,
        status: "unpaid", created_by: userId, branch_id: employee.branch_id,
      })
      .select("id")
      .single();

    if (runError) {
      setRunning(false);
      setError(
        runError.message.includes("payroll_runs_employee_id_period_key")
          ? `Payroll for ${employee.name} for ${period} has already been run. Use "Replace" to run it again, or download its slip.`
          : runError.message
      );
      router.refresh();
      return;
    }

    let remaining = applyTotal;
    for (const adv of advList) {
      if (remaining <= 0) break;
      const apply = Math.min(remaining, Number(adv.remaining));
      await supabase.from("payroll_run_advances").insert({ payroll_run_id: run.id, salary_advance_id: adv.id, amount_applied: apply });
      await supabase.from("salary_advances").update({ remaining: Number(adv.remaining) - apply }).eq("id", adv.id);
      remaining -= apply;
    }

    setRunning(false);
    setDone(`Payroll ${replace ? "re-run" : "run"} for ${employee.name} — ${period}: ${fmtINR(net)} balance.`);
    setJustRan({
      period, total_presence: presence, total_absence: absence, w_off: wOff, total_days: totalDays,
      per_day_salary: perDaySalary, payable_salary: payableSalary, overtime, extra, gross,
      advances_deducted: applyTotal, food_bill: Number(f.foodBill) || 0, missing_bill: Number(f.missingBill) || 0,
      bank_deduction: Number(f.bank) || 0, pf: Number(f.pf) || 0, shoes: Number(f.shoes) || 0, fine: Number(f.fine) || 0,
      uniform: Number(f.uniform) || 0, deductions: deductionsNow, net,
    });
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div>
          <label className="block text-[11px] text-muted mb-1">Employee</label>
          <select value={employeeId} onChange={e => { setEmployeeId(e.target.value); setDone(null); setJustRan(null); }} className="w-full">
            {employees.filter((e: Employee) => e.active).map((e: Employee) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-1">Period</label>
          <input type="month" value={period} onChange={e => { setPeriod(e.target.value); setDone(null); setJustRan(null); }} className="w-full" />
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

      {justRan ? (
        <div className="card p-4">
          <p className="text-cream text-sm mb-3">Salary slip for {employee?.name} — {period}</p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => downloadSlipPdf(slipOf(justRan))} className="btn-primary">Download PDF</button>
            <button onClick={() => downloadSlipExcel(slipOf(justRan))} className="btn-ghost">Download Excel</button>
          </div>
        </div>
      ) : existingRun ? (
        <div className="card p-4">
          <p className="text-gold text-sm">Payroll for {employee?.name} — {period} has already been run.</p>
          <p className="text-muted text-xs mt-1">Balance {fmtINR(Number(existingRun.net))}. You can download its slip, or replace the run with the figures above (any advance it recovered is put back first).</p>
          <div className="flex gap-3 flex-wrap mt-3">
            <button onClick={() => downloadSlipPdf(slipOf(existingRun))} className="btn-primary">Slip (PDF)</button>
            <button onClick={() => downloadSlipExcel(slipOf(existingRun))} className="btn-ghost">Slip (Excel)</button>
            <button
              onClick={() => { if (confirm(`Replace the existing payroll for ${employee?.name} — ${period} with the figures on this screen?`)) runPayroll(true); }}
              disabled={running}
              className="btn-ghost hover:border-rust hover:text-rust"
            >
              {running ? "Replacing…" : "Replace this run"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => runPayroll(false)} disabled={running || !employee} className="btn-primary w-full">
          {running ? "Running…" : "Run payroll for this period"}
        </button>
      )}
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
function HistoryTab({ runs, employees, branches }: { runs: PayrollRun[]; employees: Employee[]; branches: Branch[] }) {
  const nameFor = (id: string) => employees.find(e => e.id === id)?.name ?? "—";
  const slipFor = (r: PayrollRun) => {
    const emp = employees.find(e => e.id === r.employee_id);
    return buildSlip(r, { name: emp?.name ?? "", role: emp?.role ?? null, total_salary: Number(emp?.total_salary ?? 0) }, branches.find(b => b.id === (r.branch_id ?? emp?.branch_id))?.name ?? "");
  };

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
              <th className="px-4 py-3 font-medium text-right">Salary slip</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted text-sm">No payroll runs yet.</td></tr>}
            {runs.map(r => (
              <tr key={r.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-cream">{r.period}</td>
                <td className="px-4 py-3 text-muted">{nameFor(r.employee_id)}</td>
                <td className="px-4 py-3 text-right font-mono text-muted hidden md:table-cell">{r.total_presence}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtINR(Number(r.gross))}</td>
                <td className="px-4 py-3 text-right font-mono text-rust">{fmtINR(Number(r.deductions))}</td>
                <td className="px-4 py-3 text-right font-mono text-leaf">{fmtINR(Number(r.net))}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                  <button onClick={() => downloadSlipPdf(slipFor(r))} className="text-gold hover:underline mr-3">PDF</button>
                  <button onClick={() => downloadSlipExcel(slipFor(r))} className="text-gold hover:underline">Excel</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
