"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  type MissingContentFieldV1,
  siteContentConfigSchemaV1,
  validateSiteContentForSave
} from "@/lib/site-content-config-v1";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminActionState = { ok: boolean; message: string };

export type SaveSiteContentCodeV1 =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "CATEGORY_IN_USE"
  | "DATABASE_ERROR"
  | "SUCCESS";

export type SaveSiteContentStateV1 = {
  ok: boolean;
  code: SaveSiteContentCodeV1;
  message: string;
  fieldErrors: MissingContentFieldV1[];
  savedAt: string | null;
};

const saveSiteContentMessagesV1: Record<SaveSiteContentCodeV1, string> = {
  UNAUTHORIZED: "请登录后重试。",
  FORBIDDEN: "当前账号没有编辑页面内容的权限。",
  VALIDATION_ERROR: "请补全或修正页面内容后再保存。",
  CONFLICT: "内容已由其他管理员更新，请重新加载后合并修改。",
  CATEGORY_IN_USE: "该分类仍被产品引用，无法删除。",
  DATABASE_ERROR: "保存失败，请稍后重试。",
  SUCCESS: "已保存并生效。"
};

export async function saveSiteContentV1(
  _previousState: SaveSiteContentStateV1,
  formData: FormData
): Promise<SaveSiteContentStateV1> {
  const payloadJson = parseJsonFormFieldV1(formData, "payload");
  const baselineJson = parseJsonFormFieldV1(formData, "baseline");
  if (!payloadJson.ok || !baselineJson.ok || !isJsonObjectV1(baselineJson.value)) {
    return saveSiteContentFailureV1("VALIDATION_ERROR");
  }

  const payloadResult = siteContentConfigSchemaV1.safeParse(payloadJson.value);
  if (!payloadResult.success) {
    return saveSiteContentFailureV1("VALIDATION_ERROR");
  }

  const fieldErrors = validateSiteContentForSave(payloadResult.data);
  if (fieldErrors.length > 0) {
    return saveSiteContentFailureV1("VALIDATION_ERROR", fieldErrors);
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    logSiteContentSaveFailureV1("client", "DATABASE_ERROR");
    return saveSiteContentFailureV1("DATABASE_ERROR");
  }
  if (!supabase) return saveSiteContentFailureV1("UNAUTHORIZED");

  let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    authResult = await supabase.auth.getUser();
  } catch {
    return saveSiteContentFailureV1("UNAUTHORIZED");
  }
  if (authResult.error || !authResult.data.user) {
    return saveSiteContentFailureV1("UNAUTHORIZED");
  }

  let saveResult;
  try {
    saveResult = await supabase.rpc("save_site_content_v1", {
      p_payload: payloadResult.data,
      p_baseline: baselineJson.value
    });
  } catch {
    logSiteContentSaveFailureV1("transaction", "DATABASE_ERROR");
    return saveSiteContentFailureV1("DATABASE_ERROR");
  }
  if (saveResult.error) {
    const code = mapSiteContentDatabaseErrorV1(saveResult.error);
    logSiteContentSaveFailureV1("transaction", code);
    return saveSiteContentFailureV1(code);
  }
  if (!isValidTimestampV1(saveResult.data)) {
    logSiteContentSaveFailureV1("timestamp", "DATABASE_ERROR");
    return saveSiteContentFailureV1("DATABASE_ERROR");
  }

  ["/zh", "/en", "/ar", "/api/products"].forEach((path) => {
    revalidatePath(path);
  });
  return {
    ok: true,
    code: "SUCCESS",
    message: saveSiteContentMessagesV1.SUCCESS,
    fieldErrors: [],
    savedAt: saveResult.data
  };
}

function parseJsonFormFieldV1(
  formData: FormData,
  field: "payload" | "baseline"
): { ok: true; value: unknown } | { ok: false } {
  const raw = formData.get(field);
  if (typeof raw !== "string") return { ok: false };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

function isJsonObjectV1(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function saveSiteContentFailureV1(
  code: Exclude<SaveSiteContentCodeV1, "SUCCESS">,
  fieldErrors: MissingContentFieldV1[] = []
): SaveSiteContentStateV1 {
  return {
    ok: false,
    code,
    message: saveSiteContentMessagesV1[code],
    fieldErrors,
    savedAt: null
  };
}

function mapSiteContentDatabaseErrorV1(
  error: unknown
): "FORBIDDEN" | "CONFLICT" | "CATEGORY_IN_USE" | "DATABASE_ERROR" {
  if (!isJsonObjectV1(error)) return "DATABASE_ERROR";
  const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const signature = `${code} ${message}`;
  if (signature.includes("site_content_conflict")) return "CONFLICT";
  if (signature.includes("category_in_use")) return "CATEGORY_IN_USE";
  if (code === "42501" || signature.includes("forbidden")) return "FORBIDDEN";
  return "DATABASE_ERROR";
}

function isValidTimestampV1(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && Number.isFinite(Date.parse(value));
}

function logSiteContentSaveFailureV1(
  stage: "client" | "transaction" | "timestamp",
  code: "FORBIDDEN" | "CONFLICT" | "CATEGORY_IN_USE" | "DATABASE_ERROR"
) {
  console.error("site_content_save_failed", { stage, code });
}

export async function login(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "尚未配置 Supabase，当前只能查看后台预览。" };
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: "登录失败，请检查账号或密码。" };
  redirect("/admin/pages");
}

export async function logout() { const supabase = await createSupabaseServerClient(); await supabase?.auth.signOut(); redirect("/admin/login"); }

async function authorized(resource: string, action: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("has_permission", { p_resource: resource, p_action: action });
  return data ? { supabase, user } : null;
}

export async function updatePageConfiguration(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const auth = await authorized("pages", "edit");
  if (!auth) return { ok: false, message: "未登录、权限不足或 Supabase 尚未配置。" };
  const slug = String(formData.get("slug") ?? "");
  const expectedVersion = Number(formData.get("expectedVersion"));
  const patch = { layout_key: String(formData.get("layoutKey") ?? "default"), sort_order: Number(formData.get("sortOrder")), is_enabled: formData.get("isEnabled") === "on", version: expectedVersion + 1, updated_at: new Date().toISOString() };
  const { data, error } = await auth.supabase.from("pages").update(patch).eq("slug", slug).eq("version", expectedVersion).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "保存失败：内容可能已被其他管理员更新，请刷新后重试。" };
  await auth.supabase.from("audit_logs").insert({ actor_id: auth.user.id, action: "edit", resource_type: "page", resource_id: data.id, after_data: patch });
  revalidatePath("/admin/pages"); return { ok: true, message: "草稿配置已保存。" };
}

export async function updateInquiry(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const auth = await authorized("inquiries", "edit");
  if (!auth) return { ok: false, message: "未登录、权限不足或 Supabase 尚未配置。" };
  const id = String(formData.get("id") ?? ""); const status = String(formData.get("status") ?? "new"); const note = String(formData.get("note") ?? "");
  const { data: previous } = await auth.supabase.from("inquiries").select("status").eq("id", id).single();
  const { error } = await auth.supabase.from("inquiries").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, message: "更新失败。" };
  if (note) await auth.supabase.from("inquiry_followups").insert({ inquiry_id: id, author_id: auth.user.id, note, previous_status: previous?.status, next_status: status });
  await auth.supabase.from("audit_logs").insert({ actor_id: auth.user.id, action: "follow_up", resource_type: "inquiry", resource_id: id, before_data: previous, after_data: { status, note } });
  revalidatePath("/admin/inquiries"); return { ok: true, message: "线索状态与跟进记录已更新。" };
}

export async function publishPage(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const auth=await authorized("pages","publish"); if(!auth)return {ok:false,message:"未登录、权限不足或 Supabase 尚未配置。"};
  const {data,error}=await auth.supabase.rpc("publish_page_version",{p_page_id:String(formData.get("pageId")),p_expected_version:Number(formData.get("expectedVersion")),p_actor:auth.user.id});
  if(error||!data)return {ok:false,message:"发布失败：请确认中文、英文、阿文标题、SEO 和正文均已填写，且版本未冲突。"};
  revalidatePath("/admin/pages"); revalidatePath("/zh"); revalidatePath("/en"); revalidatePath("/ar"); return {ok:true,message:`已发布 V${data}。`};
}

export async function rollbackPage(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const auth=await authorized("pages","publish"); if(!auth)return {ok:false,message:"未登录、权限不足或 Supabase 尚未配置。"};
  const {data,error}=await auth.supabase.rpc("rollback_page_version",{p_page_id:String(formData.get("pageId")),p_target_version:Number(formData.get("targetVersion")),p_expected_version:Number(formData.get("expectedVersion")),p_actor:auth.user.id});
  if(error||!data)return {ok:false,message:"回滚失败：目标版本不存在或当前版本已变化。"};
  revalidatePath("/admin/pages"); return {ok:true,message:`已基于历史版本创建并发布新版本 V${data}，历史记录未覆盖。`};
}
