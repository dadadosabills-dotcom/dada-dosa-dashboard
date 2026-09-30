import { createClient, getProfile, getBranches, canSeeAllBranches } from "@/lib/supabase/server";
import { OverviewClient } from "./overview-client";

export default async function OverviewPage() {
  const supabase = createClient();
  const [profile, branches] = await Promise.all([getProfile(), getBranches()]);
  const scoped = !canSeeAllBranches(profile?.role) && profile?.branch_id ? profile.branch_id : null;

  let salesQ = supabase.from("sales").select("date, swiggy, zomato, upi, cash, channel_total, status, branch_id").limit(20000);
  let expensesQ = supabase.from("expenses").select("date, amount, category, status, branch_id").limit(20000);
  let creditorTxQ = supabase.from("creditor_transactions").select("date, creditor_id, type, amount, status, branch_id").limit(20000);
  let drawingsQ = supabase.from("drawings").select("date, amount, status, branch_id").limit(20000);
  if (scoped) {
    salesQ = salesQ.eq("branch_id", scoped);
    expensesQ = expensesQ.eq("branch_id", scoped);
    creditorTxQ = creditorTxQ.eq("branch_id", scoped);
    drawingsQ = drawingsQ.eq("branch_id", scoped);
  }

  const [{ data: sales }, { data: expenses }, { data: creditorTx }, { data: drawings }, { data: creditors }] = await Promise.all([
    salesQ,
    expensesQ,
    creditorTxQ,
    drawingsQ,
    supabase.from("creditors").select("id, name"),
  ]);

  return (
    <OverviewClient
      profileName={profile?.full_name ?? ""}
      role={profile?.role ?? "user"}
      branchName={scoped ? profile?.branch_name ?? null : null}
      branches={branches}
      canPickBranch={canSeeAllBranches(profile?.role)}
      sales={sales ?? []}
      expenses={expenses ?? []}
      creditorTx={creditorTx ?? []}
      drawings={drawings ?? []}
      creditors={creditors ?? []}
    />
  );
}
