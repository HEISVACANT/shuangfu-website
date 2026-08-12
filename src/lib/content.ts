import type { Locale } from "@/lib/i18n";

// Keep the legacy shape for CMS previews while the product catalog uses V2.
export type { ProductRecordV2 } from "@/lib/product-admin-v2";

export type PublishStatus = "draft" | "published";

export type LocalizedProductContent = {
  name: string;
  summary: string;
  description: string;
};

export type ProductImage = {
  id: string;
  url: string;
  alt: Record<Locale, string>;
  sortOrder: number;
};

export type ProductSpecification = {
  id: string;
  label: Record<Locale, string>;
  value: Record<Locale, string>;
  sortOrder: number;
};

export type ProductRecord = {
  id: string;
  slug: string;
  categoryId: string;
  categorySlug: string;
  status: PublishStatus;
  sortOrder: number;
  deletedAt: string | null;
  translations: Record<Locale, LocalizedProductContent>;
  images: ProductImage[];
  specifications: ProductSpecification[];
};

type MissingTranslation = {
  locale: Locale;
  field: keyof LocalizedProductContent;
};

const requiredTranslationFields = [
  "name",
  "summary",
  "description"
] as const satisfies readonly (keyof LocalizedProductContent)[];

export function validatePublishableTranslations(
  translations: Record<Locale, LocalizedProductContent>
): MissingTranslation[] {
  const missing: MissingTranslation[] = [];

  for (const locale of ["zh", "en", "ar"] as const) {
    for (const field of requiredTranslationFields) {
      if (!translations[locale][field].trim()) {
        missing.push({ locale, field });
      }
    }
  }

  return missing;
}

export function paginatePublishedProducts(
  products: ProductRecord[],
  input: {
    categoryId?: string;
    categorySlug?: string;
    limit: number;
    cursor?: string;
  }
): { items: ProductRecord[]; nextCursor: string | null } {
  const ordered = products
    .filter(
      (item) =>
        (input.categoryId
          ? item.categoryId === input.categoryId
          : item.categorySlug === input.categorySlug) &&
        item.status === "published" &&
        item.deletedAt === null
    )
    .toSorted(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    );

  const [cursorOrder, cursorId] = input.cursor?.split(":", 2) ?? [];
  const startIndex = cursorOrder
    ? ordered.findIndex(
        (item) =>
          item.sortOrder === Number(cursorOrder) && item.id === cursorId
      ) + 1
    : 0;
  const items = ordered.slice(Math.max(0, startIndex), startIndex + input.limit);
  const last = items.at(-1);
  const hasMore = startIndex + items.length < ordered.length;

  return {
    items,
    nextCursor: hasMore && last ? `${last.sortOrder}:${last.id}` : null
  };
}
