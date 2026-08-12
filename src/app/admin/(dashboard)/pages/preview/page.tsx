import { PageContentPreviewV1 } from "@/components/admin/page-content-preview-v1";
import {
  groupPreviewProductsByCategoryV1,
  isPageContentPreviewChannelIdV1,
  type PreviewProductsByCategoryV1
} from "@/lib/page-content-preview-v1";
import { listPublishedProductCatalog } from "@/lib/products-repository";

export default async function PageContentPreviewPage({
  searchParams
}: {
  searchParams: Promise<{ channel?: string | string[] }>;
}) {
  const query = await searchParams;
  const channelId = typeof query.channel === "string" ? query.channel : "";
  const productsByCategory = isPageContentPreviewChannelIdV1(channelId)
    ? await loadPreviewProductsByCategoryV1()
    : {};
  return (
    <PageContentPreviewV1
      channelId={channelId}
      productsByCategory={productsByCategory}
    />
  );
}

async function loadPreviewProductsByCategoryV1(): Promise<PreviewProductsByCategoryV1> {
  try {
    const products = (await listPublishedProductCatalog()).toSorted((left, right) =>
      left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
    );
    return groupPreviewProductsByCategoryV1(products);
  } catch {
    console.error("page_content_preview_products_read_failed");
    return {};
  }
}
