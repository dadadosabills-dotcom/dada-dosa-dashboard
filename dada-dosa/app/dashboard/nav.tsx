"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/dashboard", label: "Overview", icon: "home" },
  { href: "/dashboard/sales", label: "Sales", icon: "sales" },
  { href: "/dashboard/expenses", label: "Expenses", icon: "expenses" },
  { href: "/dashboard/payroll", label: "Payroll", icon: "payroll" },
  { href: "/dashboard/creditors", label: "Creditors", icon: "creditors" },
  { href: "/dashboard/drawings", label: "Drawings", icon: "drawings" },
];

const ADMIN_LINK = { href: "/dashboard/admin", label: "Admin", icon: "admin" };

// Plain staff (role "user") only get Sales and Expenses.
const STAFF_HREFS = ["/dashboard/sales", "/dashboard/expenses"];
function linksFor(role: string) {
  if (role === "user") return LINKS.filter(l => STAFF_HREFS.includes(l.href));
  return ["admin", "superadmin"].includes(role) ? [...LINKS, ADMIN_LINK] : LINKS;
}

function useSignOut() {
  const router = useRouter();
  const supabase = createClient();
  return async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };
}

/** Phone-only header: shows who is signed in and always has a Sign out button (the sidebar is desktop-only). */
export function MobileTopBar({ name, role }: { name: string; role: string }) {
  const signOut = useSignOut();
  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 bg-panel border-b border-line px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 min-w-0">
        <Image src="/logo.png" alt="" width={26} height={26} />
        <div className="min-w-0">
          <p className="text-sm text-cream leading-tight truncate">{name}</p>
          <p className="text-[10px] text-gold-dim uppercase tracking-wide leading-tight">{role}</p>
        </div>
      </div>
      <button onClick={signOut} className="shrink-0 text-xs border border-line rounded px-3 py-1.5 text-cream hover:border-rust hover:text-rust transition-colors">
        Sign out
      </button>
    </header>
  );
}

// Minimal, hand-drawn-feeling line icons — no icon library, keeps the
// bundle small and the mark consistent with the rest of the UI.
function Icon({ name }: { name: string }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6 };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9h12v-9" /></svg>;
    case "sales":
      return <svg {...common}><path d="M4 19V9l5-5 5 5v10" /><path d="M9 19v-6h4v6" /><path d="M15 19V8l5 3v8h-5" /></svg>;
    case "expenses":
      return <svg {...common}><rect x="4" y="6" width="16" height="12" rx="1.5" /><path d="M4 10h16" /><path d="M8 14h3" /></svg>;
    case "payroll":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M17 9h4M19 7v4" /></svg>;
    case "creditors":
      return <svg {...common}><path d="M4 5h16v5c0 6-3.5 9-8 10-4.5-1-8-4-8-10V5Z" /></svg>;
    case "drawings":
      return <svg {...common}><path d="M12 3v18" /><path d="M7 8c0-2.2 2.2-4 5-4s5 1.8 5 4-2.2 4-5 4-5 1.8-5 4 2.2 4 5 4 5-1.8 5-4" /></svg>;
    case "admin":
      return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /><path d="M12 3v1M4.2 6.2l.9.9M19.8 6.2l-.9.9" /></svg>;
    default:
      return null;
  }
}

export function SidebarNav({ role, name, branchName }: { role: string; name: string; branchName?: string | null }) {
  const pathname = usePathname();
  const signOut = useSignOut();
  const links = linksFor(role);

  return (
    <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-line bg-panel min-h-screen sticky top-0">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-line">
        <Image src="/logo.png" alt="" width={32} height={32} />
        <div>
          <p className="font-display font-semibold text-sm leading-tight text-cream">Dada Dosa</p>
          <p className="text-[11px] text-muted leading-tight">Dashboard</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {links.map((l) => {
          const active = l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                active ? "bg-gold/10 text-gold border-l-2 border-gold -ml-px pl-[11px]" : "text-muted hover:text-cream hover:bg-panel2"
              }`}
            >
              <Icon name={l.icon} />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-line">
        <p className="text-sm text-cream truncate">{name}</p>
        <p className="text-[11px] text-gold-dim uppercase tracking-wide">{role}</p>
        <p className="text-[11px] text-muted mb-3">{branchName ?? "All branches"}</p>
        <button onClick={signOut} className="text-xs text-muted hover:text-rust transition-colors">
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function BottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const links = linksFor(role);
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-panel border-t border-line flex pb-[env(safe-area-inset-bottom)] z-40 overflow-x-auto">
      {links.map((l) => {
        const active = l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] ${
              active ? "text-gold" : "text-muted"
            }`}
          >
            <Icon name={l.icon} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
