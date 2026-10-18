import { fmtINR } from "@/lib/constants";

/** Indian short form: ₹45,000 stays in full; ₹1.25 lakh; ₹2.1 crore. Negatives get a minus sign. */
export function fmtINRCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const trim = (x: number) => String(Math.round(x * 100) / 100);
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)} crore`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)} lakh`;
  return n < 0 ? `-${fmtINR(abs)}` : fmtINR(abs);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "today" / "yesterday" / "5 days ago" */
export function daysAgoWords(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
