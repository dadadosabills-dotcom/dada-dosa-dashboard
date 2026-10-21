import { fmtINR } from "@/lib/constants";
import { fmtINRCompact } from "@/lib/analytics/format";
import type { PnlRow } from "@/lib/analytics/report-calc";
import { TONE_TEXT } from "@/lib/analytics/tone";
import { PnlCard } from "../smart/pnl-card";

const money = (n: number) => (n < 0 ? `-${fmtINR(-n)}` : fmtINR(n));

function Line({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-muted">{label}</span>
      <span className={`num text-sm ${tone ? TONE_TEXT[tone] : "text-cream"}`}>{value}</span>
    </div>
  );
}

/** Whole business in plain words, then one card per branch. */
export function PnlView({ rows, total, payroll }: { rows: PnlRow[]; total: PnlRow; payroll: { applicable: boolean; processed: boolean } }) {
  const showSal = payroll.applicable && payroll.processed;
  return (
    <>
      <PnlCard sales={total.sales} running={total.running} drawings={total.drawings} payroll={{ applicable: payroll.applicable, processed: payroll.processed, cost: total.salaries ?? 0 }} />
      {rows.length > 1 && (
        <>
          <p className="text-xs text-muted mt-5 mb-2">By branch · best sales first</p>
          <ul className="space-y-3">
            {rows.map(r => (
              <li key={r.id ?? "none"} className="card p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-cream">{r.name}</p>
                  <p className="text-xs text-muted">{r.marginPct === null ? "" : `${r.marginPct}% left after running costs`}</p>
                </div>
                <div className="mt-2 divide-y divide-line">
                  <Line label="Sales" value={fmtINRCompact(r.sales)} />
                  <Line label="Running costs" value={`- ${fmtINRCompact(r.running)}`} />
                  <Line label="Profit before salaries" value={fmtINRCompact(r.before)} tone={r.before >= 0 ? "good" : "bad"} />
                  {showSal && r.salaries !== null && r.after !== null && (
                    <>
                      <Line label="Salaries" value={`- ${fmtINRCompact(r.salaries)}`} />
                      <Line label="Profit after salaries" value={fmtINRCompact(r.after)} tone={r.after >= 0 ? "good" : "bad"} />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
