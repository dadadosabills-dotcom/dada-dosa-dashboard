import { redirect } from "next/navigation";
import { createClient, getProfile, getBranches, canSeeAllBranches } from "@/lib/supabase/server";
import { DrawingsClient, type Drawing } from "./drawings-client";

export default async function DrawingsPage() {
  const supabase = createClient();
  const [profile, branches] = await Promise.all([getProfile(), getBranches()]);
  if (profile?.role === "user") redirect("/dashboard/sales"); // staff only get Sales and Expenses

  let query = supabase
    .from("drawings")
    .select("id, date, owner_name, amount, note, status, created_by, branch_id, profiles!drawings_created_by_fkey(full_name), branches(name)")
    .order("date", { ascending: false })
    .limit(200);

  if (!canSeeAllBranches(profile?.role) && profile?.branch_id) {
    query = query.eq("branch_id", profile.branch_id);
  }

  const { data } = await query;
  const drawings: Drawing[] = (data ?? []).map((row: any) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : row.profiles,
    branches: Array.isArray(row.branches) ? (row.branches[0] ?? null) : row.branches,
  }));

  return (
    <DrawingsClient
      initialDrawings={drawings}
      role={profile?.role ?? "user"}
      userId={profile?.id ?? ""}
      userBranchId={profile?.branch_id ?? null}
      branches={branches}
      canPickBranch={canSeeAllBranches(profile?.role)}
    />
  );
}
