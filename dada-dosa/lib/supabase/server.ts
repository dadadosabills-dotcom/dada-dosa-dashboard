import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // called from a Server Component — safe to ignore, middleware refreshes the session
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // see above
          }
        },
      },
    }
  );
}

// Fetch the current user's profile (id, name, role, branch) — every
// protected page uses this to decide what to show and what actions to allow.
export async function getProfile() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, branch_id, branches(name)")
    .eq("id", user.id)
    .single();
  if (!data) return null;
  const branches = Array.isArray((data as any).branches) ? (data as any).branches[0] : (data as any).branches;
  return { ...data, branch_name: branches?.name ?? null } as {
    id: string; full_name: string; role: string; active: boolean;
    branch_id: string | null; branch_name: string | null;
  };
}

// Admin+/superadmin see every branch; everyone else is locked to their own.
export function canSeeAllBranches(role: string | undefined) {
  return role === "admin" || role === "superadmin";
}

// Fetch active branches for dropdowns — same list everywhere.
export async function getBranches() {
  const supabase = createClient();
  const { data } = await supabase.from("branches").select("id, name, active").eq("active", true).order("name");
  return data ?? [];
}
