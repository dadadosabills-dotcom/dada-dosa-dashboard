"use client";

import { useState } from "react";
import { compareValues } from "@/lib/analytics/compare";
import { fmtINRCompact } from "@/lib/analytics/format";
import { METRIC_LABEL, type CompareMetric, type MetricRow } from "@/lib/analytics/report-calc";
import { TONE_ARROW, TONE_TEXT } from "@/lib/analytics/tone";
import { EmptyNote } from "../smart/ui";

const METRICS: CompareMetric[] = ["sales", "perDay", "profit", "costRatio"];

/** Branches side by side on one measure at a time. */
export function CompareView({ build, compareLabel, onPick, picked }: {
  build: (m: CompareMetric) => MetricRow[]; compareLabel: string; onPick: (id: string | null) => void; picked: string | null;
}) {
  const [metric, setMetric] = useState<CompareMetric>("sales");
  const rows = build(metric);
  const lowerBetter = metric === "costRatio";
  const fmt = (v: number) => (lowerBetter ? `${Math.round(v)}%` : fmtINRCompact(v));
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Compare by">
        {METRICS.map(m => (
          <button key={m} role="tab" aria-selected={metric === m} onClick={() => setMetric(m)}
            className={`shrink-0 min-h-[44px] px-3.5 rounded-full text-sm border ${metric === m ? "bg-gold text-ink border-gold font-semibold" : "border-line text-cream hover:border-gold-dim"}`}>{METRIC_LABEL[m]}</button>
        ))}
      </div>
      <p className="text-xs text-muted mt-2 mb-3">{lowerBetter ? "Lower is better: the share of sales spent on running costs." : "Higher is better."} Tap a branch to look at only that branch.</p>
      {rows.length === 0 ? <EmptyNote title="Nothing to compare yet" hint="No approved sales or expenses in this period." /> : (
        <ol className="card divide-y divide-line">
          {rows.map((r, i) => {
            const ch = r.prev === null ? null : compareValues(r.value, r.prev, compareLabel, !lowerBetter);
            return (
              <li key={r.id ?? "none"}>
                <button onClick={() => onPick(picked === r.id ? null : r.id)} aria-pressed={picked === r.id} className={`w-full text-left p-3.5 min-h-[64px] ${picked === r.id ? "bg-panel2" : "hover:bg-panel2"}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-cream truncate"><span className="text-muted mr-2 num">{i + 1}</span>{r.name}</span>
                    <span className="num text-sm text-cream shrink-0">{fmt(r.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-panel2 mt-2 overflow-hidden" aria-hidden="true">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%` }} />
                  </div>
                  {ch && <p className={`text-[11px] mt-1.5 ${TONE_TEXT[ch.tone]}`}><span aria-hidden="true">{TONE_ARROW[ch.direction]} </span>{ch.text}</p>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
