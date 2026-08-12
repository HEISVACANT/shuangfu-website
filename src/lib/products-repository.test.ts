import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, hasSupabaseAdminConfig, rpc } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  hasSupabaseAdminConfig: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
  hasSupabaseAdminConfig
}));

import {
  getPublishedProduct,
  getPublishedProductV2,
  listPublishedCatalogForSiteV2,
  listPublishedCatalogV2,
  listPublishedProductCatalog,
  listPublishedProducts,
  mergeProductCatalogPages
} from "@/lib/products-repository";

const categoryId = "00000000-0000-4000-8000-000000000001";
const productId = "10000000-0000-4000-8000-000000000001";
const secondImageId = "20000000-0000-4000-8000-000000000002";
const primaryImageId = "20000000-0000-4000-8000-000000000001";
const mediaId = "30000000-0000-4000-8000-000000000001";
const secondMediaId = "30000000-0000-4000-8000-000000000002";
const laterSpecificationId = "40000000-0000-4000-8000-000000000002";
const firstSpecificationId = "40000000-0000-4000-8000-000000000001";

const localizedCategory = {
  zh: { name: "胸垫", description: "胸垫产品" },
  en: { name: "Bra Pads", description: "Bra pad products" },
  ar: { name: "وسادات", description: "منتجات الوسادات" }
};

const localizedProduct = {
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
    description: "وصف المنتج",
    colors: "أبيض",
    material: "رغوة",
    customization_scope: "المقاس واللون"
  }
};

const alt = {
  zh: "胸垫主图",
  en: "Bra pad primary image",
  ar: "الصورة الرئيسية"
};

const catalogPayload = {
  id: categoryId,
  slug: "bra-pads",
  sort_order: 10,
  is_enabled: true,
  translations: localizedCategory,
  products: [
    {
      id: productId,
      slug: "bp-001",
      code: "BP-001",
      category_id: categoryId,
      status: "published",
      deleted_at: null,
      updated_at: "2026-07-29T04:00:00.000Z",
      category: {
        id: categoryId,
        slug: "bra-pads",
        sort_order: 10,
        is_enabled: true,
        translations: localizedCategory
      },
      translations: localizedProduct,
      images: [
        {
          id: secondImageId,
          media_id: secondMediaId,
          url: "https://example.com/second.webp",
          variants: {},
          is_primary: false,
          sort_order: 20,
          alt
        },
        {
          id: primaryImageId,
          media_id: mediaId,
          url: "https://example.com/primary.webp",
          variants: { thumbnail: "https://example.com/primary-thumb.webp" },
          is_primary: true,
          sort_order: 10,
          alt
        }
      ],
      specifications: [
        {
          id: laterSpecificationId,
          sort_order: 20,
          label: { zh: "材质", en: "Material", ar: "المواد" },
          value: { zh: "海绵", en: "Foam", ar: "رغوة" }
        },
        {
          id: firstSpecificationId,
          sort_order: 10,
          label: { zh: "规格", en: "Size", ar: "المقاس" },
          value: { zh: "A", en: "A", ar: "A" }
        }
      ]
    }
  ]
};

const camelCatalogPayload = {
  id: categoryId,
  slug: "bra-pads",
  sortOrder: 10,
  isEnabled: true,
  translations: localizedCategory,
  products: catalogPayload.products.map((product) => ({
    id: product.id,
    slug: product.slug,
    code: product.code,
    categoryId: product.category_id,
    status: product.status,
    deletedAt: product.deleted_at,
    updatedAt: product.updated_at,
    category: {
      id: product.category.id,
      slug: product.category.slug,
      sortOrder: product.category.sort_order,
      isEnabled: product.category.is_enabled,
      translations: product.category.translations
    },
    translations: {
      zh: {
        name: product.translations.zh.name,
        description: product.translations.zh.description,
        colors: product.translations.zh.colors,
        material: product.translations.zh.material,
        customizationScope: product.translations.zh.customization_scope
      },
      en: {
        name: product.translations.en.name,
        description: product.translations.en.description,
        colors: product.translations.en.colors,
        material: product.translations.en.material,
        customizationScope: product.translations.en.customization_scope
      },
      ar: {
        name: product.translations.ar.name,
        description: product.translations.ar.description,
        colors: product.translations.ar.colors,
        material: product.translations.ar.material,
        customizationScope: product.translations.ar.customization_scope
      }
    },
    images: product.images.map((image) => ({
      id: image.id,
      mediaId: image.media_id,
      url: image.url,
      variants: image.variants,
      isPrimary: image.is_primary,
      sortOrder: image.sort_order,
      alt: image.alt
    })),
    specifications: product.specifications.map((specification) => ({
      id: specification.id,
      sortOrder: specification.sort_order,
      label: specification.label,
      value: specification.value
    }))
  }))
};

const dynamicCategoryId = "00000000-0000-4000-8000-000000000099";
const dynamicProductId = "10000000-0000-4000-8000-000000000099";
const dynamicCategoryPayload = {
  ...catalogPayload,
  id: dynamicCategoryId,
  slug: "lace-inserts",
  sort_order: 30,
  translations: {
    zh: { name: "蕾丝插片", description: "蕾丝插片产品" },
    en: { name: "Lace Inserts", description: "Lace insert products" },
    ar: { name: "إدراجات الدانتيل", description: "منتجات الدانتيل" }
  },
  products: [
    {
      ...catalogPayload.products[0],
      id: dynamicProductId,
      slug: "li-001",
      code: "LI-001",
      category_id: dynamicCategoryId,
      category: {
        ...catalogPayload.products[0].category,
        id: dynamicCategoryId,
        slug: "lace-inserts",
        sort_order: 30,
        translations: {
          zh: { name: "蕾丝插片", description: "蕾丝插片产品" },
          en: { name: "Lace Inserts", description: "Lace insert products" },
          ar: { name: "إدراجات الدانتيل", description: "منتجات الدانتيل" }
        }
      }
    }
  ]
};

describe("product public repository v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasSupabaseAdminConfig.mockReturnValue(true);
    createSupabaseAdminClient.mockReturnValue({ rpc });
  });

  it("maps enabled categories and published products in category order", async () => {
    rpc.mockResolvedValue({ data: [{ payload: catalogPayload }], error: null });

    const result = await listPublishedCatalogV2("zh");

    expect(rpc).toHaveBeenCalledWith("list_published_catalog_v2");
    expect(result).toMatchObject([
      {
        id: categoryId,
        slug: "bra-pads",
        sortOrder: 10,
        isEnabled: true,
        translations: localizedCategory,
        products: [
          {
            id: productId,
            categoryId,
            translations: {
              zh: {
                name: "轻盈胸垫",
                customizationScope: "尺寸与颜色"
              }
            }
          }
        ]
      }
    ]);
    expect(result[0].products[0].images.map((image) => image.id)).toEqual([
      primaryImageId,
      secondImageId
    ]);
    expect(result[0].products[0].specifications.map((item) => item.id)).toEqual([
      firstSpecificationId,
      laterSpecificationId
    ]);
    expect(result[0].content).toEqual(localizedCategory.zh);
    expect(result[0].products[0].content.name).toBe("轻盈胸垫");
    expect(result[0].products[0].images[0].altText).toBe("胸垫主图");
    expect(result[0].products[0].specifications[0]).toMatchObject({
      labelText: "规格",
      valueText: "A"
    });
  });

  it("decodes the actual Task 2 camelCase RPC payload", async () => {
    rpc.mockResolvedValue({ data: [{ payload: camelCatalogPayload }], error: null });

    await expect(listPublishedCatalogV2("en")).resolves.toMatchObject([
      {
        sortOrder: 10,
        isEnabled: true,
        content: { name: "Bra Pads" },
        products: [
          {
            categoryId,
            updatedAt: "2026-07-29T04:00:00.000Z",
            content: { name: "Lightweight pad", customizationScope: "Size and color" }
          }
        ]
      }
    ]);
  });

  it("uses id as the deterministic tie-breaker for equal image and specification order", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          payload: {
            ...catalogPayload,
            products: [
              {
                ...catalogPayload.products[0],
                images: catalogPayload.products[0].images.map((image) => ({
                  ...image,
                  sort_order: 10
                })),
                specifications: catalogPayload.products[0].specifications.map(
                  (specification) => ({ ...specification, sort_order: 10 })
                )
              }
            ]
          }
        }
      ],
      error: null
    });

    const [category] = await listPublishedCatalogV2("zh");

    expect(category.products[0].images.map((image) => image.id)).toEqual([
      primaryImageId,
      secondImageId
    ]);
    expect(category.products[0].specifications.map((item) => item.id)).toEqual([
      firstSpecificationId,
      laterSpecificationId
    ]);
  });

  it("localizes category, product, image and specification output for each locale", async () => {
    rpc.mockResolvedValue({ data: [{ payload: catalogPayload }], error: null });

    const zh = await listPublishedCatalogV2("zh");
    const en = await listPublishedCatalogV2("en");
    const ar = await listPublishedCatalogV2("ar");

    expect([zh[0].content.name, en[0].content.name, ar[0].content.name]).toEqual([
      "胸垫",
      "Bra Pads",
      "وسادات"
    ]);
    expect([
      zh[0].products[0].content.name,
      en[0].products[0].content.name,
      ar[0].products[0].content.name
    ]).toEqual(["轻盈胸垫", "Lightweight pad", "وسادة خفيفة"]);
    expect([
      zh[0].products[0].images[0].altText,
      en[0].products[0].images[0].altText,
      ar[0].products[0].images[0].altText
    ]).toEqual(["胸垫主图", "Bra pad primary image", "الصورة الرئيسية"]);
  });

  it("keeps a configured empty catalog empty instead of replacing it with samples", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(listPublishedCatalogV2("en")).resolves.toEqual([]);
  });

  it.each([null, undefined])(
    "rejects a non-array public RPC result (%s) instead of treating it as empty",
    async (data) => {
      rpc.mockResolvedValue({ data, error: null });

      await expect(listPublishedCatalogV2("zh")).rejects.toMatchObject({
        code: "INVALID_RPC_PAYLOAD"
      });
    }
  );

  it("rejects a malformed public RPC payload", async () => {
    rpc.mockResolvedValue({ data: [{ payload: { id: categoryId } }], error: null });

    await expect(listPublishedCatalogV2("zh")).rejects.toMatchObject({
      code: "INVALID_RPC_PAYLOAD"
    });
  });

  it("uses sample products only when Supabase server configuration is absent", async () => {
    hasSupabaseAdminConfig.mockReturnValue(false);

    const catalog = await listPublishedCatalogV2("ar");

    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.flatMap((category) => category.products).length).toBeGreaterThan(0);
  });

  it("preserves the Supabase error code on public RPC failures", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "RPC unavailable", details: null, hint: null }
    });

    await expect(listPublishedCatalogV2("zh")).rejects.toMatchObject({
      code: "PGRST202",
      message: "RPC unavailable"
    });
  });

  it("returns a redacted sample catalog when the public catalog read fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const catalog = await listPublishedCatalogForSiteV2("en", async () => {
      throw new Error("catalog unavailable secret_key=should-not-leak");
    });

    expect(catalog.flatMap((category) => category.products).length).toBeGreaterThan(0);
    expect(errorSpy).toHaveBeenCalledWith(
      "published_product_catalog_read_failed",
      expect.objectContaining({ message: expect.stringContaining("[redacted]") })
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("should-not-leak");
    errorSpy.mockRestore();
  });

  it("decodes a single published product and returns null for no row", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ payload: catalogPayload.products[0] }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(getPublishedProductV2("bp-001", "zh")).resolves.toMatchObject({
      id: productId,
      code: "BP-001",
      categoryId
    });
    await expect(getPublishedProductV2("missing", "zh")).resolves.toBeNull();
    expect(rpc).toHaveBeenNthCalledWith(1, "get_published_product_v2", {
      p_slug: "bp-001"
    });
  });

  it("localizes a published product detail", async () => {
    rpc.mockResolvedValue({ data: [{ payload: catalogPayload.products[0] }], error: null });

    const zh = await getPublishedProductV2("bp-001", "zh");
    const ar = await getPublishedProductV2("bp-001", "ar");

    expect(zh?.content.name).toBe("轻盈胸垫");
    expect(ar?.content.name).toBe("وسادة خفيفة");
  });
});

describe("legacy product repository compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasSupabaseAdminConfig.mockReturnValue(true);
    createSupabaseAdminClient.mockReturnValue({ rpc });
  });

  it("merges both public categories in stable global order", () => {
    const merged = mergeProductCatalogPages([
      [{ id: "p3", sortOrder: 3 }],
      [{ id: "p1", sortOrder: 1 }, { id: "p2", sortOrder: 2 }]
    ] as never);

    expect(merged.map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("keeps a configured empty legacy catalog empty", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(listPublishedProductCatalog()).resolves.toEqual([]);
  });

  it("adapts legacy public functions to V2 RPCs without calling revoked V1 RPCs", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "get_published_product_v2") {
        return { data: [{ payload: catalogPayload.products[0] }], error: null };
      }
      return { data: [{ payload: catalogPayload }], error: null };
    });

    await expect(
      listPublishedProducts({ categorySlug: "bra-pads", limit: 10 })
    ).resolves.toMatchObject({ items: [{ slug: "bp-001", categorySlug: "bra-pads" }] });
    await expect(getPublishedProduct("bp-001")).resolves.toMatchObject({
      slug: "bp-001",
      categorySlug: "bra-pads"
    });
    await expect(listPublishedProductCatalog()).resolves.toMatchObject([
      { slug: "bp-001", categorySlug: "bra-pads" }
    ]);

    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("list_published_products");
    expect(rpc.mock.calls.map(([name]) => name)).not.toContain("get_published_product");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "list_published_catalog_v2",
      "get_published_product_v2",
      "list_published_catalog_v2"
    ]);
  });

  it("keeps dynamic V2 categories in compatibility category lists", async () => {
    rpc.mockResolvedValue({
      data: [{ payload: dynamicCategoryPayload }, { payload: catalogPayload }],
      error: null
    });

    await expect(
      listPublishedProducts({ categorySlug: "bra-pads", limit: 10 })
    ).resolves.toMatchObject({
      items: [{ slug: "bp-001", categorySlug: "bra-pads" }]
    });
    await expect(listPublishedProductCatalog()).resolves.toMatchObject([
      { slug: "bp-001", categorySlug: "bra-pads" },
      { slug: "li-001", categorySlug: "lace-inserts" }
    ]);
  });

  it("adapts detail for a product in a dynamic V2 category", async () => {
    rpc.mockResolvedValue({
      data: [{ payload: dynamicCategoryPayload.products[0] }],
      error: null
    });

    await expect(getPublishedProduct("li-001")).resolves.toMatchObject({
      slug: "li-001",
      categorySlug: "lace-inserts"
    });
    await expect(getPublishedProductV2("li-001", "en")).resolves.toMatchObject({
      slug: "li-001",
      category: { slug: "lace-inserts" },
      content: { name: "Lightweight pad" }
    });
  });
});
