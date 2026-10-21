import { redirect } from "next/navigation";
import { createClient, getProfile, getBranches } from "@/lib/supabase/server";
import { getFlags } from "@/lib/flags";
import ReportsClient from "./reports-client";

// New screen, behind the `insights_reports` flag. If the flag is off (or the person is staff),
// it quietly sends them to the normal overview, so nothing existing is affected.
export default async function ReportsPage() {
  const supabase = createClient();
  const profile = await getProfile();
  if (!profile || profile.role === "user") redirect("/dashboard");
  if (!(await getFlags(supabase)).insights_reports) redirect("/dashboard");
  const branches = await getBranches();
  return (
    <main className="px-5 py-6 md:px-8 md:py-8 w-full max-w-[1760px]">
      <ReportsClient
        role={profile.role as "admin" | "superadmin" | "superuser"}
        branches={branches}
        ownBranchId={profile.branch_id}
        ownBranchName={profile.branch_name}
      />
    </main>
  );
}
