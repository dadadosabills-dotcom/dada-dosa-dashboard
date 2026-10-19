import { fmtINR } from "@/lib/constants";
import type { PayrollPart } from "@/lib/analytics/overview-data";
import { TONE_TEXT } from "@/lib/analytics/tone";

function Row({ label, value, strong, tone, note }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad"; note?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2.5 ${strong ? "font-semibold" : ""}`}>
      <div className="min-w-0">
        <p className={`text-sm ${strong ? "text-cream" : "text-muted"}`}>{label}</p>
        {note && <p className="text-[11px] text-muted mt-0.5">{note}</p>}
      </div>
      <p className={`num text-sm shrink-0 ${tone ? TONE_TEXT[tone] : "text-cream"}`}>{value}</p>
    </div>
  );
}

/** Profit snapshot in plain words. Salaries are only subtracted for whole months, where they can be matched fairly. */
export function PnlCard({ sales, running, drawings, payroll }: { sales: number; running: number; drawings: number; payroll: PayrollPart }) {
  const before = sales - running;
  const showPayroll = payroll.applicable && payroll.processed;
  const after = before - payroll.cost;
  const money = (n: number) => (n < 0 ? `-${fmtINR(-n)}` : fmtINR(n));
  return (
    <div className="card px-4 divide-y divide-line">
      <Row label="Money in (sales)" value={fmtINR(sales)} />
      <Row label="Running costs" value={`- ${fmtINR(running)}`} note="Stock, bills, rent and other everyday costs" />
      <Row label="Profit before salaries" value={money(before)} strong tone={before >= 0 ? "good" : "bad"} />
      {payroll.applicable ? (
        showPayroll ? (
          <>
            <Row label="Salaries" value={`- ${fmtINR(payroll.cost)}`} note="From payroll for this period" />
            <Row label="Profit after salaries" value={money(after)} strong tone={after >= 0 ? "good" : "bad"} />
          </>
        ) : (
          <Row label="Salaries" value="Not processed yet" note="Counted once payroll for this month is run" />
        )
      ) : (
        <Row label="Salaries" value="—" note="Salaries are counted by month. Choose “This month” to see profit after salaries." />
      )}
      <Row label="Owner drawings (not a cost)" value={fmtINR(drawings)} note="Shown separately; not taken off profit" />
    </div>
  );
}
