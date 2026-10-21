import type { BranchRangeSummary, ExpenseCategoryTotal, WeekdayBranchSales } from "./types";
import type { Tone } from "./compare";
import { fmtINRCompact } from "./format";
import { fmtINR } from "@/lib/constants";

export type Insight = {
  id: string;
  tone: Tone | "warn";
  text: string;     // one plain sentence
  score: number;    // importance (rupees involved); used for ordering
};

export type InsightInput = {
  cur: BranchRangeSummary[];
  prev: BranchRangeSummary[];
  names: Map<string, string>;
  selectedBranch: string | null;
  compareLabel: string;
  weekday: WeekdayBranchSales[] | null;
  catCur: ExpenseCategoryTotal[] | null;
  catPrev: ExpenseCategoryTotal[] | null;
  payroll: { applicable: boolean; processed: boolean; cost: number } | null;
};

const DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const CHANNELS: { key: "swiggy" | "zomato" | "upi" | "cash"; label: string }[] = [
  { key: "swiggy", label: "Swiggy" }, { key: "zomato", label: "Zomato" }, { key: "upi", label: "UPI" }, { key: "cash", label: "Cash" },
];
const MIN_BASE = 5000;          // ignore tiny bases: "up 300%" from ₹200 is noise
const pct = (a: number, b: number) => Math.round((Math.abs(a - b) / Math.abs(b)) * 100);

/** Turns the numbers into a few plain sentences, most important first. Pure function. */
export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const nameOf = (id: string | null) => (id && i.names.get(id)) || "A branch";
  const inScope = (r: BranchRangeSummary) => !i.selectedBranch || r.branch_id === i.selectedBranch;
  const cur = i.cur.filter(inScope), prev = i.prev.filter(inScope);
  const prevOf = new Map(prev.map(r => [r.branch_id, r]));
  const multi = !i.selectedBranch && cur.length > 1;

  // 1. Each branch: sales moved a lot, and which channel explains it
  for (const r of cur) {
    const p = prevOf.get(r.branch_id);
    if (!p || p.sales_total < MIN_BASE) continue;
    const change = r.sales_total - p.sales_total;
    const pc = pct(r.sales_total, p.sales_total);
    if (pc < 10) continue;
    const up = change > 0;
    const deltas = CHANNELS.map(c => ({ label: c.label, d: r[c.key] - p[c.key] })).filter(x => (up ? x.d > 0 : x.d < 0));
    const top = deltas.sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
    const mostly = top && Math.abs(top.d) >= Math.abs(change) * 0.5 ? `, mostly ${top.label}` : "";
    out.push({
      id: `sales-${r.branch_id}`, tone: up ? "good" : "bad", score: Math.abs(change),
      text: `${nameOf(r.branch_id)} sales ${up ? "rose" : "fell"} ${pc}% (${fmtINRCompact(Math.abs(change))}) compared with ${i.compareLabel}${mostly}.`,
    });
  }

  // 2. Everything together (only worth saying when it adds to the per-branch lines)
  const tot = (rows: BranchRangeSummary[]) => rows.reduce((a, r) => ({ s: a.s + r.sales_total, e: a.e + r.expenses_operating, sw: a.sw + r.swiggy + r.zomato }), { s: 0, e: 0, sw: 0 });
  const tc = tot(cur), tp = tot(prev);
  if (tp.s >= MIN_BASE && pct(tc.s, tp.s) >= 5 && multi) {
    const up = tc.s > tp.s;
    out.push({ id: "sales-total", tone: up ? "good" : "bad", score: Math.abs(tc.s - tp.s) * 1.5,
      text: `Across all branches, sales ${up ? "rose" : "fell"} ${pct(tc.s, tp.s)}% (${fmtINRCompact(Math.abs(tc.s - tp.s))}) compared with ${i.compareLabel}.` });
  }

  // 3. Running costs eating a bigger share of sales
  for (const r of cur) {
    const p = prevOf.get(r.branch_id);
    if (!p || r.sales_total < MIN_BASE || p.sales_total < MIN_BASE) continue;
    const a = (r.expenses_operating / r.sales_total) * 100, b = (p.expenses_operating / p.sales_total) * 100;
    if (a - b >= 5) {
      out.push({ id: `ratio-${r.branch_id}`, tone: "bad", score: ((a - b) / 100) * r.sales_total,
        text: `${nameOf(r.branch_id)}: running costs took ${Math.round(a)}% of sales, up from ${Math.round(b)}% in ${i.compareLabel}.` });
    }
  }

  // 4. Dependence on Swiggy + Zomato
  if (tc.s >= MIN_BASE && tp.s >= MIN_BASE) {
    const a = (tc.sw / tc.s) * 100, b = (tp.sw / tp.s) * 100;
    if (Math.abs(a - b) >= 5) {
      out.push({ id: "apps", tone: a > b ? "warn" : "flat", score: (Math.abs(a - b) / 100) * tc.s,
        text: `Swiggy and Zomato now bring ${Math.round(a)}% of sales (${Math.round(b)}% in ${i.compareLabel}).` });
    }
  }

  // 5. Spending category that jumped
  if (i.catCur && i.catPrev) {
    const before = new Map(i.catPrev.filter(c => c.kind === "operating").map(c => [c.category, c.amount]));
    const jumps = i.catCur.filter(c => c.kind === "operating").map(c => ({ c: c.category, now: c.amount, was: before.get(c.category) ?? 0 }))
      .filter(x => x.was >= 1000 && x.now - x.was >= 2000 && x.now / x.was >= 1.2)
      .sort((a, b) => (b.now - b.was) - (a.now - a.was));
    if (jumps[0]) {
      const j = jumps[0];
      out.push({ id: "category", tone: "warn", score: j.now - j.was,
        text: `${j.c} spending is up ${pct(j.now, j.was)}% (${fmtINRCompact(j.now - j.was)} more) than ${i.compareLabel}.` });
    }
  }

  // 6. Salaries high compared with sales (only when payroll is matched to the period)
  if (i.payroll?.applicable && i.payroll.processed && tc.s >= MIN_BASE) {
    const share = (i.payroll.cost / tc.s) * 100;
    if (share >= 35) out.push({ id: "payroll", tone: "warn", score: i.payroll.cost * 0.5, text: `Salaries took ${Math.round(share)}% of sales (${fmtINR(i.payroll.cost)}).` });
  }

  // 7. Best and quietest weekday
  if (i.weekday) {
    const byDow = new Map<number, { s: number; d: number }>();
    for (const w of i.weekday.filter(w => !i.selectedBranch || w.branch_id === i.selectedBranch)) {
      const x = byDow.get(w.dow) ?? { s: 0, d: 0 };
      byDow.set(w.dow, { s: x.s + w.sales_total, d: x.d + w.days });
    }
    const rows = [...byDow.entries()].filter(([, v]) => v.d >= 2).map(([dow, v]) => ({ dow, avg: v.s / v.d }));
    if (rows.length >= 5) {
      rows.sort((a, b) => b.avg - a.avg);
      const best = rows[0], worst = rows[rows.length - 1];
      if (best.avg > 0 && worst.avg / best.avg < 0.85) {
        out.push({ id: "weekday", tone: "flat", score: 1,
          text: `${DAYS[best.dow - 1]} are your best day (about ${fmtINRCompact(best.avg)} per day). ${DAYS[worst.dow - 1]} are the quietest (about ${fmtINRCompact(worst.avg)}).` });
      }
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}
