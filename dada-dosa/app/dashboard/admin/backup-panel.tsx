"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchAllTables, restoreToSupabase, type RestoreResult } from "@/lib/backup";
import { buildBackupWorkbook, parseBackupWorkbook, backupFileName, TABLES, type ParsedBackup } from "@/lib/backup-core";

function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function BackupPanel({ currentUserId, currentUserRole }: { currentUserId: string; currentUserRole: string }) {
  const supabase = createClient();
  const router = useRouter();
  const canRestore = currentUserRole === "superadmin";

  const [busy, setBusy] = useState<null | "backup" | "restore">(null);
  const [progress, setProgress] = useState("");
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function makeBackup() {
    setError(null); setBackupMsg(null); setResult(null);
    setBusy("backup");
    try {
      const data = await fetchAllTables(supabase, setProgress);
      setProgress("Building Excel file…");
      const bytes = buildBackupWorkbook(data, "Dada Dosa online dashboard");
      download(bytes, backupFileName());
      const total = Object.values(data).reduce((a, r) => a + r.length, 0);
      setBackupMsg(`Backup downloaded — ${plural(total, "row")} across ${TABLES.length} sheets.`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
    setProgress("");
    setBusy(null);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setParsed(null); setResult(null); setError(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const p = parseBackupWorkbook(await file.arrayBuffer());
      if (!p.recognised) { setError("This doesn't look like a Dada Dosa backup — none of the expected sheets were found."); return; }
      setParsed(p);
    } catch {
      setError("Couldn't read that file. Is it an .xlsx backup made by this app?");
    }
  }

  async function doRestore() {
    if (!parsed) return;
    setError(null); setResult(null);
    setBusy("restore");
    try {
      const r = await restoreToSupabase(supabase, parsed.tables, currentUserId, setProgress);
      setResult(r);
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
    setProgress("");
    setBusy(null);
  }

  const totalRows = parsed ? Object.values(parsed.counts).reduce((a, b) => a + b, 0) : 0;
  const failedTotal = result ? Object.values(result.perTable).reduce((a, b) => a + b.failed, 0) : 0;
  const writtenTotal = result ? Object.values(result.perTable).reduce((a, b) => a + b.written, 0) : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="card p-5">
        <h2 className="font-display text-lg text-cream mb-1">Download a backup</h2>
        <p className="text-muted text-sm mb-4">
          One Excel file with every table on its own sheet (sales, expenses, payroll, creditors, drawings, staff, branches and more).
          Keep a copy somewhere safe — email, cloud drive or USB stick.
        </p>
        <button onClick={makeBackup} disabled={busy !== null} className="btn-primary disabled:opacity-50">
          {busy === "backup" ? "Preparing…" : "Download full backup (.xlsx)"}
        </button>
        {busy === "backup" && progress && <p className="text-muted text-xs mt-3">{progress}</p>}
        {backupMsg && <p className="text-leaf text-sm mt-3">{backupMsg}</p>}
        <p className="text-muted text-xs mt-4">
          Not included: login accounts (Supabase looks after those) and the receipt photos themselves. The links to the receipts are saved.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-lg text-cream mb-1">Restore from a backup</h2>
        {!canRestore ? (
          <p className="text-muted text-sm">Only a SuperAdmin can restore a backup.</p>
        ) : (
          <>
            <p className="text-muted text-sm mb-4">
              Choose a backup file made by this app. You&apos;ll see a preview before anything changes. Restoring <span className="text-cream">adds missing rows and updates rows that already exist</span> — it never deletes anything, so it&apos;s safe to run twice.
            </p>
            <input ref={fileRef} type="file" accept=".xlsx" onChange={onPick} disabled={busy !== null} className="block w-full max-w-md text-sm" />

            {parsed && (
              <div className="mt-5">
                <p className="text-cream text-sm mb-2">
                  <span className="text-gold">{fileName}</span> — {plural(totalRows, "row")} found
                </p>
                <div className="overflow-x-auto border border-line rounded">
                  <table className="w-full text-sm">
                    <tbody>
                      {TABLES.map(t => (
                        <tr key={t.name} className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-1.5 text-cream">{t.label}</td>
                          <td className="px-3 py-1.5 text-right num text-muted">
                            {parsed.missingSheets.includes(t.name) ? <span className="text-muted/60">no sheet</span> : parsed.counts[t.name]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.warnings.length > 0 && (
                  <ul className="mt-3 text-xs text-rust list-disc pl-5 space-y-1">
                    {parsed.warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
                <div className="flex gap-3 mt-4">
                  <button onClick={doRestore} disabled={busy !== null || totalRows === 0} className="btn-primary disabled:opacity-50">
                    {busy === "restore" ? "Restoring…" : `Restore ${plural(totalRows, "row")}`}
                  </button>
                  <button
                    onClick={() => { setParsed(null); if (fileRef.current) fileRef.current.value = ""; }}
                    disabled={busy !== null}
                    className="btn-ghost"
                  >Cancel</button>
                </div>
                {busy === "restore" && progress && <p className="text-muted text-xs mt-3">{progress}</p>}
              </div>
            )}

            {result && (
              <div className="mt-5 border border-line rounded p-4">
                <p className={`text-sm ${failedTotal ? "text-rust" : "text-leaf"}`}>
                  {failedTotal
                    ? `Restored ${plural(writtenTotal, "row")}, but ${plural(failedTotal, "row")} couldn't be saved.`
                    : `Restore complete — ${plural(writtenTotal, "row")} written.`}
                </p>
                {result.notes.map((n, i) => <p key={i} className="text-muted text-xs mt-2">{n}</p>)}
                {result.errors.length > 0 && (
                  <ul className="mt-3 text-xs text-rust list-disc pl-5 space-y-1">
                    {result.errors.slice(0, 10).map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="text-rust text-sm mt-4">{error}</p>}
      </section>
    </div>
  );
}
