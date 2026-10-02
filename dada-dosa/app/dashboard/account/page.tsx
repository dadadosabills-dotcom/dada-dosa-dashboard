import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { AccountClient, type MyAdvance, type MyRun } from "./account-client";

export const dynamic = "force-dynamic";

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function AccountPage() {
  const supabase = createClient();
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "user") redirect("/dashboard"); // this page is the staff member's own space

  // Which employee record is this login? Explicit link (Admin → Staff) first, else the same name.
  let linked: { id: string; name: string } | null = null;
  let res: any = await supabase.from("employees").select("id, name, profile_id");
  if (res.error) res = await supabase.from("employees").select("id, name"); // migration 010 not run yet
  const emps: { id: string; name: string; profile_id?: string | null }[] = res.data ?? [];
  linked = emps.find(e => e.profile_id === profile.id) ?? emps.find(e => norm(e.name) === norm(profile.full_name)) ?? null;

  let advances: MyAdvance[] = [];
  let runs: MyRun[] = [];
  if (linked) {
    const [{ data: advData }, { data: runData }] = await Promise.all([
      supabase
        .from("salary_advances")
        .select("id, date, amount, remaining, source_expense_id, expenses(status)")
        .eq("employee_id", linked.id)
        .order("date", { ascending: false }),
      supabase
        .from("payroll_runs")
        .select("id, period, advances_deducted, food_bill, missing_bill, bank_deduction, pf, shoes, fine, uniform, deductions")
        .eq("employee_id", linked.id)
        .order("period", { ascending: false }),
    ]);
    advances = (advData ?? []).map((a: any) => ({ ...a, expenses: one(a.expenses) }));
    runs = (runData ?? []) as MyRun[];
  }

  return <AccountClient name={profile.full_name} branchName={profile.branch_name} employeeName={linked?.name ?? null} advances={advances} runs={runs} />;
}
