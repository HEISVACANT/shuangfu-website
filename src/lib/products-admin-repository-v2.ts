import "server-only";
import { z } from "zod";

import type {
  AdminProductFilters,
  ProductCategoryV2,
  ProductRecordV2
} from "@/lib/product-admin-v2";
import {
  decodeCategoryV2Payload,
  decodeProductV2Payload,
  decodeRpcPayloadRows,
  productRepositoryError
} from "@/lib/products-repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminMediaItem = {
  id: string;
  url: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  width: number;
  height: number;
  variants: Record<string, string>;
  createdAt: string;
};

function normalizeMediaRow(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  return {
    ...row,
    url: row.url ?? row.storage_path,
    mimeType: row.mimeType ?? row.mime_type,
    byteSize: row.byteSize ?? row.byte_size,
    createdAt: row.createdAt ?? row.created_at
  };
}

const adminMediaItemSchema = z.preprocess(
  normalizeMediaRow,
  z.object({
    id: z.string().uuid(),
    url: z.string().min(1),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    variants: z.record(z.string(), z.string()),
    createdAt: z.string()
  })
);

function decodeAdminMediaRows(data: unknown): AdminMediaItem[] {
  const result = z.array(adminMediaItemSchema).safeParse(data);
  if (!result.success) {
    throw Object.assign(new Error("Supabase media query returned an invalid payload"), {
      name: "ProductRepositoryError",
      code: "INVALID_RPC_PAYLOAD",
      details: result.error.issues.map((issue) => issue.path.join(".")).join(", "),
      cause: result.error
    });
  }
  return result.data;
}

export async function listAdminProductsV2(
  filters: AdminProductFilters
): Promise<ProductRecordV2[]> {
  const query = filters.query.trim();
  const { data, error } = await createSupabaseAdminClient().rpc(
    "list_admin_products_v2",
    {
      p_query: query || null,
      p_category_id: filters.categoryId,
      p_status: filters.status
    }
  );
  if (error) throw productRepositoryError(error);
  return decodeRpcPayloadRows(decodeProductV2Payload, data);
}

export async function getAdminProductV2(id: string): Promise<ProductRecordV2 | null> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "get_admin_product_v2",
    { p_product_id: id }
  );
  if (error) throw productRepositoryError(error);
  return decodeRpcPayloadRows(decodeProductV2Payload, data)[0] ?? null;
}

export async function listAdminCategoriesV2(): Promise<ProductCategoryV2[]> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    "list_product_categories_v2",
    { p_include_disabled: true }
  );
  if (error) throw productRepositoryError(error);
  return decodeRpcPayloadRows(decodeCategoryV2Payload, data).toSorted(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
  );
}

export async function listAdminMediaV2(): Promise<AdminMediaItem[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from("media")
    .select("id,storage_path,mime_type,byte_size,width,height,variants,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw productRepositoryError(error);
  return decodeAdminMediaRows(data);
}
