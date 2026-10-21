import { fmtINRCompact } from "@/lib/analytics/format";
import { SHARE_COLORS } from "@/lib/analytics/tone";

/** Where sales come from: one stacked bar (share of total), not a pie. */
export function ChannelMix({ swiggy, zomato, upi, cash }: { swiggy: number; zomato: number; upi: number; cash: number }) {
  const items = [
    { name: "Swiggy", v: swiggy }, { name: "Zomato", v: zomato }, { name: "UPI", v: upi }, { name: "Cash", v: cash },
  ];
  const total = items.reduce((a, i) => a + i.v, 0);
  if (total <= 0) return null;
  const apps = Math.round(((swiggy + zomato) / total) * 100);
  return (
    <div className="card p-4">
      <div className="flex h-3 rounded-full overflow-hidden bg-panel2" role="img" aria-label={`Sales by channel: ${items.map(i => `${i.name} ${Math.round((i.v / total) * 100)} percent`).join(", ")}`}>
        {items.map((i, k) => i.v > 0 && <div key={i.name} style={{ width: `${(i.v / total) * 100}%`, background: SHARE_COLORS[k] }} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
        {items.map((i, k) => (
          <li key={i.name} className="flex items-baseline gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0 translate-y-[1px]" style={{ background: SHARE_COLORS[k] }} aria-hidden="true" />
            <span className="text-muted">{i.name}</span>
            <span className="num text-cream ml-auto">{Math.round((i.v / total) * 100)}% · {fmtINRCompact(i.v)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted mt-3">Swiggy and Zomato together bring in <span className="text-cream">{apps}%</span> of sales.</p>
    </div>
  );
}
