import * as XLSX from "xlsx";

/** Lower-cases, trims and collapses inner whitespace/newlines — used to compare names and headers. */
export const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Downloads an array of plain objects as a .xlsx file, one row per object. */
export function exportToExcel(rows: Record<string, any>[], filename: string, sheetName = "Sheet1") {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export type SheetRow = Record<string, any>;

/**
 * Reads the first sheet of an uploaded .xlsx/.csv file and finds the header row by itself:
 * the first row (within the top 40) that contains at least one alias from EVERY group.
 * Title rows above the headers (e.g. "FOR SALES") are ignored, and reading stops at the next
 * section title (a row starting with "FOR ..."). Rows come back keyed by normalised header text.
 */
export function parseSheetTable(file: File, groups: string[][]): Promise<{ rows: SheetRow[]; headerFound: boolean }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
        const aliasSets = groups.map(g => g.map(norm));

        let headerIdx = -1;
        for (let i = 0; i < Math.min(grid.length, 40); i++) {
          const cells = (grid[i] ?? []).map(norm);
          if (aliasSets.every(set => set.some(a => cells.includes(a)))) { headerIdx = i; break; }
        }
        if (headerIdx < 0) { resolve({ rows: [], headerFound: false }); return; }

        const headers = (grid[headerIdx] ?? []).map(norm);
        const rows: SheetRow[] = [];
        for (let i = headerIdx + 1; i < grid.length; i++) {
          const line = grid[i] ?? [];
          const firstCell = line.find((c: any) => c !== "" && c !== null && c !== undefined);
          if (typeof firstCell === "string" && /^for\s/i.test(firstCell.trim())) break; // next section
          const obj: SheetRow = {};
          let any = false;
          headers.forEach((h: string, idx: number) => {
            const v = line[idx] ?? "";
            if (v !== "") any = true;
            if (h && obj[h] === undefined) obj[h] = v;
          });
          if (any) rows.push(obj); // fully blank rows are ignored silently
        }
        resolve({ rows, headerFound: true });
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/** Raw cell value for the first matching header alias. */
export function pickRaw(row: SheetRow, ...aliases: string[]): any {
  for (const a of aliases) {
    const v = row[norm(a)];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

/** Trimmed text for the first matching header alias. */
export function pickField(row: SheetRow, ...aliases: string[]): string {
  const v = pickRaw(row, ...aliases);
  return v === "" ? "" : String(v).trim();
}

export function toNumber(v: any): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  return isFinite(n) ? n : 0;
}

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Excel serial number, Date, "yyyy-mm-dd" or Indian-style "dd/mm/yyyy" -> "yyyy-mm-dd".
 * Returns null when it can't be read (so the row is reported, never silently given today's date).
 */
export function toDateString(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : ymd(value.getFullYear(), value.getMonth() + 1, value.getDate());
  if (typeof value === "number") {
    if (value < 20000 || value > 90000) return null;
    const d = new Date(Math.floor(value - 25569) * 86400000); // Excel serial -> UTC date
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) return ymd(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * Turns a branch name from a sheet into a branch id. Admins may use any branch; everyone else
 * can only import rows for their own branch (blank branch = their own).
 */
export function makeBranchResolver(branches: { id: string; name: string }[], canPickBranch: boolean, userBranchId: string | null) {
  const byName = new Map(branches.map(b => [norm(b.name), b.id]));
  return (rawName: string): { id: string | null; problem: string | null } => {
    const key = norm(rawName);
    if (!key) {
      if (canPickBranch) return { id: null, problem: "branch is blank" };
      return userBranchId ? { id: userBranchId, problem: null } : { id: null, problem: "your account has no branch" };
    }
    const id = byName.get(key);
    if (!id) return { id: null, problem: `unknown branch "${rawName.trim()}"` };
    if (!canPickBranch && id !== userBranchId) return { id: null, problem: `row is for another branch ("${rawName.trim()}")` };
    return { id, problem: null };
  };
}
