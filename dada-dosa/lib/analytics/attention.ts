import type { BackupStatus, CreditorAgeing, MissingEntry, PendingApproval, UnusualExpense } from "./types";
import { addDays, fmtDate, type YMD } from "./dates";
import { fmtINR } from "@/lib/constants";
import { plural } from "./format";

export type Severity = "bad" | "warn" | "info";
export type AttentionDetail = { text: string; href?: string };
export type AttentionItem = {
  id: string;
  severity: Severity;
  title: string;      // one plain sentence
  details: AttentionDetail[]; // revealed on tap
  href: string;       // where to act
  actionLabel: string;
};

export type AttentionInput = {
  today: YMD;
  hourIST: number;                          // 0-23, India time
  branchNames: Map<string, string>;
  selectedBranch: string | null;            // null = all
  pending: PendingApproval[] | null;
  missing: MissingEntry[] | null;
  unusual: UnusualExpense[] | null;
  ageing: CreditorAgeing[] | null;          // owners only
  backup: BackupStatus | null | undefined;  // undefined = not applicable (not an owner)
  nowMs: number;
};

const MODULE_LABEL: Record<string, string> = { sales: "Sales", expenses: "Expenses", creditors: "Creditors", drawings: "Drawings" };
const MODULE_HREF: Record<string, string> = { sales: "/dashboard/sales", expenses: "/dashboard/expenses", creditors: "/dashboard/creditors", drawings: "/dashboard/drawings" };
const MAX_DETAILS = 8;

const daysBetween = (a: YMD, b: YMD) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function cap(details: AttentionDetail[]): AttentionDetail[] {
  if (details.length <= MAX_DETAILS) return details;
  return [...details.slice(0, MAX_DETAILS), { text: `…and ${details.length - MAX_DETAILS} more` }];
}

/** Builds the "Needs your attention" list. Pure function: same input, same output. */
export function buildAttention(i: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const nameOf = (id: string | null) => (id && i.branchNames.get(id)) || "Unassigned";
  const inScope = (id: string | null) => !i.selectedBranch || id === i.selectedBranch;

  // 1. Entries waiting for approval
  if (i.pending) {
    const rows = i.pending.filter(p => inScope(p.branch_id) && p.pending_count > 0);
    const total = rows.reduce((a, r) => a + r.pending_count, 0);
    if (total > 0) {
      const oldest = rows.reduce<string | null>((m, r) => (r.oldest_date && (!m || r.oldest_date < m) ? r.oldest_date : m), null);
      const oldestDays = oldest ? daysBetween(oldest, i.today) : 0;
      const sorted = [...rows].sort((a, b) => (a.oldest_date ?? "").localeCompare(b.oldest_date ?? ""));
      items.push({
        id: "pending",
        severity: oldestDays >= 3 ? "bad" : "warn",
        title: `${plural(total, "entry is", "entries are")} waiting for approval${oldestDays >= 1 ? ` (oldest ${oldestDays} ${oldestDays === 1 ? "day" : "days"})` : ""}`,
        details: cap(sorted.map(r => ({
          text: `${MODULE_LABEL[r.module] ?? r.module} · ${nameOf(r.branch_id)} — ${r.pending_count} waiting${r.oldest_date ? `, since ${fmtDate(r.oldest_date)}` : ""}`,
          href: MODULE_HREF[r.module],
        }))),
        href: MODULE_HREF[sorted[0].module] ?? "/dashboard/sales",
        actionLabel: "Review",
      });
    }
  }

  // 2. Sales not entered (past days always; today only after 9 PM)
  if (i.missing) {
    const since = addDays(i.today, -7);
    const rows = i.missing.filter(m => inScope(m.branch_id) && m.entry_date >= since && (!m.is_today || i.hourIST >= 21));
    if (rows.length > 0) {
      const byBranch = new Map<string, string[]>();
      for (const r of rows) byBranch.set(r.branch_id, [...(byBranch.get(r.branch_id) ?? []), r.entry_date]);
      const details = [...byBranch.entries()].map(([id, dates]) => {
        const sorted = [...dates].sort().reverse();
        const shown = sorted.slice(0, 4).map(fmtDate).join(", ");
        return { text: `${nameOf(id)} — ${plural(sorted.length, "day", "days")} missing: ${shown}${sorted.length > 4 ? "…" : ""}`, href: "/dashboard/sales" };
      });
      items.push({
        id: "missing",
        severity: "bad",
        title: `${plural(byBranch.size, "branch has", "branches have")} not entered sales`,
        details: cap(details),
        href: "/dashboard/sales",
        actionLabel: "Open Sales",
      });
    }
  }

  // 3. Suppliers unpaid for more than 30 days (owners only; not branch-specific)
  if (i.ageing && !i.selectedBranch) {
    const rows = i.ageing.filter(a => a.bucket_31_60 + a.bucket_61_plus > 0).sort((a, b) => (b.bucket_31_60 + b.bucket_61_plus) - (a.bucket_31_60 + a.bucket_61_plus));
    if (rows.length > 0) {
      const over60 = rows.some(r => r.bucket_61_plus > 0);
      items.push({
        id: "overdue",
        severity: over60 ? "bad" : "warn",
        title: `You owe ${plural(rows.length, "supplier", "suppliers")} for bills older than 30 days`,
        details: cap(rows.map(r => ({
          text: `${r.creditor_name} — ${fmtINR(r.bucket_31_60 + r.bucket_61_plus)} overdue${r.oldest_open_days != null ? `, oldest bill ${r.oldest_open_days} days` : ""}`,
          href: "/dashboard/creditors",
        }))),
        href: "/dashboard/creditors",
        actionLabel: "Open Creditors",
      });
    }
  }

  // 4. Unusually high expenses
  if (i.unusual) {
    const rows = i.unusual.filter(u => inScope(u.branch_id));
    if (rows.length > 0) {
      items.push({
        id: "unusual",
        severity: "warn",
        title: `${plural(rows.length, "expense is", "expenses are")} much higher than usual`,
        details: cap(rows.map(u => ({
          text: `${u.category} ${fmtINR(u.amount)} at ${nameOf(u.branch_id)} (${fmtDate(u.date)}) — ${u.times_typical}× the usual ${fmtINR(u.typical_amount)}${u.status === "pending" ? ", not approved yet" : ""}`,
          href: "/dashboard/expenses",
        }))),
        href: "/dashboard/expenses",
        actionLabel: "Check expenses",
      });
    }
  }

  // 5. Backup health (owners only)
  if (i.backup !== undefined) {
    const b = i.backup;
    if (!b || !b.last_success_at) {
      items.push({ id: "backup", severity: "warn", title: "No successful backup has been recorded yet", details: b?.message ? [{ text: b.message }] : [], href: "/dashboard/admin", actionLabel: "Open Admin" });
    } else {
      const hours = (i.nowMs - Date.parse(b.last_success_at)) / 3600000;
      if (hours > 36) {
        const days = Math.floor(hours / 24);
        items.push({ id: "backup", severity: "bad", title: `The last good backup was ${plural(days, "day", "days")} ago`, details: b.message ? [{ text: b.message }] : [], href: "/dashboard/admin", actionLabel: "Open Admin" });
      } else if (!b.ok) {
        items.push({ id: "backup", severity: "warn", title: "The latest backup run reported a problem", details: b.message ? [{ text: b.message }] : [], href: "/dashboard/admin", actionLabel: "Open Admin" });
      }
    }
  }

  const rank: Record<Severity, number> = { bad: 0, warn: 1, info: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
