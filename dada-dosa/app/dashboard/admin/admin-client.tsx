"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BackupPanel } from "./backup-panel";

export type StaffProfile = {
  id: string; full_name: string; role: string; active: boolean; branch_id: string | null; phone: string | null;
  branches: { name: string } | null;
};
export type BranchRow = { id: string; name: string; active: boolean };
export type EmployeeLink = { id: string; name: string; profile_id: string | null };

const ROLES = ["user", "superuser", "admin", "superadmin"];

export function AdminClient({ staff, employees, branches, currentUserId, currentUserRole }: {
  staff: StaffProfile[]; employees: EmployeeLink[]; branches: BranchRow[]; currentUserId: string; currentUserRole: string;
}) {
  const [tab, setTab] = useState<"staff" | "branches" | "backup" | "account">("staff");

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-cream">Admin</h1>
        <p className="text-muted text-sm mt-1">Staff roles, branch assignment, the branch list, and backups</p>
      </header>

      <div className="flex gap-1 mb-6 border-b border-line overflow-x-auto">
        <button onClick={() => setTab("staff")} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === "staff" ? "border-gold text-gold" : "border-transparent text-muted hover:text-cream"}`}>Staff</button>
        <button onClick={() => setTab("branches")} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === "branches" ? "border-gold text-gold" : "border-transparent text-muted hover:text-cream"}`}>Branches</button>
        <button onClick={() => setTab("backup")} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === "backup" ? "border-gold text-gold" : "border-transparent text-muted hover:text-cream"}`}>Backup &amp; Restore</button>
        <button onClick={() => setTab("account")} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === "account" ? "border-gold text-gold" : "border-transparent text-muted hover:text-cream"}`}>Account</button>
      </div>

      {tab === "staff" ? (
        <StaffTab staff={staff} employees={employees} branches={branches} currentUserId={currentUserId} currentUserRole={currentUserRole} />
      ) : tab === "branches" ? (
        <BranchesTab branches={branches} />
      ) : tab === "backup" ? (
        <BackupPanel currentUserId={currentUserId} currentUserRole={currentUserRole} />
      ) : (
        <AccountTab name={staff.find(x => x.id === currentUserId)?.full_name ?? ""} role={currentUserRole} />
      )}
    </main>
  );
}

function StaffTab({ staff, employees, branches, currentUserId, currentUserRole }: { staff: StaffProfile[]; employees: EmployeeLink[]; branches: BranchRow[]; currentUserId: string; currentUserRole: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  async function updateRole(id: string, role: string) {
    setSavingId(id);
    const branchNeeded = role === "user" || role === "superuser";
    const patch: any = { role };
    if (!branchNeeded) patch.branch_id = null; // admin/superadmin see all branches, no lock needed
    await supabase.from("profiles").update(patch).eq("id", id);
    setSavingId(null);
    router.refresh();
  }

  async function updateBranch(id: string, branch_id: string) {
    setSavingId(id);
    await supabase.from("profiles").update({ branch_id: branch_id || null }).eq("id", id);
    setSavingId(null);
    router.refresh();
  }

  async function linkEmployee(profileId: string, employeeId: string) {
    setSavingId(profileId);
    await supabase.from("employees").update({ profile_id: null }).eq("profile_id", profileId); // one employee record per login
    if (employeeId) await supabase.from("employees").update({ profile_id: profileId }).eq("id", employeeId);
    setSavingId(null);
    router.refresh();
  }

  async function toggleActive(id: string, active: boolean) {
    if (id === currentUserId) return;
    setSavingId(id);
    await supabase.from("profiles").update({ active: !active }).eq("id", id);
    setSavingId(null);
    router.refresh();
  }

  const assignableRoles = currentUserRole === "superadmin" ? ROLES : ROLES.filter(r => r !== "superadmin");

  const roleSelect = (s: StaffProfile) => (
    <select value={s.role} disabled={s.id === currentUserId || savingId === s.id} onChange={e => updateRole(s.id, e.target.value)} className="text-sm w-full">
      {assignableRoles.map(r => <option key={r} value={r}>{r}</option>)}
    </select>
  );
  const branchSelect = (s: StaffProfile) =>
    s.role === "user" || s.role === "superuser" ? (
      <select value={s.branch_id ?? ""} disabled={savingId === s.id} onChange={e => updateBranch(s.id, e.target.value)} className="text-sm w-full">
        <option value="">Unassigned</option>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    ) : (
      <span className="text-muted text-xs">All branches</span>
    );
  const employeeSelect = (s: StaffProfile) => (
    <select value={employees.find(e => e.profile_id === s.id)?.id ?? ""} disabled={savingId === s.id} onChange={e => linkEmployee(s.id, e.target.value)} className="text-sm w-full">
      <option value="">Not linked</option>
      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );

  return (
    <>
    {/* Phones: one card per person instead of a wide table */}
    <div className="md:hidden space-y-3">
      {staff.map(s => (
        <div key={s.id} className="card p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-cream text-sm min-w-0 break-words">
              {s.full_name}
              {s.id === currentUserId && <span className="ml-2 text-[10px] text-gold">(you)</span>}
              {!s.active && <span className="ml-2 text-[10px] text-rust">inactive</span>}
            </p>
            {s.id !== currentUserId && (
              <button onClick={() => toggleActive(s.id, s.active)} className="shrink-0 text-xs text-muted hover:text-rust">
                {s.active ? "Deactivate" : "Reactivate"}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <label className="block"><span className="block text-[11px] text-muted mb-1">Role</span>{roleSelect(s)}</label>
            <label className="block"><span className="block text-[11px] text-muted mb-1">Branch</span>{branchSelect(s)}</label>
            <label className="block"><span className="block text-[11px] text-muted mb-1">Employee record</span>{employeeSelect(s)}</label>
          </div>
        </div>
      ))}
      <p className="text-muted text-xs">New staff sign up themselves at /signup, then show up here as "user" with no branch until you assign both.</p>
    </div>
    <div className="card overflow-x-auto hidden md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Branch</th>
            <th className="px-4 py-3 font-medium">Employee record</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {staff.map(s => {
            const needsBranch = s.role === "user" || s.role === "superuser";
            return (
              <tr key={s.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-cream">
                  {s.full_name}
                  {s.id === currentUserId && <span className="ml-2 text-[10px] text-gold">(you)</span>}
                  {!s.active && <span className="ml-2 text-[10px] text-rust">inactive</span>}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={s.role}
                    disabled={s.id === currentUserId || savingId === s.id}
                    onChange={e => updateRole(s.id, e.target.value)}
                    className="text-sm"
                  >
                    {assignableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {needsBranch ? (
                    <select
                      value={s.branch_id ?? ""}
                      disabled={savingId === s.id}
                      onChange={e => updateBranch(s.id, e.target.value)}
                      className="text-sm"
                    >
                      <option value="">Unassigned</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-muted text-xs">All branches</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={employees.find(e => e.profile_id === s.id)?.id ?? ""}
                    disabled={savingId === s.id}
                    onChange={e => linkEmployee(s.id, e.target.value)}
                    className="text-sm max-w-[160px]"
                  >
                    <option value="">Not linked</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  {s.id !== currentUserId && (
                    <button onClick={() => toggleActive(s.id, s.active)} className="text-xs text-muted hover:text-rust hover:underline">
                      {s.active ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted text-xs px-4 py-3 border-t border-line">
        New staff sign up themselves at /signup, then show up here as "user" with no branch until you assign both.
      </p>
    </div>
    </>
  );
}

function BranchesTab({ branches }: { branches: BranchRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabase.from("branches").insert({ name: name.trim() });
    if (error) { setError(error.message); return; }
    setName("");
    router.refresh();
  }

  async function toggleActive(id: string, active: boolean) {
    await supabase.from("branches").update({ active: !active }).eq("id", id);
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={addBranch} className="card p-4 mb-6 flex gap-3 items-end max-w-md">
        <div className="flex-1">
          <label className="block text-[11px] text-muted mb-1">New branch name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 11th Branch" className="w-full" />
        </div>
        <button type="submit" className="btn-primary">Add</button>
      </form>
      {error && <p className="text-rust text-xs mb-4">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {branches.map(b => (
              <tr key={b.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-cream">{b.name}{!b.active && <span className="ml-2 text-[10px] text-rust">inactive</span>}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggleActive(b.id, b.active)} className="text-xs text-muted hover:text-gold hover:underline">
                    {b.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted text-xs mt-3">
        Deactivating hides a branch from dropdowns going forward — past entries logged against it stay intact.
      </p>
    </div>
  );
}


function AccountTab({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <section className="card p-5 max-w-md">
      <h2 className="font-display text-lg text-cream mb-1">Your account</h2>
      <p className="text-muted text-sm mb-4">Signed in as <span className="text-cream">{name}</span> · <span className="text-gold-dim uppercase text-xs tracking-wide">{role}</span></p>
      <button onClick={signOut} className="btn-ghost hover:border-rust hover:text-rust w-full sm:w-auto">Sign out</button>
    </section>
  );
}
