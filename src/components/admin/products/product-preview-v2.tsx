"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";

import type { Locale } from "@/lib/i18n";
import type {
  ProductImageV2,
  ProductRecordV2,
  ProductStatusV2
} from "@/lib/product-admin-v2";

type ProductPreviewV2Props = {
  product: ProductRecordV2;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
};

const locales = ["zh", "en", "ar"] as const satisfies readonly Locale[];
const localeLabels: Record<Locale, string> = {
  zh: "中文",
  en: "English",
  ar: "العربية"
};
const statusLabels: Record<ProductStatusV2, string> = {
  unpublished: "未发布",
  published: "已发布",
  archived: "已下架"
};

function displayValue(value: string): string {
  return value.trim() || "未填写";
}

function orderedImages(images: ProductImageV2[]): ProductImageV2[] {
  return [...images].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return left.sortOrder - right.sortOrder;
  });
}

export function ProductPreviewV2({
  product,
  onClose,
  returnFocus
}: ProductPreviewV2Props) {
  const images = useMemo(() => orderedImages(product.images), [product.images]);
  const [activeLocale, setActiveLocale] = useState<Locale>("zh");
  const [selectedImageId, setSelectedImageId] = useState(images[0]?.id ?? null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    returnFocus === undefined
      ? typeof document === "undefined" || !(document.activeElement instanceof HTMLElement)
        ? null
        : document.activeElement
      : returnFocus
  );
  const tabRefs = useRef<Record<Locale, HTMLButtonElement | null>>({
    zh: null,
    en: null,
    ar: null
  });

  const selectedImage = images.find((image) => image.id === selectedImageId) ?? images[0];
  const translation = product.translations[activeLocale];

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

  function closePreview() {
    onClose();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePreview();
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

  return (
    <div
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) closePreview();
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
        zIndex: 110
      }}
    >
      <section
        aria-labelledby="product-preview-title"
        aria-modal="true"
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        style={{
          background: "white",
          borderRadius: 18,
          boxShadow: "0 24px 80px rgba(25,17,20,.25)",
          maxHeight: "calc(100vh - 48px)",
          maxWidth: 1040,
          overflowY: "auto",
          padding: 28,
          width: "100%"
        }}
      >
        <header style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" }}>
          <div>
            <p style={{ color: "#876d65", margin: 0 }}>预览实际已填内容</p>
            <h2 id="product-preview-title" style={{ margin: "6px 0 0" }}>
              产品预览 {product.code}
            </h2>
          </div>
          <button aria-label="关闭产品预览" onClick={closePreview} ref={closeRef} type="button">
            关闭
          </button>
        </header>

        <div
          aria-label="预览语言"
          role="tablist"
          style={{ display: "flex", gap: 8, marginTop: 24 }}
        >
          {locales.map((locale) => (
            <button
              aria-controls={`product-preview-panel-${locale}`}
              aria-selected={activeLocale === locale}
              id={`product-preview-tab-${locale}`}
              key={locale}
              onClick={() => selectLocale(locale)}
              onKeyDown={(event) => handleTabKeyDown(event, locale)}
              ref={(element) => {
                tabRefs.current[locale] = element;
              }}
              role="tab"
              tabIndex={activeLocale === locale ? 0 : -1}
              type="button"
            >
              {localeLabels[locale]}
            </button>
          ))}
        </div>

        <div
          aria-labelledby={`product-preview-tab-${activeLocale}`}
          dir={activeLocale === "ar" ? "rtl" : "ltr"}
          id={`product-preview-panel-${activeLocale}`}
          role="tabpanel"
          style={{ display: "grid", gap: 28, gridTemplateColumns: "minmax(280px, .9fr) minmax(300px, 1.1fr)", marginTop: 22 }}
        >
          <div>
            {selectedImage ? (
              <Image
                alt={selectedImage.alt[activeLocale].trim()}
                data-testid="preview-main-image"
                height={720}
                src={selectedImage.url}
                style={{ aspectRatio: "4 / 3", borderRadius: 14, height: "auto", objectFit: "cover", width: "100%" }}
                unoptimized
                width={960}
              />
            ) : (
              <div className="admin-empty" style={{ alignItems: "center", aspectRatio: "4 / 3", display: "flex", justifyContent: "center" }}>
                未填写
              </div>
            )}
            {images.length > 0 ? (
              <div aria-label="产品配图" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                {images.map((image, index) => (
                  <button
                    aria-label={`查看配图 ${index + 1}`}
                    aria-pressed={selectedImage?.id === image.id}
                    key={image.id}
                    onClick={() => setSelectedImageId(image.id)}
                    style={{ border: selectedImage?.id === image.id ? "2px solid #7f2c38" : "1px solid #d8ceca", borderRadius: 10, padding: 3 }}
                    type="button"
                  >
                    <Image
                      alt=""
                      height={72}
                      src={image.variants.thumbnail ?? image.url}
                      style={{ borderRadius: 7, display: "block", height: 72, objectFit: "cover", width: 72 }}
                      unoptimized
                      width={72}
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <dl style={{ display: "grid", gap: 16, margin: 0 }}>
            <div><dt><strong>产品名称</strong></dt><dd style={{ margin: "4px 0 0" }}>{displayValue(translation.name)}</dd></div>
            <div><dt><strong>产品编号</strong></dt><dd style={{ margin: "4px 0 0" }}>{displayValue(product.code)}</dd></div>
            <div><dt><strong>产品分类</strong></dt><dd style={{ margin: "4px 0 0" }}>{displayValue(product.category.translations[activeLocale].name)}</dd></div>
            <div><dt><strong>发布状态</strong></dt><dd style={{ margin: "4px 0 0" }}>{statusLabels[product.status]}</dd></div>
            <div><dt><strong>产品描述</strong></dt><dd style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{displayValue(translation.description)}</dd></div>
            <div>
              <dt><strong>规格</strong></dt>
              <dd style={{ margin: "4px 0 0" }}>
                {product.specifications.length === 0 ? "未填写" : (
                  <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    {[...product.specifications].sort((left, right) => left.sortOrder - right.sortOrder).map((specification) => (
                      <li key={specification.id}>
                        {displayValue(specification.label[activeLocale])}：{displayValue(specification.value[activeLocale])}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div><dt><strong>颜色</strong></dt><dd style={{ margin: "4px 0 0" }}>{displayValue(translation.colors)}</dd></div>
            <div><dt><strong>材质</strong></dt><dd style={{ margin: "4px 0 0" }}>{displayValue(translation.material)}</dd></div>
            <div><dt><strong>定制范围</strong></dt><dd style={{ margin: "4px 0 0" }}>{displayValue(translation.customizationScope)}</dd></div>
          </dl>
        </div>
      </section>
    </div>
  );
}
