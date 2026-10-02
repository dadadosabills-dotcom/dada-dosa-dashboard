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
