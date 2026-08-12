import type { ProductRecord } from "@/lib/content";

export const pageContentPreviewChannelPrefixV1 = "shuangfu:page-content-preview:v1:";
export const pageContentPreviewConsumerTimeoutMsV1 = 5000;
export const pageContentPreviewProducerTimeoutMsV1 = 30_000;

export type PreviewProductsByCategoryV1 = Readonly<
  Record<string, readonly ProductRecord[] | undefined>
>;

const previewChannelIdPatternV1 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPageContentPreviewChannelIdV1(value: string): boolean {
  return previewChannelIdPatternV1.test(value);
}

export function groupPreviewProductsByCategoryV1(
  products: ProductRecord[]
): PreviewProductsByCategoryV1 {
  const grouped: Record<string, ProductRecord[]> = {};
  for (const product of products) {
    const identity = product as ProductRecord & {
      categoryId?: unknown;
      categorySlug?: unknown;
      category?: unknown;
    };
    const keys = new Set(
      [identity.categoryId, identity.categorySlug, identity.category]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    for (const key of keys) {
      (grouped[key] ??= []).push(product);
    }
  }
  return grouped;
}
