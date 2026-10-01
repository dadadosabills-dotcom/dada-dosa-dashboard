// Shows who entered a record and who approved/rejected it — the audit trail on Sales and Expenses.
type LogProps = {
  status: string;
  createdBy?: string | null;
  createdAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
};

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export function EntryLog({ status, createdBy, createdAt, approvedBy, approvedAt }: LogProps) {
  const verb = status === "rejected" ? "Rejected" : "Approved";
  return (
    <div className="text-[11px] leading-snug">
      <p className="text-muted">
        Entered by <span className="text-cream">{createdBy ?? "Unknown"}</span>
        {createdAt && <span className="block">{when(createdAt)}</span>}
      </p>
      {status === "pending" ? (
        <p className="text-gold-dim mt-0.5">Awaiting approval</p>
      ) : (
        <p className="text-muted mt-0.5">
          {verb} by <span className="text-cream">{approvedBy ?? "Unknown"}</span>
          {approvedAt && <span className="block">{when(approvedAt)}</span>}
        </p>
      )}
    </div>
  );
}
