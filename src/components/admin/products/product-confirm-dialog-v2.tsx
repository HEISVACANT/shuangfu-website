"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

import {
  changeProductStatusV2,
  deleteProductV2,
  type ProductActionResult
} from "@/app/admin/product-actions-v2";
import { ProductPreviewV2 } from "@/components/admin/products/product-preview-v2";
import type { Locale } from "@/lib/i18n";
import type { ProductRecordV2, ProductStatusV2 } from "@/lib/product-admin-v2";

type ProductAction = (input: unknown) => Promise<ProductActionResult>;
type ProductConfirmKind = "status" | "delete";

type ProductConfirmDialogV2Props = {
  product: ProductRecordV2;
  kind: ProductConfirmKind;
  onClose: () => void;
  onSuccess: (message: string) => void;
  statusAction?: ProductAction;
  deleteAction?: ProductAction;
  returnFocus?: HTMLElement | null;
};

type ProductDialogsV2Props = {
  loadProduct: (id: string) => Promise<ProductRecordV2 | null>;
  statusAction?: ProductAction;
  deleteAction?: ProductAction;
};

type StatusDialogCopy = {
  title: string;
  confirm: string;
  description: string;
  targetStatus: "published" | "archived";
};

const localeLabels: Record<Locale, string> = {
  zh: "中文",
  en: "English",
  ar: "العربية"
};

const fieldLabels: Record<string, string> = {
  name: "产品名称",
  description: "产品描述",
  colors: "颜色",
  material: "材质",
  customizationScope: "定制范围",
  category: "产品分类",
  categoryId: "产品分类",
  imageLimit: "产品图片数量",
  primaryImage: "主图",
  imageAlt: "图片说明",
  specifications: "规格",
  specificationLabel: "规格名称",
  specificationValue: "规格值"
};

export function getStatusDialogCopy(status: ProductStatusV2): StatusDialogCopy {
  if (status === "published") {
    return {
      title: "下架产品",
      confirm: "确认下架",
      description: "下架后产品将从官网中隐藏，后台数据仍会保留。",
      targetStatus: "archived"
    };
  }
  return {
    title: "发布产品",
    confirm: "确认发布",
    description: "发布前将检查三语内容、图片与规格，成功后产品会显示在官网。",
    targetStatus: "published"
  };
}

function fieldErrorLabel(error: NonNullable<ProductActionResult["fieldErrors"]>[number]): string {
  const path = error.field.replace(/^product\./, "");
  let normalized = path.replace(/^translations\./, "").split(".").at(-1) ?? path;
  if (path === "imageAlt" || path === "images.alt" || path.startsWith("images.")) {
    normalized = "imageAlt";
  } else if (path.startsWith("specifications.")) {
    if (path.endsWith(".label")) normalized = "specificationLabel";
    else if (path.endsWith(".value")) normalized = "specificationValue";
    else normalized = "specifications";
  }
  const label = fieldLabels[normalized] ?? error.field;
  return error.locale ? `${localeLabels[error.locale]} ${label}` : label;
}

export function ProductConfirmDialogV2({
  product,
  kind,
  onClose,
  onSuccess,
  statusAction = changeProductStatusV2,
  deleteAction = deleteProductV2,
  returnFocus
}: ProductConfirmDialogV2Props) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ProductActionResult | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    returnFocus === undefined
      ? typeof document === "undefined" || !(document.activeElement instanceof HTMLElement)
        ? null
        : document.activeElement
      : returnFocus
  );
  const statusCopy = getStatusDialogCopy(product.status);
  const title = kind === "status" ? statusCopy.title : "删除产品";
  const confirm = kind === "status" ? statusCopy.confirm : "确认删除";
  const publishedDelete = kind === "delete" && product.status === "published";
  const productName = product.translations.zh.name.trim() || "未填写";

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    const parent = overlay?.parentElement;
    if (!overlay || !parent) return;
    const siblings = Array.from(parent.children).filter((element) => element !== overlay);
    const previous = siblings.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.hasAttribute("inert")
    }));
    for (const sibling of siblings) {
      sibling.setAttribute("aria-hidden", "true");
      sibling.setAttribute("inert", "");
    }
    return () => {
      for (const item of previous) {
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden");
        else item.element.setAttribute("aria-hidden", item.ariaHidden);
        if (!item.inert) item.element.removeAttribute("inert");
      }
    };
  }, []);

  function closeDialog() {
    if (pending) return;
    onClose();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !pending) {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hasAttribute("hidden"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submit() {
    if (pending || publishedDelete) return;
    setPending(true);
    setResult(null);
    try {
      const actionResult = kind === "status"
        ? await statusAction({
          productId: product.id,
          expectedUpdatedAt: product.updatedAt,
          status: statusCopy.targetStatus
        })
        : await deleteAction({
          productId: product.id,
          expectedUpdatedAt: product.updatedAt
        });
      if (!actionResult.ok) {
        setResult(actionResult);
        return;
      }
      onSuccess(actionResult.message);
      onClose();
      window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    } catch {
      setResult({
        ok: false,
        code: "DATABASE_ERROR",
        message: "操作失败，请稍后重试。"
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closeDialog();
      }}
      ref={overlayRef}
      style={{
        alignItems: "center",
        background: "rgba(29,22,24,.55)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: 24,
        position: "fixed",
        zIndex: 120
      }}
    >
      <section
        aria-labelledby="product-confirm-title"
        aria-modal="true"
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        style={{ background: "white", borderRadius: 16, boxShadow: "0 24px 80px rgba(25,17,20,.25)", maxWidth: 540, padding: 26, width: "100%" }}
      >
        <header style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" }}>
          <h2 id="product-confirm-title" style={{ margin: 0 }}>{title}</h2>
          <button
            aria-label="关闭确认对话框"
            disabled={pending}
            onClick={closeDialog}
            ref={closeRef}
            type="button"
          >
            关闭
          </button>
        </header>

        <p style={{ fontWeight: 700, margin: "22px 0 8px" }}>
          {productName}（{product.code}）
        </p>
        <p style={{ margin: 0 }}>
          {kind === "status"
            ? statusCopy.description
            : "删除后将从后台默认列表和官网中隐藏"}
        </p>
        {publishedDelete ? (
          <div className="admin-message error" role="alert" style={{ marginTop: 18 }}>
            已发布产品不可删除，请先下架。
          </div>
        ) : null}
        {result && !result.ok ? (
          <div className="admin-message error" role="alert" style={{ marginTop: 18 }}>
            <p style={{ margin: 0 }}>{result.message}</p>
            {result.fieldErrors?.length ? (
              <ul style={{ marginBottom: 0 }}>
                {result.fieldErrors.map((error, index) => (
                  <li key={`${error.locale ?? "global"}-${error.field}-${error.index ?? index}`}>
                    {fieldErrorLabel(error)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <footer style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button disabled={pending} onClick={closeDialog} type="button">取消</button>
          <button
            className="admin-primary"
            disabled={pending || publishedDelete}
            onClick={submit}
            type="button"
          >
            {pending ? "处理中…" : confirm}
          </button>
        </footer>
      </section>
    </div>
  );
}

function RefreshProductList({ version }: { version: number }) {
  const router = useRouter();
  useEffect(() => {
    if (version > 0) router.refresh();
  }, [router, version]);
  return null;
}

export function ProductDialogsV2({
  loadProduct,
  statusAction = changeProductStatusV2,
  deleteAction = deleteProductV2
}: ProductDialogsV2Props) {
  const [dialog, setDialog] = useState<{
    kind: "preview" | ProductConfirmKind;
    product: ProductRecordV2;
    trigger: HTMLElement;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    async function handleProductAction(event: MouseEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-product-action]")
        : null;
      const action = target?.dataset.productAction;
      if (
        !target ||
        (
          action !== "create" &&
          action !== "edit" &&
          action !== "view" &&
          action !== "status" &&
          action !== "delete"
        )
      ) return;
      const sequence = ++requestSequence.current;
      setDialog(null);
      setFeedback(null);
      if (action === "create" || action === "edit") return;
      if (action === "delete" && target.dataset.productStatus === "published") {
        setFeedback({ message: "已发布产品不可删除，请先下架。", tone: "error" });
        return;
      }
      const id = target.dataset.productId;
      if (!id) return;
      try {
        const product = await loadProduct(id);
        if (sequence !== requestSequence.current) return;
        if (!product) {
          setFeedback({ message: "产品详情加载失败，请稍后重试。", tone: "error" });
          return;
        }
        if (action === "delete" && product.status === "published") {
          setFeedback({ message: "已发布产品不可删除，请先下架。", tone: "error" });
          return;
        }
        setDialog({
          kind: action === "view" ? "preview" : action,
          product,
          trigger: target
        });
      } catch {
        if (sequence === requestSequence.current) {
          setFeedback({ message: "产品详情加载失败，请稍后重试。", tone: "error" });
        }
      }
    }

    document.addEventListener("click", handleProductAction);
    return () => document.removeEventListener("click", handleProductAction);
  }, [loadProduct]);

  function closeDialog() {
    requestSequence.current += 1;
    setDialog(null);
  }

  function handleSuccess(message: string) {
    setFeedback({ message, tone: "success" });
    setRefreshVersion((version) => version + 1);
  }

  return (
    <>
      {refreshVersion > 0 ? <RefreshProductList version={refreshVersion} /> : null}
      {feedback ? (
        <p
          className={`admin-message ${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
      {dialog?.kind === "preview" ? (
        <ProductPreviewV2
          key={dialog.product.id}
          onClose={closeDialog}
          product={dialog.product}
          returnFocus={dialog.trigger}
        />
      ) : null}
      {dialog && dialog.kind !== "preview" ? (
        <ProductConfirmDialogV2
          deleteAction={deleteAction}
          key={`${dialog.kind}-${dialog.product.id}`}
          kind={dialog.kind}
          onClose={closeDialog}
          onSuccess={handleSuccess}
          product={dialog.product}
          returnFocus={dialog.trigger}
          statusAction={statusAction}
        />
      ) : null}
    </>
  );
}
