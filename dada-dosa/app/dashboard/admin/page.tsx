import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { AdminClient, type StaffProfile, type BranchRow } from "./admin-client";

export default async function AdminPage() {
  const supabase = createClient();
  const profile = await getProfile();
  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const { data: staffData } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, branch_id, phone, branches(name)")
    .order("full_name");
  const staff: StaffProfile[] = (staffData ?? []).map((s: any) => ({
    ...s,
    branches: Array.isArray(s.branches) ? (s.branches[0] ?? null) : s.branches,
  }));

  const { data: branches } = await supabase.from("branches").select("id, name, active").order("name");

  return <AdminClient staff={staff} branches={(branches ?? []) as BranchRow[]} currentUserId={profile.id} currentUserRole={profile.role} />;
}
