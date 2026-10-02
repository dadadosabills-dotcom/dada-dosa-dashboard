import { fetchAllTables } from "./backup";
import { buildBackupWorkbook } from "./backup-core";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { SupabaseClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const ROOT = "Dada Dosa Backups";

const clean = (s: unknown, max = 100) =>
  String(s ?? "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "unnamed";

const sourceKey = (src: string) =>
  createHash("sha256").update(src, "utf8").digest("hex");

const day = (v: unknown) => {
  const d = new Date(String(v));
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 10);
};

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

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
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

  async function trash(fileId: string): Promise<void> {
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
    });
  }

  // Overwrites the file with this name in the folder (same Drive file ID),
  // or creates it if it doesn't exist yet. Extra duplicates are trashed.
  async function replaceFile(u: Upload): Promise<DriveFile> {
    const matches = (await listFolderFiles(u.folderId)).filter(
      (f) => f.name === u.name
    );

    if (matches.length === 0) return upload(u);

    const [keep, ...dupes] = matches;
    await drive.files.update({
      fileId: keep.id,
      media: { mimeType: u.mime, body: Readable.from(u.bytes) },
      fields: "id,name",
    });

    for (const d of dupes) await trash(d.id);
    return keep;
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

  return {
    ensureFolder,
    listFolderFiles,
    upload,
    replaceFile,
    hasSourceKey,
    trash,
  };
}

export type DriveClient = ReturnType<typeof googleDrive>;

export type BackupResult = {
  ok: boolean;
  message: string;
  workbookName: string;
  dataRows: number;
  documentsUploaded: number;
  documentsSkipped: number;
  documentsFailed: number;
};

// Column names are auto-detected from the first match in these lists.
const PATH_COLS = ["storage_path", "file_path", "path", "file_url", "url", "file_name", "name"];
const KIND_COLS = ["kind", "type", "doc_type", "document_type", "category", "file_type", "document_kind"];
const DATE_COLS = ["created_at", "uploaded_at", "inserted_at"];

const firstCol = (row: Record<string, any>, cols: string[]) =>
  cols.find((c) => row[c] !== undefined && row[c] !== null && row[c] !== "");

const prettify = (v: string) => {
  const s = v.replace(/[_-]+/g, " ").trim();
  return clean(s.charAt(0).toUpperCase() + s.slice(1), 60);
};

// Accepts "folder/file.pdf" or a full Supabase storage URL.
const parseRef = (v: string, fallbackBucket: string) => {
  const m = v.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/
  );
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  return { bucket: fallbackBucket, path: v.replace(/^\/+/, "") };
};

export async function runBackup(
  supabase: SupabaseClient,
  drive: DriveClient
): Promise<BackupResult> {
  // 1) Dashboard data: ONE file, overwritten every run (latest data only)
  const tables: any = await fetchAllTables(supabase as any);

  const dataRows = (
    Array.isArray(tables) ? tables : Object.values(tables ?? {})
  ).reduce(
    (n: number, t: any) =>
      n +
      (Array.isArray(t) ? t.length : Array.isArray(t?.rows) ? t.rows.length : 0),
    0
  );

  const built: any = await buildBackupWorkbook(tables);
  const bytes = Buffer.isBuffer(built)
    ? built
    : Buffer.from(built instanceof ArrayBuffer ? new Uint8Array(built) : built);

  const dataFolder = await drive.ensureFolder([ROOT, "Dashboard Data"]);
  const workbookName = "dada-dosa-dashboard-backup.xlsx";

  await drive.replaceFile({
    folderId: dataFolder,
    name: workbookName,
    bytes,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // 2) Uploaded files (images, PDFs, ...): copied once, sorted by category,
  //    never replaced or deleted. Columns are auto-detected.
  const DEFAULT_BUCKET = process.env.BACKUP_BUCKET || "documents";
  let documentsUploaded = 0;
  let documentsSkipped = 0;
  let documentsFailed = 0;

  const { data: docs, error } = await supabase.from("documents").select("*");
  if (error) throw new Error(`Couldn't read documents: ${error.message}`);

  if (docs && docs.length) {
    const sample = docs[0] as Record<string, any>;
    console.log("documents columns:", Object.keys(sample).join(", "));
  }

  const folderCache = new Map<string, string>();

  for (const d of (docs ?? []) as Record<string, any>[]) {
    try {
      const pathCol = firstCol(d, PATH_COLS);
      if (!pathCol) throw new Error("no file path column found in row");

      const { bucket, path } = parseRef(
        String(d[pathCol]),
        d.bucket ? String(d.bucket) : DEFAULT_BUCKET
      );

      const kindCol = firstCol(d, KIND_COLS);
      const rawKind = kindCol ? String(d[kindCol]) : "";
      const label =
        KIND_LABEL[rawKind] ??
        (rawKind ? prettify(rawKind) : prettify(path.split("/")[0] || "Other"));

      let folderId = folderCache.get(label);
      if (!folderId) {
        folderId = await drive.ensureFolder([ROOT, "Documents", label]);
        folderCache.set(label, folderId);
      }

      const key = sourceKey(`${bucket}/${path}`);
      if (await drive.hasSourceKey(folderId, key)) {
        documentsSkipped++;
        continue;
      }

      const { data: blob, error: dlErr } = await supabase.storage
        .from(bucket)
        .download(path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "download failed");

      const dateCol = firstCol(d, DATE_COLS);
      const when = dateCol ? day(d[dateCol]) : day(new Date());
      const ext = extOf(path);
      const base = clean(path.split("/").pop()?.replace(/\.[^.]+$/, ""));

      await drive.upload({
        folderId,
        name: `${when} ${base}${ext}`,
        bytes: Buffer.from(await blob.arrayBuffer()),
        mime: blob.type || MIME_BY_EXT[ext] || "application/octet-stream",
        appProperties: { sourceKey: key },
      });
      documentsUploaded++;
    } catch (e) {
      documentsFailed++;
      console.error(
        `Document backup failed (${JSON.stringify(d).slice(0, 200)}):`,
        e
      );
    }
  }

  const ok = documentsFailed === 0;
  const message =
    `Dashboard backup updated (${workbookName}). ` +
    `Files: ${documentsUploaded} uploaded, ${documentsSkipped} already backed up, ${documentsFailed} failed.`;

  return {
    ok,
    message,
    workbookName,
    dataRows,
    documentsUploaded,
    documentsSkipped,
    documentsFailed,
  };
}
