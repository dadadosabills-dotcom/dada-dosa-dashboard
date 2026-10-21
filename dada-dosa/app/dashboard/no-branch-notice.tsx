export function NoBranchNotice() {
  return (
    <div className="card p-3 mb-4 border border-rust/40">
      <p className="text-rust text-sm">Your account isn&apos;t assigned to a branch yet.</p>
      <p className="text-muted text-xs mt-1">
        Adding and importing entries is switched off until an Admin assigns you a branch (Admin → Staff).
      </p>
    </div>
  );
}
