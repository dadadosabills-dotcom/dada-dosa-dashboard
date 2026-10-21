import { fmtINR } from "@/lib/constants";
import type { CashFlowSummary } from "@/lib/analytics/report-calc";
import { TONE_TEXT } from "@/lib/analytics/tone";

function Row({ label, value, note, strong, tone }: { label: string; value: string; note?: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0"><p className={`text-sm ${strong ? "text-cream font-semibold" : "text-muted"}`}>{label}</p>{note && <p className="text-[11px] text-muted mt-0.5">{note}</p>}</div>
      <p className={`num text-sm shrink-0 ${tone ? TONE_TEXT[tone] : "text-cream"}`}>{value}</p>
    </div>
  );
}

/** Money in, money out, and what was bought on credit. Movement only: opening balances aren't recorded. */
export function CashFlowView({ s }: { s: CashFlowSummary }) {
  const money = (n: number) => (n < 0 ? `-${fmtINR(-n)}` : fmtINR(n));
  return (
    <div className="space-y-4">
      <div className="card px-4 divide-y divide-line">
        <Row label="Money in (all sales)" value={fmtINR(s.inTotal)} strong />
        {s.channels.map(c => <Row key={c.name} label={`  ${c.name}`} value={fmtINR(c.v)} />)}
      </div>
      <div className="card px-4 divide-y divide-line">
        <Row label="Money paid out" value={`- ${fmtINR(s.paidTotal)}`} strong note={`${fmtINR(s.cashPaid)} in cash · ${fmtINR(s.bankPaid)} by bank`} />
        <Row label="  Running costs" value={fmtINR(s.paid.running)} />
        <Row label="  Payments to suppliers" value={fmtINR(s.paid.suppliers)} note="For bills bought on credit earlier" />
        <Row label="  Salaries paid" value={fmtINR(s.paid.salaries)} />
        <Row label="  Owner drawings" value={fmtINR(s.paid.drawings)} />
      </div>
      <div className="card px-4">
        <Row label="Left over (in minus paid out)" value={money(s.net)} strong tone={s.net >= 0 ? "good" : "bad"} note="Before any opening cash or bank balance" />
      </div>
      <div className="card px-4">
        <Row label="Bought on credit, not paid yet" value={fmtINR(s.onCredit)} note="This becomes money you owe suppliers" />
      </div>
      <p className="text-xs text-muted">Uses approved entries only. Opening cash and bank balances aren&apos;t recorded in the app, so this shows money moving, not the balance you hold.</p>
    </div>
  );
}
