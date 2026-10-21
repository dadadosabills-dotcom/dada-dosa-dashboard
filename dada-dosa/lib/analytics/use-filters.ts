"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { compareRangeFor, rangeFor, todayIST, type CompareRange, type DateRange, type RangePreset } from "./dates";

// One date range + one branch, remembered on this device (so the next screen,
// and the next visit, opens exactly how the person left it).

const KEY = "dd:filters:v1";
const PRESETS: RangePreset[] = ["today", "yesterday", "last7", "this_month", "last_month", "this_fy", "custom"];

type Saved = { preset: RangePreset; custom: DateRange | null; branchId: string | null };

function load(): Saved | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    if (!v.preset || !PRESETS.includes(v.preset)) return null;
    const c = v.custom;
    const custom = c && /^\d{4}-\d{2}-\d{2}$/.test(c.from) && /^\d{4}-\d{2}-\d{2}$/.test(c.to) && c.from <= c.to ? c : null;
    return { preset: v.preset, custom, branchId: typeof v.branchId === "string" ? v.branchId : null };
  } catch {
    return null; // private mode / corrupt value: just use defaults
  }
}
function save(v: Saved) {
  try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

export function useGlobalFilters(validBranchIds: string[], lockedBranch: string | null) {
  const [hydrated, setHydrated] = useState(false);
  const [preset, setPresetState] = useState<RangePreset>("today");
  const [custom, setCustomState] = useState<DateRange | null>(null);
  const [branchId, setBranchState] = useState<string | null>(null);
  const [today] = useState(() => todayIST());

  useEffect(() => {
    const s = load();
    if (s) {
      setPresetState(s.preset === "custom" && !s.custom ? "today" : s.preset);
      setCustomState(s.custom);
      setBranchState(s.branchId && validBranchIds.includes(s.branchId) ? s.branchId : null);
    }
    setHydrated(true);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((p: RangePreset, c: DateRange | null, b: string | null) => save({ preset: p, custom: c, branchId: b }), []);

  const setPreset = (p: RangePreset) => { setPresetState(p); persist(p, custom, branchId); };
  const setCustom = (c: DateRange) => { setCustomState(c); setPresetState("custom"); persist("custom", c, branchId); };
  const setBranchId = (b: string | null) => { setBranchState(b); persist(preset, custom, b); };

  const range: DateRange = useMemo(() => rangeFor(preset, today, custom ?? undefined), [preset, today, custom]);
  const compare: CompareRange = useMemo(() => compareRangeFor(preset, range), [preset, range]);
  const effectiveBranch = lockedBranch ?? branchId;

  return { hydrated, today, preset, setPreset, custom, setCustom, range, compare, branchId: effectiveBranch, setBranchId };
}
