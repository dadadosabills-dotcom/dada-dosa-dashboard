import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import { DocumentsClient, type Folder, type DocFile } from "./documents-client";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = createClient();
  const profile = await getProfile();
  if (!profile || !["admin", "superadmin"].includes(profile.role)) redirect("/dashboard");

  const [fRes, dRes] = await Promise.all([
    supabase.from("document_folders").select("id, parent_id, name, created_at").order("name"),
    supabase
      .from("documents")
      .select("id, folder_id, name, storage_path, size, mime_type, created_at, uploader:profiles!documents_uploaded_by_fkey(full_name)")
      .order("created_at", { ascending: false }),
  ]);

  const missingSetup = !!(fRes.error || dRes.error);
  const files: DocFile[] = (dRes.data ?? []).map((d: any) => ({ ...d, uploader: Array.isArray(d.uploader) ? (d.uploader[0] ?? null) : d.uploader }));

  return (
    <DocumentsClient
      folders={(fRes.data ?? []) as Folder[]}
      files={files}
      canManage={profile.role === "superadmin"}
      userId={profile.id}
      missingSetup={missingSetup}
    />
  );
}
