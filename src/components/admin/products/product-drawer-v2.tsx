"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useFieldArray, useForm, useWatch, type FieldPath, type Resolver } from "react-hook-form";

import {
  saveProductV2,
  type ProductActionResult
} from "@/app/admin/product-actions-v2";
import { ProductImageEditorV2 } from "@/components/admin/products/product-image-editor-v2";
import type { Locale } from "@/lib/i18n";
import {
  productInputV2Schema,
  type ProductCategoryV2,
  type ProductInputV2,
  type ProductRecordV2
} from "@/lib/product-admin-v2";

type ProductDrawerV2Props = {
  categories: ProductCategoryV2[];
  loadProduct: (id: string) => Promise<ProductRecordV2 | null>;
  saveAction?: (input: unknown) => Promise<ProductActionResult>;
};

function RefreshProductList({ version }: { version: number }) {
  const router = useRouter();
  useEffect(() => {
    if (version > 0) router.refresh();
  }, [router, version]);
  return null;
}

const locales = ["zh", "en", "ar"] as const satisfies readonly Locale[];
const localeLabels: Record<Locale, string> = {
  zh: "中文",
  en: "English",
  ar: "العربية"
};
const translationFields = [
  ["name", "产品名称"],
  ["description", "产品描述"],
  ["colors", "颜色"],
  ["material", "材质"],
  ["customizationScope", "定制范围"]
] as const;

function emptyTranslation() {
  return { name: "", description: "", colors: "", material: "", customizationScope: "" };
}

function emptyProduct(categoryId: string): ProductInputV2 {
  return {
    code: "",
    categoryId,
    status: "unpublished",
    translations: {
      zh: emptyTranslation(),
      en: emptyTranslation(),
      ar: emptyTranslation()
    },
    images: [],
    specifications: []
  };
}

function productInput(product: ProductRecordV2): ProductInputV2 {
  return {
    code: product.code,
    categoryId: product.categoryId,
    status: product.status,
    translations: structuredClone(product.translations),
    images: structuredClone(product.images),
    specifications: structuredClone(product.specifications)
  };
}

function newSpecification() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000",
    sortOrder: 0,
    label: { zh: "", en: "", ar: "" },
    value: { zh: "", en: "", ar: "" }
  };
}

function focusTarget(
  error: NonNullable<ProductActionResult["fieldErrors"]>[number]
): { locale?: Locale; name: FieldPath<ProductInputV2> } {
  const path = error.field.replace(/^product\./, "");
  if (path === "category" || path === "categoryId") {
    return { name: "categoryId" };
  }
  if (path === "imageAlt" || path === "images.alt" || path.startsWith("images.")) {
    const locale = error.locale ?? "zh";
    return { locale, name: `images.${error.index ?? 0}.alt.${locale}` };
  }
  if (path === "specifications" || path.startsWith("specifications.")) {
    const locale = error.locale ?? "zh";
    const specificationField = path.endsWith(".value") ? "value" : "label";
    return { locale, name: `specifications.${error.index ?? 0}.${specificationField}.${locale}` };
  }
  const field = path.replace(/^translations\./, "") as keyof ProductInputV2["translations"][Locale];
  if (["name", "description", "colors", "material", "customizationScope"].includes(field)) {
    const locale = error.locale ?? "zh";
    return { locale, name: `translations.${locale}.${field}` };
  }
  return { name: "code" };
}

export function ProductDrawerV2({
  categories,
  loadProduct,
  saveAction = saveProductV2
}: ProductDrawerV2Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [activeLocale, setActiveLocale] = useState<Locale>("zh");
  const [productId, setProductId] = useState<string | null>(null);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ProductActionResult | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [pendingFocus, setPendingFocus] = useState<FieldPath<ProductInputV2> | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const requestSequence = useRef(0);
  const tabRefs = useRef<Record<Locale, HTMLButtonElement | null>>({ zh: null, en: null, ar: null });

  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    register,
    reset,
    setFocus,
    setValue
  } = useForm<ProductInputV2>({
    resolver: zodResolver(productInputV2Schema) as Resolver<ProductInputV2>,
    defaultValues: emptyProduct(categories.find((category) => category.isEnabled)?.id ?? categories[0]?.id ?? "")
  });
  const specifications = useFieldArray({
    control,
    name: "specifications",
    keyName: "_formId"
  });
  const images = useWatch({ control, name: "images" });
  const currentCode = useWatch({ control, name: "code" });
  const currentStatus = useWatch({ control, name: "status" });

  useEffect(() => {
    if (!pendingFocus || !open) return;
    const timer = window.setTimeout(() => {
      setFocus(pendingFocus);
      document.querySelector<HTMLElement>(`[name="${pendingFocus}"]`)?.focus();
      setPendingFocus(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeLocale, open, pendingFocus, setFocus]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setFocus("code"), 0);
    return () => window.clearTimeout(timer);
  }, [open, setFocus]);

  function closeDrawer() {
    requestSequence.current += 1;
    setOpen(false);
    window.setTimeout(() => returnFocus.current?.focus(), 0);
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  function selectLocale(locale: Locale) {
    setActiveLocale(locale);
    window.setTimeout(() => tabRefs.current[locale]?.focus(), 0);
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, locale: Locale) {
    const index = locales.indexOf(locale);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % locales.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + locales.length) % locales.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = locales.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectLocale(locales[nextIndex]);
  }

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
      setFeedback(null);
      if (action === "view" || action === "status" || action === "delete") {
        setOpen(false);
        return;
      }
      if (action === "create") {
        returnFocus.current = target;
        setMode("create");
        setProductId(null);
        setExpectedUpdatedAt(null);
        setActiveLocale("zh");
        setActionResult(null);
        reset(emptyProduct(categories.find((category) => category.isEnabled)?.id ?? categories[0]?.id ?? ""));
        setOpen(true);
        return;
      }
      if (target.dataset.productStatus === "published") {
        setOpen(false);
        return;
      }
      const id = target.dataset.productId;
      if (!id) return;
      returnFocus.current = target;
      setActionResult(null);
      try {
        const detail = await loadProduct(id);
        if (sequence !== requestSequence.current) return;
        if (!detail) {
          setFeedback({ message: "产品详情加载失败，请稍后重试。", tone: "error" });
          return;
        }
        if (detail.status === "published") return;
        setMode("edit");
        setProductId(detail.id);
        setExpectedUpdatedAt(detail.updatedAt);
        setActiveLocale("zh");
        reset(productInput(detail));
        setOpen(true);
      } catch {
        if (sequence === requestSequence.current) {
          setFeedback({ message: "产品详情加载失败，请稍后重试。", tone: "error" });
        }
      }
    }

    document.addEventListener("click", handleProductAction);
    return () => document.removeEventListener("click", handleProductAction);
  }, [categories, loadProduct, reset]);

  async function submit(product: ProductInputV2) {
    setActionResult(null);
    const result = await saveAction({ productId, expectedUpdatedAt, product });
    if (!result.ok) {
      setActionResult(result);
      const firstError = result.fieldErrors?.[0];
      if (firstError) {
        const target = focusTarget(firstError);
        if (target.locale) setActiveLocale(target.locale);
        setPendingFocus(target.name);
      }
      return;
    }
    closeDrawer();
    setFeedback({ message: result.message, tone: "success" });
    setRefreshVersion((version) => version + 1);
  }

  const title = mode === "create" ? "新建产品" : `编辑产品 ${currentCode}`;

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
      {open ? (
        <div
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDrawer();
          }}
          style={{ background: "rgba(29,22,24,.55)", display: "flex", inset: 0, justifyContent: "flex-end", position: "fixed", zIndex: 100 }}
        >
          <aside
            aria-labelledby="product-drawer-title"
            aria-modal="true"
            data-side="right"
            onKeyDown={handleDialogKeyDown}
            role="dialog"
            style={{ background: "white", boxShadow: "-20px 0 60px rgba(25,17,20,.2)", height: "100vh", maxWidth: "100vw", overflowY: "auto", padding: 28, width: 920 }}
          >
            <header style={{ alignItems: "center", borderBottom: "1px solid #eee9e7", display: "flex", justifyContent: "space-between", marginBottom: 20, paddingBottom: 16 }}>
              <div>
                <h2 id="product-drawer-title" style={{ margin: 0 }}>{title}</h2>
                <small>状态：<span data-testid="product-status-value">{currentStatus}</span></small>
              </div>
              <button aria-label="关闭产品编辑" onClick={closeDrawer} tabIndex={-1} type="button">×</button>
            </header>

            <form
              className="admin-form"
              onSubmit={(event) => void handleSubmit(submit)(event)}
            >
              <label>
                产品编号
                <input
                  aria-label="产品编号"
                  {...register("code", {
                    onBlur: (event) => setValue("code", event.target.value.trim(), { shouldValidate: true })
                  })}
                />
              </label>
              <label>
                产品分类
                <select aria-label="产品分类" {...register("categoryId")}>
                  {categories.map((category) => (
                    <option disabled={!category.isEnabled} key={category.id} value={category.id}>
                      {category.translations.zh.name || category.slug}{category.isEnabled ? "" : "（已停用）"}
                    </option>
                  ))}
                </select>
              </label>

              <div className="locale-tabs" role="tablist" style={{ gridColumn: "1 / -1" }}>
                {locales.map((locale) => (
                  <button
                    aria-controls={`product-locale-panel-${locale}`}
                    aria-selected={activeLocale === locale}
                    className={activeLocale === locale ? "active" : ""}
                    id={`product-locale-tab-${locale}`}
                    key={locale}
                    onClick={() => selectLocale(locale)}
                    onKeyDown={(event) => handleTabKeyDown(event, locale)}
                    ref={(element) => { tabRefs.current[locale] = element; }}
                    role="tab"
                    tabIndex={activeLocale === locale ? 0 : -1}
                    type="button"
                  >{localeLabels[locale]}</button>
                ))}
              </div>

              <section
                aria-labelledby={`product-locale-tab-${activeLocale}`}
                dir={activeLocale === "ar" ? "rtl" : "ltr"}
                id={`product-locale-panel-${activeLocale}`}
                role="tabpanel"
                style={{ display: "grid", gap: 16, gridColumn: "1 / -1", gridTemplateColumns: "1fr 1fr" }}
              >
                {translationFields.map(([field, label]) => (
                  <label key={field} style={{ gridColumn: field === "description" || field === "customizationScope" ? "1 / -1" : undefined }}>
                    {label}
                    {field === "description" || field === "customizationScope" ? (
                      <textarea
                        aria-label={label}
                        dir={activeLocale === "ar" ? "rtl" : "ltr"}
                        rows={3}
                        {...register(`translations.${activeLocale}.${field}`)}
                      />
                    ) : (
                      <input
                        aria-label={label}
                        dir={activeLocale === "ar" ? "rtl" : "ltr"}
                        {...register(`translations.${activeLocale}.${field}`)}
                      />
                    )}
                  </label>
                ))}

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                    <h3>产品规格</h3>
                    <button
                      className="admin-secondary"
                      onClick={() => specifications.append({ ...newSpecification(), sortOrder: specifications.fields.length })}
                      type="button"
                    >添加规格</button>
                  </div>
                  {specifications.fields.map((specification, index) => (
                    <div key={specification._formId} style={{ alignItems: "end", display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr auto", marginTop: 10 }}>
                      <label>
                        规格名称 {index + 1}
                        <input
                          aria-label={`规格名称 ${index + 1}`}
                          dir={activeLocale === "ar" ? "rtl" : "ltr"}
                          {...register(`specifications.${index}.label.${activeLocale}`)}
                        />
                      </label>
                      <label>
                        规格值 {index + 1}
                        <input
                          aria-label={`规格值 ${index + 1}`}
                          dir={activeLocale === "ar" ? "rtl" : "ltr"}
                          {...register(`specifications.${index}.value.${activeLocale}`)}
                        />
                      </label>
                      <button aria-label={`删除规格 ${index + 1}`} onClick={() => specifications.remove(index)} type="button">删除</button>
                    </div>
                  ))}
                </div>
              </section>

              <ProductImageEditorV2
                images={images}
                locale={activeLocale}
                onChange={(next) => setValue("images", next, { shouldDirty: true, shouldValidate: true })}
              />

              {actionResult && !actionResult.ok ? (
                <p className="admin-message error" role="alert">{actionResult.message}</p>
              ) : null}
              <div style={{ display: "flex", gap: 10, gridColumn: "1 / -1", justifyContent: "flex-end" }}>
                <button className="admin-secondary" onClick={closeDrawer} type="button">取消</button>
                <button className="admin-primary" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "保存中…" : "保存产品"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
