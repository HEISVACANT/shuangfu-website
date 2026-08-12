import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseServerClient,
  getAdminProductV2,
  getUser,
  permissionRpc
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getAdminProductV2: vi.fn(),
  getUser: vi.fn(),
  permissionRpc: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/products-admin-repository-v2", () => ({ getAdminProductV2 }));

import type { ProductActionResult } from "@/app/admin/product-actions-v2";
import { loadAdminProductDetail } from "@/components/admin/products/product-admin-v2";
import { ProductDrawerV2 } from "@/components/admin/products/product-drawer-v2";
import type { ProductCategoryV2, ProductRecordV2 } from "@/lib/product-admin-v2";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));

const category: ProductCategoryV2 = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "bra-pads",
  sortOrder: 10,
  isEnabled: true,
  translations: {
    zh: { name: "胸垫", description: "产品" },
    en: { name: "Bra Pads", description: "Products" },
    ar: { name: "وسادات", description: "منتجات" }
  }
};

const detail: ProductRecordV2 = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "bp-001",
  code: "BP-001",
  categoryId: category.id,
  status: "archived",
  deletedAt: null,
  updatedAt: "2026-07-29T08:00:00.000Z",
  category,
  translations: {
    zh: { name: "轻盈胸垫", description: "介绍", colors: "白色", material: "海绵", customizationScope: "尺寸" },
    en: { name: "Light pad", description: "Description", colors: "White", material: "Foam", customizationScope: "Size" },
    ar: { name: "وسادة", description: "وصف", colors: "أبيض", material: "رغوة", customizationScope: "المقاس" }
  },
  images: [],
  specifications: []
};

const secondDetail: ProductRecordV2 = {
  ...detail,
  id: "10000000-0000-4000-8000-000000000002",
  slug: "bp-002",
  code: "BP-002"
};

const detailedProduct: ProductRecordV2 = {
  ...detail,
  images: [{
    id: "20000000-0000-4000-8000-000000000001",
    mediaId: "30000000-0000-4000-8000-000000000001",
    url: "https://example.com/detail.webp",
    variants: {},
    isPrimary: true,
    sortOrder: 0,
    alt: { zh: "主图", en: "Primary", ar: "الصورة" }
  }],
  specifications: [{
    id: "40000000-0000-4000-8000-000000000001",
    sortOrder: 0,
    label: { zh: "尺寸", en: "Size", ar: "المقاس" },
    value: { zh: "S", en: "S", ar: "S" }
  }]
};

function Harness({
  loadProduct = vi.fn().mockResolvedValue(detail),
  saveAction = vi.fn<(input: unknown) => Promise<ProductActionResult>>().mockResolvedValue({ ok: true, code: "OK", message: "产品已保存。" })
}: {
  loadProduct?: (id: string) => Promise<ProductRecordV2 | null>;
  saveAction?: (input: unknown) => Promise<ProductActionResult>;
}) {
  return (
    <>
      <button data-product-action="create" type="button">新建产品</button>
      <button data-product-action="edit" data-product-id={detail.id} data-product-status="archived" type="button">编辑 BP-001</button>
      <button data-product-action="edit" data-product-id={secondDetail.id} data-product-status="archived" type="button">编辑 BP-002</button>
      <button data-product-action="edit" data-product-id="published-id" data-product-status="published" type="button">编辑 PUB-001</button>
      <ProductDrawerV2 categories={[category]} loadProduct={loadProduct} saveAction={saveAction} />
    </>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ProductDrawerV2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "90000000-0000-4000-8000-000000000001" } }, error: null });
    permissionRpc.mockResolvedValue({ data: true, error: null });
    createSupabaseServerClient.mockResolvedValue({
      auth: { getUser },
      rpc: permissionRpc
    });
    getAdminProductV2.mockResolvedValue(detail);
  });

  it("authorizes and validates the detail Server Action before service-role access", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(loadAdminProductDetail(detail.id)).resolves.toBeNull();
    expect(permissionRpc).not.toHaveBeenCalled();
    expect(getAdminProductV2).not.toHaveBeenCalled();

    await expect(loadAdminProductDetail("not-a-uuid")).resolves.toBeNull();
    expect(getAdminProductV2).not.toHaveBeenCalled();

    permissionRpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(loadAdminProductDetail(detail.id)).resolves.toBeNull();
    expect(permissionRpc).toHaveBeenLastCalledWith("has_permission", {
      p_resource: "products",
      p_action: "view"
    });
    expect(getAdminProductV2).not.toHaveBeenCalled();

    await expect(loadAdminProductDetail(detail.id)).resolves.toEqual(detail);
    expect(getAdminProductV2).toHaveBeenCalledWith(detail.id);
  });

  it("opens a wide right drawer for a new unpublished trilingual product", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新建产品" }));
    const dialog = screen.getByRole("dialog", { name: "新建产品" });
    expect(dialog).toHaveAttribute("data-side", "right");
    expect(dialog).toHaveStyle({ width: "920px", maxWidth: "100vw" });
    expect(screen.getByRole("tab", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "العربية" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("id", "product-locale-tab-en");
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-controls", "product-locale-panel-en");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "product-locale-tab-zh");
    expect(screen.getByRole("combobox", { name: "产品分类" })).toHaveValue(category.id);
    expect(screen.getByTestId("product-status-value")).toHaveTextContent("unpublished");
  });

  it("ignores late edit detail after the user switches to create", async () => {
    const user = userEvent.setup();
    const pending = deferred<ProductRecordV2 | null>();
    render(<Harness loadProduct={vi.fn().mockReturnValue(pending.promise)} />);

    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    await user.click(screen.getByRole("button", { name: "新建产品" }));
    expect(screen.getByRole("dialog", { name: "新建产品" })).toBeInTheDocument();

    pending.resolve(detail);
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByRole("dialog", { name: "新建产品" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "产品编号" })).toHaveValue("");
  });

  it("accepts only the latest of overlapping edit detail requests", async () => {
    const user = userEvent.setup();
    const first = deferred<ProductRecordV2 | null>();
    const second = deferred<ProductRecordV2 | null>();
    const loadProduct = vi.fn((id: string) => id === detail.id ? first.promise : second.promise);
    render(<Harness loadProduct={loadProduct} />);

    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    await user.click(screen.getByRole("button", { name: "编辑 BP-002" }));
    expect(loadProduct).toHaveBeenCalledTimes(2);

    second.resolve(secondDetail);
    expect(await screen.findByRole("dialog", { name: "编辑产品 BP-002" })).toBeInTheDocument();
    first.resolve(detail);
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByRole("dialog", { name: "编辑产品 BP-002" })).toBeInTheDocument();
  });

  it("invalidates an in-flight edit request when the drawer closes", async () => {
    const user = userEvent.setup();
    const pending = deferred<ProductRecordV2 | null>();
    render(<Harness loadProduct={vi.fn().mockReturnValue(pending.promise)} />);

    await user.click(screen.getByRole("button", { name: "新建产品" }));
    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    await user.click(screen.getByRole("button", { name: "关闭产品编辑" }));
    pending.resolve(detail);
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["null", "throw"] as const)("shows the same error alert when edit detail loading returns %s", async (outcome) => {
    const user = userEvent.setup();
    const loadProduct = outcome === "null"
      ? vi.fn().mockResolvedValue(null)
      : vi.fn().mockRejectedValue(new Error("network"));
    render(<Harness loadProduct={loadProduct} />);

    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("产品详情加载失败，请稍后重试。");
    expect(alert).toHaveClass("error");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("traps keyboard focus, closes with Escape, and restores the trigger focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "新建产品" });

    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "产品编号" })).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "保存产品" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("switches locale tabs with arrow keys and keeps tab-panel relationships stable", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "新建产品" }));

    const chinese = screen.getByRole("tab", { name: "中文" });
    chinese.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "English" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "product-locale-panel-en");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "product-locale-tab-en");
  });

  it("keeps values after action errors, switches locale, and focuses the first field error", async () => {
    const user = userEvent.setup();
    const saveAction = vi.fn<(input: unknown) => Promise<ProductActionResult>>().mockResolvedValue({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "请检查英文名称。",
      fieldErrors: [{ locale: "en", field: "product.translations.name" }]
    });
    render(<Harness saveAction={saveAction} />);

    await user.click(screen.getByRole("button", { name: "新建产品" }));
    await user.type(screen.getByRole("textbox", { name: "产品编号" }), "  BP-NEW  ");
    await user.type(screen.getByRole("textbox", { name: "产品名称" }), "新产品");
    await user.click(screen.getByRole("button", { name: "保存产品" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请检查英文名称。");
    expect(screen.getByRole("textbox", { name: "产品编号" })).toHaveValue("BP-NEW");
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "产品名称" })).toHaveFocus());
  });

  it("maps product.categoryId action errors to the shared category control", async () => {
    const user = userEvent.setup();
    const saveAction = vi.fn<(input: unknown) => Promise<ProductActionResult>>().mockResolvedValue({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "请选择分类。",
      fieldErrors: [{ field: "product.categoryId" }]
    });
    render(<Harness saveAction={saveAction} />);

    await user.click(screen.getByRole("button", { name: "新建产品" }));
    await user.type(screen.getByRole("textbox", { name: "产品编号" }), "BP-NEW");
    await user.click(screen.getByRole("button", { name: "保存产品" }));

    await waitFor(() => expect(screen.getByRole("combobox", { name: "产品分类" })).toHaveFocus());
  });

  it("maps product.images.alt errors to the indexed locale alt control", async () => {
    const user = userEvent.setup();
    const saveAction = vi.fn<(input: unknown) => Promise<ProductActionResult>>().mockResolvedValue({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "请补充图片说明。",
      fieldErrors: [{ locale: "ar", field: "product.images.alt", index: 0 }]
    });
    render(<Harness loadProduct={vi.fn().mockResolvedValue(detailedProduct)} saveAction={saveAction} />);

    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    await screen.findByRole("dialog", { name: "编辑产品 BP-001" });
    await user.click(screen.getByRole("button", { name: "保存产品" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "图片说明 配图 1" })).toHaveFocus());
    expect(screen.getByRole("tab", { name: "العربية" })).toHaveAttribute("aria-selected", "true");
  });

  it("maps product.specifications.value errors to the indexed locale value control", async () => {
    const user = userEvent.setup();
    const saveAction = vi.fn<(input: unknown) => Promise<ProductActionResult>>().mockResolvedValue({
      ok: false,
      code: "VALIDATION_ERROR",
      message: "请补充规格值。",
      fieldErrors: [{ locale: "en", field: "product.specifications.value", index: 0 }]
    });
    render(<Harness loadProduct={vi.fn().mockResolvedValue(detailedProduct)} saveAction={saveAction} />);

    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    await screen.findByRole("dialog", { name: "编辑产品 BP-001" });
    await user.click(screen.getByRole("button", { name: "保存产品" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "规格值 1" })).toHaveFocus());
    expect(screen.getByRole("tab", { name: "English" })).toHaveAttribute("aria-selected", "true");
  });

  it("loads complete edit detail, renders repeatable specs, and marks Arabic controls RTL", async () => {
    const user = userEvent.setup();
    const loadProduct = vi.fn().mockResolvedValue(detail);
    render(<Harness loadProduct={loadProduct} />);

    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    expect(loadProduct).toHaveBeenCalledWith(detail.id);
    expect(await screen.findByRole("dialog", { name: "编辑产品 BP-001" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "产品编号" })).toHaveValue("BP-001");

    await user.click(screen.getByRole("button", { name: "添加规格" }));
    expect(screen.getByRole("textbox", { name: "规格名称 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "العربية" }));
    expect(screen.getByRole("textbox", { name: "产品名称" })).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("textbox", { name: "规格名称 1" })).toHaveAttribute("dir", "rtl");
  });

  it("never requests or opens the editor for a published product", async () => {
    const user = userEvent.setup();
    const loadProduct = vi.fn();
    render(<Harness loadProduct={loadProduct} />);

    await user.click(screen.getByRole("button", { name: "编辑 PUB-001" }));
    expect(loadProduct).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes, refreshes, and announces success after saving", async () => {
    const user = userEvent.setup();
    const saveAction = vi.fn<(input: unknown) => Promise<ProductActionResult>>().mockResolvedValue({ ok: true, code: "OK", message: "产品已保存。" });
    render(<Harness saveAction={saveAction} />);

    await user.click(screen.getByRole("button", { name: "新建产品" }));
    await user.type(screen.getByRole("textbox", { name: "产品编号" }), "BP-NEW");
    await user.click(screen.getByRole("button", { name: "保存产品" }));

    expect(await screen.findByRole("status")).toHaveTextContent("产品已保存。");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
    expect(saveAction).toHaveBeenCalledWith(expect.objectContaining({
      productId: null,
      expectedUpdatedAt: null,
      product: expect.objectContaining({ status: "unpublished" })
    }));
  });
});
