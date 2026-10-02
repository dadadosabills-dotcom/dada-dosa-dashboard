import { createClient } from "@supabase/supabase-js";
import { runBackup, googleDrive } from "../lib/drive-backup";

const need = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"];
const missing = need.filter(k => !process.env[k]);
if (missing.length) { console.error("Missing settings: " + missing.join(", ")); process.exit(2); }

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function report(ok: boolean, message: string, r?: { dataRows: number; copied: number; failed: number }) {
  const { error } = await supabase.from("backup_status").upsert({
    id: 1, last_run_at: new Date().toISOString(), ok, message: message.slice(0, 500),
    data_rows: r?.dataRows ?? 0, files_copied: r?.copied ?? 0, files_failed: r?.failed ?? 0,
    ...(ok ? { last_success_at: new Date().toISOString() } : {}),
  });
  if (error) console.error("Couldn't record status (has migration 014 been run?): " + error.message);
}

(async () => {
  try {
    const drive = googleDrive(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, process.env.GOOGLE_REFRESH_TOKEN!);
    const r = await runBackup(supabase, drive);
    await report(r.ok, r.message, r);
    process.exit(r.ok ? 0 : 1);
  } catch (e: any) {
    console.error(e);
    await report(false, e?.message ?? String(e));
    process.exit(1);
  }
})();
