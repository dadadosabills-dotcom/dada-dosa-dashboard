import * as XLSX from "xlsx";

/** Everything printed on one salary slip. */
export type SlipData = {
  company: string;
  period: string;        // "2026-09"
  periodLabel: string;   // "September 2026"
  employee: string;
  designation: string;
  branch: string;
  presence: number; absence: number; wOff: number; totalDays: number;
  monthlySalary: number; perDay: number; payable: number; overtime: number; extra: number; gross: number;
  deductions: { label: string; amount: number }[];
  totalDeductions: number;
  net: number;
};

export type SlipRun = {
  period: string; total_presence: number; total_absence: number; w_off: number; total_days: number;
  per_day_salary: number; payable_salary: number; overtime: number; extra: number; gross: number;
  advances_deducted: number; food_bill: number; missing_bill: number; bank_deduction: number;
  pf: number; shoes: number; fine: number; uniform: number; deductions: number; net: number;
};

const n = (v: unknown) => Number(v ?? 0) || 0;

export function periodLabel(period: string) {
  const [y, m] = period.split("-");
  return m ? new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : period;
}

export function buildSlip(run: SlipRun, emp: { name: string; role: string | null; total_salary: number }, branch: string): SlipData {
  const all = [
    { label: "Advance recovered", amount: n(run.advances_deducted) },
    { label: "Food bill", amount: n(run.food_bill) },
    { label: "Missing bill", amount: n(run.missing_bill) },
    { label: "Bank", amount: n(run.bank_deduction) },
    { label: "PF", amount: n(run.pf) },
    { label: "Shoes", amount: n(run.shoes) },
    { label: "Fine", amount: n(run.fine) },
    { label: "Uniform", amount: n(run.uniform) },
  ];
  return {
    company: "Dada Dosa",
    period: run.period,
    periodLabel: periodLabel(run.period),
    employee: emp.name,
    designation: emp.role ?? "",
    branch,
    presence: n(run.total_presence), absence: n(run.total_absence), wOff: n(run.w_off), totalDays: n(run.total_days),
    monthlySalary: n(emp.total_salary), perDay: n(run.per_day_salary), payable: n(run.payable_salary),
    overtime: n(run.overtime), extra: n(run.extra), gross: n(run.gross),
    deductions: all,
    totalDeductions: n(run.deductions),
    net: n(run.net),
  };
}

const fileBase = (s: SlipData) => `salary-slip-${s.employee.replace(/[^\w]+/g, "_")}-${s.period}`;

/** Excel salary slip (one sheet, real numbers so it can be edited/printed). */
export function downloadSlipExcel(s: SlipData) {
  const aoa: (string | number)[][] = [
    [s.company],
    [`Salary slip — ${s.periodLabel}`],
    [],
    ["Employee", s.employee],
    ["Designation", s.designation || "—"],
    ["Branch", s.branch || "—"],
    [],
    ["Attendance"],
    ["Presence (days)", s.presence],
    ["Absence (days)", s.absence],
    ["W/OFF (days)", s.wOff],
    ["Total days", s.totalDays],
    [],
    ["Earnings", "Amount (Rs.)"],
    ["Monthly salary", s.monthlySalary],
    ["Per day salary", s.perDay],
    ["Payable salary", s.payable],
    ["Overtime", s.overtime],
    ["Extra", s.extra],
    ["Gross earnings", s.gross],
    [],
    ["Deductions", "Amount (Rs.)"],
    ...s.deductions.map(d => [d.label, d.amount] as (string | number)[]),
    ["Total deductions", s.totalDeductions],
    [],
    ["NET PAY", s.net],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 26 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Salary slip");
  XLSX.writeFile(wb, `${fileBase(s)}.xlsx`);
}

const inr = (v: number) => "Rs. " + v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** PDF salary slip (A4). Loaded on demand so the PDF library isn't part of every page. */
export async function downloadSlipPdf(s: SlipData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, L = 15, R = W - 15;
  let y = 18;

  doc.setFont("helvetica", "bold").setFontSize(20).text(s.company, L, y);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(90).text("Salary slip", R, y - 6, { align: "right" });
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0).text(s.periodLabel, R, y, { align: "right" });
  y += 5;
  doc.setDrawColor(180).line(L, y, R, y);
  y += 8;

  const kv = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110).text(label, x, yy);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0).text(value || "—", x, yy + 5);
  };
  kv("Employee", s.employee, L, y);
  kv("Designation", s.designation, L + 70, y);
  kv("Branch", s.branch, L + 130, y);
  y += 16;

  // Attendance strip
  doc.setFillColor(245, 245, 245).rect(L, y, R - L, 14, "F");
  const cells: [string, string][] = [["Presence", String(s.presence)], ["Absence", String(s.absence)], ["W/OFF", String(s.wOff)], ["Total days", String(s.totalDays)]];
  const cw = (R - L) / cells.length;
  cells.forEach(([k, v], i) => {
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(110).text(k, L + cw * i + 4, y + 5);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0).text(v, L + cw * i + 4, y + 11);
  });
  y += 22;

  // Two columns: earnings | deductions
  const mid = W / 2;
  const colHead = (t: string, x: number) => {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0).text(t, x, y);
    doc.text("Amount", x + (mid - L - 10), y, { align: "right" });
    doc.setDrawColor(150).line(x, y + 2, x + (mid - L - 10), y + 2);
  };
  colHead("Earnings", L);
  colHead("Deductions", mid + 5);

  const earn: [string, number][] = [
    ["Monthly salary", s.monthlySalary], ["Per day salary", s.perDay], ["Payable salary", s.payable], ["Overtime", s.overtime], ["Extra", s.extra],
  ];
  const ded = s.deductions;
  const rows = Math.max(earn.length, ded.length);
  let ry = y + 8;
  doc.setFontSize(10);
  for (let i = 0; i < rows; i++) {
    if (earn[i]) {
      doc.setFont("helvetica", "normal").setTextColor(60).text(earn[i][0], L, ry);
      doc.setTextColor(0).text(inr(earn[i][1]), L + (mid - L - 10), ry, { align: "right" });
    }
    if (ded[i]) {
      doc.setFont("helvetica", "normal").setTextColor(60).text(ded[i].label, mid + 5, ry);
      doc.setTextColor(0).text(ded[i].amount ? inr(ded[i].amount) : "-", mid + 5 + (mid - L - 10), ry, { align: "right" });
    }
    ry += 7;
  }
  doc.setDrawColor(150).line(L, ry - 3, L + (mid - L - 10), ry - 3).line(mid + 5, ry - 3, mid + 5 + (mid - L - 10), ry - 3);
  doc.setFont("helvetica", "bold").setTextColor(0);
  doc.text("Gross earnings", L, ry + 2);
  doc.text(inr(s.gross), L + (mid - L - 10), ry + 2, { align: "right" });
  doc.text("Total deductions", mid + 5, ry + 2);
  doc.text(inr(s.totalDeductions), mid + 5 + (mid - L - 10), ry + 2, { align: "right" });
  y = ry + 14;

  // Net pay
  doc.setFillColor(30, 30, 30).rect(L, y, R - L, 16, "F");
  doc.setTextColor(255).setFont("helvetica", "normal").setFontSize(11).text("NET PAY", L + 5, y + 10);
  doc.setFont("helvetica", "bold").setFontSize(15).text(inr(s.net), R - 5, y + 10.5, { align: "right" });
  y += 30;

  doc.setTextColor(120).setFont("helvetica", "normal").setFontSize(8.5);
  doc.text("This is a computer-generated salary slip.", L, y);
  doc.setDrawColor(160).line(R - 55, y + 14, R, y + 14);
  doc.text("Authorised signature", R - 55, y + 19);

  doc.save(`${fileBase(s)}.pdf`);
}
