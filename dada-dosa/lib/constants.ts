// Shared lists used across Sales/Expenses/Creditors/Drawings/Payroll.
// Branches now come from the `branches` table (admin-editable), not a
// hardcoded list — fetched at the page level and passed down.

export const SALES_CATEGORIES = ["Dine-in", "Takeaway", "Delivery", "Catering", "Other"];

// Pulled directly from the "Regarding" column of the real expense sheet —
// 26 categories, not a generic placeholder set.
export const EXPENSE_CATEGORIES = [
  "Advance Salary",
  "Drawing",
  "Water Utilities",
  "Consumables",
  "Repairs & Maintenance",
  "Gas Utilities",
  "Electrical Items",
  "Bill Pay",
  "Staff Welfare",
  "Cartage",
  "Kitchen Items",
  "Mobile Expenses/Recharge",
  "Staff Room Rent",
  "Stationary",
  "Bank",
  "Electricity Charges",
  "Receipt",
  "Bakery Items",
  "Food Safety",
  "Plant and Machinery",
  "Salary",
  "Refreshments Items",
  "Training & Appraisal",
  "Internet Charges",
  "Cleaning Items",
  "Computer & Printer Items",
  "Return",
];

// Used across Sales, Expenses, Creditors. Bank requires a bank name field.
export const PAYMENT_MODES = ["Cash", "Credit", "Bank"];

export function fmtINR(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export type Branch = { id: string; name: string; active: boolean };
