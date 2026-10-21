import { redirect } from "next/navigation";
import { createClient, getProfile, getBranches, canSeeAllBranches } from "@/lib/supabase/server";
import { PayrollClient, type Employee, type Advance, type PayrollRun, type EmployeeDoc } from "./payroll-client";

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function PayrollPage() {
  const supabase = createClient();
  const [profile, branches] = await Promise.all([getProfile(), getBranches()]);
  if (profile?.role === "user") redirect("/dashboard/sales"); // staff only get Sales and Expenses
  const canManage = ["admin", "superadmin"].includes(profile?.role ?? "");
  const scoped = !canSeeAllBranches(profile?.role) && profile?.branch_id ? profile.branch_id : null;

  let empQuery = supabase.from("employees").select("id, name, role, total_salary, active, branch_id, branches(name)").order("name");
  let advQuery = supabase
    .from("salary_advances")
    .select("id, employee_id, date, amount, remaining, branch_id, source_expense_id, employees(name), branches(name), expenses(status)")
    .order("date", { ascending: false })
    .limit(1000);
  if (scoped) {
    empQuery = empQuery.eq("branch_id", scoped);
    advQuery = advQuery.eq("branch_id", scoped);
  }

  const [{ data: empData }, { data: advData }, { data: runsData }] = await Promise.all([
    empQuery,
    advQuery,
    supabase
      .from("payroll_runs")
      .select(
        "id, employee_id, period, total_presence, total_absence, overtime, w_off, total_days, per_day_salary, payable_salary, advances_deducted, food_bill, missing_bill, bank_deduction, pf, shoes, fine, uniform, extra, gross, deductions, net, status, branch_id"
      )
      .order("period", { ascending: false })
      .limit(200),
  ]);

  // Employee documents (joining form, ID proof). Empty + flagged if migration 012 hasn't been run.
  const docRes = canManage
    ? await supabase.from("employee_documents").select("id, employee_id, kind, name, storage_path, size, mime_type, created_at").order("created_at", { ascending: false })
    : { data: [], error: null };

  const employees: Employee[] = (empData ?? []).map((e: any) => ({ ...e, branches: one(e.branches) }));

  // An advance whose expense was later rejected shouldn't count.
  const advances: Advance[] = (advData ?? [])
    .map((a: any) => ({ ...a, employees: one(a.employees), branches: one(a.branches), expenses: one(a.expenses) }))
    .filter((a: Advance) => a.expenses?.status !== "rejected");

  return (
    <PayrollClient
      employees={employees}
      advances={advances}
      runs={(runsData ?? []) as PayrollRun[]}
      role={profile?.role ?? "user"}
      userId={profile?.id ?? ""}
      userBranchId={profile?.branch_id ?? null}
      branches={branches}
      canManage={canManage}
      canPickBranch={canSeeAllBranches(profile?.role)}
      docs={(docRes.data ?? []) as EmployeeDoc[]}
      docsReady={!docRes.error}
    />
  );
}
