import { compareValues } from "@/lib/analytics/compare";
import { fmtINRCompact } from "@/lib/analytics/format";
import { TONE_ARROW, TONE_TEXT } from "@/lib/analytics/tone";

export type LeaderRow = { id: string; name: string; sales: number; prev: number };

/** Ranking bar chart. Tap a branch to look at just that branch (drill-down). */
export function Leaderboard({ rows, selectedId, onSelect, compareLabel }: {
  rows: LeaderRow[]; selectedId: string | null; onSelect: (id: string | null) => void; compareLabel: string;
}) {
  const sorted = [...rows].sort((a, b) => b.sales - a.sales);
  const max = Math.max(1, ...sorted.map(r => r.sales));
  return (
    <ol className="card divide-y divide-line">
      {sorted.map((r, i) => {
        const ch = compareValues(r.sales, r.prev, compareLabel, true);
        const active = selectedId === r.id;
        return (
          <li key={r.id}>
            <button
              onClick={() => onSelect(active ? null : r.id)}
              aria-pressed={active}
              className={`w-full text-left p-3.5 min-h-[64px] transition-colors ${active ? "bg-panel2" : "hover:bg-panel2"}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-cream truncate"><span className="text-muted mr-2 num">{i + 1}</span>{r.name}</span>
                <span className="num text-sm text-cream shrink-0">{fmtINRCompact(r.sales)}</span>
              </div>
              <div className="h-2 rounded-full bg-panel2 mt-2 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(2, (r.sales / max) * 100)}%` }} />
              </div>
              <p className={`text-[11px] mt-1.5 ${TONE_TEXT[ch.tone]}`}>
                <span aria-hidden="true">{TONE_ARROW[ch.direction]} </span>{ch.text}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
