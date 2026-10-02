import { Readable } from "node:stream";
import { fetchAllTables } from "./backup";
import { buildBackupWorkbook } from "./backup-core";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const ROOT = "Dada Dosa Backups";
const DAILY_KEEP = 30;

const clean = (s: unknown, max = 100) =>
  String(s ?? "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "unnamed";

const sourceKey = (src: string) =>
  createHash("sha256").update(src, "utf8").digest("hex");

const day = (v: unknown) => new Date(String(v)).toISOString().slice(0, 10);

const extOf = (path: string) => {
  const m = path.match(/\.[^./]+$/);
  return m ? m[0].toLowerCase() : "";
};

const KIND_LABEL: Record<string, string> = {
  id_proof: "ID proof",
  address_proof: "Address proof",
  contract: "Contract",
  other: "Other",
};

type Upload = {
  folderId: string;
  name: string;
  bytes: Buffer;
  mime: string;
  appProperties?: Record<string, string>;
};

type DriveFile = {
  id: string;
  name: string;
};

export function googleDrive(
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const drive = google.drive({ version: "v3", auth });

  const escQ = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const r = await drive.files.list({
        q: `'${escQ(folderId)}' in parents and trashed = false`,
        fields: "nextPageToken, files(id,name)",
        pageSize: 1000,
        pageToken,
      });

      for (const f of r.data.files ?? []) {
        if (f.id && f.name) out.push({ id: f.id, name: f.name });
      }

      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);

    return out;
  }

  async function ensureFolder(parts: string[]): Promise<string> {
    let parent: string | undefined;

    for (const part of parts) {
      const q = [
        `'${parent ?? "root"}' in parents`,
        "mimeType = 'application/vnd.google-apps.folder'",
        `name = '${escQ(part)}'`,
        "trashed = false",
      ].join(" and ");

      const r = await drive.files.list({
        q,
        fields: "files(id,name)",
        pageSize: 10,
      });

      if (r.data.files?.[0]?.id) {
        parent = r.data.files[0].id;
        continue;
      }

      const created = await drive.files.create({
        requestBody: {
          name: part,
          mimeType: "application/vnd.google-apps.folder",
          ...(parent ? { parents: [parent] } : {}),
        },
        fields: "id",
      });

      if (!created.data.id) {
        throw new Error(`Couldn't create Drive folder "${part}"`);
      }
      parent = created.data.id;
    }

    if (!parent) throw new Error("Couldn't determine Drive folder");
    return parent;
  }

    async function upload(u: Upload): Promise<DriveFile> {
    const r = await drive.files.create({
      requestBody: {
        name: u.name,
        parents: [u.folderId],
        ...(u.appProperties ? { appProperties: u.appProperties } : {}),
      },
      media: { mimeType: u.mime, body: Readable.from(u.bytes) },
      fields: "id,name",
    });

    if (!r.data.id) throw new Error(`Drive upload failed for "${u.name}"`);
    return { id: r.data.id, name: r.data.name ?? u.name };
  }

  // True if a file with this source hash already exists in the folder.
  async function hasSourceKey(folderId: string, key: string): Promise<boolean> {
    const r = await drive.files.list({
      q: [
        `'${escQ(folderId)}' in parents`,
        "trashed = false",
        `appProperties has { key='sourceKey' and value='${escQ(key)}' }`,
      ].join(" and "),
      fields: "files(id)",
      pageSize: 1,
    });
    return (r.data.files?.length ?? 0) > 0;
  }

  async function trash(fileId: string): Promise<void> {
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
    });
  }

  // Keeps the newest `keep` files (names start with YYYY-MM-DD) and trashes the rest.
  async function pruneDaily(folderId: string, keep = DAILY_KEEP): Promise<number> {
    const files = (await listFolderFiles(folderId)).sort((a, b) =>
      b.name.localeCompare(a.name)
    );
    const old = files.slice(keep);
    for (const f of old) await trash(f.id);
    return old.length;
  }

  return { ensureFolder, listFolderFiles, upload, hasSourceKey, trash, pruneDaily };
}

export type DriveClient = ReturnType<typeof googleDrive>;

export type BackupResult = {
  workbookName: string;
  documentsUploaded: number;
  documentsSkipped: number;
  documentsFailed: number;
  oldBackupsTrashed: number;
};

export async function runDriveBackup(
  supabase: SupabaseClient,
  drive: DriveClient
): Promise<BackupResult> {
  const today = day(new Date());

  // 1) Daily workbook
  // ASSUMPTION: fetchAllTables(supabase) returns the tables, and
  // buildBackupWorkbook(tables) returns xlsx bytes (Buffer / Uint8Array / ArrayBuffer).
  const tables = await fetchAllTables(supabase as any);
  const built: any = await buildBackupWorkbook(tables as any);
  const bytes = Buffer.isBuffer(built)
    ? built
    : Buffer.from(built instanceof ArrayBuffer ? new Uint8Array(built) : built);

  const dailyFolder = await drive.ensureFolder([ROOT, "Daily"]);
  const workbookName = `${today} dada-dosa-backup.xlsx`;

  const existing = await drive.listFolderFiles(dailyFolder);
  for (const f of existing.filter((f) => f.name === workbookName)) {
    await drive.trash(f.id); // re-run on the same day replaces the file
  }

  await drive.upload({
    folderId: dailyFolder,
    name: workbookName,
    bytes,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const oldBackupsTrashed = await drive.pruneDaily(dailyFolder, DAILY_KEEP);

  // 2) Uploaded documents (ID proofs, contracts, ...)
  // ASSUMPTION: a `documents` table with storage_path, kind, created_at
  // and a Supabase Storage bucket named "documents".
  const BUCKET = "documents";
  let documentsUploaded = 0;
  let documentsSkipped = 0;
  let documentsFailed = 0;

  const { data: docs, error } = await supabase
    .from("documents")
    .select("storage_path, kind, created_at");

  if (error) throw new Error(`Couldn't read documents: ${error.message}`);

  const folderCache = new Map<string, string>();

  for (const d of docs ?? []) {
    try {
      const path = String(d.storage_path);
      const label = KIND_LABEL[String(d.kind)] ?? KIND_LABEL.other;

      let folderId = folderCache.get(label);
      if (!folderId) {
        folderId = await drive.ensureFolder([ROOT, "Documents", label]);
        folderCache.set(label, folderId);
      }

      const key = sourceKey(`${BUCKET}/${path}`);
      if (await drive.hasSourceKey(folderId, key)) {
        documentsSkipped++;
        continue;
      }

      const { data: blob, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .download(path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "download failed");

      const base = clean(path.split("/").pop()?.replace(/\.[^.]+$/, ""));
      await drive.upload({
        folderId,
        name: `${day(d.created_at)} ${base}${extOf(path)}`,
        bytes: Buffer.from(await blob.arrayBuffer()),
        mime: blob.type || "application/octet-stream",
        appProperties: { sourceKey: key },
      });
      documentsUploaded++;
    } catch (e) {
      documentsFailed++;
      console.error(`Document backup failed (${d.storage_path}):`, e);
    }
  }

  return {
    workbookName,
    documentsUploaded,
    documentsSkipped,
    documentsFailed,
    oldBackupsTrashed,
  };
}
