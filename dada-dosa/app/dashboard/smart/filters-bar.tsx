"use client";

import { PRESET_LABELS, fmtRange, type DateRange, type RangePreset } from "@/lib/analytics/dates";
import type { Branch } from "@/lib/constants";

const SHORT: Record<RangePreset, string> = {
  today: "Today", yesterday: "Yesterday", last7: "7 days", this_month: "This month",
  last_month: "Last month", this_fy: "This year", custom: "Custom",
};
const ORDER: RangePreset[] = ["today", "yesterday", "last7", "this_month", "last_month", "this_fy", "custom"];

/** One date range + one branch for the whole page. Sticks to the top while scrolling. */
export function FiltersBar({
  preset, onPreset, range, custom, onCustom, branches, branchId, onBranch, showBranchPicker, stickyClass,
}: {
  preset: RangePreset; onPreset: (p: RangePreset) => void;
  range: DateRange; custom: DateRange | null; onCustom: (r: DateRange) => void;
  branches: Branch[]; branchId: string | null; onBranch: (id: string | null) => void;
  showBranchPicker: boolean; stickyClass: string;
}) {
  const c = custom ?? range;
  return (
    <div className={`sticky ${stickyClass} z-20 -mx-5 px-5 md:-mx-8 md:px-8 py-2.5 bg-ink/95 backdrop-blur border-b border-line`}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="Time period">
        {ORDER.map(p => (
          <button
            key={p} role="tab" aria-selected={preset === p} onClick={() => onPreset(p)}
            className={`shrink-0 min-h-[44px] px-3.5 rounded-full text-sm border transition-colors ${
              preset === p ? "bg-gold text-ink border-gold font-semibold" : "border-line text-cream hover:border-gold-dim"
            }`}
          >{SHORT[p]}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
        {showBranchPicker && (
          <label className="flex items-center gap-2 text-xs text-muted">
            Branch
            <select value={branchId ?? ""} onChange={e => onBranch(e.target.value || null)} className="min-h-[44px] max-w-[11rem]" aria-label="Branch">
              <option value="">All branches</option>
              {branches.filter(b => b.active && b.name !== "All Branch").map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <p className="text-xs text-muted">{PRESET_LABELS[preset]}: <span className="text-cream">{fmtRange(range)}</span></p>
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <label className="text-xs text-muted flex items-center gap-2">From
            <input type="date" value={c.from} max={c.to} onChange={e => e.target.value && onCustom({ from: e.target.value, to: c.to })} className="min-h-[44px]" />
          </label>
          <label className="text-xs text-muted flex items-center gap-2">To
            <input type="date" value={c.to} min={c.from} onChange={e => e.target.value && onCustom({ from: c.from, to: e.target.value })} className="min-h-[44px]" />
          </label>
        </div>
      )}
    </div>
  );
}
