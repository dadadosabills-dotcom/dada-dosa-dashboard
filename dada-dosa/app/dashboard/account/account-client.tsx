"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtINR } from "@/lib/constants";

export type MyAdvance = { id: string; date: string; amount: number; remaining: number; source_expense_id: string | null; expenses: { status: string } | null };
export type MyRun = {
  id: string; period: string; advances_deducted: number; food_bill: number; missing_bill: number; bank_deduction: number;
  pf: number; shoes: number; fine: number; uniform: number; deductions: number;
};

const DEDUCTION_COLS: { key: keyof MyRun; label: string }[] = [
  { key: "advances_deducted", label: "Advance recovered" },
  { key: "food_bill", label: "Food bill" },
  { key: "missing_bill", label: "Missing bill" },
  { key: "bank_deduction", label: "Bank" },
  { key: "pf", label: "PF" },
  { key: "shoes", label: "Shoes" },
  { key: "fine", label: "Fine" },
  { key: "uniform", label: "Uniform" },
];

const monthLabel = (period: string) => {
  const [y, m] = period.split("-");
  return m ? new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : period;
};

export function AccountClient({ name, branchName, employeeName, advances, runs }: {
  name: string; branchName: string | null; employeeName: string | null; advances: MyAdvance[]; runs: MyRun[];
}) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // An advance counts once its expense entry is approved (or if it has no expense behind it).
  const counted = advances.filter(a => !a.expenses || a.expenses.status === "approved");
  const waiting = advances.filter(a => a.expenses && a.expenses.status === "pending");
  const totalAdvance = counted.reduce((a, b) => a + Number(b.amount), 0);
  const outstanding = counted.reduce((a, b) => a + Number(b.remaining), 0);

  const totals = DEDUCTION_COLS.map(c => ({ ...c, total: runs.reduce((a, r) => a + Number(r[c.key] ?? 0), 0) }));
  const totalDeducted = runs.reduce((a, r) => a + Number(r.deductions ?? 0), 0);

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-cream">My Account</h1>
        <p className="text-muted text-sm mt-1">{name}{branchName ? ` · ${branchName}` : ""}</p>
      </header>

      {!employeeName ? (
        <div className="card p-4 mb-6">
          <p className="text-cream text-sm">Your advances and deductions aren&apos;t linked to your login yet.</p>
          <p className="text-muted text-xs mt-1">Ask an admin to link your account to your employee record (Admin → Staff → Employee record).</p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 mb-6">
            <div className="card p-4">
              <p className="text-[11px] text-muted uppercase tracking-wide mb-1">Total advance taken</p>
              <p className="font-mono text-xl text-gold">{fmtINR(totalAdvance)}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] text-muted uppercase tracking-wide mb-1">Still to be deducted</p>
              <p className="font-mono text-xl text-rust">{fmtINR(outstanding)}</p>
            </div>
          </section>
          {waiting.length > 0 && (
            <p className="text-muted text-xs -mt-3 mb-6">{waiting.length} advance{waiting.length > 1 ? "s" : ""} still waiting for approval {waiting.length > 1 ? "aren't" : "isn't"} counted yet.</p>
          )}

          <section className="card mb-6 overflow-x-auto">
            <h2 className="font-display text-base text-cream px-4 pt-4 pb-2">Advances taken</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium text-right">Amount</th>
                  <th className="px-4 py-2 font-medium text-right">Still to deduct</th>
                </tr>
              </thead>
              <tbody>
                {counted.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-muted text-sm">No advances.</td></tr>}
                {counted.map(a => (
                  <tr key={a.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5 text-muted whitespace-nowrap">{new Date(a.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-cream">{fmtINR(Number(a.amount))}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">{fmtINR(Number(a.remaining))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card mb-6">
            <h2 className="font-display text-base text-cream px-4 pt-4 pb-2">Deductions from salary</h2>
            {runs.length === 0 ? (
              <p className="px-4 pb-4 text-muted text-sm">No salary has been processed for you yet.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 px-4 pb-4">
                  {totals.filter(t => t.total > 0).map(t => (
                    <div key={t.key}>
                      <p className="text-[11px] text-muted">{t.label}</p>
                      <p className="font-mono text-cream text-sm">{fmtINR(t.total)}</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-[11px] text-muted">All deductions</p>
                    <p className="font-mono text-gold text-sm">{fmtINR(totalDeducted)}</p>
                  </div>
                </div>
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] text-muted uppercase tracking-wide border-b border-line">
                        <th className="px-4 py-2 font-medium">Month</th>
                        {DEDUCTION_COLS.map(c => <th key={c.key} className="px-3 py-2 font-medium text-right whitespace-nowrap">{c.label}</th>)}
                        <th className="px-4 py-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map(r => (
                        <tr key={r.id} className="border-b border-line/60 last:border-0">
                          <td className="px-4 py-2.5 text-muted whitespace-nowrap">{monthLabel(r.period)}</td>
                          {DEDUCTION_COLS.map(c => (
                            <td key={c.key} className="px-3 py-2.5 text-right font-mono text-muted">{Number(r[c.key]) ? fmtINR(Number(r[c.key])) : "—"}</td>
                          ))}
                          <td className="px-4 py-2.5 text-right font-mono text-cream">{fmtINR(Number(r.deductions))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}

      <section className="card p-4">
        <button onClick={signOut} className="btn-ghost text-sm hover:border-rust hover:text-rust w-full md:w-auto">Sign out</button>
      </section>
    </main>
  );
}
