import type { Insight } from "@/lib/analytics/insights";
import { TONE_BORDER, TONE_TEXT } from "@/lib/analytics/tone";

const MARK: Record<Insight["tone"], { glyph: string; word: string }> = {
  good: { glyph: "▲", word: "Good news" }, bad: { glyph: "▼", word: "Watch" }, warn: { glyph: "!", word: "Check" },
  flat: { glyph: "●", word: "Pattern" }, new: { glyph: "●", word: "Note" },
};

/** Plain-language findings, most important first. */
export function InsightsView({ insights, compareLabel, hasComparison = true }: { insights: Insight[]; compareLabel: string; hasComparison?: boolean }) {
  if (!hasComparison) {
    return (
      <div className="card p-4 border-[#F2C14E]/40">
        <p className="text-sm text-[#F2C14E]">Nothing to compare with yet</p>
        <p className="text-xs text-muted mt-1">There are no approved sales in {compareLabel}, so changes can&apos;t be worked out. Try &ldquo;This month&rdquo; or &ldquo;Last 7 days&rdquo;.</p>
      </div>
    );
  }
  if (insights.length === 0) {
    return (
      <div className="card p-4 border-[#7CC47F]/40">
        <p className="text-sm text-[#7CC47F]">✓ Nothing unusual</p>
        <p className="text-xs text-muted mt-1">Sales, costs and spending are all close to {compareLabel}. Pick a longer period to look for bigger changes.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {insights.map(i => {
        const m = MARK[i.tone];
        return (
          <li key={i.id} className={`card p-3.5 border ${TONE_BORDER[i.tone]} flex gap-3`}>
            <span className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold mt-0.5 h-fit px-1.5 py-0.5 rounded border ${TONE_BORDER[i.tone]} ${TONE_TEXT[i.tone]}`}><span aria-hidden="true">{m.glyph} </span>{m.word}</span>
            <p className="text-sm text-cream leading-snug">{i.text}</p>
          </li>
        );
      })}
    </ul>
  );
}
