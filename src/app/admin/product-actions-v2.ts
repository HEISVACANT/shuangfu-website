"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Locale } from "@/lib/i18n";
import { productInputV2Schema } from "@/lib/product-admin-v2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProductActionResult = {
  ok: boolean;
  code:
    | "OK"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "VALIDATION_ERROR"
    | "CONFLICT"
    | "PRODUCT_PUBLISHED"
    | "INCOMPLETE_TRANSLATIONS"
    | "DATABASE_ERROR";
  message: string;
  productId?: string;
  fieldErrors?: Array<{ locale?: Locale; field: string; index?: number }>;
};

const uuidSchema = z.string().uuid();
const updatedAtSchema = z.string().datetime({ offset: true });
const saveInputSchema = z.object({
  productId: uuidSchema.nullable(),
  expectedUpdatedAt: updatedAtSchema.nullable(),
  product: productInputV2Schema
}).superRefine((value, context) => {
  if (value.productId && !value.expectedUpdatedAt) {
    context.addIssue({
      code: "custom",
      message: "Existing products require expectedUpdatedAt",
      path: ["expectedUpdatedAt"]
    });
  }
  if (!value.productId && value.expectedUpdatedAt) {
    context.addIssue({
      code: "custom",
      message: "New products cannot include expectedUpdatedAt",
      path: ["expectedUpdatedAt"]
    });
  }
});
const statusInputSchema = z.object({
  productId: uuidSchema,
  expectedUpdatedAt: updatedAtSchema,
  status: z.enum(["published", "archived"])
});
const deleteInputSchema = z.object({
  productId: uuidSchema,
  expectedUpdatedAt: updatedAtSchema
});

type RpcError = { code?: unknown; message?: unknown; details?: unknown };
type FieldError = NonNullable<ProductActionResult["fieldErrors"]>[number];

const publicPaths = ["/zh", "/en", "/ar"] as const;
const locales = ["zh", "en", "ar"] as const satisfies readonly Locale[];

function validationResult(error: z.ZodError): ProductActionResult {
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    message: "请检查输入内容。",
    fieldErrors: error.issues.map((issue) => {
      const locale = issue.path.find(
        (part): part is Locale => typeof part === "string" && locales.includes(part as Locale)
      );
      const index = issue.path.find((part): part is number => typeof part === "number");
      return {
        ...(locale ? { locale } : {}),
        field: issue.path.filter((part) => part !== locale && typeof part !== "number").join("."),
        ...(index === undefined ? {} : { index })
      };
    })
  };
}

function isFieldError(value: unknown): value is FieldError {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.field === "string" &&
    (record.locale === undefined || locales.includes(record.locale as Locale)) &&
    (record.index === undefined || typeof record.index === "number")
  );
}

function globalValidationField(value: string): string {
  if (value.includes("category")) return "category";
  if (value.includes("image count")) return "imageLimit";
  if (value.includes("primary image")) return "primaryImage";
  if (value.includes("image alt")) return "imageAlt";
  if (value.includes("specification")) return "specifications";
  return value;
}

function fieldErrorsFromDetails(details: unknown): FieldError[] | undefined {
  let parsed = details;
  if (typeof details === "string") {
    try {
      parsed = JSON.parse(details);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(parsed)) {
    const result = parsed.filter(isFieldError);
    return result.length > 0 ? result : undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;

  const record = parsed as Record<string, unknown>;
  const result: FieldError[] = [];
  for (const locale of locales) {
    const fields = record[locale];
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      if (typeof field === "string") result.push({ locale, field });
    }
  }
  const globalFields = record._global;
  if (Array.isArray(globalFields)) {
    for (const field of globalFields) {
      if (typeof field === "string") result.push({ field: globalValidationField(field) });
    }
  }
  return result.length > 0 ? result : undefined;
}

function mapProductRpcError(error: RpcError | null | undefined): ProductActionResult {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (
    code === "PRODUCT_PUBLISHED" ||
    message.includes("published product")
  ) {
    return {
      ok: false,
      code: "PRODUCT_PUBLISHED",
      message: "已发布产品不可编辑，请先下架。"
    };
  }
  if (code === "FORBIDDEN" || code === "42501" || message.includes("forbidden") || message.includes("permission denied")) {
    return { ok: false, code: "FORBIDDEN", message: "无权执行该操作。" };
  }
  if (message.includes("category is disabled")) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "请选择已启用的产品分类。",
      fieldErrors: [{ field: "category" }]
    };
  }
  if (
    code === "CONFLICT" ||
    code === "23505" ||
    message.includes("version conflict") ||
    message.includes("duplicate key") ||
    message.includes("invalid product state")
  ) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "数据已发生变化或产品编号重复，请刷新后重试。"
    };
  }
  if (
    code === "INCOMPLETE_TRANSLATIONS" ||
    code === "22023" ||
    message.includes("product validation failed")
  ) {
    const fieldErrors = fieldErrorsFromDetails(error?.details);
    return {
      ok: false,
      code: "INCOMPLETE_TRANSLATIONS",
      message: "发布前请补全三语内容、图片和规格。",
      ...(fieldErrors ? { fieldErrors } : {})
    };
  }
  return { ok: false, code: "DATABASE_ERROR", message: "操作失败，请稍后重试。" };
}

type Authorized = {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  actorId: string;
};

async function authorize(action: "create" | "edit" | "publish" | "delete"): Promise<
  { authorized: Authorized; error?: never } | { authorized?: never; error: ProductActionResult }
> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: { ok: false, code: "UNAUTHORIZED", message: "请重新登录。" } };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: { ok: false, code: "UNAUTHORIZED", message: "请重新登录。" } };
  }
  const permission = await supabase.rpc("has_permission", {
    p_resource: "products",
    p_action: action
  });
  if (permission.error) return { error: mapProductRpcError(permission.error) };
  if (!permission.data) {
    return { error: { ok: false, code: "FORBIDDEN", message: "无权执行该操作。" } };
  }
  return { authorized: { supabase, actorId: data.user.id } };
}

function revalidateProducts(includePublic: boolean): void {
  revalidatePath("/admin/products");
  if (includePublic) publicPaths.forEach((path) => revalidatePath(path));
}

function resultProductId(data: unknown, fallback?: string): string | undefined {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const id = (data as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return fallback;
}

export async function saveProductV2(input: unknown): Promise<ProductActionResult> {
  const rawProductId = input && typeof input === "object" && "productId" in input
    ? (input as { productId?: unknown }).productId
    : null;
  const authentication = await authorize(typeof rawProductId === "string" ? "edit" : "create");
  if (authentication.error) return authentication.error;

  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const { productId, expectedUpdatedAt, product } = parsed.data;
  const { data, error } = await authentication.authorized.supabase.rpc("save_product_v2", {
    p_product_id: productId,
    p_payload: product,
    p_expected_updated_at: expectedUpdatedAt,
    p_actor: authentication.authorized.actorId
  });
  if (error) return mapProductRpcError(error);

  revalidateProducts(false);
  return {
    ok: true,
    code: "OK",
    message: "产品已保存。",
    ...(resultProductId(data, productId ?? undefined)
      ? { productId: resultProductId(data, productId ?? undefined) }
      : {})
  };
}

export async function changeProductStatusV2(input: unknown): Promise<ProductActionResult> {
  const authentication = await authorize("publish");
  if (authentication.error) return authentication.error;

  const parsed = statusInputSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const { productId, expectedUpdatedAt, status } = parsed.data;
  const functionName = status === "published" ? "publish_product_v2" : "archive_product_v2";
  const { error } = await authentication.authorized.supabase.rpc(functionName, {
    p_product_id: productId,
    p_expected_updated_at: expectedUpdatedAt,
    p_actor: authentication.authorized.actorId
  });
  if (error) return mapProductRpcError(error);

  revalidateProducts(true);
  return {
    ok: true,
    code: "OK",
    message: status === "published" ? "产品已发布。" : "产品已下架。",
    productId
  };
}

export async function deleteProductV2(input: unknown): Promise<ProductActionResult> {
  const authentication = await authorize("delete");
  if (authentication.error) return authentication.error;

  const parsed = deleteInputSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const { productId, expectedUpdatedAt } = parsed.data;
  const { error } = await authentication.authorized.supabase.rpc("soft_delete_product_v2", {
    p_product_id: productId,
    p_expected_updated_at: expectedUpdatedAt,
    p_actor: authentication.authorized.actorId
  });
  if (error) return mapProductRpcError(error);

  revalidateProducts(true);
  return { ok: true, code: "OK", message: "产品已删除。", productId };
}
