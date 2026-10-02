"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Folder = { id: string; parent_id: string | null; name: string; created_at: string };
export type DocFile = {
  id: string; folder_id: string | null; name: string; storage_path: string; size: number; mime_type: string | null;
  created_at: string; uploader: { full_name: string } | null;
};

const BUCKET = "branch-documents";
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const safeName = (n: string) => n.replace(/[^\w.\- ()]+/g, "_");
const viewable = (f: DocFile) => /^(image\/|application\/pdf|text\/)/.test(f.mime_type ?? "");

export function DocumentsClient({ folders, files, canManage, userId, missingSetup }: {
  folders: Folder[]; files: DocFile[]; canManage: boolean; userId: string; missingSetup: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [current, setCurrent] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);
  const trail = useMemo(() => {
    const out: Folder[] = [];
    let cur = current ? byId.get(current) : undefined;
    while (cur) { out.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return out;
  }, [current, byId]);

  const subFolders = folders.filter(f => (f.parent_id ?? null) === current);
  const here = files.filter(f => (f.folder_id ?? null) === current);
  const countIn = (id: string) => files.filter(f => f.folder_id === id).length + folders.filter(f => f.parent_id === id).length;

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    const name = newName.trim();
    if (!name) return;
    if (subFolders.some(f => f.name.toLowerCase() === name.toLowerCase())) { setError("A folder with that name already exists here."); return; }
    const { error } = await supabase.from("document_folders").insert({ name, parent_id: current, created_by: userId });
    if (error) { setError(error.message); return; }
    setNewName("");
    router.refresh();
  }

  async function renameFolder(f: Folder) {
    const name = prompt("Rename folder", f.name)?.trim();
    if (!name || name === f.name) return;
    const { error } = await supabase.from("document_folders").update({ name }).eq("id", f.id);
    if (error) setError(error.message); else router.refresh();
  }

  async function deleteFolder(f: Folder) {
    setError(null); setMsg(null);
    if (countIn(f.id) > 0) { setError(`"${f.name}" isn't empty. Delete or move what's inside first.`); return; }
    if (!confirm(`Delete the empty folder "${f.name}"?`)) return;
    const { error } = await supabase.from("document_folders").delete().eq("id", f.id);
    if (error) setError(error.message); else router.refresh();
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!list.length) return;
    setBusy(true); setError(null); setMsg(null);
    let ok = 0;
    const problems: string[] = [];
    for (const file of list) {
      const path = `${current ?? "root"}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) { problems.push(`${file.name}: ${up.error.message}`); continue; }
      const { error } = await supabase.from("documents").insert({
        folder_id: current, name: file.name, storage_path: path, size: file.size, mime_type: file.type || null, uploaded_by: userId,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]); // don't leave an orphan file behind
        problems.push(`${file.name}: ${error.message}`);
      } else ok++;
    }
    setBusy(false);
    if (ok) setMsg(`${ok} file${ok > 1 ? "s" : ""} uploaded.`);
    if (problems.length) setError(problems.join(" · "));
    router.refresh();
  }

  /** Opens/downloads through a short-lived signed link (the bucket is private). */
  async function open(f: DocFile, download: boolean) {
    setError(null);
    const win = download ? null : window.open("", "_blank"); // opened first so phones don't block the popup
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 120, download ? { download: f.name } : undefined);
    if (error || !data?.signedUrl) { win?.close(); setError(error?.message ?? "Couldn't open the file."); return; }
    if (download) {
      const a = document.createElement("a");
      a.href = data.signedUrl; a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
    } else if (win) win.location.href = data.signedUrl;
  }

  async function deleteFile(f: DocFile) {
    if (!confirm(`Delete "${f.name}"? This can't be undone.`)) return;
    setError(null);
    const rm = await supabase.storage.from(BUCKET).remove([f.storage_path]);
    if (rm.error) { setError(rm.error.message); return; }
    const { error } = await supabase.from("documents").delete().eq("id", f.id);
    if (error) setError(error.message); else router.refresh();
  }

  return (
    <main className="px-5 py-6 md:px-8 md:py-8 max-w-4xl">
      <header className="mb-5">
        <h1 className="font-display text-2xl text-cream">Branch Documents</h1>
        <p className="text-muted text-sm mt-1">{canManage ? "Create folders and upload files. Admins can view and download." : "View and download. Only a SuperAdmin can add or remove folders and files."}</p>
      </header>

      {missingSetup && (
        <div className="card p-3 mb-4 border border-rust/40">
          <p className="text-rust text-sm">Documents aren&apos;t set up yet.</p>
          <p className="text-muted text-xs mt-1">Run <span className="num">supabase/migration_011_drawing_parties_documents.sql</span> in the Supabase SQL Editor, then refresh.</p>
        </div>
      )}

      <nav className="flex items-center flex-wrap gap-1 text-sm mb-4">
        <button onClick={() => setCurrent(null)} className={current === null ? "text-gold" : "text-muted hover:text-cream"}>All documents</button>
        {trail.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1">
            <span className="text-muted">/</span>
            <button onClick={() => setCurrent(f.id)} className={i === trail.length - 1 ? "text-gold" : "text-muted hover:text-cream"}>{f.name}</button>
          </span>
        ))}
      </nav>

      {canManage && (
        <div className="card p-4 mb-5 flex flex-wrap gap-4 items-end">
          <form onSubmit={addFolder} className="flex gap-2 items-end">
            <div>
              <label className="block text-[11px] text-muted mb-1">{current ? "New folder in here" : "New section / folder"}</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. 1st Branch — Licences" className="w-64 max-w-full" />
            </div>
            <button type="submit" className="btn-ghost" disabled={!newName.trim()}>Add</button>
          </form>
          <div>
            <input ref={fileRef} type="file" multiple onChange={upload} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? "Uploading…" : current ? "Upload files here" : "Upload files"}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-leaf text-sm mb-3">{msg}</p>}
      {error && <p className="text-rust text-sm mb-3">{error}</p>}

      {subFolders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {subFolders.map(f => (
            <div key={f.id} className="card p-3 flex items-center gap-3">
              <button onClick={() => setCurrent(f.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-gold shrink-0"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
                <span className="min-w-0">
                  <span className="block text-cream text-sm truncate">{f.name}</span>
                  <span className="block text-muted text-[11px]">{countIn(f.id)} item{countIn(f.id) === 1 ? "" : "s"}</span>
                </span>
              </button>
              {canManage && (
                <span className="shrink-0 flex gap-3 text-xs">
                  <button onClick={() => renameFolder(f)} className="text-muted hover:text-gold">Rename</button>
                  <button onClick={() => deleteFolder(f)} className="text-muted hover:text-rust">Delete</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {here.length === 0 && (
              <tr><td className="px-4 py-8 text-center text-muted text-sm">
                {subFolders.length ? "No files directly in here." : canManage ? "Empty — upload a file or add a folder." : "Nothing here yet."}
              </td></tr>
            )}
            {here.map(f => (
              <tr key={f.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3 text-cream break-words">
                  {f.name}
                  <p className="text-muted text-[11px] mt-0.5">
                    {fmtSize(Number(f.size))} · {new Date(f.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    {f.uploader?.full_name ? ` · ${f.uploader.full_name}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                  {viewable(f) && <button onClick={() => open(f, false)} className="text-gold hover:underline mr-3">View</button>}
                  <button onClick={() => open(f, true)} className="text-gold hover:underline">Download</button>
                  {canManage && <button onClick={() => deleteFile(f)} className="text-muted hover:text-rust hover:underline ml-3">Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
