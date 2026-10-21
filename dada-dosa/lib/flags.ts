import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Feature flags for the new dashboard features.
 *
 * Flags live in the `feature_flags` table (migration 015), so an admin can
 * switch a feature on or off in the database without a redeploy.
 *
 * SAFE BY DEFAULT: every flag is OFF when
 *   - the table doesn't exist yet (migration 015 not run),
 *   - the flag row is missing, or
 *   - anything goes wrong while reading it.
 * So adding this file can never change what existing screens do.
 *
 * Phase A adds the plumbing only; nothing reads these flags yet.
 */
export type FlagKey =
  | "smart_overview"   // Phase B: role-aware home
  | "insights_reports" // Phase C: insights, P&L, ageing, comparisons
  | "quick_tools"      // Phase D: search, saved views, bulk approve, export, share
  | "trust_speed";     // Phase E: audit log, data-quality warnings, offline queue

export const FLAG_KEYS: FlagKey[] = ["smart_overview", "insights_reports", "quick_tools", "trust_speed"];

export type Flags = Record<FlagKey, boolean>;

/** Everything OFF. Used as the starting point and as the fallback on any error. */
export const DEFAULT_FLAGS: Flags = {
  smart_overview: false,
  insights_reports: false,
  quick_tools: false,
  trust_speed: false,
};

/** Read all flags for the signed-in user. Never throws. */
export async function getFlags(supabase: SupabaseClient): Promise<Flags> {
  const flags: Flags = { ...DEFAULT_FLAGS };
  try {
    const { data, error } = await supabase.from("feature_flags").select("key, enabled");
    if (error || !data) return flags;
    for (const row of data as { key: string; enabled: boolean }[]) {
      if ((FLAG_KEYS as string[]).includes(row.key)) flags[row.key as FlagKey] = row.enabled === true;
    }
  } catch {
    // keep defaults (all OFF)
  }
  return flags;
}

/** Convenience: is one flag on? */
export async function isFlagOn(supabase: SupabaseClient, key: FlagKey): Promise<boolean> {
  return (await getFlags(supabase))[key];
}
