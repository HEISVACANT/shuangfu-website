import { describe, expect, it } from "vitest";
import { buildCatalogProductsV1 } from "@/lib/product-catalog-v1";

describe("product catalog v1", () => {
  it("builds exactly ten unique, publishable catalog products", () => {
    const products = buildCatalogProductsV1();
    expect(products).toHaveLength(10);
    expect(new Set(products.map((item) => item.slug)).size).toBe(10);
    expect(products.filter((item) => item.categorySlug === "bra-pads")).toHaveLength(5);
    expect(products.filter((item) => item.categorySlug === "cups")).toHaveLength(5);
    expect(products.every((item) => /^[0-9a-f-]{36}$/.test(item.categoryId))).toBe(true);
    expect(products.every((item) => item.status === "published")).toBe(true);
    expect(products.every((item) => item.images.length >= 1)).toBe(true);
    expect(products.every((item) => ["zh", "en", "ar"].every((locale) => {
      const translation = item.translations[locale as "zh" | "en" | "ar"];
      return Boolean(translation.name && translation.summary && translation.description);
    }))).toBe(true);
  });

  it("merges both integrated-cup spreads into one product gallery", () => {
    const product = buildCatalogProductsV1().find((item) => item.slug === "integrated-cup-pad");
    expect(product?.translations.zh.name).toBe("连体杯");
    expect(product?.images.map((image) => image.url)).toEqual([
      "/images/products/catalog-v1/integrated-cup-pad-01.webp",
      "/images/products/catalog-v1/integrated-cup-pad-02.webp"
    ]);
  });
});
