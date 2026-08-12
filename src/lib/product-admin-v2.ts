import { z } from "zod";

import type { Locale } from "@/lib/i18n";

export type ProductStatusV2 = "unpublished" | "published" | "archived";

export type ProductTranslationV2 = {
  name: string;
  description: string;
  colors: string;
  material: string;
  customizationScope: string;
};

export type ProductImageV2 = {
  id: string;
  mediaId: string;
  url: string;
  variants: Record<string, string>;
  isPrimary: boolean;
  sortOrder: number;
  alt: Record<Locale, string>;
};

export type ProductSpecificationV2 = {
  id: string;
  sortOrder: number;
  label: Record<Locale, string>;
  value: Record<Locale, string>;
};

export type ProductCategoryV2 = {
  id: string;
  slug: string;
  sortOrder: number;
  isEnabled: boolean;
  translations: Record<Locale, { name: string; description: string }>;
};

export type ProductRecordV2 = {
  id: string;
  slug: string;
  code: string;
  categoryId: string;
  status: ProductStatusV2;
  deletedAt: string | null;
  updatedAt: string;
  category: ProductCategoryV2;
  translations: Record<Locale, ProductTranslationV2>;
  images: ProductImageV2[];
  specifications: ProductSpecificationV2[];
};

export type PublishedCatalogCategoryV2 = ProductCategoryV2 & {
  products: ProductRecordV2[];
};

export type AdminProductFilters = {
  query: string;
  categoryId: string | null;
  status: ProductStatusV2 | null;
};

const locales = ["zh", "en", "ar"] as const satisfies readonly Locale[];
const productTranslationFields = [
  "name",
  "description",
  "colors",
  "material",
  "customizationScope"
] as const satisfies readonly (keyof ProductTranslationV2)[];

const draftTextSchema = z.string().default("");
const localizedTextSchema = z.object({
  zh: draftTextSchema,
  en: draftTextSchema,
  ar: draftTextSchema
});
const productTranslationSchema = z.object({
  name: draftTextSchema,
  description: draftTextSchema,
  colors: draftTextSchema,
  material: draftTextSchema,
  customizationScope: draftTextSchema
});

export const productInputV2Schema = z.object({
  code: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1)
  ),
  categoryId: z.string().uuid(),
  status: z.enum(["unpublished", "published", "archived"]).default("unpublished"),
  translations: z.object({
    zh: productTranslationSchema,
    en: productTranslationSchema,
    ar: productTranslationSchema
  }),
  images: z
    .array(
      z.object({
        id: z.string().uuid(),
        mediaId: z.string().uuid(),
        url: z.string().url(),
        variants: z.record(z.string(), z.string()),
        isPrimary: z.boolean(),
        sortOrder: z.number().int(),
        alt: localizedTextSchema
      })
    )
    .max(10),
  specifications: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int(),
      label: localizedTextSchema,
      value: localizedTextSchema
    })
  )
});

export type ProductInputV2 = z.output<typeof productInputV2Schema>;

export type ProductPublishValidationIssue =
  | { field: "category" | "imageLimit" | "primaryImage" | "imageAlt" | "specifications" }
  | { locale: Locale; field: keyof ProductTranslationV2 };

export function validateProductForPublish(
  product: ProductInputV2
): ProductPublishValidationIssue[] {
  const missing: ProductPublishValidationIssue[] = [];

  if (!product.categoryId.trim()) {
    missing.push({ field: "category" });
  }

  for (const locale of locales) {
    for (const field of productTranslationFields) {
      if (!product.translations[locale][field].trim()) {
        missing.push({ locale, field });
      }
    }
  }

  if (product.images.length > 10) {
    missing.push({ field: "imageLimit" });
  }
  if (product.images.filter((image) => image.isPrimary).length !== 1) {
    missing.push({ field: "primaryImage" });
  }
  for (const image of product.images) {
    if (locales.some((locale) => !image.alt[locale].trim())) {
      missing.push({ field: "imageAlt" });
      break;
    }
  }

  if (
    product.specifications.length === 0 ||
    product.specifications.some((specification) =>
      locales.some(
        (locale) =>
          !specification.label[locale].trim() || !specification.value[locale].trim()
      )
    )
  ) {
    missing.push({ field: "specifications" });
  }

  return missing;
}
