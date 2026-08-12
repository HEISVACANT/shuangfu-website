import { describe, expect, it } from "vitest";

import {
  productInputV2Schema,
  validateProductForPublish
} from "@/lib/product-admin-v2";
import type { ProductInputV2 } from "@/lib/product-admin-v2";

function makeCompleteProductInput(): ProductInputV2 {
  return {
    code: "BP-001",
    categoryId: "11111111-1111-4111-8111-111111111111",
    status: "unpublished",
    translations: {
      zh: {
        name: "胸垫 A",
        description: "中文产品说明",
        colors: "肤色",
        material: "海绵",
        customizationScope: "厚度"
      },
      en: {
        name: "Pad A",
        description: "English product description",
        colors: "Nude",
        material: "Foam",
        customizationScope: "Thickness"
      },
      ar: {
        name: "وسادة أ",
        description: "وصف المنتج بالعربية",
        colors: "لون البشرة",
        material: "إسفنج",
        customizationScope: "السماكة"
      }
    },
    images: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        mediaId: "33333333-3333-4333-8333-333333333333",
        url: "https://example.com/pad-a.jpg",
        variants: { thumbnail: "https://example.com/pad-a-thumb.jpg" },
        isPrimary: true,
        sortOrder: 0,
        alt: { zh: "胸垫 A", en: "Pad A", ar: "وسادة أ" }
      }
    ],
    specifications: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        sortOrder: 0,
        label: { zh: "厚度", en: "Thickness", ar: "السماكة" },
        value: { zh: "5 毫米", en: "5 mm", ar: "٥ ملم" }
      }
    ]
  };
}

describe("product admin v2", () => {
  it("defaults a new product to unpublished and normalizes its code", () => {
    const parsed = productInputV2Schema.parse({
      code: "  BP-001  ",
      categoryId: "11111111-1111-4111-8111-111111111111",
      translations: { zh: {}, en: {}, ar: {} },
      images: [],
      specifications: []
    });

    expect(parsed.code).toBe("BP-001");
    expect(parsed.status).toBe("unpublished");
  });

  it("reports missing fields by locale before publication", () => {
    const complete = makeCompleteProductInput();
    const missing = validateProductForPublish({
      ...complete,
      translations: {
        ...complete.translations,
        en: { ...complete.translations.en, name: "" }
      }
    });

    expect(missing).toContainEqual({ locale: "en", field: "name" });
  });

  it("requires exactly one primary image and no more than ten images", () => {
    const complete = makeCompleteProductInput();

    expect(validateProductForPublish({ ...complete, images: [] })).toContainEqual({
      field: "primaryImage"
    });

    const elevenImages = Array.from({ length: 11 }, (_, sortOrder) => ({
      ...complete.images[0],
      mediaId: `00000000-0000-4000-8000-${String(sortOrder).padStart(12, "0")}`,
      sortOrder,
      isPrimary: sortOrder === 0
    }));
    expect(
      validateProductForPublish({ ...complete, images: elevenImages })
    ).toContainEqual({ field: "imageLimit" });
  });
});
