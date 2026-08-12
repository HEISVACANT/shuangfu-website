import { PageContentEditorV1 } from "@/components/admin/page-content-editor-v1";
import type { MediaRecord } from "@/components/admin/media-upload";
import { getSiteContentConfigV1 } from "@/lib/site-content-repository-v1";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PagesAdmin() {
  if (hasSupabaseAdminConfig() && !await canViewPagesV1()) {
    return (
      <section className="admin-auth-required" role="alert">
        <h1>无法访问页面内容</h1>
        <p>当前账号未登录或没有页面查看权限。</p>
      </section>
    );
  }
  const [{ config, baseline }, media] = await Promise.all([
    getSiteContentConfigV1(),
    listMediaSafelyV1()
  ]);
  return <PageContentEditorV1 initialConfig={config} baseline={baseline} media={media} />;
}

async function canViewPagesV1() {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return false;
    const authResult = await supabase.auth.getUser();
    if (authResult.error || !authResult.data.user) return false;
    const permission = await supabase.rpc("has_permission", {
      p_resource: "pages",
      p_action: "view"
    });
    return !permission.error && permission.data === true;
  } catch {
    return false;
  }
}

async function listMediaSafelyV1(): Promise<MediaRecord[]> {
  if (!hasSupabaseAdminConfig()) return [];
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("media")
      .select("id,storage_path,variants")
      .order("created_at", { ascending: false });
    if (error || !Array.isArray(data)) throw new Error("media_read_failed");
    return data.flatMap((value): MediaRecord[] => {
      if (!value || typeof value !== "object") return [];
      const record = value as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.storage_path !== "string") return [];
      if (!record.variants || typeof record.variants !== "object" || Array.isArray(record.variants)) return [];
      const variants = Object.fromEntries(
        Object.entries(record.variants).filter((entry): entry is [string, string] => typeof entry[1] === "string")
      );
      return [{ id: record.id, storage_path: record.storage_path, variants }];
    });
  } catch {
    console.error("page_content_media_read_failed");
    return [];
  }
}
