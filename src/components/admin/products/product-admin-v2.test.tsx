import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listAdminCategoriesV2, listAdminProductsV2 } = vi.hoisted(() => ({
  listAdminCategoriesV2: vi.fn(),
  listAdminProductsV2: vi.fn()
}));

vi.mock("@/lib/products-admin-repository-v2", () => ({
  listAdminCategoriesV2,
  listAdminProductsV2
}));

import ProductsAdmin from "@/app/admin/(dashboard)/products/page";
import { ProductAdminV2 } from "@/components/admin/products/product-admin-v2";
import type {
  AdminProductFilters,
  ProductCategoryV2,
  ProductRecordV2,
  ProductStatusV2
} from "@/lib/product-admin-v2";

const enabledCategory: ProductCategoryV2 = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "bra-pads",
  sortOrder: 10,
  isEnabled: true,
  translations: {
    zh: { name: "胸垫", description: "胸垫产品" },
    en: { name: "Bra Pads", description: "Bra pad products" },
    ar: { name: "وسادات", description: "منتجات الوسادات" }
  }
};

const disabledCategory: ProductCategoryV2 = {
  id: "00000000-0000-4000-8000-000000000002",
  slug: "cups",
  sortOrder: 20,
  isEnabled: false,
  translations: {
    zh: { name: "罩杯", description: "罩杯产品" },
    en: { name: "Cups", description: "Cup products" },
    ar: { name: "أكواب", description: "منتجات الأكواب" }
  }
};

const categories = [enabledCategory, disabledCategory];

function makeProduct({
  code,
  category = enabledCategory,
  name,
  status
}: {
  code: string;
  category?: ProductCategoryV2;
  name: string;
  status: ProductStatusV2;
}): ProductRecordV2 {
  const sequence = code === "BP-001" ? "1" : code === "BP-002" ? "2" : "3";
  return {
    id: `10000000-0000-4000-8000-00000000000${sequence}`,
    slug: code.toLowerCase(),
    code,
    categoryId: category.id,
    status,
    deletedAt: null,
    updatedAt: "2026-07-29T04:00:00.000Z",
    category,
    translations: {
      zh: {
        name,
        description: "产品介绍",
        colors: "白色",
        material: "海绵",
        customizationScope: "尺寸与颜色"
      },
      en: {
        name: `${code} product`,
        description: "Product description",
        colors: "White",
        material: "Foam",
        customizationScope: "Size and color"
      },
      ar: {
        name: `منتج ${code}`,
        description: "وصف المنتج",
        colors: "أبيض",
        material: "رغوة",
        customizationScope: "المقاس واللون"
      }
    },
    images: [
      {
        id: `20000000-0000-4000-8000-00000000000${sequence}`,
        mediaId: `30000000-0000-4000-8000-00000000000${sequence}`,
        url: `https://example.com/${code.toLowerCase()}.webp`,
        variants: {},
        isPrimary: true,
        sortOrder: 0,
        alt: {
          zh: `${code} 主图`,
          en: `${code} primary image`,
          ar: `الصورة الرئيسية ${code}`
        }
      }
    ],
    specifications: []
  };
}

const products: ProductRecordV2[] = [
  makeProduct({ code: "BP-001", name: "轻盈胸垫", status: "published" }),
  makeProduct({ code: "BP-002", name: "", status: "unpublished" }),
  makeProduct({
    code: "BP-003",
    category: disabledCategory,
    name: "立体罩杯",
    status: "archived"
  })
];

const emptyFilters: AdminProductFilters = {
  query: "",
  categoryId: null,
  status: null
};

function getProductRow(code: string) {
  return screen.getByText(code).closest('[role="row"]') as HTMLElement;
}

describe("ProductAdminV2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAdminCategoriesV2.mockResolvedValue([]);
    listAdminProductsV2.mockResolvedValue([]);
  });

  it("normalizes invalid route category and status filters before repository access", async () => {
    const page = await ProductsAdmin({
      searchParams: Promise.resolve({
        query: "  BP-001  ",
        category: "not-a-uuid",
        status: "deleted"
      })
    });

    expect(listAdminProductsV2).toHaveBeenCalledWith({
      query: "  BP-001  ",
      categoryId: null,
      status: null
    });
    expect(page.props.filters).toEqual({
      query: "  BP-001  ",
      categoryId: null,
      status: null
    });
  });

  it("preserves valid route category and status filters", async () => {
    const page = await ProductsAdmin({
      searchParams: Promise.resolve({
        category: disabledCategory.id,
        status: "archived"
      })
    });

    expect(listAdminProductsV2).toHaveBeenCalledWith({
      query: "",
      categoryId: disabledCategory.id,
      status: "archived"
    });
    expect(page.props.filters).toEqual({
      query: "",
      categoryId: disabledCategory.id,
      status: "archived"
    });
  });

  it("renders the fixed list contract without legacy summary numbers", () => {
    render(
      <ProductAdminV2
        categories={categories}
        filters={emptyFilters}
        products={products}
      />
    );

    expect(screen.queryByText("胸垫14")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "主图" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "产品名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "编号" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "分类" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();

    expect(
      within(getProductRow("BP-001"))
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["查看", "发布状态", "编辑", "删除"]);
    expect(screen.getByRole("button", { name: "查询" })).toHaveAttribute(
      "type",
      "submit"
    );
  });

  it("keeps submitted filters in a GET form and does not filter while typing", async () => {
    const user = userEvent.setup();
    render(
      <ProductAdminV2
        categories={categories}
        filters={{
          query: "BP",
          categoryId: disabledCategory.id,
          status: "archived"
        }}
        products={products}
      />
    );

    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/admin/products");
    expect(form).toHaveStyle({ flexWrap: "wrap" });
    expect(screen.getByRole("searchbox", { name: "名称或编号" })).toHaveAttribute(
      "name",
      "query"
    );
    expect(screen.getByRole("combobox", { name: "分类" })).toHaveValue(
      disabledCategory.id
    );
    expect(screen.getByRole("combobox", { name: "状态" })).toHaveValue("archived");

    await user.clear(screen.getByRole("searchbox", { name: "名称或编号" }));
    await user.type(
      screen.getByRole("searchbox", { name: "名称或编号" }),
      "不存在的产品"
    );
    expect(screen.getAllByTestId("product-row")).toHaveLength(3);
    const queryButton = within(form).getAllByRole("button").at(-1);
    expect(queryButton).toHaveTextContent("查询");
    expect(queryButton).toHaveStyle({ flexShrink: "0" });
  });

  it("keeps published edit and delete actions visible but accessibly disabled", () => {
    render(
      <ProductAdminV2
        categories={categories}
        filters={emptyFilters}
        products={products}
      />
    );

    const publishedRow = getProductRow("BP-001");
    const edit = within(publishedRow).getByRole("button", { name: "编辑 BP-001" });
    const remove = within(publishedRow).getByRole("button", {
      name: "删除 BP-001"
    });
    expect(edit).toBeDisabled();
    expect(remove).toBeDisabled();
    expect(edit).toHaveStyle({ cursor: "not-allowed", opacity: "0.45" });
    expect(remove).toHaveStyle({ cursor: "not-allowed", opacity: "0.45" });
    expect(edit).toHaveAccessibleDescription("已发布产品需先下架后才能编辑");
    expect(remove).toHaveAccessibleDescription("已发布产品需先下架后才能删除");
    expect(
      within(publishedRow).getByRole("button", { name: "查看 BP-001" })
    ).toBeEnabled();
    expect(
      within(publishedRow).getByRole("button", { name: "发布状态 BP-001" })
    ).toBeEnabled();

    const unpublishedRow = getProductRow("BP-002");
    expect(
      within(unpublishedRow).getByRole("button", { name: "编辑 BP-002" })
    ).toBeEnabled();
    expect(
      within(unpublishedRow).getByRole("button", { name: "删除 BP-002" })
    ).toBeEnabled();
  });

  it("trims whitespace before marking missing Chinese names and categories", () => {
    const whitespaceCategory = {
      ...disabledCategory,
      translations: {
        ...disabledCategory.translations,
        zh: { name: "   ", description: "罩杯产品" }
      }
    };
    render(
      <ProductAdminV2
        categories={[enabledCategory, whitespaceCategory]}
        filters={emptyFilters}
        products={[
          {
            ...products[1],
            translations: {
              ...products[1].translations,
              zh: { ...products[1].translations.zh, name: "   " }
            }
          },
          {
            ...products[2],
            category: whitespaceCategory
          }
        ]}
      />
    );

    expect(within(getProductRow("BP-002")).getByText("未填写")).toBeInTheDocument();
    expect(
      within(getProductRow("BP-003")).getByText("未命名分类（已停用）")
    ).toBeInTheDocument();
  });

  it("renders an empty result as a valid table row and cell", () => {
    render(
      <ProductAdminV2
        categories={categories}
        filters={emptyFilters}
        products={[]}
      />
    );

    const table = screen.getByRole("table", { name: "产品列表" });
    expect(
      within(table).getByRole("cell", { name: "没有符合条件的产品" })
    ).toBeInTheDocument();
  });
});
