import type { SupabaseClient } from "@supabase/supabase-js";

/** Inserts rows in chunks (each chunk is all-or-nothing). `inserted` counts rows from the start that made it in. */
export async function insertInChunks(
  supabase: SupabaseClient,
  table: string,
  rows: any[],
  size = 200
): Promise<{ inserted: number; error: string | null }> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) return { inserted, error: error.message };
    inserted += chunk.length;
  }
  return { inserted, error: null };
}

export function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** 'unknown branch "X" (3), branch is blank (1)' — capped so the message stays readable. */
export function describeProblems(map: Map<string, number>, max = 5): string {
  const items = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const shown = items.slice(0, max).map(([k, n]) => `${k} (${n})`).join(", ");
  return items.length > max ? `${shown}, and ${items.length - max} more kinds` : shown;
}
