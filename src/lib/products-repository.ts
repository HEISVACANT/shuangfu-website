import "server-only";
import { z } from "zod";

import type { ProductRecord } from "@/lib/content";
import { paginatePublishedProducts } from "@/lib/content";
import type {
  ProductCategoryV2,
  ProductImageV2,
  ProductRecordV2,
  ProductSpecificationV2,
  ProductTranslationV2,
  PublishedCatalogCategoryV2
} from "@/lib/product-admin-v2";
import type { Locale } from "@/lib/i18n";
import type { ProductCategoryV1 } from "@/lib/site-content-config-v1";
import { normalizeRepositoryError } from "@/lib/site-content-repository-v1";
import { sampleProducts } from "@/lib/site-content";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

type JsonObject = Record<string, unknown>;

type SupabaseErrorLike = {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
};

export type ProductRepositoryError = Error & {
  code: string;
  details?: string | null;
  hint?: string | null;
};

export type LocalizedProductImageV2 = ProductImageV2 & {
  altText: string;
};

export type LocalizedProductSpecificationV2 = ProductSpecificationV2 & {
  labelText: string;
  valueText: string;
};

export type LocalizedProductRecordV2 = Omit<
  ProductRecordV2,
  "images" | "specifications"
> & {
  content: ProductTranslationV2;
  images: LocalizedProductImageV2[];
  specifications: LocalizedProductSpecificationV2[];
};

export type LocalizedPublishedCatalogCategoryV2 = Omit<
  PublishedCatalogCategoryV2,
  "products"
> & {
  content: ProductCategoryV2["translations"][Locale];
  products: LocalizedProductRecordV2[];
};

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function normalizeAliases(value: unknown, aliases: Record<string, string>): unknown {
  const object = asObject(value);
  if (!object) return value;

  const normalized = { ...object };
  for (const [snakeCase, camelCase] of Object.entries(aliases)) {
    if (normalized[camelCase] === undefined && normalized[snakeCase] !== undefined) {
      normalized[camelCase] = normalized[snakeCase];
    }
  }
  return normalized;
}

const localeTextSchema = z.object({
  zh: z.string(),
  en: z.string(),
  ar: z.string()
});

const categoryTranslationsSchema = z.object({
  zh: z.object({ name: z.string(), description: z.string() }),
  en: z.object({ name: z.string(), description: z.string() }),
  ar: z.object({ name: z.string(), description: z.string() })
});

const productTranslationSchema = z.preprocess(
  (value) => normalizeAliases(value, { customization_scope: "customizationScope" }),
  z.object({
    name: z.string(),
    description: z.string(),
    colors: z.string(),
    material: z.string(),
    customizationScope: z.string()
  })
);

const productTranslationsSchema = z.object({
  zh: productTranslationSchema,
  en: productTranslationSchema,
  ar: productTranslationSchema
});

const categoryPayloadSchema = z.preprocess(
  (value) =>
    normalizeAliases(value, {
      sort_order: "sortOrder",
      is_enabled: "isEnabled"
    }),
  z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    sortOrder: z.number().int(),
    isEnabled: z.boolean(),
    translations: categoryTranslationsSchema
  })
);

const productImagePayloadSchema = z.preprocess(
  (value) =>
    normalizeAliases(value, {
      media_id: "mediaId",
      is_primary: "isPrimary",
      sort_order: "sortOrder"
    }),
  z.object({
    id: z.string().uuid(),
    mediaId: z.string().uuid(),
    url: z.string().min(1),
    variants: z.record(z.string(), z.string()),
    isPrimary: z.boolean(),
    sortOrder: z.number().int(),
    alt: localeTextSchema
  })
);

const specificationPayloadSchema = z.preprocess(
  (value) => normalizeAliases(value, { sort_order: "sortOrder" }),
  z.object({
    id: z.string().uuid(),
    sortOrder: z.number().int(),
    label: localeTextSchema,
    value: localeTextSchema
  })
);

const productPayloadSchema = z.preprocess(
  (value) =>
    normalizeAliases(value, {
      category_id: "categoryId",
      deleted_at: "deletedAt",
      updated_at: "updatedAt"
    }),
  z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    code: z.string().min(1),
    categoryId: z.string().uuid(),
    status: z.enum(["unpublished", "published", "archived"]),
    deletedAt: z.string().nullable(),
    updatedAt: z.string(),
    category: categoryPayloadSchema,
    translations: productTranslationsSchema,
    images: z.array(productImagePayloadSchema),
    specifications: z.array(specificationPayloadSchema)
  })
);

const publishedCategoryPayloadSchema = z.preprocess(
  (value) =>
    normalizeAliases(value, {
      sort_order: "sortOrder",
      is_enabled: "isEnabled"
    }),
  z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    sortOrder: z.number().int(),
    isEnabled: z.boolean(),
    translations: categoryTranslationsSchema,
    products: z.array(productPayloadSchema)
  })
);

function stableSortByOrderAndId<T extends { id: string; sortOrder: number }>(items: T[]): T[] {
  return items.toSorted(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
  );
}

export function productRepositoryError(error: SupabaseErrorLike): ProductRepositoryError {
  return Object.assign(new Error(error.message), {
    name: "ProductRepositoryError",
    code: error.code ?? "SUPABASE_ERROR",
    details: error.details,
    hint: error.hint
  });
}

function invalidPayloadError(error: z.ZodError): ProductRepositoryError {
  return Object.assign(new Error("Supabase product RPC returned an invalid payload"), {
    name: "ProductRepositoryError",
    code: "INVALID_RPC_PAYLOAD",
    details: error.issues.map((issue) => issue.path.join(".")).join(", "),
    cause: error
  });
}

function decodeWithSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw invalidPayloadError(result.error);
  return result.data;
}

export function decodeProductV2Payload(value: unknown): ProductRecordV2 {
  const product = decodeWithSchema(productPayloadSchema, value);
  return {
    ...product,
    images: stableSortByOrderAndId(product.images),
    specifications: stableSortByOrderAndId(product.specifications)
  };
}

export function decodeCategoryV2Payload(value: unknown): ProductCategoryV2 {
  return decodeWithSchema(categoryPayloadSchema, value);
}

function decodePublishedCategoryV2Payload(value: unknown): PublishedCatalogCategoryV2 {
  const category = decodeWithSchema(publishedCategoryPayloadSchema, value);
  return {
    ...category,
    products: category.products.map((product) => ({
      ...product,
      images: stableSortByOrderAndId(product.images),
      specifications: stableSortByOrderAndId(product.specifications)
    }))
  };
}

export function decodeRpcPayloadRows<T>(
  schema: (value: unknown) => T,
  data: unknown
): T[] {
  const rows = decodeWithSchema(
    z.array(z.object({ payload: z.unknown() })),
    data
  );
  return rows.map((row) => schema(row.payload));
}

const sampleCategoryDefinitions: Record<
  "bra-pads" | "cups",
  Omit<ProductCategoryV2, "translations"> & {
    translations: ProductCategoryV2["translations"];
  }
> = {
  "bra-pads": {
    id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001",
    slug: "bra-pads",
    sortOrder: 10,
    isEnabled: true,
    translations: {
      zh: { name: "胸垫", description: "胸垫产品" },
      en: { name: "Bra Pads", description: "Bra pad products" },
      ar: { name: "وسادات حمالة الصدر", description: "منتجات وسادات حمالة الصدر" }
    }
  },
  cups: {
    id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa002",
    slug: "cups",
    sortOrder: 20,
    isEnabled: true,
    translations: {
      zh: { name: "罩杯", description: "罩杯产品" },
      en: { name: "Cups", description: "Cup products" },
      ar: { name: "أكواب", description: "منتجات الأكواب" }
    }
  }
};

function sampleProductToV2(product: ProductRecord): ProductRecordV2 {
  const category = sampleCategoryDefinitions[product.categorySlug as "bra-pads" | "cups"];
  const code = product.specifications[0]?.value.en || product.id.toUpperCase();

  return {
    id: product.id,
    slug: product.slug,
    code,
    categoryId: category.id,
    status: product.status === "published" ? "published" : "unpublished",
    deletedAt: product.deletedAt,
    updatedAt: "1970-01-01T00:00:00.000Z",
    category,
    translations: {
      zh: {
        name: product.translations.zh.name,
        description: product.translations.zh.description,
        colors: "",
        material: "",
        customizationScope: ""
      },
      en: {
        name: product.translations.en.name,
        description: product.translations.en.description,
        colors: "",
        material: "",
        customizationScope: ""
      },
      ar: {
        name: product.translations.ar.name,
        description: product.translations.ar.description,
        colors: "",
        material: "",
        customizationScope: ""
      }
    },
    images: product.images.map<ProductImageV2>((image, index) => ({
      id: image.id,
      mediaId: image.id,
      url: image.url,
      variants: {},
      isPrimary: index === 0,
      sortOrder: image.sortOrder,
      alt: image.alt
    })),
    specifications: product.specifications.map<ProductSpecificationV2>((item) => ({
      ...item
    }))
  };
}

function samplePublishedCatalogV2(): PublishedCatalogCategoryV2[] {
  return (["bra-pads", "cups"] as const).map((slug) => {
    const category = sampleCategoryDefinitions[slug];
    return {
      ...category,
      products: sampleProducts
        .filter(
          (product) =>
            product.categorySlug === slug &&
            product.status === "published" &&
            product.deletedAt === null
        )
        .map(sampleProductToV2)
    };
  });
}

function localizeProductV2(
  product: ProductRecordV2,
  locale: Locale
): LocalizedProductRecordV2 {
  return {
    ...product,
    content: product.translations[locale],
    images: product.images.map((image) => ({
      ...image,
      altText: image.alt[locale]
    })),
    specifications: product.specifications.map((specification) => ({
      ...specification,
      labelText: specification.label[locale],
      valueText: specification.value[locale]
    }))
  };
}

function localizeCatalogCategoryV2(
  category: PublishedCatalogCategoryV2,
  locale: Locale
): LocalizedPublishedCatalogCategoryV2 {
  return {
    ...category,
    content: category.translations[locale],
    products: category.products.map((product) => localizeProductV2(product, locale))
  };
}

export async function listPublishedCatalogV2(
  locale: Locale
): Promise<LocalizedPublishedCatalogCategoryV2[]> {
  if (!hasSupabaseAdminConfig()) {
    return samplePublishedCatalogV2().map((category) =>
      localizeCatalogCategoryV2(category, locale)
    );
  }

  const { data, error } = await createSupabaseAdminClient().rpc(
    "list_published_catalog_v2"
  );
  if (error) throw productRepositoryError(error);

  return decodeRpcPayloadRows(decodePublishedCategoryV2Payload, data)
    .toSorted(
      (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    )
    .map((category) => localizeCatalogCategoryV2(category, locale));
}

export async function listPublishedCatalogForSiteV2(
  locale: Locale,
  readCatalog: (locale: Locale) => Promise<LocalizedPublishedCatalogCategoryV2[]> = listPublishedCatalogV2
) {
  try {
    return await readCatalog(locale);
  } catch (error) {
    console.error(
      "published_product_catalog_read_failed",
      normalizeRepositoryError(error)
    );
    return samplePublishedCatalogV2().map((category) =>
      localizeCatalogCategoryV2(category, locale)
    );
  }
}

export async function getPublishedProductV2(
  slug: string,
  locale: Locale
): Promise<LocalizedProductRecordV2 | null> {
  if (!hasSupabaseAdminConfig()) {
    const product = samplePublishedCatalogV2()
      .flatMap((category) => category.products)
      .find((item) => item.slug === slug);
    return product ? localizeProductV2(product, locale) : null;
  }

  const { data, error } = await createSupabaseAdminClient().rpc(
    "get_published_product_v2",
    { p_slug: slug }
  );
  if (error) throw productRepositoryError(error);

  const product = decodeRpcPayloadRows(decodeProductV2Payload, data)[0];
  return product ? localizeProductV2(product, locale) : null;
}

function adaptProductV2ToLegacy(
  product: ProductRecordV2,
  categorySortOrder: number,
  productIndex: number
): ProductRecord {
  return {
    id: product.id,
    slug: product.slug,
    categoryId: product.categoryId,
    categorySlug: product.category.slug,
    status: "published",
    sortOrder: categorySortOrder * 1000 + productIndex,
    deletedAt: product.deletedAt,
    translations: {
      zh: {
        name: product.translations.zh.name,
        summary: product.translations.zh.description,
        description: product.translations.zh.description
      },
      en: {
        name: product.translations.en.name,
        summary: product.translations.en.description,
        description: product.translations.en.description
      },
      ar: {
        name: product.translations.ar.name,
        summary: product.translations.ar.description,
        description: product.translations.ar.description
      }
    },
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      sortOrder: image.sortOrder
    })),
    specifications: product.specifications.map((specification) => ({
      id: specification.id,
      label: specification.label,
      value: specification.value,
      sortOrder: specification.sortOrder
    }))
  };
}

export function adaptCatalogV2ToLegacy(
  catalog: LocalizedPublishedCatalogCategoryV2[]
): ProductRecord[] {
  return catalog.flatMap((category) =>
    category.products.map((product, index) =>
      adaptProductV2ToLegacy(
        product,
        category.sortOrder,
        index
      )
    )
  );
}

export async function listPublishedProducts(input: {
  categoryId?: string;
  categorySlug?: string;
  cursor?: string;
  limit: number;
}) {
  const products = adaptCatalogV2ToLegacy(await listPublishedCatalogV2("zh"));
  return paginatePublishedProducts(products, input);
}

export async function getPublishedProduct(slug: string) {
  const product = await getPublishedProductV2(slug, "zh");
  return product
    ? adaptProductV2ToLegacy(product, product.category.sortOrder, 0)
    : null;
}

export function mergeProductCatalogPages(pages: ProductRecord[][]) {
  return pages.flat().toSorted((left, right) =>
    left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
  );
}

export function groupProductsByCategoryV1(
  categories: readonly ProductCategoryV1[],
  products: readonly ProductRecord[]
) {
  return Object.fromEntries(
    categories
      .filter((category) => category.enabled)
      .toSorted(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.slug.localeCompare(right.slug)
      )
      .map((category) => [
        category.id,
        products
          .filter(
            (product) =>
              product.categoryId === category.id ||
              product.categorySlug === category.slug
          )
          .toSorted(
            (left, right) =>
              left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
          )
      ])
  ) as Record<string, ProductRecord[]>;
}

export async function listPublishedProductCatalog(): Promise<ProductRecord[]> {
  return adaptCatalogV2ToLegacy(await listPublishedCatalogV2("zh"));
}

export async function listProductsForAdmin(): Promise<ProductRecord[]> {
  if (!hasSupabaseAdminConfig()) return [];
  return listPublishedProductCatalog();
}
