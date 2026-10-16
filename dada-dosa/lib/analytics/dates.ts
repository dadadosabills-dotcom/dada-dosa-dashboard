// Date helpers for the new dashboard. Everything is in INDIA time (Asia/Kolkata)
// and uses plain "YYYY-MM-DD" strings, so a phone in any timezone sees the same
// "today". (Date arithmetic is done in UTC on those strings, which has no
// daylight-saving or timezone surprises.)

export type YMD = string; // "YYYY-MM-DD"

export type RangePreset = "today" | "yesterday" | "last7" | "this_month" | "last_month" | "this_fy" | "custom";

export type DateRange = { from: YMD; to: YMD };

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  this_month: "This month",
  last_month: "Last month",
  this_fy: "This financial year",
  custom: "Custom",
};

const ist = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in India, e.g. "2026-10-16". */
export function todayIST(now: Date = new Date()): YMD {
  return ist.format(now); // en-CA gives YYYY-MM-DD
}

function parse(d: YMD): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function fmt(dt: Date): YMD {
  return dt.toISOString().slice(0, 10);
}

export function addDays(d: YMD, n: number): YMD {
  const dt = parse(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}

/** Add whole months, keeping the day where possible (31 Mar + 1 month -> 30 Apr). */
export function addMonths(d: YMD, n: number): YMD {
  const dt = parse(d);
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + n);
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, last));
  return fmt(dt);
}

export function startOfMonth(d: YMD): YMD {
  return d.slice(0, 8) + "01";
}
export function endOfMonth(d: YMD): YMD {
  const dt = parse(d);
  return fmt(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)));
}

/** Indian financial year starts 1 April. */
export function startOfFY(d: YMD): YMD {
  const [y, m] = d.split("-").map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

/** Number of days in the range, inclusive. */
export function daysInRange(r: DateRange): number {
  return Math.round((parse(r.to).getTime() - parse(r.from).getTime()) / 86400000) + 1;
}

/** Turn a preset (or custom dates) into a concrete range. */
export function rangeFor(preset: RangePreset, today: YMD = todayIST(), custom?: DateRange): DateRange {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const prev = addMonths(startOfMonth(today), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case "this_fy":
      return { from: startOfFY(today), to: today };
    case "custom":
      return custom && custom.from <= custom.to ? custom : { from: today, to: today };
  }
}

export type CompareRange = DateRange & { label: string };

/**
 * The period a number is compared against, chosen to be a FAIR comparison:
 *  - a single day is compared with the same weekday last week (a Monday with a Monday)
 *  - 7 days -> the 7 days before
 *  - this month -> the same number of days of last month
 *  - last month -> the month before
 *  - this financial year -> the same stretch of the previous year
 *  - custom -> the equally long period just before it
 */
export function compareRangeFor(preset: RangePreset, range: DateRange): CompareRange {
  switch (preset) {
    case "today":
    case "yesterday": {
      const d = addDays(range.from, -7);
      return { from: d, to: d, label: "same day last week" };
    }
    case "last7":
      return { from: addDays(range.from, -7), to: addDays(range.from, -1), label: "the previous 7 days" };
    case "this_month": {
      const prevStart = addMonths(range.from, -1);
      const elapsed = daysInRange(range);
      const prevEnd = addDays(prevStart, elapsed - 1);
      const cap = endOfMonth(prevStart);
      return { from: prevStart, to: prevEnd > cap ? cap : prevEnd, label: "the same days last month" };
    }
    case "last_month": {
      const prevStart = addMonths(range.from, -1);
      return { from: prevStart, to: endOfMonth(prevStart), label: "the month before" };
    }
    case "this_fy":
      return { from: addMonths(range.from, -12), to: addMonths(range.to, -12), label: "the same period last year" };
    case "custom": {
      const n = daysInRange(range);
      return { from: addDays(range.from, -n), to: addDays(range.from, -1), label: "the previous period" };
    }
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "16-Oct-2026" — the date style used across the app. */
export function fmtDate(d: YMD): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${String(day).padStart(2, "0")}-${MONTHS[m - 1]}-${y}`;
}

export function fmtRange(r: DateRange): string {
  return r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} to ${fmtDate(r.to)}`;
}

/** "YYYY-MM" key used by payroll periods. */
export function periodOf(d: YMD): string {
  return d.slice(0, 7);
}
