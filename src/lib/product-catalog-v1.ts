import { z } from "zod";

import type { ProductRecord } from "@/lib/content";
import rawCatalog from "../../data/product-catalog-v1.json";

const localizedTextSchema = z.object({
  zh: z.string().min(1),
  en: z.string().min(1),
  ar: z.string().min(1)
});

const catalogSchema = z.object({
  version: z.string().min(1),
  source: z.string().min(1),
  products: z.array(z.object({
    slug: z.string().min(1),
    category: z.enum(["bra-pads", "cups"]),
    sortOrder: z.number().int().positive(),
    translations: z.object({
      zh: z.object({ name: z.string().min(1), summary: z.string().min(1), description: z.string().min(1) }),
      en: z.object({ name: z.string().min(1), summary: z.string().min(1), description: z.string().min(1) }),
      ar: z.object({ name: z.string().min(1), summary: z.string().min(1), description: z.string().min(1) })
    }),
    images: z.array(z.object({ fileName: z.string().min(1), alt: localizedTextSchema })).min(1),
    specifications: z.array(z.object({ label: localizedTextSchema, value: localizedTextSchema }))
  }))
});

export function buildCatalogProductsV1(): ProductRecord[] {
  const catalog = catalogSchema.parse(rawCatalog);
  return catalog.products.map((product) => ({
    id: product.slug,
    slug: product.slug,
    categoryId: product.category === "bra-pads"
      ? "b8c8fe47-2268-4f88-bf2a-3d751c2fa001"
      : "b8c8fe47-2268-4f88-bf2a-3d751c2fa002",
    categorySlug: product.category,
    status: "published",
    sortOrder: product.sortOrder,
    deletedAt: null,
    translations: product.translations,
    images: product.images.map((image, index) => ({
      id: `${product.slug}-image-${index + 1}`,
      url: `/images/products/catalog-v1/${image.fileName}`,
      alt: image.alt,
      sortOrder: index
    })),
    specifications: product.specifications.map((specification, index) => ({
      id: `${product.slug}-spec-${index + 1}`,
      label: specification.label,
      value: specification.value,
      sortOrder: index
    }))
  }));
}

export const catalogProductsV1 = buildCatalogProductsV1();
