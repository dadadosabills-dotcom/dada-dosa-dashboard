"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTodayEntry } from "@/lib/analytics/queries";
import { addDays, fmtDate, todayIST } from "@/lib/analytics/dates";
import { fmtINR } from "@/lib/constants";
import type { EntryState, TodayEntry } from "@/lib/analytics/types";
import { TONE_BORDER, TONE_TEXT, type DisplayTone } from "@/lib/analytics/tone";
import { SectionError, Skeleton } from "./ui";

const STATE: Record<EntryState, { tone: DisplayTone; word: string; line: string }> = {
  none: { tone: "bad", word: "Not done", line: "Not entered yet" },
  pending: { tone: "warn", word: "Waiting", line: "Entered — waiting for approval" },
  approved: { tone: "good", word: "Done", line: "Approved" },
  rejected: { tone: "bad", word: "Fix it", line: "Rejected — please enter it again" },
};

function Step({ title, state, line, href, action }: { title: string; state: EntryState; line?: string; href: string; action: string }) {
  const s = STATE[state];
  return (
    <div className={`card p-4 border ${TONE_BORDER[s.tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-cream">{title}</p>
          <p className={`text-xs mt-1 ${TONE_TEXT[s.tone]}`}>{line ?? s.line}</p>
        </div>
        <span className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${TONE_BORDER[s.tone]} ${TONE_TEXT[s.tone]}`}>{s.word}</span>
      </div>
      <Link href={href} className={`${state === "approved" ? "btn-ghost" : "btn-primary"} block text-center mt-3 min-h-[48px] leading-[30px]`}>{action}</Link>
    </div>
  );
}

/** What a staff member needs to do today, and whether it is done. */
export function StaffToday({ name, branchId, branchName }: { name: string; branchId: string | null; branchName: string | null }) {
  const sb = useMemo(() => createClient(), []);
  const today = useMemo(() => todayIST(), []);
  const [data, setData] = useState<TodayEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!branchId);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true); setError(null);
    try {
      const r = await getTodayEntry(sb, branchId, today, addDays(today, -1));
      if (r.data) setData(r.data); else setError(r.error);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    setLoading(false);
  }, [sb, branchId, today]);
  useEffect(() => { load(); }, [load]);

  if (!branchId) {
    return (
      <div className="card p-4 border border-[#F2C14E]/40" role="alert">
        <p className="text-sm text-[#F2C14E]">Your account isn&apos;t assigned to a branch yet.</p>
        <p className="text-xs text-muted mt-1">Please ask your manager or an Admin to add you to a branch. Then your daily checklist will appear here.</p>
      </div>
    );
  }
  const hello = (() => { const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date())); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; })();

  return (
    <div className="max-w-xl">
      <p className="text-xs text-muted">{fmtDate(today)}{branchName ? ` · ${branchName}` : ""}</p>
      <h1 className="font-display text-2xl text-cream mt-1">{hello}, {name.split(" ")[0]}</h1>
      <p className="text-sm text-muted mt-1">Today&apos;s entry</p>

      <div className="mt-4 space-y-3">
        {loading && !data ? (<><Skeleton className="h-[132px]" /><Skeleton className="h-[132px]" /></>) : error ? (
          <SectionError what="your checklist" onRetry={load} />
        ) : data && (
          <>
            {data.yesterday.sales === "none" && (
              <Step title="Yesterday's sales" state="none" line="Missing — please add it" href="/dashboard/sales" action="Add yesterday's sales" />
            )}
            <Step
              title="Today's sales"
              state={data.today.sales}
              line={data.today.sales === "none" ? "Enter this when the day's sales are final" : data.today.sales === "approved" || data.today.sales === "pending" ? `${fmtINR(data.today.salesAmount)} · ${STATE[data.today.sales].line}` : undefined}
              href="/dashboard/sales"
              action={data.today.sales === "none" || data.today.sales === "rejected" ? "Enter today's sales" : "See sales"}
            />
            <div className="card p-4">
              <p className="text-sm text-cream">Today&apos;s expenses</p>
              <p className="text-xs text-muted mt-1">
                {data.today.expenseCount === 0 ? "Nothing added yet. Add each bill or payment as it happens." : `${data.today.expenseCount} added · ${fmtINR(data.today.expenseTotal)}`}
              </p>
              <Link href="/dashboard/expenses" className="btn-ghost block text-center mt-3 min-h-[48px] leading-[30px]">Add an expense</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
