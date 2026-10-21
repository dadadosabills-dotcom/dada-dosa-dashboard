import Link from "next/link";
import type { CreditorAgeing } from "@/lib/analytics/types";
import { fmtINR } from "@/lib/constants";
import { fmtINRCompact, plural } from "@/lib/analytics/format";
import { EmptyNote } from "../smart/ui";

const BUCKETS = [
  { key: "bucket_0_30", label: "0–30 days", color: "#8FB3E0" },
  { key: "bucket_31_60", label: "31–60 days", color: "#F2C14E" },
  { key: "bucket_61_plus", label: "Over 60 days", color: "#FF8F7A" },
] as const;

/** Who you owe, and for how long. Oldest bills are treated as paid first. */
export function SuppliersView({ rows }: { rows: CreditorAgeing[] }) {
  const owed = rows.filter(r => r.total_outstanding > 0);
  if (owed.length === 0) return <EmptyNote title="You don't owe any supplier" hint="Nothing is outstanding right now." />;
  const totals = BUCKETS.map(b => ({ ...b, v: owed.reduce((a, r) => a + r[b.key], 0) }));
  const all = totals.reduce((a, t) => a + t.v, 0);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {totals.map(t => (
          <div key={t.key} className="card p-3">
            <p className="text-[11px] text-muted leading-tight">{t.label}</p>
            <p className="num text-base text-cream mt-1">{fmtINRCompact(t.v)}</p>
            <div className="h-1.5 rounded-full mt-2" style={{ background: t.color, opacity: t.v > 0 ? 1 : 0.25 }} aria-hidden="true" />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-2">{plural(owed.length, "supplier", "suppliers")} · {fmtINR(all)} in total. Payments are counted against the oldest bills first.</p>
      <ul className="card divide-y divide-line mt-3">
        {owed.map(r => (
          <li key={r.creditor_id} className="p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-cream truncate">{r.creditor_name}</p>
              <p className="num text-sm text-cream shrink-0">{fmtINR(r.total_outstanding)}</p>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-panel2 mt-2" role="img" aria-label={`${BUCKETS.map(b => `${b.label}: ${fmtINR(r[b.key])}`).join(", ")}`}>
              {BUCKETS.map(b => r[b.key] > 0 && <div key={b.key} style={{ width: `${(r[b.key] / r.total_outstanding) * 100}%`, background: b.color }} />)}
            </div>
            <p className="text-[11px] text-muted mt-1.5">
              {r.oldest_open_days !== null ? `Oldest unpaid bill: ${r.oldest_open_days} days` : ""}
              {r.bucket_61_plus > 0 ? <span className="text-[#FF8F7A]"> · {fmtINR(r.bucket_61_plus)} is over 60 days</span> : null}
            </p>
          </li>
        ))}
      </ul>
      <Link href="/dashboard/creditors" className="btn-ghost inline-block mt-3 min-h-[44px] leading-[26px]">Open Creditors →</Link>
    </>
  );
}
