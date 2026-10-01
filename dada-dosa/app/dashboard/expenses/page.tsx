import { createClient, getProfile, getBranches, canSeeAllBranches } from "@/lib/supabase/server";
import { ExpensesClient, type Expense } from "./expenses-client";

export default async function ExpensesPage() {
  const supabase = createClient();
  const [profile, branches] = await Promise.all([getProfile(), getBranches()]);

  let query = supabase
    .from("expenses")
    .select(
      "id, date, particulars, vendor, category, note, amount, payment_mode, bank_name, gst_bill, receipt_url, voucher_number, status, created_by, branch_id, approved_by, approved_at, created_at, profiles!expenses_created_by_fkey(full_name), approver:profiles!expenses_approved_by_fkey(full_name), branches(name)"
    )
    .order("date", { ascending: false })
    .limit(200);

  if (!canSeeAllBranches(profile?.role) && profile?.branch_id) {
    query = query.eq("branch_id", profile.branch_id);
  }

  const [{ data }, { data: employees }] = await Promise.all([
    query,
    supabase.from("employees").select("id, name, branch_id").eq("active", true).order("name"),
  ]);

  const expenses: Expense[] = (data ?? []).map((row: any) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles,
    branches: Array.isArray(row.branches) ? (row.branches[0] ?? null) : row.branches,
    approver: Array.isArray(row.approver) ? (row.approver[0] ?? null) : row.approver ?? null,
  }));

  return (
    <ExpensesClient
      initialExpenses={expenses}
      role={profile?.role ?? "user"}
      userId={profile?.id ?? ""}
      userBranchId={profile?.branch_id ?? null}
      branches={branches}
      canPickBranch={canSeeAllBranches(profile?.role)}
      employees={employees ?? []}
    />
  );
}
