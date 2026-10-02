```ts
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

const day = (v: unknown) =>
  new Date(String(v)).toISOString().slice(0, 10);

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

  const drive = google.drive({
    version: "v3",
    auth,
  });

  async function listFolderFiles(folderId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const r = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
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
        `name = '${part.replace(/'/g, "\\'")}'`,
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

      if (!created.data.id) throw new Error(`Couldn't create Drive folder "${part}"`);
      parent = created.data.id;
    }

    if (!parent) throw new Error("Couldn't determine Drive folder");
    return parent;
  }

  async funct
```
