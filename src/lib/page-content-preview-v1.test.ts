import { describe, expect, it } from "vitest";

import {
  groupPreviewProductsByCategoryV1,
  isPageContentPreviewChannelIdV1,
  pageContentPreviewChannelPrefixV1
} from "@/lib/page-content-preview-v1";
import { sampleProducts } from "@/lib/site-content";

describe("page content preview v1 protocol", () => {
  it("validates v4 channel ids from a pure shared module", () => {
    expect(isPageContentPreviewChannelIdV1("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isPageContentPreviewChannelIdV1("11111111-1111-5111-8111-111111111111")).toBe(false);
    expect(isPageContentPreviewChannelIdV1("not-a-channel")).toBe(false);
    expect(pageContentPreviewChannelPrefixV1).toBe("shuangfu:page-content-preview:v1:");
  });

  it("groups current and dynamic product category identities without duplicates", () => {
    const product = {
      ...structuredClone(sampleProducts[0]),
      categoryId: "category-bra-pads",
      categorySlug: "bra-pads"
    };

    const grouped = groupPreviewProductsByCategoryV1([product]);

    expect(grouped["category-bra-pads"]).toEqual([product]);
    expect(grouped["bra-pads"]).toEqual([product]);
  });
});
