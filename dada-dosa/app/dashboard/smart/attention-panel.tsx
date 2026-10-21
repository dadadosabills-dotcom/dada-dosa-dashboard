import Link from "next/link";
import type { AttentionItem } from "@/lib/analytics/attention";
import { TONE_BORDER, TONE_TEXT, type DisplayTone } from "@/lib/analytics/tone";

const SEV: Record<AttentionItem["severity"], { tone: DisplayTone; word: string }> = {
  bad: { tone: "bad", word: "Urgent" },
  warn: { tone: "warn", word: "Check" },
  info: { tone: "flat", word: "Note" },
};

/** "Needs your attention": one line per problem; tap a line to see exactly what and where. */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="card p-4 border-[#7CC47F]/40" id="attention">
        <p className="text-sm text-[#7CC47F]">✓ All clear</p>
        <p className="text-xs text-muted mt-1">Nothing is waiting for you right now. No approvals pending, no missing entries, no overdue suppliers.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2" id="attention">
      {items.map(it => {
        const s = SEV[it.severity];
        return (
          <li key={it.id}>
            <details className={`card border ${TONE_BORDER[s.tone]} group`}>
              <summary className="flex items-start gap-3 p-3.5 cursor-pointer list-none min-h-[56px]">
                <span className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold mt-0.5 px-1.5 py-0.5 rounded border ${TONE_BORDER[s.tone]} ${TONE_TEXT[s.tone]}`}>{s.word}</span>
                <span className="text-sm text-cream flex-1 leading-snug">{it.title}</span>
                <span className="text-muted text-xs mt-0.5 group-open:rotate-90 transition-transform" aria-hidden="true">▶</span>
              </summary>
              <div className="px-3.5 pb-3.5 border-t border-line">
                {it.details.length > 0 && (
                  <ul className="mt-2.5 space-y-2">
                    {it.details.map((d, i) => (
                      <li key={i} className="text-xs text-muted leading-snug">
                        {d.href ? <Link href={d.href} className="hover:text-cream underline-offset-2 hover:underline">{d.text}</Link> : d.text}
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={it.href} className="btn-ghost inline-block mt-3 min-h-[44px] leading-[26px]">{it.actionLabel} →</Link>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
