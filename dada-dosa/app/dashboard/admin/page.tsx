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

  let empRes: any = await supabase.from("employees").select("id, name, profile_id").order("name");
  if (empRes.error) empRes = await supabase.from("employees").select("id, name").order("name"); // migration 010 not run yet
  const employees = ((empRes.data ?? []) as any[]).map(e => ({ id: e.id, name: e.name, profile_id: e.profile_id ?? null }));

  const { data: branches } = await supabase.from("branches").select("id, name, active").order("name");

  return <AdminClient staff={staff} employees={employees} branches={(branches ?? []) as BranchRow[]} currentUserId={profile.id} currentUserRole={profile.role} />;
}
