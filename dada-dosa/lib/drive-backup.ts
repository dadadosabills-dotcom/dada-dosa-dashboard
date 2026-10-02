import { fetchAllTables } from "./backup";
import { buildBackupWorkbook } from "./backup-core";

/**
 * Nightly backup to Google Drive (run by scripts/backup-to-drive.ts on a schedule).
 *  1. One Excel file with every table  -> Dada Dosa Backups / Daily data / data-YYYY-MM-DD.xlsx  (last 30 days kept)
 *  2. Every uploaded file that isn't in Drive yet, copied under Dada Dosa Backups / Files / …
 *       Expense receipts   -> Expense receipts / <branch> / <YYYY-MM> / <date>_<party>_<amount>.<ext>
 *       Branch documents   -> Branch documents / <folder path> / <date>_<file name>
 *       Employee documents -> Employee documents / <employee> / <Joining form|Identity proof|Other> / <date>_<file name>
 *  Files are only ever ADDED to Drive, never deleted or overwritten, and already-copied files are skipped.
 */

export interface DriveApi {
  ensureFolder(path: string[]): Promise<string>;
  /** Source keys ("bucket:path") of files already copied. */
  listCopied(): Promise<Set<string>>;
  upload(o: { folderId: string; name: string; bytes: Uint8Array; mime: string; src?: string }): Promise<void>;
  listFolderFiles(folderId: string): Promise<{ id: string; name: string }[]>;
  remove(id: string): Promise<void>;
}

export type BackupResult = { ok: boolean; dataRows: number; copied: number; skipped: number; failed: number; message: string };

const DAILY_KEEP = 30;
const ROOT = "Dada Dosa Backups";
const KIND_LABEL: Record<string, string> = { joining_form: "Joining form", identity_proof: "Identity proof", other: "Other" };

const clean = (s: unknown, max = 100) =>
  String(s ?? "").replace(/[\\/:*?"<>|\r\n\t]+/g, "_").replace(/\s+/g, " ").trim().slice(0, max) || "unnamed";
const day = (iso: string | null | undefined) => String(iso ?? "").slice(0, 10) || "undated";
const extOf = (p: string) => { const m = p.match(/\.[A-Za-z0-9]{1,5}$/); return m ? m[0].toLowerCase() : ""; };
const mimeOf = (p: string, fallback?: string | null) => {
  if (fallback) return fallback;
  const e = extOf(p);
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" } as Record<string, string>)[e] ?? "application/octet-stream";
};

async function readAll(supabase: any, table: string, cols: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function runBackup(supabase: any, drive: DriveApi, log: (m: string) => void = console.log, today = new Date()): Promise<BackupResult> {
  const res: BackupResult = { ok: false, dataRows: 0, copied: 0, skipped: 0, failed: 0, message: "" };
  const stamp = today.toISOString().slice(0, 10);

  // ---------- 1. data ----------
  log("Reading all tables…");
  const tables = await fetchAllTables(supabase);
  res.dataRows = Object.values(tables).reduce((a, r) => a + r.length, 0);
  const xlsx = buildBackupWorkbook(tables, "Nightly Google Drive backup");
  const dataFolder = await drive.ensureFolder([ROOT, "Daily data"]);
  const existing = await drive.listFolderFiles(dataFolder);
  for (const f of existing.filter(f => f.name === `data-${stamp}.xlsx`)) await drive.remove(f.id); // re-run on the same day replaces it
  await drive.upload({ folderId: dataFolder, name: `data-${stamp}.xlsx`, bytes: xlsx, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const cutoff = new Date(today.getTime() - DAILY_KEEP * 86400000).toISOString().slice(0, 10);
  for (const f of existing) {
    const m = f.name.match(/^data-(\d{4}-\d{2}-\d{2})\.xlsx$/);
    if (m && m[1] < cutoff) await drive.remove(f.id);
  }
  log(`Data backup saved (${res.dataRows} rows).`);

  // ---------- 2. files ----------
  const copied = await drive.listCopied();
  type Job = { bucket: string; path: string; folder: string[]; name: string; mime?: string | null };
  const jobs: Job[] = [];

  const branches = new Map((await readAll(supabase, "branches", "id, name")).map(b => [b.id, b.name]));
  for (const e of await readAll(supabase, "expenses", "id, date, vendor, amount, branch_id, receipt_url")) {
    const m = String(e.receipt_url ?? "").match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/receipts\/([^?]+)/);
    if (!m) continue;
    const path = decodeURIComponent(m[1]);
    jobs.push({
      bucket: "receipts", path,
      folder: ["Files", "Expense receipts", clean(branches.get(e.branch_id) ?? "No branch"), day(e.date).slice(0, 7)],
      name: `${day(e.date)}_${clean(e.vendor, 50)}_${Math.round(Number(e.amount))}${extOf(path)}`,
    });
  }

  const docFolders = new Map((await readAll(supabase, "document_folders", "id, parent_id, name").catch(() => [])).map(f => [f.id, f]));
  const trail = (id: string | null): string[] => {
    const out: string[] = []; let cur = id ? docFolders.get(id) : undefined; let guard = 0;
    while (cur && guard++ < 20) { out.unshift(clean(cur.name)); cur = cur.parent_id ? docFolders.get(cur.parent_id) : undefined; }
    return out;
  };
  for (const d of await readAll(supabase, "documents", "id, folder_id, name, storage_path, mime_type, created_at").catch(() => [])) {
    jobs.push({ bucket: "branch-documents", path: d.storage_path, folder: ["Files", "Branch documents", ...trail(d.folder_id)], name: `${day(d.created_at)}_${clean(d.name, 120)}`, mime: d.mime_type });
  }

  const employees = new Map((await readAll(supabase, "employees", "id, name")).map(e => [e.id, e.name]));
  for (const d of await readAll(supabase, "employee_documents", "id, employee_id, kind, name, storage_path, mime_type, created_at").catch(() => [])) {
    jobs.push({
      bucket: "employee-documents", path: d.storage_path,
      folder: ["Files", "Employee documents", clean(employees.get(d.employee_id) ?? "Unknown employee"), KIND_LABEL[d.kind] ?? "Other"],
      name: `${day(d.created_at)}_${clean(d.name, 120)}`, mime: d.mime_type,
    });
  }

  const todo = jobs.filter(j => !copied.has(`${j.bucket}:${j.path}`));
  res.skipped = jobs.length - todo.length;
  log(`${jobs.length} files in the app, ${todo.length} not yet in Drive.`);

  // folders first (sequential, so we never create the same folder twice), then uploads a few at a time
  const folderIds = new Map<string, string>();
  for (const j of todo) {
    const key = j.folder.join("/");
    if (!folderIds.has(key)) folderIds.set(key, await drive.ensureFolder([ROOT, ...j.folder]));
  }
  const failures: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const j = todo[next++];
      try {
        const { data, error } = await supabase.storage.from(j.bucket).download(j.path);
        if (error || !data) throw new Error(error?.message ?? "download failed");
        const bytes = new Uint8Array(await data.arrayBuffer());
        await drive.upload({ folderId: folderIds.get(j.folder.join("/"))!, name: j.name, bytes, mime: mimeOf(j.path, j.mime), src: `${j.bucket}:${j.path}` });
        res.copied++;
      } catch (e: any) {
        res.failed++;
        failures.push(`${j.name}: ${e?.message ?? e}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  res.ok = res.failed === 0;
  res.message = res.ok
    ? `Backed up ${res.dataRows} data rows; copied ${res.copied} new file${res.copied === 1 ? "" : "s"} (${res.skipped} already in Drive).`
    : `Data backed up, but ${res.failed} file${res.failed === 1 ? "" : "s"} failed: ${failures.slice(0, 3).join(" · ")}`;
  log(res.message);
  return res;
}

/** Real Google Drive implementation using the REST API (no extra packages). Scope: drive.file — only files this app created. */
export function googleDrive(clientId: string, clientSecret: string, refreshToken: string): DriveApi {
  let token = ""; let expires = 0;
  const auth = async () => {
    if (token && Date.now() < expires - 60000) return token;
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    const j: any = await r.json();
    if (!r.ok || !j.access_token) throw new Error(`Google sign-in failed (${j.error_description ?? j.error ?? r.status}). The Drive connection needs to be set up again.`);
    token = j.access_token; expires = Date.now() + (j.expires_in ?? 3600) * 1000;
    return token;
  };
  const api = async (url: string, init: RequestInit = {}, tries = 4): Promise<any> => {
    for (let i = 0; ; i++) {
      const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await auth()}` } });
      if (r.ok) return r.status === 204 ? null : r.json();
      if ((r.status === 429 || r.status >= 500) && i < tries) { await new Promise(s => setTimeout(s, 1000 * 2 ** i)); continue; }
      throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
  };
  const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const cache = new Map<string, string>();

  return {
    async ensureFolder(path) {
      let parent = "root"; let key = "";
      for (const name of path) {
        key += "/" + name;
        const hit = cache.get(key);
        if (hit) { parent = hit; continue; }
        const found = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and '${parent}' in parents and trashed=false`)}&fields=files(id)&pageSize=1`);
        let id: string = found.files?.[0]?.id;
        if (!id) {
          const c = await api("https://www.googleapis.com/drive/v3/files?fields=id", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] }),
          });
          id = c.id;
        }
        cache.set(key, id); parent = id;
      }
      return parent;
    },
    async listCopied() {
      const out = new Set<string>(); let pageToken = "";
      do {
        const r = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("appProperties has { key='dd_src_set' and value='1' } and trashed=false")}&fields=nextPageToken,files(appProperties)&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ""}`);
        for (const f of r.files ?? []) if (f.appProperties?.dd_src) out.add(f.appProperties.dd_src);
        pageToken = r.nextPageToken ?? "";
      } while (pageToken);
      return out;
    },
    async upload({ folderId, name, bytes, mime, src }) {
      const meta: any = { name, parents: [folderId] };
      if (src) meta.appProperties = { dd_src_set: "1", dd_src: src.slice(0, 120) }; // Drive caps a property at 124 bytes
      const boundary = "dd" + Math.random().toString(36).slice(2);
      const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
      const body = Buffer.concat([head, Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`)]);
      await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
      });
    },
    async listFolderFiles(folderId) {
      const r = await api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name)&pageSize=1000`);
      return r.files ?? [];
    },
    async remove(id) {
      await api(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE" });
    },
  };
}
