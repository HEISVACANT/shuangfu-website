import { NextResponse } from "next/server";
import { isLocale } from "@/lib/i18n";
import { getPublishedProductV2 } from "@/lib/products-repository";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const requestedLocale = new URL(request.url).searchParams.get("locale");
  const locale = requestedLocale && isLocale(requestedLocale) ? requestedLocale : "zh";
  const product = await getPublishedProductV2((await params).slug, locale);
  const isPublic =
    product?.status === "published" &&
    product.deletedAt === null &&
    product.category.isEnabled;

  return isPublic
    ? NextResponse.json(product)
    : NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
}
