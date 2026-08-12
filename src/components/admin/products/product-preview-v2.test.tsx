import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ProductPreviewV2 } from "@/components/admin/products/product-preview-v2";
import type { ProductRecordV2 } from "@/lib/product-admin-v2";

const product: ProductRecordV2 = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "bp-001",
  code: "BP-001",
  categoryId: "00000000-0000-4000-8000-000000000001",
  status: "published",
  deletedAt: null,
  updatedAt: "2026-07-29T04:00:00.000Z",
  category: {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "bra-pads",
    sortOrder: 10,
    isEnabled: true,
    translations: {
      zh: { name: "胸垫", description: "胸垫产品" },
      en: { name: "Bra Pads", description: "Bra pad products" },
      ar: { name: "وسادات", description: "منتجات الوسادات" }
    }
  },
  translations: {
    zh: {
      name: "轻盈胸垫",
      description: "透气亲肤的胸垫产品",
      colors: "白色、黑色",
      material: "高回弹海绵",
      customizationScope: "尺寸、颜色与标识"
    },
    en: {
      name: "Lightweight Bra Pad",
      description: "A breathable and skin-friendly bra pad.",
      colors: "White and black",
      material: "High-resilience foam",
      customizationScope: "Size, color, and branding"
    },
    ar: {
      name: "وسادة صدر خفيفة",
      description: "وسادة صدر مسامية ولطيفة على البشرة.",
      colors: "أبيض وأسود",
      material: "رغوة عالية المرونة",
      customizationScope: "المقاس واللون والعلامة"
    }
  },
  images: [
    {
      id: "20000000-0000-4000-8000-000000000002",
      mediaId: "30000000-0000-4000-8000-000000000002",
      url: "https://example.com/bp-001-secondary.webp",
      variants: { thumbnail: "https://example.com/bp-001-secondary-thumb.webp" },
      isPrimary: false,
      sortOrder: 0,
      alt: {
        zh: "BP-001 侧面",
        en: "BP-001 side view",
        ar: "منظر جانبي BP-001"
      }
    },
    {
      id: "20000000-0000-4000-8000-000000000001",
      mediaId: "30000000-0000-4000-8000-000000000001",
      url: "https://example.com/bp-001-primary.webp",
      variants: { thumbnail: "https://example.com/bp-001-primary-thumb.webp" },
      isPrimary: true,
      sortOrder: 10,
      alt: {
        zh: "BP-001 主图",
        en: "BP-001 primary image",
        ar: "الصورة الرئيسية BP-001"
      }
    }
  ],
  specifications: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      sortOrder: 0,
      label: { zh: "密度", en: "Density", ar: "الكثافة" },
      value: { zh: "35D", en: "35D", ar: "35D" }
    }
  ]
};

const noop = () => undefined;

describe("ProductPreviewV2", () => {
  it("starts with the primary image, changes thumbnails, and switches locale content", async () => {
    const user = userEvent.setup();
    render(<ProductPreviewV2 product={product} onClose={noop} />);

    expect(screen.getByTestId("preview-main-image")).toHaveAttribute(
      "src",
      expect.stringContaining(product.images[1].url)
    );
    await user.click(screen.getByRole("button", { name: "查看配图 2" }));
    expect(screen.getByTestId("preview-main-image")).toHaveAttribute(
      "src",
      expect.stringContaining(product.images[0].url)
    );
    await user.click(screen.getByRole("tab", { name: "English" }));
    expect(screen.getByText(product.translations.en.description)).toBeInTheDocument();
    expect(screen.getByText(/Density/)).toBeInTheDocument();
  });

  it("shows every required product field in the selected language", () => {
    render(<ProductPreviewV2 product={product} onClose={noop} />);
    const dialog = screen.getByRole("dialog", { name: "产品预览 BP-001" });

    for (const label of [
      "产品名称",
      "产品编号",
      "产品分类",
      "发布状态",
      "产品描述",
      "规格",
      "颜色",
      "材质",
      "定制范围"
    ]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    }
    expect(within(dialog).getByText("轻盈胸垫")).toBeInTheDocument();
    expect(within(dialog).getByText("BP-001")).toBeInTheDocument();
    expect(within(dialog).getByText("胸垫")).toBeInTheDocument();
    expect(within(dialog).getByText("已发布")).toBeInTheDocument();
    expect(within(dialog).getByText("白色、黑色")).toBeInTheDocument();
    expect(within(dialog).getByText("高回弹海绵")).toBeInTheDocument();
    expect(within(dialog).getByText("尺寸、颜色与标识")).toBeInTheDocument();
  });

  it("marks missing images, localized text, and specifications instead of inventing fallbacks", () => {
    const missingProduct: ProductRecordV2 = {
      ...product,
      status: "unpublished",
      category: {
        ...product.category,
        translations: {
          ...product.category.translations,
          zh: { ...product.category.translations.zh, name: "   " }
        }
      },
      translations: {
        ...product.translations,
        zh: {
          name: " ",
          description: "",
          colors: " ",
          material: "",
          customizationScope: ""
        }
      },
      images: [],
      specifications: []
    };

    render(<ProductPreviewV2 product={missingProduct} onClose={noop} />);

    expect(screen.queryByTestId("preview-main-image")).not.toBeInTheDocument();
    expect(screen.getAllByText("未填写")).toHaveLength(8);
  });

  it("traps focus, hides background interaction, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">打开产品预览</button>
          {open ? <ProductPreviewV2 product={product} onClose={() => setOpen(false)} /> : null}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "打开产品预览" });
    await user.click(trigger);

    const close = screen.getByRole("button", { name: "关闭产品预览" });
    await waitFor(() => expect(close).toHaveFocus());
    expect(trigger).toHaveAttribute("inert");
    await user.tab({ shift: true });
    expect(document.activeElement).not.toBe(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).not.toHaveAttribute("inert");
  });
});
