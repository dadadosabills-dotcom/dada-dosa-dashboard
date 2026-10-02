import type { SupabaseClient } from "@supabase/supabase-js";
import { norm } from "./excel";
import { insertInChunks } from "./bulk";

/** An expense that has just been saved, and needs its knock-on records created. */
export type SyncExpense = {
  id: string;
  date: string;
  vendor: string; // Party Name
  category: string; // "Regarding"
  particulars: string | null;
  amount: number;
  payment_mode: string;
  branch_id: string;
  employee_id?: string | null; // known employee (manual form); otherwise matched by Party Name
};

export type SyncSummary = {
  bills: number;
  payments: number;
  newCreditors: number;
  advances: number;
  drawings: number;
  newEmployees: number;
  notes: string[];
};

const isAdvance = (r: SyncExpense) => norm(r.category) === "advance salary";
const isDrawing = (r: SyncExpense) => norm(r.category) === "drawing";
const isCredit = (r: SyncExpense) => norm(r.payment_mode) === "credit";
const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * The rules:
 *  - Credit expense            -> adds a BILL to the creditor with that Party Name (creditor is created if new)
 *  - Cash/Bank expense to a party that already exists as a creditor -> adds a PAYMENT, reducing what is owed
 *  - "Advance Salary" expense  -> adds a salary advance for that employee (shown in Payroll, auto-deducted next run)
 *  - "Drawing" expense         -> adds a matching entry in Drawings for that party (same approval status)
 */
export async function syncExpenseSideEffects(
  supabase: SupabaseClient,
  rows: SyncExpense[],
  opts: { userId: string; canCreateEmployees: boolean; approve: boolean }
): Promise<SyncSummary> {
  const summary: SyncSummary = { bills: 0, payments: 0, newCreditors: 0, advances: 0, drawings: 0, newEmployees: 0, notes: [] };
  const txStatus = opts.approve ? "approved" : "pending";
  const normalRows = rows.filter(r => !isAdvance(r));
  const advanceRows = rows.filter(isAdvance);

  // ---------- Creditors: bills and payments ----------
  if (normalRows.length) {
    const creditorIds = new Map<string, string>();
    const { data: existing } = await supabase.from("creditors").select("id, name");
    (existing ?? []).forEach((c: any) => creditorIds.set(norm(c.name), c.id));

    const toCreate = new Map<string, string>();
    for (const r of normalRows) {
      const k = norm(r.vendor);
      if (isCredit(r) && k && !creditorIds.has(k) && !toCreate.has(k)) toCreate.set(k, cleanName(r.vendor));
    }
    if (toCreate.size) {
      const { data: created, error } = await supabase
        .from("creditors")
        .insert([...toCreate.values()].map(name => ({ name, created_by: opts.userId })))
        .select("id, name");
      if (error) summary.notes.push(`Couldn't create new creditors: ${error.message}`);
      else {
        (created ?? []).forEach((c: any) => creditorIds.set(norm(c.name), c.id));
        summary.newCreditors = created?.length ?? 0;
      }
    }

    const tx: any[] = [];
    for (const r of normalRows) {
      const creditorId = creditorIds.get(norm(r.vendor));
      if (!creditorId) continue; // not a creditor and not on credit: nothing to do
      tx.push({
        creditor_id: creditorId,
        date: r.date,
        type: isCredit(r) ? "bill" : "payment",
        amount: r.amount,
        note: r.particulars || r.category,
        branch_id: r.branch_id,
        status: txStatus,
        approved_by: opts.approve ? opts.userId : null,
        created_by: opts.userId,
        source_expense_id: r.id,
      });
    }
    if (tx.length) {
      const res = await insertInChunks(supabase, "creditor_transactions", tx);
      const done = tx.slice(0, res.inserted);
      summary.bills = done.filter(t => t.type === "bill").length;
      summary.payments = done.filter(t => t.type === "payment").length;
      if (res.error) summary.notes.push(`Some creditor entries weren't saved: ${res.error}`);
    }
  }

  // ---------- Drawings ----------
  const drawingRows = rows.filter(isDrawing);
  if (drawingRows.length) {
    const dr = drawingRows.map(r => ({
      date: r.date,
      owner_name: cleanName(r.vendor),
      amount: r.amount,
      note: r.particulars || null,
      branch_id: r.branch_id,
      status: txStatus,
      approved_by: opts.approve ? opts.userId : null,
      created_by: opts.userId,
      source_expense_id: r.id,
    }));
    const res = await insertInChunks(supabase, "drawings", dr);
    summary.drawings = res.inserted;
    if (res.error) summary.notes.push(`Some entries couldn't be added to Drawings (has migration 012 been run?): ${res.error}`);
  }

  // ---------- Salary advances ----------
  if (advanceRows.length) {
    const employeeIds = new Map<string, string>();
    const needsLookup = advanceRows.some(r => !r.employee_id);
    if (needsLookup) {
      const { data: emps } = await supabase.from("employees").select("id, name");
      (emps ?? []).forEach((e: any) => employeeIds.set(norm(e.name), e.id));

      const toCreate = new Map<string, { name: string; branch_id: string }>();
      for (const r of advanceRows) {
        const k = norm(r.vendor);
        if (!r.employee_id && k && !employeeIds.has(k) && !toCreate.has(k)) toCreate.set(k, { name: cleanName(r.vendor), branch_id: r.branch_id });
      }
      if (toCreate.size) {
        if (opts.canCreateEmployees) {
          const { data: created, error } = await supabase
            .from("employees")
            .insert([...toCreate.values()].map(v => ({ name: v.name, pay_type: "monthly", total_salary: 0, branch_id: v.branch_id })))
            .select("id, name");
          if (error) summary.notes.push(`Couldn't create new employees: ${error.message}`);
          else {
            (created ?? []).forEach((e: any) => employeeIds.set(norm(e.name), e.id));
            summary.newEmployees = created?.length ?? 0;
          }
        } else {
          summary.notes.push(
            `Salary advances were NOT recorded for employees that don't exist yet: ${[...toCreate.values()].map(v => v.name).join(", ")}. ` +
              `An admin needs to add them under Payroll → Employees (an admin importing the file creates them automatically).`
          );
        }
      }
    }

    const adv: any[] = [];
    for (const r of advanceRows) {
      const employeeId = r.employee_id || employeeIds.get(norm(r.vendor));
      if (!employeeId) continue;
      adv.push({
        employee_id: employeeId,
        date: r.date,
        amount: r.amount,
        remaining: r.amount,
        branch_id: r.branch_id,
        source_expense_id: r.id,
        created_by: opts.userId,
      });
    }
    if (adv.length) {
      const res = await insertInChunks(supabase, "salary_advances", adv);
      summary.advances = res.inserted;
      if (res.error) summary.notes.push(`Some salary advances weren't saved: ${res.error}`);
    }
  }

  return summary;
}

/** One-line description of what the sync did, for showing under a form or after an import. */
export function describeSync(s: SyncSummary): string[] {
  const lines: string[] = [];
  if (s.bills || s.payments || s.newCreditors) {
    const parts = [];
    if (s.bills) parts.push(`${s.bills} added to creditors as bills${s.newCreditors ? ` (${s.newCreditors} new creditor${s.newCreditors > 1 ? "s" : ""})` : ""}`);
    if (s.payments) parts.push(`${s.payments} payment${s.payments > 1 ? "s" : ""} reduced what you owe a creditor`);
    lines.push(`Creditors: ${parts.join("; ")}.`);
  }
  if (s.drawings) lines.push(`Drawings: ${s.drawings} entr${s.drawings > 1 ? "ies" : "y"} added to the Drawings section.`);
  if (s.advances) {
    lines.push(
      `Payroll: ${s.advances} salary advance${s.advances > 1 ? "s" : ""} recorded${
        s.newEmployees ? `, ${s.newEmployees} new employee${s.newEmployees > 1 ? "s" : ""} created (set their monthly salary under Payroll → Employees)` : ""
      }.`
    );
  }
  return [...lines, ...s.notes];
}
