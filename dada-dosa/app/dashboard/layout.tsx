import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { SidebarNav, BottomNav, MobileTopBar } from "./nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // No session at all — genuinely not logged in, safe to send to /login.
  if (!user) redirect("/login");

  const profile = await getProfile();

  // Logged in, but the profile row couldn't be loaded (RLS issue, deleted
  // row, database hiccup, etc). Do NOT redirect to /login here — the user
  // still has a valid session, so /login would just bounce them straight
  // back to /dashboard, creating an infinite redirect loop. Show a clear,
  // dead-end message instead.
  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-cream mb-2">Couldn&apos;t load your account.</p>
          <p className="text-muted text-sm mb-4">
            You&apos;re signed in, but your staff profile couldn&apos;t be read. This
            usually means it hasn&apos;t been set up yet, or there was a
            temporary database issue. Try refreshing, or contact an admin.
          </p>
          <SignOutButton />
        </div>
      </main>
    );
  }

  if (!profile.active) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-muted">
          Your account is deactivated. Contact an admin to restore access.
        </p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <SidebarNav role={profile.role} name={profile.full_name} branchName={profile.branch_name} />
      <div className="flex-1 min-w-0 pb-16 md:pb-0">
        <MobileTopBar name={profile.full_name} role={profile.role} />
        {children}
      </div>
      <BottomNav role={profile.role} />
    </div>
  );
}

function SignOutButton() {
  return (
    <form action="/api/signout" method="post">
      <button type="submit" className="btn-ghost">Sign out and try again</button>
    </form>
  );
}
