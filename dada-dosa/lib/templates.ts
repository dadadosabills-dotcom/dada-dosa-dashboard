import * as XLSX from "xlsx";

/**
 * Ready-to-fill import sheets. The first sheet is the one the app reads; a second "How to fill" sheet
 * explains the columns (the app ignores it). Keep headings exactly as they are.
 */
type Template = { file: string; sheet: string; headers: string[]; sample: (string | number)[][]; notes: string[][] };

const TEMPLATES: Record<"sales" | "expenses" | "employees", Template> = {
  sales: {
    file: "sales-import-template.xlsx",
    sheet: "Sales",
    headers: ["Date", "Branch", "Swiggy", "Zomato", "UPI", "Cash"],
    sample: [
      ["2026-09-01", "1st Branch", 12500, 8400, 15200, 22300],
      ["2026-09-01", "2nd Branch", 9800, 6100, 11750, 18900],
    ],
    notes: [
      ["Column", "What to put"],
      ["Date", "yyyy-mm-dd (or dd/mm/yyyy). Required."],
      ["Branch", "Exactly as named in the app, e.g. 1st Branch. Required."],
      ["Swiggy / Zomato / UPI / Cash", "Amount for each channel; leave 0 or blank if none. At least one must be above 0."],
      ["Tip", "Delete the two sample rows before importing. Importing the same file twice won't double the sales."],
    ],
  },
  expenses: {
    file: "expenses-import-template.xlsx",
    sheet: "Expenses",
    headers: ["Date", "Particulars", "Party Name", "Regarding", "Amount", "Branch", "Payment Mode", "Bank Name", "Remarks", "Voucher No.", "GST Bill", "Bill/Voucher"],
    sample: [
      ["2026-09-02", "Gas cylinder", "Sri Balaji Gas", "Gas Utilities", 1850, "1st Branch", "Cash", "", "", "V-1021", "No", ""],
      ["2026-09-03", "Rice 50 kg", "Sri Traders", "Consumables", 4200, "2nd Branch", "Credit", "", "Monthly account", "", "Yes", ""],
      ["2026-09-04", "Advance", "Ravi Kumar", "Advance Salary", 2000, "1st Branch", "Cash", "", "", "", "No", ""],
      ["2026-09-05", "Owner drawing", "Mr. Sharma", "Drawing", 10000, "Office", "Bank", "HDFC", "", "", "No", ""],
    ],
    notes: [
      ["Column", "What to put"],
      ["Date, Party Name, Amount, Branch", "Required."],
      ["Regarding", "The category, e.g. Gas Utilities, Consumables, Advance Salary, Drawing. Unknown ones are saved as General."],
      ["Payment Mode", "Cash, Credit or Bank. Credit adds a bill to that party's creditor account; Cash/Bank to an existing creditor records a payment."],
      ["Bank Name", "Only used when Payment Mode is Bank."],
      ["GST Bill", "Yes or No."],
      ["Bill/Voucher", "Optional web link (https://…) to the bill."],
      ["Advance Salary rows", "Party Name must be the employee's name; it becomes a salary advance in Payroll."],
      ["Drawing rows", "Also appear in the Drawings section under that party name."],
      ["Tip", "Delete the sample rows before importing. Admin imports are marked approved; others wait for approval."],
    ],
  },
  employees: {
    file: "employees-import-template.xlsx",
    sheet: "Employees",
    headers: ["Name", "Designation", "Branch", "Monthly Salary"],
    sample: [
      ["Ravi Kumar", "Cook", "1st Branch", 18000],
      ["Anita Devi", "Cashier", "2nd Branch", 15000],
    ],
    notes: [
      ["Column", "What to put"],
      ["Name", "Full name. Required. If an employee with the same name already exists, their designation, branch and salary are updated instead of adding a duplicate."],
      ["Designation", "Job title (optional)."],
      ["Branch", "Exactly as named in the app. Required."],
      ["Monthly Salary", "Total monthly salary in rupees. Required."],
      ["Joining form / ID proof", "Files can't go in the sheet. After importing, open Payroll → Employees → Documents on each person to upload them."],
    ],
  },
};

export type TemplateKind = keyof typeof TEMPLATES;

export function buildTemplateWorkbook(kind: TemplateKind): XLSX.WorkBook {
  const t = TEMPLATES[kind];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.sample]);
  ws["!cols"] = t.headers.map(h => ({ wch: Math.max(12, h.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, t.sheet);
  const help = XLSX.utils.aoa_to_sheet(t.notes);
  help["!cols"] = [{ wch: 32 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, help, "How to fill");
  return wb;
}

export function downloadTemplate(kind: TemplateKind) {
  XLSX.writeFile(buildTemplateWorkbook(kind), TEMPLATES[kind].file);
}

export const TEMPLATE_FILES = Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, v.file]));
