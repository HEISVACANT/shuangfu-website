import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { changeProductStatusV2, deleteProductV2, refresh, saveProductV2 } = vi.hoisted(() => ({
  changeProductStatusV2: vi.fn(),
  deleteProductV2: vi.fn(),
  refresh: vi.fn(),
  saveProductV2: vi.fn()
}));

vi.mock("@/app/admin/product-actions-v2", () => ({
  changeProductStatusV2,
  deleteProductV2,
  saveProductV2
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import type { ProductActionResult } from "@/app/admin/product-actions-v2";
import {
  getStatusDialogCopy,
  ProductConfirmDialogV2,
  ProductDialogsV2
} from "@/components/admin/products/product-confirm-dialog-v2";
import { ProductDrawerV2 } from "@/components/admin/products/product-drawer-v2";
import type { ProductRecordV2 } from "@/lib/product-admin-v2";

const product: ProductRecordV2 = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "bp-001",
  code: "BP-001",
  categoryId: "00000000-0000-4000-8000-000000000001",
  status: "unpublished",
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
      description: "产品介绍",
      colors: "白色",
      material: "海绵",
      customizationScope: "尺寸与颜色"
    },
    en: {
      name: "Lightweight Bra Pad",
      description: "Product description",
      colors: "White",
      material: "Foam",
      customizationScope: "Size and color"
    },
    ar: {
      name: "وسادة صدر",
      description: "وصف المنتج",
      colors: "أبيض",
      material: "رغوة",
      customizationScope: "المقاس واللون"
    }
  },
  images: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      mediaId: "30000000-0000-4000-8000-000000000001",
      url: "https://example.com/bp-001.webp",
      variants: {},
      isPrimary: true,
      sortOrder: 0,
      alt: { zh: "BP-001 主图", en: "BP-001 image", ar: "صورة BP-001" }
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function CoordinatedHarness({
  loadProduct
}: {
  loadProduct: (id: string) => Promise<ProductRecordV2 | null>;
}) {
  return (
    <>
      <button
        data-product-action="create"
        type="button"
      >
        新建产品
      </button>
      <button
        data-product-action="edit"
        data-product-id={product.id}
        data-product-status="unpublished"
        type="button"
      >
        编辑 BP-001
      </button>
      <button
        data-product-action="view"
        data-product-id={product.id}
        type="button"
      >
        查看 BP-001
      </button>
      <button type="button">其他操作</button>
      <ProductDrawerV2 categories={[product.category]} loadProduct={loadProduct} />
      <ProductDialogsV2 loadProduct={loadProduct} />
    </>
  );
}

describe("ProductConfirmDialogV2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    changeProductStatusV2.mockResolvedValue({ ok: true, code: "OK", message: "产品已发布。" });
    deleteProductV2.mockResolvedValue({ ok: true, code: "OK", message: "产品已删除。" });
  });

  it("chooses publish and archive copy from the current product status", () => {
    expect(getStatusDialogCopy("unpublished")).toMatchObject({
      title: "发布产品",
      confirm: "确认发布"
    });
    expect(getStatusDialogCopy("archived")).toMatchObject({
      title: "发布产品",
      confirm: "确认发布"
    });
    expect(getStatusDialogCopy("published")).toMatchObject({
      title: "下架产品",
      confirm: "确认下架"
    });
  });

  it("loads the clicked product and shows the destructive delete confirmation", async () => {
    const user = userEvent.setup();
    const loadProduct = vi.fn().mockResolvedValue(product);
    render(
      <>
        <button
          data-product-action="delete"
          data-product-id={product.id}
          data-product-status={product.status}
          type="button"
        >
          删除 BP-001
        </button>
        <ProductDialogsV2 loadProduct={loadProduct} />
      </>
    );

    await user.click(screen.getByRole("button", { name: "删除 BP-001" }));
    expect(await screen.findByText("删除后将从后台默认列表和官网中隐藏")).toBeInTheDocument();
    expect(screen.getByText("轻盈胸垫（BP-001）")).toBeInTheDocument();
    expect(loadProduct).toHaveBeenCalledWith(product.id);
  });

  it.each([
    ["unpublished", "published", "确认发布"],
    ["archived", "published", "确认发布"],
    ["published", "archived", "确认下架"]
  ] as const)("submits the %s status transition to %s", async (current, target, label) => {
    const user = userEvent.setup();
    const statusAction = vi.fn().mockResolvedValue({
      ok: true,
      code: "OK",
      message: target === "published" ? "产品已发布。" : "产品已下架。"
    });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(
      <ProductConfirmDialogV2
        kind="status"
        onClose={onClose}
        onSuccess={onSuccess}
        product={{ ...product, status: current }}
        statusAction={statusAction}
      />
    );

    await user.click(screen.getByRole("button", { name: label }));

    expect(statusAction).toHaveBeenCalledWith({
      productId: product.id,
      expectedUpdatedAt: product.updatedAt,
      status: target
    });
    expect(onSuccess).toHaveBeenCalledWith(
      target === "published" ? "产品已发布。" : "产品已下架。"
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows server completeness fields inside the dialog and keeps it open", async () => {
    const user = userEvent.setup();
    const statusAction = vi.fn().mockResolvedValue({
      ok: false,
      code: "INCOMPLETE_TRANSLATIONS",
      message: "发布前请补全三语内容、图片和规格。",
      fieldErrors: [
        { locale: "en", field: "product.images.alt", index: 0 },
        { locale: "ar", field: "product.specifications.label", index: 0 },
        { locale: "zh", field: "product.specifications.value", index: 0 },
        { field: "primaryImage" },
      ]
    } satisfies ProductActionResult);
    render(
      <ProductConfirmDialogV2
        kind="status"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        product={product}
        statusAction={statusAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "确认发布" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("发布前请补全三语内容、图片和规格。");
    expect(alert).toHaveTextContent("English 图片说明");
    expect(alert).toHaveTextContent("العربية 规格名称");
    expect(alert).toHaveTextContent("中文 规格值");
    expect(alert).toHaveTextContent("主图");
    expect(alert).not.toHaveTextContent("product.images.alt");
    expect(alert).not.toHaveTextContent("product.specifications.label");
    expect(screen.getByRole("dialog", { name: "发布产品" })).toBeInTheDocument();
  });

  it("cancels a pending edit before a later preview resolves", async () => {
    const user = userEvent.setup();
    const editRequest = deferred<ProductRecordV2 | null>();
    const previewRequest = deferred<ProductRecordV2 | null>();
    const loadProduct = vi.fn()
      .mockReturnValueOnce(editRequest.promise)
      .mockReturnValueOnce(previewRequest.promise);
    render(<CoordinatedHarness loadProduct={loadProduct} />);

    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    await user.click(screen.getByRole("button", { name: "查看 BP-001" }));
    previewRequest.resolve(product);
    expect(await screen.findByRole("dialog", { name: "产品预览 BP-001" })).toBeInTheDocument();

    await act(async () => {
      editRequest.resolve(product);
      await editRequest.promise;
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "编辑产品 BP-001" })).not.toBeInTheDocument();
  });

  it("cancels a pending preview before a later edit resolves", async () => {
    const user = userEvent.setup();
    const previewRequest = deferred<ProductRecordV2 | null>();
    const editRequest = deferred<ProductRecordV2 | null>();
    const loadProduct = vi.fn()
      .mockReturnValueOnce(previewRequest.promise)
      .mockReturnValueOnce(editRequest.promise);
    render(<CoordinatedHarness loadProduct={loadProduct} />);

    await user.click(screen.getByRole("button", { name: "查看 BP-001" }));
    await user.click(screen.getByRole("button", { name: "编辑 BP-001" }));
    editRequest.resolve(product);
    expect(await screen.findByRole("dialog", { name: "编辑产品 BP-001" })).toBeInTheDocument();

    await act(async () => {
      previewRequest.resolve(product);
      await previewRequest.promise;
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "产品预览 BP-001" })).not.toBeInTheDocument();
  });

  it.each([
    ["view", "查看 BP-001", "关闭产品预览"],
    ["status", "发布状态 BP-001", "关闭确认对话框"]
  ] as const)("restores the original %s trigger even when focus moves during detail loading", async (action, label, closeLabel) => {
    const user = userEvent.setup();
    const pending = deferred<ProductRecordV2 | null>();
    render(
      <>
        <button
          data-product-action={action}
          data-product-id={product.id}
          data-product-status={product.status}
          type="button"
        >
          {label}
        </button>
        <button type="button">其他操作</button>
        <ProductDialogsV2 loadProduct={vi.fn().mockReturnValue(pending.promise)} />
      </>
    );
    const trigger = screen.getByRole("button", { name: label });

    await user.click(trigger);
    screen.getByRole("button", { name: "其他操作" }).focus();
    pending.resolve(product);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: closeLabel }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it.each(["null", "throw"] as const)("shows the same error alert when detail loading returns %s", async (outcome) => {
    const user = userEvent.setup();
    const loadProduct = outcome === "null"
      ? vi.fn().mockResolvedValue(null)
      : vi.fn().mockRejectedValue(new Error("network"));
    render(
      <>
        <button data-product-action="view" data-product-id={product.id} type="button">
          查看 BP-001
        </button>
        <ProductDialogsV2 loadProduct={loadProduct} />
      </>
    );

    await user.click(screen.getByRole("button", { name: "查看 BP-001" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("产品详情加载失败，请稍后重试。");
    expect(alert).toHaveClass("error");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("disables confirmation while an action is pending", async () => {
    const user = userEvent.setup();
    const pending = deferred<ProductActionResult>();
    const deleteAction = vi.fn().mockReturnValue(pending.promise);
    render(
      <ProductConfirmDialogV2
        deleteAction={deleteAction}
        kind="delete"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        product={product}
      />
    );

    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.getByRole("button", { name: "处理中…" })).toBeDisabled();
    expect(deleteAction).toHaveBeenCalledOnce();

    pending.resolve({ ok: true, code: "OK", message: "产品已删除。" });
    await waitFor(() => expect(screen.getByRole("button", { name: "确认删除" })).toBeEnabled());
  });

  it("closes, refreshes, announces success, and restores focus after a status change", async () => {
    const user = userEvent.setup();
    const loadProduct = vi.fn().mockResolvedValue(product);
    render(
      <>
        <button
          data-product-action="status"
          data-product-id={product.id}
          data-product-status={product.status}
          type="button"
        >
          发布状态 BP-001
        </button>
        <ProductDialogsV2 loadProduct={loadProduct} />
      </>
    );
    const trigger = screen.getByRole("button", { name: "发布状态 BP-001" });

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "确认发布" }));

    expect(await screen.findByRole("status")).toHaveTextContent("产品已发布。");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("never opens or deletes when a published product reaches the delete controller", async () => {
    const user = userEvent.setup();
    const publishedProduct = { ...product, status: "published" as const };
    const loadProduct = vi.fn().mockResolvedValue(publishedProduct);
    render(
      <>
        <button
          data-product-action="delete"
          data-product-id={publishedProduct.id}
          data-product-status="published"
          type="button"
        >
          删除 BP-001
        </button>
        <ProductDialogsV2 loadProduct={loadProduct} />
      </>
    );

    await user.click(screen.getByRole("button", { name: "删除 BP-001" }));

    expect(loadProduct).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteProductV2).not.toHaveBeenCalled();
  });

  it("rejects a stale non-published delete trigger when fresh detail is published", async () => {
    const user = userEvent.setup();
    const publishedProduct = { ...product, status: "published" as const };
    render(
      <>
        <button
          data-product-action="delete"
          data-product-id={publishedProduct.id}
          data-product-status="unpublished"
          type="button"
        >
          删除 BP-001
        </button>
        <ProductDialogsV2 loadProduct={vi.fn().mockResolvedValue(publishedProduct)} />
      </>
    );

    await user.click(screen.getByRole("button", { name: "删除 BP-001" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("已发布产品不可删除，请先下架。");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteProductV2).not.toHaveBeenCalled();
  });

  it("keeps the direct delete boundary disabled for published detail", async () => {
    const user = userEvent.setup();
    const deleteAction = vi.fn();
    render(
      <ProductConfirmDialogV2
        deleteAction={deleteAction}
        kind="delete"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        product={{ ...product, status: "published" }}
      />
    );

    const confirm = screen.getByRole("button", { name: "确认删除" });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it("traps focus, makes the background inert, and restores focus after Escape", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">打开删除确认</button>
          {open ? (
            <ProductConfirmDialogV2
              kind="delete"
              onClose={() => setOpen(false)}
              onSuccess={vi.fn()}
              product={product}
            />
          ) : null}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "打开删除确认" });
    await user.click(trigger);

    const close = screen.getByRole("button", { name: "关闭确认对话框" });
    await waitFor(() => expect(close).toHaveFocus());
    expect(trigger).toHaveAttribute("inert");
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "确认删除" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).not.toHaveAttribute("inert");
  });
});
