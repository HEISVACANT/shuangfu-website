import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, from, rpc } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient
}));

import {
  getAdminProductV2,
  listAdminCategoriesV2,
  listAdminMediaV2,
  listAdminProductsV2
} from "@/lib/products-admin-repository-v2";

const categoryId = "00000000-0000-4000-8000-000000000001";
const productId = "10000000-0000-4000-8000-000000000001";

const categoryPayload = {
  id: categoryId,
  slug: "bra-pads",
  sort_order: 10,
  is_enabled: true,
  translations: {
    zh: { name: "胸垫", description: "胸垫产品" },
    en: { name: "Bra Pads", description: "Bra pad products" },
    ar: { name: "وسادات", description: "منتجات" }
  }
};

const productPayload = {
  id: productId,
  slug: "bp-001",
  code: "BP-001",
  category_id: categoryId,
  status: "archived",
  deleted_at: null,
  updated_at: "2026-07-29T04:00:00.000Z",
  category: categoryPayload,
  translations: {
    zh: {
      name: "轻盈胸垫",
      description: "产品介绍",
      colors: "白色",
      material: "海绵",
      customization_scope: "尺寸与颜色"
    },
    en: {
      name: "Lightweight pad",
      description: "Product description",
      colors: "White",
      material: "Foam",
      customization_scope: "Size and color"
    },
    ar: {
      name: "وسادة خفيفة",
      description: "وصف",
      colors: "أبيض",
      material: "رغوة",
      customization_scope: "المقاس"
    }
  },
  images: [],
  specifications: []
};

describe("product admin repository v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseAdminClient.mockReturnValue({ from, rpc });
  });

  it("passes submitted search, category and status filters to the admin RPC", async () => {
    rpc.mockResolvedValue({ data: [{ payload: productPayload }], error: null });

    const result = await listAdminProductsV2({
      query: "bp-01",
      categoryId,
      status: "archived"
    });

    expect(rpc).toHaveBeenCalledWith("list_admin_products_v2", {
      p_query: "bp-01",
      p_category_id: categoryId,
      p_status: "archived"
    });
    expect(result).toMatchObject([
      {
        id: productId,
        categoryId,
        status: "archived",
        translations: { zh: { customizationScope: "尺寸与颜色" } }
      }
    ]);
  });

  it("passes null filters without inventing admin fallback data", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(
      listAdminProductsV2({ query: "", categoryId: null, status: null })
    ).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("list_admin_products_v2", {
      p_query: null,
      p_category_id: null,
      p_status: null
    });
  });

  it.each([null, undefined])(
    "rejects a non-array admin RPC result (%s) instead of treating it as empty",
    async (data) => {
      rpc.mockResolvedValue({ data, error: null });

      await expect(
        listAdminProductsV2({ query: "", categoryId: null, status: null })
      ).rejects.toMatchObject({ code: "INVALID_RPC_PAYLOAD" });
    }
  );

  it("rejects a malformed admin RPC payload", async () => {
    rpc.mockResolvedValue({ data: [{ payload: { id: productId } }], error: null });

    await expect(
      listAdminProductsV2({ query: "", categoryId: null, status: null })
    ).rejects.toMatchObject({ code: "INVALID_RPC_PAYLOAD" });
  });

  it("returns one admin product or null from the detail RPC", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ payload: productPayload }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(getAdminProductV2(productId)).resolves.toMatchObject({ id: productId });
    await expect(getAdminProductV2(productId)).resolves.toBeNull();
    expect(rpc).toHaveBeenNthCalledWith(1, "get_admin_product_v2", {
      p_product_id: productId
    });
  });

  it("requests disabled categories and maps them in stable order", async () => {
    rpc.mockResolvedValue({
      data: [
        { payload: { ...categoryPayload, id: "00000000-0000-4000-8000-000000000002", sort_order: 20 } },
        { payload: categoryPayload }
      ],
      error: null
    });

    const categories = await listAdminCategoriesV2();

    expect(rpc).toHaveBeenCalledWith("list_product_categories_v2", {
      p_include_disabled: true
    });
    expect(categories.map((category) => category.sortOrder)).toEqual([10, 20]);
  });

  it("maps non-deleted media rows and preserves stable newest-first ordering", async () => {
    const secondOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "50000000-0000-4000-8000-000000000002",
          storage_path: "https://example.com/new.webp",
          mime_type: "image/webp",
          byte_size: 2048,
          width: 960,
          height: 640,
          variants: { thumbnail: "https://example.com/new-thumb.webp" },
          created_at: "2026-07-29T05:00:00.000Z"
        }
      ],
      error: null
    });
    const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
    const is = vi.fn().mockReturnValue({ order: firstOrder });
    const select = vi.fn().mockReturnValue({ is });
    from.mockReturnValue({ select });

    await expect(listAdminMediaV2()).resolves.toEqual([
      {
        id: "50000000-0000-4000-8000-000000000002",
        url: "https://example.com/new.webp",
        mimeType: "image/webp",
        byteSize: 2048,
        width: 960,
        height: 640,
        variants: { thumbnail: "https://example.com/new-thumb.webp" },
        createdAt: "2026-07-29T05:00:00.000Z"
      }
    ]);
    expect(from).toHaveBeenCalledWith("media");
    expect(select).toHaveBeenCalledWith(
      "id,storage_path,mime_type,byte_size,width,height,variants,created_at"
    );
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(firstOrder).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(secondOrder).toHaveBeenCalledWith("id", { ascending: true });
  });

  it.each([null, undefined])(
    "rejects a non-array media result (%s) instead of treating it as empty",
    async (data) => {
      const secondOrder = vi.fn().mockResolvedValue({ data, error: null });
      const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
      const is = vi.fn().mockReturnValue({ order: firstOrder });
      const select = vi.fn().mockReturnValue({ is });
      from.mockReturnValue({ select });

      await expect(listAdminMediaV2()).rejects.toMatchObject({
        code: "INVALID_RPC_PAYLOAD"
      });
    }
  );

  it("rejects a malformed media row", async () => {
    const secondOrder = vi.fn().mockResolvedValue({
      data: [{ id: "not-a-uuid" }],
      error: null
    });
    const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
    const is = vi.fn().mockReturnValue({ order: firstOrder });
    const select = vi.fn().mockReturnValue({ is });
    from.mockReturnValue({ select });

    await expect(listAdminMediaV2()).rejects.toMatchObject({
      code: "INVALID_RPC_PAYLOAD"
    });
  });

  it("preserves the Supabase error code on admin RPC failures", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied", details: null, hint: null }
    });

    await expect(
      listAdminProductsV2({ query: "", categoryId: null, status: null })
    ).rejects.toMatchObject({ code: "42501", message: "permission denied" });
  });

  it("never falls back to samples when Supabase server configuration is missing", async () => {
    createSupabaseAdminClient.mockImplementation(() => {
      throw new Error("Supabase server configuration is missing");
    });

    await expect(
      listAdminProductsV2({ query: "", categoryId: null, status: null })
    ).rejects.toThrow("Supabase server configuration is missing");
  });
});
