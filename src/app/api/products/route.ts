import { NextResponse } from "next/server";
import { isLocale } from "@/lib/i18n";
import { listPublishedCatalogV2 } from "@/lib/products-repository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const categorySlug = url.searchParams.get("category");
  const requestedLocale = url.searchParams.get("locale");
  const requestedLimit = Number(url.searchParams.get("limit") ?? 12);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(24, Math.max(1, Math.trunc(requestedLimit)))
    : 12;

  if (!categorySlug || (requestedLocale !== null && !isLocale(requestedLocale))) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const locale = requestedLocale ?? "zh";

  const category = (await listPublishedCatalogV2(locale)).find(
    (item) => item.isEnabled && item.slug === categorySlug
  );
  if (!category) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const products = category.products.filter(
    (product) =>
      product.status === "published" &&
      product.deletedAt === null &&
      product.category.isEnabled
  );
  const cursor = url.searchParams.get("cursor");
  const cursorIndex = cursor
    ? products.findIndex((product) => product.id === cursor)
    : -1;
  if (cursor && cursorIndex < 0) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const startIndex = cursorIndex + 1;
  const items = products.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + items.length < products.length;

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null
  });
}
