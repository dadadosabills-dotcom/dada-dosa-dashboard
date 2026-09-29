import { createClient, getProfile, canSeeAllBranches } from "@/lib/supabase/server";
import { fmtINR } from "@/lib/constants";

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return start;
}

export default async function OverviewPage() {
  const supabase = createClient();
  const profile = await getProfile();
  const monthStart = monthRange();
  const scoped = !canSeeAllBranches(profile?.role) && profile?.branch_id;

  let salesQ = supabase.from("sales").select("channel_total, status").gte("date", monthStart);
  let expensesQ = supabase.from("expenses").select("amount, status").gte("date", monthStart);
  let creditorQ = supabase.from("creditor_transactions").select("amount, type, status");
  if (scoped) {
    salesQ = salesQ.eq("branch_id", profile!.branch_id);
    expensesQ = expensesQ.eq("branch_id", profile!.branch_id);
    creditorQ = creditorQ.eq("branch_id", profile!.branch_id);
  }

  const [{ data: sales }, { data: expenses }, { data: creditorTx }] = await Promise.all([salesQ, expensesQ, creditorQ]);

  const salesTotal = (sales ?? []).filter(s => s.status !== "rejected").reduce((a, b) => a + Number(b.channel_total), 0);
  const expenseTotal = (expenses ?? []).filter(x => x.status !== "rejected").reduce((a, b) => a + Number(b.amount), 0);
  const net = salesTotal - expenseTotal;
  const owed = (creditorTx ?? []).filter(t => t.status !== "rejected").reduce(
    (a, b) => a + (b.type === "bill" ? Number(b.amount) : -Number(b.amount)), 0
  );

  const cards = [
    { label: "Sales this month", value: fmtINR(salesTotal), accent: "gold" },
    { label: "Expenses this month", value: fmtINR(expenseTotal), accent: "pink" },
    { label: net >= 0 ? "Net profit" : "Net loss", value: fmtINR(Math.abs(net)), accent: net >= 0 ? "leaf" : "rust" },
    { label: "Owed to creditors", value: fmtINR(owed), accent: "gold" },
  ];

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-cream">Overview</h1>
        <p className="text-muted text-sm mt-1">
          Welcome back, {profile?.full_name?.split(" ")[0]}.
          {scoped && profile?.branch_name && <span className="text-gold"> — {profile.branch_name}</span>}
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="text-[11px] text-muted uppercase tracking-wide">{c.label}</p>
            <p className={`font-mono text-xl mt-2 text-cream`}>{c.value}</p>
          </div>
        ))}
      </div>

      {(profile?.role === "superuser" || profile?.role === "admin" || profile?.role === "superadmin") && (
        <div className="card p-4">
          <p className="text-sm text-cream mb-1">Pending your approval</p>
          <p className="text-muted text-xs">
            Check the Sales, Expenses, Creditors and Drawings tabs — entries
            staff have added sit as <span className="text-gold">pending</span> until
            you approve or reject them there.
          </p>
        </div>
      )}
    </main>
  );
}
