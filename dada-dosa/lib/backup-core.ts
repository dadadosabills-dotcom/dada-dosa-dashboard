import * as XLSX from "xlsx";
import { toDateString } from "./excel";

/**
 * Shared by the online app (browser) and the offline app (server).
 * Knows every table, how to write them all into ONE Excel workbook (one sheet per table,
 * plus a README sheet) and how to read such a workbook back — including one that somebody
 * opened in Excel and saved again (dates/times turn into native Excel values).
 */

export type ColType = "text" | "num" | "bool" | "date" | "time" | "ts";
export type ColDef = {
  t: ColType;
  /** Row is skipped when this is blank (primary keys, NOT NULL columns without a sensible default). */
  req?: boolean;
  /** Value used when blank, for NOT NULL columns that have a database default. "now" = current timestamp. */
  def?: string | number | boolean;
  /** Computed by the database (generated column): written to Excel for reading, ignored on restore. */
  gen?: boolean;
};
export type TableDef = { name: string; label: string; pk: string[]; cols: Record<string, ColDef> };

const txt = (o: Partial<ColDef> = {}): ColDef => ({ t: "text", ...o });
const num = (o: Partial<ColDef> = {}): ColDef => ({ t: "num", ...o });
const bool = (o: Partial<ColDef> = {}): ColDef => ({ t: "bool", ...o });
const date = (o: Partial<ColDef> = {}): ColDef => ({ t: "date", ...o });
const time = (o: Partial<ColDef> = {}): ColDef => ({ t: "time", ...o });
const ts = (o: Partial<ColDef> = {}): ColDef => ({ t: "ts", ...o });
const id = () => txt({ req: true });

/** Order matters: parents before children, so foreign keys are satisfied when restoring. */
export const TABLES: TableDef[] = [
  { name: "branches", label: "Branches", pk: ["id"], cols: {
    id: id(), name: txt({ req: true }), active: bool({ def: true }), created_at: ts({ def: "now" }) } },
  { name: "profiles", label: "Staff profiles", pk: ["id"], cols: {
    id: id(), full_name: txt({ req: true }), role: txt({ def: "user" }), phone: txt(), active: bool({ def: true }),
    branch_id: txt(), created_at: ts({ def: "now" }) } },
  { name: "employees", label: "Employees", pk: ["id"], cols: {
    id: id(), name: txt({ req: true }), role: txt(), pay_type: txt({ def: "monthly" }), rate: num({ def: 0 }),
    active: bool({ def: true }), branch_id: txt(), hourly_rate: num({ def: 0 }), total_salary: num({ def: 0 }), created_at: ts({ def: "now" }) } },
  { name: "creditors", label: "Creditors", pk: ["id"], cols: {
    id: id(), name: txt({ req: true }), contact: txt(), opening_balance: num({ def: 0 }), created_by: txt({ req: true }), created_at: ts({ def: "now" }) } },
  { name: "expenses", label: "Expenses", pk: ["id"], cols: {
    id: id(), date: date({ req: true }), vendor: txt({ req: true }), category: txt({ def: "General" }), note: txt(),
    amount: num({ req: true }), payment_mode: txt({ def: "cash" }), created_by: txt({ req: true }), status: txt({ def: "pending" }),
    approved_by: txt(), approved_at: ts(), created_at: ts({ def: "now" }), branch_id: txt(), gst_bill: bool({ def: false }),
    receipt_url: txt(), voucher_number: txt(), bank_name: txt(), particulars: txt() } },
  { name: "sales", label: "Sales", pk: ["id"], cols: {
    id: id(), date: date({ req: true }), item: txt(), customer: txt(), category: txt({ def: "General" }), amount: num(),
    payment_mode: txt({ def: "cash" }), created_by: txt({ req: true }), status: txt({ def: "pending" }), approved_by: txt(),
    approved_at: ts(), created_at: ts({ def: "now" }), branch_id: txt(), swiggy: num({ def: 0 }), zomato: num({ def: 0 }),
    upi: num({ def: 0 }), cash: num({ def: 0 }), channel_total: num({ gen: true }) } },
  { name: "drawings", label: "Drawings", pk: ["id"], cols: {
    id: id(), date: date({ req: true }), owner_name: txt({ req: true }), amount: num({ req: true }), note: txt(),
    created_by: txt({ req: true }), status: txt({ def: "pending" }), approved_by: txt(), created_at: ts({ def: "now" }), branch_id: txt() } },
  { name: "creditor_transactions", label: "Creditor bills & payments", pk: ["id"], cols: {
    id: id(), creditor_id: txt({ req: true }), date: date({ req: true }), type: txt({ req: true }), amount: num({ req: true }), note: txt(),
    created_by: txt({ req: true }), status: txt({ def: "pending" }), approved_by: txt(), created_at: ts({ def: "now" }),
    branch_id: txt(), source_expense_id: txt() } },
  { name: "attendance", label: "Attendance", pk: ["id"], cols: {
    id: id(), employee_id: txt({ req: true }), date: date({ req: true }), status: txt({ req: true }), marked_by: txt({ req: true }),
    created_at: ts({ def: "now" }), branch_id: txt(), check_in: time(), check_out: time(), hours: num({ gen: true }) } },
  { name: "payroll_runs", label: "Payroll runs", pk: ["id"], cols: {
    id: id(), employee_id: txt({ req: true }), period: txt({ req: true }), gross: num({ req: true }), deductions: num({ def: 0 }),
    net: num({ gen: true }), status: txt({ def: "unpaid" }), created_by: txt({ req: true }), created_at: ts({ def: "now" }),
    branch_id: txt(), advances_deducted: num({ def: 0 }), total_presence: num({ def: 0 }), total_absence: num({ def: 0 }),
    overtime: num({ def: 0 }), w_off: num({ def: 0 }), total_days: num({ def: 30 }), per_day_salary: num({ def: 0 }),
    payable_salary: num({ def: 0 }), food_bill: num({ def: 0 }), missing_bill: num({ def: 0 }), bank_deduction: num({ def: 0 }),
    pf: num({ def: 0 }), shoes: num({ def: 0 }), fine: num({ def: 0 }), uniform: num({ def: 0 }), extra: num({ def: 0 }) } },
  { name: "salary_advances", label: "Salary advances", pk: ["id"], cols: {
    id: id(), employee_id: txt({ req: true }), date: date({ req: true }), amount: num({ req: true }), remaining: num({ req: true }),
    branch_id: txt(), source_expense_id: txt(), created_by: txt({ req: true }), created_at: ts({ def: "now" }) } },
  { name: "payroll_run_advances", label: "Payroll ↔ advances", pk: ["payroll_run_id", "salary_advance_id"], cols: {
    payroll_run_id: id(), salary_advance_id: id(), amount_applied: num({ req: true }) } },
];

export const TABLE_NAMES = TABLES.map(t => t.name);
export type TableData = Record<string, Record<string, any>[]>;

export const BACKUP_FORMAT = "dada-dosa-backup-v1";

// ---------------------------------------------------------------- writing

function pad(n: number) { return String(n).padStart(2, "0"); }

/** Builds the .xlsx bytes from all tables. `source` is shown on the README sheet. */
export function buildBackupWorkbook(data: TableData, source: string): Uint8Array {
  const wb = XLSX.utils.book_new();
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const readme: (string | number)[][] = [
    ["Dada Dosa — full data backup"],
    [],
    ["Created", stamp],
    ["Made by", source],
    ["Format", BACKUP_FORMAT],
    [],
    ["Sheet", "What it holds", "Rows"],
    ...TABLES.map(t => [t.name, t.label, (data[t.name] ?? []).length] as (string | number)[]),
    [],
    ["How to use this file"],
    ["• Keep it somewhere safe (email it to yourself, put it on a USB stick or cloud drive)."],
    ["• To restore, open the app → Backup / Data & Backup → choose this file. You always see a preview first."],
    ["• You may open it in Excel to look around. Please don't rename sheets or column headings, or restore won't recognise them."],
    ["• Columns marked as calculated (channel_total, hours, net) are recomputed automatically and are ignored on restore."],
    ["• Login accounts and receipt photos are not inside this file; only the receipt links are."],
  ];
  const rs = XLSX.utils.aoa_to_sheet(readme);
  rs["!cols"] = [{ wch: 26 }, { wch: 34 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, rs, "README");

  for (const t of TABLES) {
    const headers = Object.keys(t.cols);
    const rows = (data[t.name] ?? []).map(r => {
      const o: Record<string, any> = {};
      for (const h of headers) {
        const v = r[h];
        o[h] = v === undefined || v === null ? "" : v;
      }
      return o;
    });
    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    sheet["!cols"] = headers.map(h => ({ wch: h === "id" || h.endsWith("_id") || h.endsWith("_by") ? 38 : Math.max(10, Math.min(28, h.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, sheet, t.name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer | number[];
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

// ---------------------------------------------------------------- reading

export type ParsedBackup = {
  tables: TableData;
  counts: Record<string, number>;
  warnings: string[];
  missingSheets: string[];
  recognised: boolean;
};

const key = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

function serialToParts(serial: number) {
  const ms = Math.round(serial * 86400000) + Date.UTC(1899, 11, 30);
  return new Date(ms);
}

function toTime(v: any): string | null {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") {
    const frac = v - Math.floor(v);
    const secs = Math.round(frac * 86400) % 86400;
    return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`;
  }
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${pad(+m[1])}:${m[2]}:${m[3] ?? "00"}`;
}

function toTimestamp(v: any): string | null {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") return isNaN(v) ? null : serialToParts(v).toISOString();
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toBool(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1", "t"].includes(s)) return true;
  if (["false", "no", "n", "0", "f"].includes(s)) return false;
  return null;
}

function toNum(v: any): number | null | "bad" {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : "bad";
  const n = Number(String(v).replace(/[₹,\s]/g, ""));
  return isFinite(n) ? n : "bad";
}

/** Reads a backup workbook. Never throws on bad rows: they are skipped and described in `warnings`. */
export function parseBackupWorkbook(buf: ArrayBuffer | Uint8Array): ParsedBackup {
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetByName = new Map(wb.SheetNames.map(n => [key(n), n]));
  const tables: TableData = {};
  const counts: Record<string, number> = {};
  const warnings: string[] = [];
  const missingSheets: string[] = [];
  const nowIso = new Date().toISOString();
  let recognisedAny = false;

  for (const t of TABLES) {
    const sheetName = sheetByName.get(t.name);
    tables[t.name] = [];
    counts[t.name] = 0;
    if (!sheetName) { missingSheets.push(t.name); continue; }
    recognisedAny = true;
    const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1, defval: "", raw: true, blankrows: false });
    if (!grid.length) continue;
    const headers = (grid[0] ?? []).map(key);
    const colIndex: Record<string, number> = {};
    for (const c of Object.keys(t.cols)) colIndex[c] = headers.indexOf(c);
    const pkMissing = t.pk.filter(p => colIndex[p] < 0);
    if (pkMissing.length) { warnings.push(`Sheet "${t.name}": column "${pkMissing.join(", ")}" not found — sheet skipped.`); continue; }

    const seen = new Set<string>();
    const skipped = new Map<string, number>();
    const skip = (why: string) => skipped.set(why, (skipped.get(why) ?? 0) + 1);
    let badNumbers = 0;

    for (let i = 1; i < grid.length; i++) {
      const line = grid[i] ?? [];
      if (line.every((c: any) => c === "" || c === null || c === undefined)) continue;
      const row: Record<string, any> = {};
      let ok = true;
      for (const [col, def] of Object.entries(t.cols)) {
        if (def.gen) continue;
        const raw = colIndex[col] >= 0 ? line[colIndex[col]] : "";
        let v: any = null;
        switch (def.t) {
          case "text": v = raw === "" || raw === null || raw === undefined ? null : String(raw).trim(); if (v === "") v = null; break;
          case "num": { const n = toNum(raw); if (n === "bad") { badNumbers++; v = null; } else v = n; break; }
          case "bool": v = toBool(raw); break;
          case "date": v = raw === "" ? null : toDateString(raw); break;
          case "time": v = toTime(raw); break;
          case "ts": v = toTimestamp(raw); break;
        }
        if (v === null && def.def !== undefined) v = def.def === "now" ? nowIso : def.def;
        if (v === null && def.req) { ok = false; skip(`missing ${col}`); break; }
        row[col] = v;
      }
      if (!ok) continue;
      const pkVal = t.pk.map(p => row[p]).join("|");
      if (seen.has(pkVal)) { skip("duplicate id in file"); continue; }
      seen.add(pkVal);
      tables[t.name].push(row);
    }
    counts[t.name] = tables[t.name].length;
    if (skipped.size) warnings.push(`Sheet "${t.name}": skipped ${[...skipped.entries()].map(([w, n]) => `${n} row${n > 1 ? "s" : ""} (${w})`).join(", ")}.`);
    if (badNumbers) warnings.push(`Sheet "${t.name}": ${badNumbers} cell${badNumbers > 1 ? "s" : ""} in number columns weren't numbers and were left empty.`);
  }
  return { tables, counts, warnings, missingSheets, recognised: recognisedAny };
}

/** Fields the database computes itself — never send these when writing. */
export const GENERATED: Record<string, string[]> = Object.fromEntries(
  TABLES.map(t => [t.name, Object.entries(t.cols).filter(([, c]) => c.gen).map(([n]) => n)])
);

export function backupFileName(prefix = "dada-dosa-backup") {
  const d = new Date();
  return `${prefix}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;
}
