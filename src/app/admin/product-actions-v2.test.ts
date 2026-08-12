import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductInputV2 } from "@/lib/product-admin-v2";

const { createSupabaseServerClient, getUser, revalidatePath, rpc } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

import * as productActions from "@/app/admin/product-actions-v2";

const { changeProductStatusV2, deleteProductV2, saveProductV2 } = productActions;

const actorId = "10000000-0000-4000-8000-000000000001";
const productId = "20000000-0000-4000-8000-000000000001";
const categoryId = "30000000-0000-4000-8000-000000000001";
const imageId = "40000000-0000-4000-8000-000000000001";
const mediaId = "50000000-0000-4000-8000-000000000001";
const specificationId = "60000000-0000-4000-8000-000000000001";
const expectedUpdatedAt = "2026-07-29T06:00:00.000Z";

function validProduct(): ProductInputV2 {
  return {
    code: "BP-001",
    categoryId,
    status: "unpublished",
    translations: {
      zh: { name: "轻盈胸垫", description: "产品介绍", colors: "白色", material: "海绵", customizationScope: "尺寸" },
      en: { name: "Lightweight pad", description: "Description", colors: "White", material: "Foam", customizationScope: "Size" },
      ar: { name: "وسادة", description: "وصف", colors: "أبيض", material: "رغوة", customizationScope: "المقاس" }
    },
    images: [{
      id: imageId,
      mediaId,
      url: "https://example.com/product.webp",
      variants: { "480": "https://example.com/product-480.webp" },
      isPrimary: true,
      sortOrder: 0,
      alt: { zh: "主图", en: "Primary", ar: "الصورة" }
    }],
    specifications: [{
      id: specificationId,
      sortOrder: 0,
      label: { zh: "尺寸", en: "Size", ar: "المقاس" },
      value: { zh: "S", en: "S", ar: "S" }
    }]
  };
}

function signedInClient() {
  return { auth: { getUser }, rpc };
}

async function withWriteError(
  action: () => Promise<unknown>,
  error: { code: string; message?: string; details?: unknown }
) {
  rpc.mockReset();
  rpc
    .mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: null, error });
  return action();
}

describe("product actions v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
    createSupabaseServerClient.mockResolvedValue(signedInClient());
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it("exports only async server actions at runtime", () => {
    expect(Object.keys(productActions).sort()).toEqual([
      "changeProductStatusV2",
      "deleteProductV2",
      "saveProductV2"
    ]);
    expect(Object.values(productActions).every((value) => value.constructor.name === "AsyncFunction"))
      .toBe(true);
  });

  it("requires a verified user before checking permissions or writing", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(saveProductV2({ productId: null, expectedUpdatedAt: null, product: validProduct() }))
      .resolves.toEqual({ ok: false, code: "UNAUTHORIZED", message: "请重新登录。" });
    expect(getUser).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("checks products:create then calls save_product_v2 exactly once for a new product", async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });

    await expect(saveProductV2({ productId: null, expectedUpdatedAt: null, product: validProduct() }))
      .resolves.toEqual({ ok: true, code: "OK", message: "产品已保存。", productId });

    expect(rpc).toHaveBeenNthCalledWith(1, "has_permission", {
      p_resource: "products",
      p_action: "create"
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "save_product_v2", {
      p_product_id: null,
      p_payload: validProduct(),
      p_expected_updated_at: null,
      p_actor: actorId
    });
    expect(rpc.mock.calls.filter(([name]) => name === "save_product_v2")).toHaveLength(1);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/products");
    expect(revalidatePath).not.toHaveBeenCalledWith("/zh");
  });

  it("checks products:edit for an existing product and rejects invalid input before writing", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });

    const result = await saveProductV2({
      productId,
      expectedUpdatedAt,
      product: { ...validProduct(), code: " " }
    });

    expect(rpc).toHaveBeenCalledWith("has_permission", {
      p_resource: "products",
      p_action: "edit"
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(rpc.mock.calls.filter(([name]) => name === "save_product_v2")).toHaveLength(0);
  });

  it("checks products:publish and publishes with one write RPC", async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });

    await expect(changeProductStatusV2({
      productId,
      expectedUpdatedAt,
      status: "published"
    })).resolves.toEqual({ ok: true, code: "OK", message: "产品已发布。", productId });

    expect(rpc).toHaveBeenNthCalledWith(1, "has_permission", {
      p_resource: "products",
      p_action: "publish"
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "publish_product_v2", {
      p_product_id: productId,
      p_expected_updated_at: expectedUpdatedAt,
      p_actor: actorId
    });
    expect(rpc.mock.calls.filter(([name]) => name === "publish_product_v2")).toHaveLength(1);
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin/products", "/zh", "/en", "/ar"
    ]);
  });

  it("archives published products and invalidates every public locale", async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });

    await expect(changeProductStatusV2({
      productId,
      expectedUpdatedAt,
      status: "archived"
    })).resolves.toMatchObject({ ok: true, message: "产品已下架。" });
    expect(rpc).toHaveBeenNthCalledWith(2, "archive_product_v2", {
      p_product_id: productId,
      p_expected_updated_at: expectedUpdatedAt,
      p_actor: actorId
    });
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin/products", "/zh", "/en", "/ar"
    ]);
  });

  it("checks products:delete, soft deletes once, and invalidates catalog paths", async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });

    await expect(deleteProductV2({ productId, expectedUpdatedAt }))
      .resolves.toEqual({ ok: true, code: "OK", message: "产品已删除。", productId });
    expect(rpc).toHaveBeenNthCalledWith(1, "has_permission", {
      p_resource: "products",
      p_action: "delete"
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "soft_delete_product_v2", {
      p_product_id: productId,
      p_expected_updated_at: expectedUpdatedAt,
      p_actor: actorId
    });
    expect(rpc.mock.calls.filter(([name]) => name === "soft_delete_product_v2")).toHaveLength(1);
    expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
      "/admin/products", "/zh", "/en", "/ar"
    ]);
  });

  it("does not call a write RPC when the products permission is denied", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });

    await expect(deleteProductV2({ productId, expectedUpdatedAt }))
      .resolves.toEqual({ ok: false, code: "FORBIDDEN", message: "无权执行该操作。" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("maps published, conflict, forbidden and duplicate-code database errors through actions", async () => {
    await expect(withWriteError(
      () => saveProductV2({ productId, expectedUpdatedAt, product: validProduct() }),
      { code: "PRODUCT_PUBLISHED" }
    )).resolves.toEqual({
      ok: false,
      code: "PRODUCT_PUBLISHED",
      message: "已发布产品不可编辑，请先下架。"
    });
    await expect(withWriteError(
      () => deleteProductV2({ productId, expectedUpdatedAt }),
      { code: "P0001", message: "version conflict" }
    )).resolves.toMatchObject({
      ok: false, code: "CONFLICT"
    });
    await expect(withWriteError(
      () => deleteProductV2({ productId, expectedUpdatedAt }),
      { code: "42501", message: "permission denied" }
    )).resolves.toMatchObject({
      ok: false, code: "FORBIDDEN"
    });
    await expect(withWriteError(
      () => saveProductV2({ productId: null, expectedUpdatedAt: null, product: validProduct() }),
      { code: "23505", message: "duplicate key" }
    )).resolves.toMatchObject({
      ok: false, code: "CONFLICT"
    });
    await expect(withWriteError(
      () => saveProductV2({ productId, expectedUpdatedAt, product: validProduct() }),
      { code: "P0001", message: "category is disabled" }
    )).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "请选择已启用的产品分类。",
      fieldErrors: [{ field: "category" }]
    });
    await expect(withWriteError(
      () => changeProductStatusV2({ productId, expectedUpdatedAt, status: "archived" }),
      { code: "P0001", message: "invalid product state for archive" }
    )).resolves.toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("maps JSON validation details to locale-aware field errors through publish", async () => {
    const missing = [
      { locale: "en", field: "translations.name" },
      { field: "primaryImage" }
    ];
    await expect(withWriteError(
      () => changeProductStatusV2({ productId, expectedUpdatedAt, status: "published" }),
      { code: "INCOMPLETE_TRANSLATIONS", details: missing }
    )).resolves.toMatchObject({ code: "INCOMPLETE_TRANSLATIONS", fieldErrors: missing });

    await expect(withWriteError(
      () => changeProductStatusV2({ productId, expectedUpdatedAt, status: "published" }),
      {
        code: "22023",
        message: "product validation failed",
        details: JSON.stringify({
          zh: [],
          en: ["translations.name", "images.alt"],
          ar: [],
          _global: ["exactly one primary image is required"]
        })
      }
    )).resolves.toMatchObject({
      code: "INCOMPLETE_TRANSLATIONS",
      fieldErrors: [
        { locale: "en", field: "translations.name" },
        { locale: "en", field: "images.alt" },
        { field: "primaryImage" }
      ]
    });
  });

  it("falls back to a safe database error without leaking server details", async () => {
    await expect(withWriteError(
      () => deleteProductV2({ productId, expectedUpdatedAt }),
      { code: "XX000", message: "secret internal failure" }
    )).resolves.toEqual({
      ok: false,
      code: "DATABASE_ERROR",
      message: "操作失败，请稍后重试。"
    });
  });
});
