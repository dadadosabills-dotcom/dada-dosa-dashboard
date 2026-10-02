import { redirect } from "next/navigation";
import { createClient, getProfile, getBranches, canSeeAllBranches } from "@/lib/supabase/server";
import { CreditorsClient, type Creditor, type CreditorTx } from "./creditors-client";

export default async function CreditorsPage() {
  const supabase = createClient();
  const [profile, branches] = await Promise.all([getProfile(), getBranches()]);
  if (profile?.role === "user") redirect("/dashboard/sales"); // staff only get Sales and Expenses

  let txQuery = supabase
    .from("creditor_transactions")
    .select("id, creditor_id, date, type, amount, note, status, created_by, branch_id, profiles!creditor_transactions_created_by_fkey(full_name), branches(name)")
    .order("date", { ascending: false });

  if (!canSeeAllBranches(profile?.role) && profile?.branch_id) {
    txQuery = txQuery.eq("branch_id", profile.branch_id);
  }

  const [{ data: creditors }, { data: txData }] = await Promise.all([
    supabase.from("creditors").select("id, name, contact, opening_balance, created_at").order("name"),
    txQuery,
  ]);

  const transactions: CreditorTx[] = (txData ?? []).map((row: any) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles,
    branches: Array.isArray(row.branches) ? (row.branches[0] ?? null) : row.branches,
  }));

  return (
    <CreditorsClient
      creditors={(creditors ?? []) as Creditor[]}
      transactions={transactions}
      role={profile?.role ?? "user"}
      userId={profile?.id ?? ""}
      userBranchId={profile?.branch_id ?? null}
      branches={branches}
      canPickBranch={canSeeAllBranches(profile?.role)}
    />
  );
}
