import type { SupabaseClient } from "@supabase/supabase-js";
import { TABLES, GENERATED, type TableData } from "./backup-core";

const PAGE = 1000; // Supabase returns at most 1,000 rows per request, so we page through

/** Reads every row of every table (paging past the 1,000-row limit). */
export async function fetchAllTables(
  supabase: SupabaseClient,
  onProgress?: (msg: string) => void
): Promise<TableData> {
  const out: TableData = {};
  for (const t of TABLES) {
    onProgress?.(`Reading ${t.label}…`);
    const rows: Record<string, any>[] = [];
    const orderCol = t.pk[0];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(t.name)
        .select("*")
        .order(orderCol, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Couldn't read "${t.name}": ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    out[t.name] = rows;
  }
  return out;
}

export type RestoreResult = {
  perTable: Record<string, { written: number; failed: number }>;
  errors: string[];
  notes: string[];
};

const CHUNK = 200;

/**
 * Writes the backup into Supabase. Rows are matched by their id: rows that don't exist are added,
 * rows that do exist are updated to the backup's values. Nothing is ever deleted, so running it
 * twice gives the same result.
 *
 * Supabase Auth accounts can't be created from here. Staff (profiles) that are missing from a
 * fresh project are therefore skipped, and their entries are attributed to the person restoring.
 */
export async function restoreToSupabase(
  supabase: SupabaseClient,
  data: TableData,
  restorerId: string,
  onProgress?: (msg: string) => void
): Promise<RestoreResult> {
  const result: RestoreResult = { perTable: {}, errors: [], notes: [] };
  const addError = (m: string) => { if (result.errors.length < 25) result.errors.push(m); };

  // Which staff accounts exist in THIS project?
  const { data: existingProfiles, error: pErr } = await supabase.from("profiles").select("id");
  if (pErr) throw new Error(`Couldn't read staff list: ${pErr.message}`);
  const knownUsers = new Set((existingProfiles ?? []).map((p: any) => p.id as string));
  knownUsers.add(restorerId);
  let reassigned = 0;

  for (const t of TABLES) {
    let rows = (data[t.name] ?? []).map(r => {
      const o = { ...r };
      for (const g of GENERATED[t.name] ?? []) delete o[g];
      return o;
    });
    result.perTable[t.name] = { written: 0, failed: 0 };
    if (!rows.length) continue;
    onProgress?.(`Restoring ${t.label} (${rows.length})…`);

    if (t.name === "profiles") {
      // Can only update accounts that already exist; a profile row can't exist without a login account.
      const skipped = rows.filter(r => !knownUsers.has(r.id)).length;
      rows = rows.filter(r => knownUsers.has(r.id) && r.id !== restorerId); // never touch your own role by accident
      if (skipped) result.notes.push(`${skipped} staff profile${skipped > 1 ? "s" : ""} in the backup have no login account in this project, so weren't restored (people need to sign up again).`);
    } else {
      // Columns that point at staff accounts
      for (const r of rows) {
        for (const col of ["created_by", "marked_by"]) {
          if (col in r && r[col] && !knownUsers.has(r[col])) { r[col] = restorerId; reassigned++; }
        }
        if ("approved_by" in r && r.approved_by && !knownUsers.has(r.approved_by)) r.approved_by = null;
      }
    }

    // A profile's branch may not exist yet either, but branches are restored first, so that's fine.
    const conflict = t.pk.join(",");
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from(t.name).upsert(chunk, { onConflict: conflict });
      if (!error) { result.perTable[t.name].written += chunk.length; continue; }

      // One bad row shouldn't sink 200 good ones: retry row by row to find which.
      for (const row of chunk) {
        const { error: e2 } = await supabase.from(t.name).upsert(row, { onConflict: conflict });
        if (e2) {
          result.perTable[t.name].failed++;
          addError(`${t.name}: ${e2.message}`);
        } else result.perTable[t.name].written++;
      }
    }
  }
  if (reassigned) result.notes.push(`${reassigned} entries were made by staff who don't have an account here; they're now listed under your name.`);
  return result;
}
