"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
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
const DOCS_LINK = { href: "/dashboard/documents", label: "Documents", icon: "docs" };

// Plain staff (role "user") only get Sales and Expenses.
const STAFF_HREFS = ["/dashboard/sales", "/dashboard/expenses"];
const ACCOUNT_LINK = { href: "/dashboard/account", label: "My Account", icon: "account" };
function linksFor(role: string, staffOverview = false) {
  if (role === "user") return [...(staffOverview ? [LINKS[0]] : []), ...LINKS.filter(l => STAFF_HREFS.includes(l.href)), ACCOUNT_LINK];
  return ["admin", "superadmin"].includes(role) ? [...LINKS, DOCS_LINK, ADMIN_LINK] : LINKS;
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
    <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 bg-panel/90 backdrop-blur border-b border-line px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(232,196,104,0.12)]">
      <div className="flex items-center gap-2 min-w-0">
        <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full ring-1 ring-gold/40" />
        <div className="min-w-0">
          <p className="text-sm text-cream leading-tight truncate">{name}</p>
          <p className="text-[10px] text-gold-dim leading-tight capitalize">{role}</p>
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
    case "docs":
      return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>;
    case "account":
      return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></svg>;
    case "admin":
      return <svg {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /><path d="M12 3v1M4.2 6.2l.9.9M19.8 6.2l-.9.9" /></svg>;
    default:
      return null;
  }
}

export function SidebarNav({ role, name, branchName, staffOverview = false }: { role: string; name: string; branchName?: string | null; staffOverview?: boolean }) {
  const pathname = usePathname();
  const signOut = useSignOut();
  const links = linksFor(role, staffOverview);

  return (
    <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-line top-0 h-screen sticky bg-gradient-to-b from-panel via-panel to-leaf-deep/50">
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={44} height={44} className="rounded-full ring-1 ring-gold/40 shadow-[0_0_24px_-4px_rgba(232,196,104,0.35)]" />
          <div>
            <p className="font-display font-semibold text-base leading-tight text-cream">Dada Dosa</p>
            <p className="devanagari text-[11px] text-gold-dim leading-tight mt-0.5">दादा डोसा</p>
          </div>
        </div>
        <div className="gold-rule mt-5" />
      </div>

      <nav className="flex-1 px-3 pb-4 space-y-1 overflow-y-auto">
        {links.map((l) => {
          const active = l.href === "/dashboard" ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                active
                  ? "bg-gradient-to-r from-gold/20 to-gold/[0.03] text-gold font-semibold shadow-[inset_0_0_0_1px_rgba(232,196,104,0.18)] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-gold"
                  : "text-muted hover:text-cream hover:bg-white/[0.04]"
              }`}
            >
              <Icon name={l.icon} />
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-md border border-line bg-ink/50 px-4 py-3">
        <p className="text-sm text-cream truncate font-semibold">{name}</p>
        <p className="mt-1.5 flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-gold/15 text-gold px-2 py-0.5 capitalize">{role}</span>
          <span className="text-muted truncate">{branchName ?? "All branches"}</span>
        </p>
        {role === "superuser" && (
          <button onClick={signOut} className="text-xs text-muted hover:text-pink-soft transition-colors mt-3">
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}

const PRIMARY_COUNT = 4;

/** Phone tab bar: up to 4 main tabs, everything else lives under "More" so nothing is squeezed or scrolls sideways. */
export function BottomNav({ role, staffOverview = false }: { role: string; staffOverview?: boolean }) {
  const pathname = usePathname();
  const links = linksFor(role, staffOverview);
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  const needMore = links.length > PRIMARY_COUNT;
  const primary = needMore ? links.slice(0, PRIMARY_COUNT) : links;
  const more = needMore ? links.slice(PRIMARY_COUNT) : [];
  const moreActive = more.some(l => isActive(l.href));

  const tab = (active: boolean) => `flex-1 min-w-0 flex flex-col items-center gap-1 py-2.5 text-[10px] ${active ? "text-gold font-semibold" : "text-muted"}`;

  return (
    <>
      {open && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="absolute left-0 right-0 bottom-0 bg-panel border-t border-line rounded-t-xl px-4 pt-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))]"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-xs text-muted mb-3">More</p>
            <div className="grid grid-cols-3 gap-3">
              {more.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border py-3 text-xs ${isActive(l.href) ? "border-gold text-gold bg-gold/10" : "border-line text-cream bg-panel2/60"}`}
                >
                  <Icon name={l.icon} />
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-panel/95 backdrop-blur border-t border-gold/20 flex pb-[env(safe-area-inset-bottom)] z-50">
        {primary.map(l => (
          <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={tab(isActive(l.href) && !open)}>
            <Icon name={l.icon} />
            <span className="truncate max-w-full">{l.label}</span>
          </Link>
        ))}
        {needMore && (
          <button onClick={() => setOpen(o => !o)} className={tab(open || moreActive)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            More
          </button>
        )}
      </nav>
    </>
  );
}
