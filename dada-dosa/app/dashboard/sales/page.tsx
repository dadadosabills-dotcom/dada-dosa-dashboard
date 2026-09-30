import { createClient, getProfile, getBranches, canSeeAllBranches } from "@/lib/supabase/server";
import { SalesClient, type Sale } from "./sales-client";

export default async function SalesPage() {
  const supabase = createClient();
  const [profile, branches] = await Promise.all([getProfile(), getBranches()]);

  let query = supabase
    .from("sales")
    .select("id, date, swiggy, zomato, upi, cash, channel_total, status, created_by, branch_id, profiles!sales_created_by_fkey(full_name), branches(name)")
    .order("date", { ascending: false })
    .limit(200);

  if (!canSeeAllBranches(profile?.role) && profile?.branch_id) {
    query = query.eq("branch_id", profile.branch_id);
  }

  const { data } = await query;

  const sales: Sale[] = (data ?? []).map((row: any) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles,
    branches: Array.isArray(row.branches) ? (row.branches[0] ?? null) : row.branches,
  }));

  return (
    <SalesClient
      initialSales={sales}
      role={profile?.role ?? "user"}
      userId={profile?.id ?? ""}
      userBranchId={profile?.branch_id ?? null}
      branches={branches}
      canPickBranch={canSeeAllBranches(profile?.role)}
    />
  );
}
