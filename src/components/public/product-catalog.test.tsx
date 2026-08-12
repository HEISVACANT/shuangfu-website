import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublishedProductV2, listPublishedCatalogV2 } = vi.hoisted(() => ({
  getPublishedProductV2: vi.fn(),
  listPublishedCatalogV2: vi.fn()
}));

vi.mock("@/lib/products-repository", () => ({
  getPublishedProductV2,
  listPublishedCatalogV2
}));

import { ProductCatalog } from "@/components/public/product-catalog";
import { GET as getProductRoute } from "@/app/api/products/[slug]/route";
import { GET as listProductsRoute } from "@/app/api/products/route";
import type {
  LocalizedProductRecordV2,
  LocalizedPublishedCatalogCategoryV2
} from "@/lib/products-repository";

const cupsCategoryId = "00000000-0000-4000-8000-000000000001";
const padsCategoryId = "00000000-0000-4000-8000-000000000002";

function productFixture(
  overrides: Partial<LocalizedProductRecordV2> = {}
): LocalizedProductRecordV2 {
  const translations = {
    zh: {
      name: "水滴形胸垫",
      description: "用于展示结构与材质。",
      colors: "黑色、白色",
      material: "高回弹海绵",
      customizationScope: "尺寸、颜色与标识"
    },
    en: {
      name: "Teardrop pad",
      description: "Shows structure and material.",
      colors: "Black and white",
      material: "High-resilience foam",
      customizationScope: "Size, color, and branding"
    },
    ar: {
      name: "وسادة قطرة",
      description: "لعرض البنية والخامة.",
      colors: "أسود وأبيض",
      material: "رغوة عالية المرونة",
      customizationScope: "المقاس واللون والعلامة"
    }
  };
  const category = {
    id: padsCategoryId,
    slug: "bra-pads",
    sortOrder: 20,
    isEnabled: true,
    translations: {
      zh: { name: "动态胸垫", description: "由后台维护的胸垫分类。" },
      en: { name: "Dynamic pads", description: "Admin-managed pad category." },
      ar: { name: "وسادات ديناميكية", description: "فئة وسادات مدارة." }
    }
  };

  return {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "pad-01",
    code: "BP-001",
    categoryId: padsCategoryId,
    status: "published",
    deletedAt: null,
    updatedAt: "2026-07-29T04:00:00.000Z",
    category,
    translations,
    content: translations.zh,
    images: [
      {
        id: "20000000-0000-4000-8000-000000000002",
        mediaId: "30000000-0000-4000-8000-000000000002",
        url: "/images/secondary-product-placeholder-v2.png",
        variants: { thumbnail: "/images/secondary-product-thumb-v2.png" },
        isPrimary: false,
        sortOrder: 1,
        alt: { zh: "胸垫侧面", en: "Pad side", ar: "جانب الوسادة" },
        altText: "胸垫侧面"
      },
      {
        id: "20000000-0000-4000-8000-000000000001",
        mediaId: "30000000-0000-4000-8000-000000000001",
        url: "/images/product-catalog-placeholder-v1.png",
        variants: { thumbnail: "/images/product-primary-thumb-v2.png" },
        isPrimary: true,
        sortOrder: 2,
        alt: { zh: "胸垫主图", en: "Pad primary", ar: "الصورة الرئيسية" },
        altText: "胸垫主图"
      }
    ],
    specifications: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        label: { zh: "尺寸", en: "Size", ar: "المقاس" },
        value: { zh: "A 杯", en: "A cup", ar: "كوب A" },
        sortOrder: 1,
        labelText: "尺寸",
        valueText: "A 杯"
      }
    ],
    ...overrides
  };
}

const publishedProduct = productFixture();
const archivedProduct = productFixture({
  id: "10000000-0000-4000-8000-000000000099",
  slug: "archived-pad",
  status: "archived",
  translations: {
    ...publishedProduct.translations,
    zh: { ...publishedProduct.translations.zh, name: "已下架胸垫" }
  },
  content: { ...publishedProduct.content, name: "已下架胸垫" }
});

const cupsCategory: LocalizedPublishedCatalogCategoryV2 = {
  id: cupsCategoryId,
  slug: "made-to-measure-cups",
  sortOrder: 10,
  isEnabled: true,
  translations: {
    zh: { name: "后台罩杯分类", description: "暂无已发布产品。" },
    en: { name: "Admin cup category", description: "No published products yet." },
    ar: { name: "فئة الأكواب", description: "لا توجد منتجات منشورة." }
  },
  content: { name: "后台罩杯分类", description: "暂无已发布产品。" },
  products: []
};

const padsCategory: LocalizedPublishedCatalogCategoryV2 = {
  ...publishedProduct.category,
  content: publishedProduct.category.translations.zh,
  products: [publishedProduct, archivedProduct]
};

describe("ProductCatalog", () => {
  it("renders enabled dynamic categories in server order and defensively filters non-public component input", () => {
    render(<ProductCatalog locale="zh" categories={[cupsCategory, padsCategory]} />);

    expect(
      screen
        .getAllByTestId("public-product-category")
        .map((node) => node.textContent)
    ).toEqual([
      expect.stringContaining(cupsCategory.translations.zh.name),
      expect.stringContaining(padsCategory.translations.zh.name)
    ]);
    expect(screen.getByText("共 0 款")).toBeInTheDocument();
    expect(screen.queryByText(archivedProduct.translations.zh.name)).not.toBeInTheDocument();
  });

  it("opens complete localized details with the primary image and selectable thumbnails", async () => {
    const user = userEvent.setup();
    render(<ProductCatalog locale="zh" categories={[padsCategory]} />);

    await user.click(screen.getByRole("button", { name: /动态胸垫/ }));
    await user.click(screen.getByRole("button", { name: "查看 水滴形胸垫" }));

    const detail = screen.getByRole("article");
    expect(within(detail).getByRole("heading", { name: "水滴形胸垫" })).toBeInTheDocument();
    expect(within(detail).getByText("BP-001")).toBeInTheDocument();
    expect(within(detail).getByText("用于展示结构与材质。")).toBeInTheDocument();
    expect(within(detail).getByText("尺寸")).toBeInTheDocument();
    expect(within(detail).getByText("黑色、白色")).toBeInTheDocument();
    expect(within(detail).getByText("高回弹海绵")).toBeInTheDocument();
    expect(within(detail).getByText("尺寸、颜色与标识")).toBeInTheDocument();
    expect(within(detail).getByTestId("public-product-main-image")).toHaveAttribute(
      "src",
      expect.stringContaining("product-catalog-placeholder-v1.png")
    );

    await user.click(within(detail).getByRole("button", { name: "查看配图 1" }));
    expect(within(detail).getByTestId("public-product-main-image")).toHaveAttribute(
      "src",
      expect.stringContaining("secondary-product-placeholder-v2.png")
    );
  });

  it("passes the V2 product id and dynamic category slug to inquiry selection", async () => {
    const user = userEvent.setup();
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    render(<ProductCatalog locale="zh" categories={[padsCategory]} />);

    await user.click(screen.getByRole("button", { name: /动态胸垫/ }));
    await user.click(screen.getByRole("button", { name: "查看 水滴形胸垫" }));
    await user.click(screen.getByRole("link", { name: "咨询该产品" }));

    const inquiryEvent = dispatchEvent.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === "select-inquiry-product") as CustomEvent;
    expect(inquiryEvent.detail).toEqual({
      productId: publishedProduct.id,
      categoryId: padsCategory.id,
      categorySlug: padsCategory.slug
    });
    dispatchEvent.mockRestore();
  });
});

describe("public product API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a dynamic repository category slug", async () => {
    listPublishedCatalogV2.mockResolvedValue([cupsCategory]);

    const response = await listProductsRoute(
      new Request(
        `http://localhost/api/products?category=${cupsCategory.slug}&locale=zh`
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(listPublishedCatalogV2).toHaveBeenCalledWith("zh");
  });

  it("returns 400 for an explicitly invalid locale without querying the repository", async () => {
    const response = await listProductsRoute(
      new Request("http://localhost/api/products?category=bra-pads&locale=fr")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "VALIDATION_ERROR" });
    expect(listPublishedCatalogV2).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown or expired cursor", async () => {
    listPublishedCatalogV2.mockResolvedValue([padsCategory]);

    const response = await listProductsRoute(
      new Request(
        "http://localhost/api/products?category=bra-pads&cursor=expired-product-id"
      )
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "VALIDATION_ERROR" });
  });

  it.each([
    ["unpublished", productFixture({ status: "unpublished" })],
    ["archived", productFixture({ status: "archived" })],
    ["soft-deleted", productFixture({ deletedAt: "2026-08-01T00:00:00.000Z" })],
    [
      "disabled-category",
      productFixture({
        category: { ...publishedProduct.category, isEnabled: false }
      })
    ]
  ])("returns 404 when the repository yields a %s product", async (_case, product) => {
    getPublishedProductV2.mockResolvedValue(product);

    const response = await getProductRoute(
      new Request("http://localhost/api/products/pad-01"),
      { params: Promise.resolve({ slug: "pad-01" }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "NOT_FOUND" });
  });
});
