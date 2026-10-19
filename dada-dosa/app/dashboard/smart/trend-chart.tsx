"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/analytics/overview-data";
import { fmtDate } from "@/lib/analytics/dates";
import { fmtINR } from "@/lib/constants";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const axisMoney = (n: number) => (n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1000 ? `${+(n / 1000).toFixed(0)}k` : String(n));

/** One plain line: sales per day. No decoration, one axis. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <div className="card p-3" role="img" aria-label={`Daily sales from ${fmtDate(points[0].date)} to ${fmtDate(points[points.length - 1].date)}`}>
      <div className="h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#332F27" vertical={false} />
            <XAxis dataKey="date" tickFormatter={short} tick={{ fill: "#9A9284", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={axisMoney} tick={{ fill: "#9A9284", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
            <Tooltip
              cursor={{ stroke: "#B99A4E" }}
              contentStyle={{ background: "#1F1D19", border: "1px solid #332F27", borderRadius: 8, color: "#F6EFDD", fontSize: 12 }}
              labelFormatter={(d: string) => fmtDate(d)}
              formatter={(v: number) => [fmtINR(v), "Sales"]}
            />
            <Line type="monotone" dataKey="sales" stroke="#E8C468" strokeWidth={2.5} dot={points.length <= 16 ? { r: 3, fill: "#E8C468" } : false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
