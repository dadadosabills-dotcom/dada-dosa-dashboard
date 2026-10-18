import { redirect } from "next/navigation";
import { createClient, getProfile, getBranches, canSeeAllBranches } from "@/lib/supabase/server";
import { OverviewClient } from "./overview-client";
import { getFlags } from "@/lib/flags";
import { LazySmartOverview, LazyStaffToday } from "./smart/lazy-entry"; // downloaded only when the flag is on

export default async function OverviewPage({ searchParams }: { searchParams?: { view?: string } }) {
  const supabase = createClient();
  const [profile, branches] = await Promise.all([getProfile(), getBranches()]);
  // New overview, behind the `smart_overview` flag (OFF by default). "?view=classic" always shows the original screen.
  if (profile && searchParams?.view !== "classic" && (await getFlags(supabase)).smart_overview) {
    return (
      <main className="px-5 py-6 md:px-8 md:py-8 max-w-6xl">
        {profile.role === "user" ? (
          <LazyStaffToday name={profile.full_name} branchId={profile.branch_id} branchName={profile.branch_name} />
        ) : (
          <LazySmartOverview
            role={profile.role as "admin" | "superadmin" | "superuser"}
            name={profile.full_name}
            branches={branches}
            ownBranchId={profile.branch_id}
            ownBranchName={profile.branch_name}
          />
        )}
      </main>
    );
  }
  if (profile?.role === "user") redirect("/dashboard/sales"); // staff only get Sales and Expenses
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
