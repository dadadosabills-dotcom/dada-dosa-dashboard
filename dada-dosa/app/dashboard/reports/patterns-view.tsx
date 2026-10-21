"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtINR } from "@/lib/constants";
import { fmtShort } from "@/lib/analytics/format";
import type { CategoryMatrix, WeekdayMatrix } from "@/lib/analytics/report-calc";
import { EmptyNote } from "../smart/ui";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Darker gold = bigger. Text stays cream, so it is readable on every shade. */
const heat = (v: number, max: number) => `rgba(232,196,104,${(0.08 + 0.55 * (max > 0 ? v / max : 0)).toFixed(2)})`;

export function PatternsView({ weekday, categories }: { weekday: WeekdayMatrix; categories: CategoryMatrix }) {
  const data = DAY.map((d, i) => ({ day: d, avg: Math.round(weekday.overall[i] ?? 0), has: weekday.overall[i] !== null }));
  const hasData = data.some(d => d.has);
  const best = Math.max(...data.map(d => d.avg));
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-cream mb-1">Which days sell the most</h3>
        <p className="text-xs text-muted mb-2">Average sales on a trading day, for each day of the week.</p>
        {!hasData ? <EmptyNote title="No sales in this period" hint="Pick a longer period to see which days are busiest." /> : (
          <div className="card p-3" role="img" aria-label={`Average sales by weekday: ${data.map(d => `${d.day} ${fmtINR(d.avg)}`).join(", ")}`}>
            <div className="h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#332F27" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#9A9284", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtShort} tick={{ fill: "#9A9284", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
                  <Tooltip cursor={{ fill: "rgba(232,196,104,0.08)" }} contentStyle={{ background: "#1F1D19", border: "1px solid #332F27", borderRadius: 8, color: "#F6EFDD", fontSize: 12 }} formatter={(v: number) => [fmtINR(v), "Average per day"]} />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {data.map(d => <Cell key={d.day} fill={d.avg === best && best > 0 ? "#E8C468" : "#8C7A45"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {weekday.rows.length > 1 && hasData && (
        <section>
          <h3 className="text-sm font-semibold text-cream mb-1">Busy days, branch by branch</h3>
          <p className="text-xs text-muted mb-2">Average sales per trading day. Darker means busier for that branch.</p>
          <div className="card overflow-x-auto">
            <table className="w-full text-xs min-w-[460px]">
              <thead><tr><th scope="col" className="text-left p-2.5 text-muted font-normal">Branch</th>{DAY.map(d => <th scope="col" key={d} className="p-1.5 text-muted font-normal">{d}</th>)}</tr></thead>
              <tbody>
                {weekday.rows.map(r => {
                  const max = Math.max(...r.avg.map(v => v ?? 0));
                  return (
                    <tr key={r.id ?? "none"} className="border-t border-line">
                      <th scope="row" className="text-left p-2.5 text-cream font-normal whitespace-nowrap">{r.name}</th>
                      {r.avg.map((v, i) => (
                        <td key={i} className="p-1 text-center">
                          <div className="rounded px-1 py-2 num text-cream" style={{ background: v === null ? "transparent" : heat(v, max) }}>{v === null ? "–" : fmtShort(v)}</div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-cream mb-1">Where each branch spends</h3>
        <p className="text-xs text-muted mb-2">Share of each branch&apos;s running costs. Salaries and owner drawings are not included.</p>
        {categories.rows.length === 0 ? <EmptyNote title="No expenses in this period" hint="Once expenses are entered and approved, the split shows here." /> : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 120 + categories.columns.length * 76 }}>
              <thead><tr><th scope="col" className="text-left p-2.5 text-muted font-normal">Branch</th>{categories.columns.map(c => <th scope="col" key={c} className="p-1.5 text-muted font-normal">{c}</th>)}</tr></thead>
              <tbody>
                {categories.rows.map(r => (
                  <tr key={r.id ?? "none"} className="border-t border-line">
                    <th scope="row" className="text-left p-2.5 text-cream font-normal whitespace-nowrap">{r.name}</th>
                    {r.share.map((s, i) => (
                      <td key={i} className="p-1 text-center"><div className="rounded px-1 py-2 num text-cream" style={{ background: heat(s, 100) }}>{Math.round(s)}%</div></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
