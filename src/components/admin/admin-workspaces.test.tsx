import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  AuditWorkspace,
  CustomizationWorkspace,
  PagesWorkspace,
  ProductsWorkspace,
  UsersWorkspace,
} from "@/components/admin/admin-workspaces";
import { sampleProducts } from "@/lib/site-content";

const categories = [
  {
    id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001",
    slug: "bra-pads",
    enabled: true,
    sortOrder: 0,
    productReferenceCount: 14,
    translations: {
      zh: { name: "胸垫", description: "胸垫产品" },
      en: { name: "Bra pads", description: "Bra pad products" },
      ar: { name: "حشوات الصدر", description: "منتجات حشوات الصدر" }
    }
  },
  {
    id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa099",
    slug: "retired-cups",
    enabled: false,
    sortOrder: 1,
    productReferenceCount: 1,
    translations: {
      zh: { name: "已停用杯", description: "仅后台可见" },
      en: { name: "Retired cups", description: "Admin only" },
      ar: { name: "أكواب متوقفة", description: "للإدارة فقط" }
    }
  }
];

describe("admin workspaces", () => {
  it("switches locale, previews and reorders page sections", async () => {
    const user = userEvent.setup();
    render(<PagesWorkspace />);
    await user.click(screen.getByRole("tab", { name: "English" }));
    expect(screen.getByRole("tab", { name: "English" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "预览草稿" })).toHaveAttribute("href", "/en?preview=draft");
    await user.click(screen.getByRole("button", { name: "下移 企业介绍" }));
    expect(screen.getAllByTestId("page-section")[0]).toHaveTextContent("产品介绍");
  });

  it("filters products and opens create, edit and history dialogs", async () => {
    const user = userEvent.setup();
    render(<ProductsWorkspace categories={categories} products={sampleProducts} />);

    await user.type(screen.getByPlaceholderText("搜索名称或产品编号"), "BP-001");
    expect(screen.getAllByTestId("product-row")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "新建产品" }));
    expect(screen.getByRole("dialog", { name: "新建产品" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    expect(screen.getByRole("dialog", { name: "编辑产品" })).toBeInTheDocument();
  });

  it("renders each product's persisted publication status", () => {
    render(<ProductsWorkspace categories={categories} products={sampleProducts.map((product, index) => index === 0 ? {
      ...product,
      status: "draft"
    } : product)} />);

    expect(within(screen.getAllByTestId("product-row")[0]).getByText("草稿")).toHaveClass("status-draft");
  });

  it("keeps an existing product's disabled category visible but blocks new assignment", async () => {
    const user = userEvent.setup();
    const retiredProduct = {
      ...sampleProducts[0],
      categoryId: categories[1].id,
      categorySlug: categories[1].slug
    };
    render(<ProductsWorkspace categories={categories} products={[retiredProduct]} />);

    expect(screen.getByTestId("product-row")).toHaveTextContent("已停用杯");
    await user.click(screen.getByRole("button", { name: "新建产品" }));
    expect(within(screen.getByRole("dialog", { name: "新建产品" }))
      .getByRole("option", { name: "已停用杯（已停用）" })).toBeDisabled();
  });

  it("adds and edits customization dimensions", async () => {
    const user = userEvent.setup();
    render(<CustomizationWorkspace />);
    await user.click(screen.getByRole("button", { name: "新增维度" }));
    expect(screen.getByRole("dialog", { name: "新增维度" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getAllByRole("button", { name: /编辑选项/ })[0]);
    expect(screen.getByRole("dialog", { name: "编辑选项" })).toBeInTheDocument();
  });

  it("opens user and permission dialogs", async () => {
    const user = userEvent.setup();
    render(<UsersWorkspace />);
    await user.click(screen.getByRole("button", { name: "邀请管理员" }));
    expect(screen.getByRole("dialog", { name: "邀请管理员" })).toBeInTheDocument();
  });

  it("filters audit records", async () => {
    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await user.selectOptions(screen.getByLabelText("操作筛选"), "发布");
    expect(screen.getAllByTestId("audit-row")).toHaveLength(1);
  });
});
