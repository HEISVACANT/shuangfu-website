import { describe, expect, it } from "vitest";

import {
  paginatePublishedProducts,
  validatePublishableTranslations
} from "@/lib/content";
import type { ProductRecord } from "@/lib/content";

const translations = {
  zh: { name: "胸垫 A", summary: "中文简介", description: "中文详情" },
  en: { name: "Pad A", summary: "English summary", description: "English details" },
  ar: { name: "وسادة أ", summary: "ملخص عربي", description: "تفاصيل عربية" }
};

function product(
  id: string,
  overrides: Partial<ProductRecord> = {}
): ProductRecord {
  return {
    id,
    slug: id,
    categoryId: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001",
    categorySlug: "bra-pads",
    status: "published",
    sortOrder: Number(id.replace(/\D/g, "")) || 0,
    deletedAt: null,
    translations,
    images: [],
    specifications: [],
    ...overrides
  };
}

describe("validatePublishableTranslations", () => {
  it("accepts a record when all three locales have required content", () => {
    expect(validatePublishableTranslations(translations)).toEqual([]);
  });

  it("returns the missing locale and field before publishing", () => {
    expect(
      validatePublishableTranslations({
        ...translations,
        ar: { ...translations.ar, description: " " }
      })
    ).toEqual([{ locale: "ar", field: "description" }]);
  });
});

describe("paginatePublishedProducts", () => {
  it("returns only published, active products in stable order", () => {
    const result = paginatePublishedProducts(
      [
        product("p3", { sortOrder: 3 }),
        product("draft", { status: "draft", sortOrder: 1 }),
        product("deleted", { deletedAt: "2026-07-20T00:00:00Z", sortOrder: 2 }),
        product("p1", { sortOrder: 1 }),
        product("p2", { sortOrder: 2 })
      ],
      { categoryId: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001", limit: 12 }
    );

    expect(result.items.map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
    expect(result.nextCursor).toBeNull();
  });

  it("returns a cursor that continues without duplicates", () => {
    const products = Array.from({ length: 14 }, (_, index) =>
      product(`p${index + 1}`, { sortOrder: index + 1 })
    );

    const first = paginatePublishedProducts(products, {
      categorySlug: "bra-pads",
      limit: 12
    });
    const second = paginatePublishedProducts(products, {
      categorySlug: "bra-pads",
      limit: 12,
      cursor: first.nextCursor ?? undefined
    });

    expect(first.items).toHaveLength(12);
    expect(first.nextCursor).toBe("12:p12");
    expect(second.items.map((item) => item.id)).toEqual(["p13", "p14"]);
  });
});
