"use client";

import Image from "next/image";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { Locale } from "@/lib/i18n";
import type {
  LocalizedProductRecordV2,
  LocalizedPublishedCatalogCategoryV2
} from "@/lib/products-repository";

const copy = {
  zh: {
    count: (count: number) => `共 ${count} 款`,
    collapse: "收起",
    view: (name: string) => `查看 ${name}`,
    inquiry: "咨询该产品",
    loadMore: "加载更多",
    noProducts: "该分类暂无已发布产品",
    gallery: "产品配图",
    viewImage: (index: number) => `查看配图 ${index}`,
    code: "产品编号",
    colors: "颜色",
    material: "材质",
    customizationScope: "定制范围"
  },
  en: {
    count: (count: number) => `${count} products`,
    collapse: "Collapse",
    view: (name: string) => `View ${name}`,
    inquiry: "Ask about this product",
    loadMore: "Load more",
    noProducts: "No published products in this category",
    gallery: "Product images",
    viewImage: (index: number) => `View image ${index}`,
    code: "Product code",
    colors: "Colors",
    material: "Material",
    customizationScope: "Customization scope"
  },
  ar: {
    count: (count: number) => `${count} منتجات`,
    collapse: "طي",
    view: (name: string) => `عرض ${name}`,
    inquiry: "استفسر عن هذا المنتج",
    loadMore: "عرض المزيد",
    noProducts: "لا توجد منتجات منشورة في هذه الفئة",
    gallery: "صور المنتج",
    viewImage: (index: number) => `عرض الصورة ${index}`,
    code: "رمز المنتج",
    colors: "الألوان",
    material: "الخامة",
    customizationScope: "نطاق التخصيص"
  }
} satisfies Record<Locale, object>;

function isPublicProduct(product: LocalizedProductRecordV2): boolean {
  return (
    product.status === "published" &&
    product.deletedAt === null &&
    product.category.isEnabled
  );
}

export function ProductCatalog({
  locale,
  categories
}: {
  locale: Locale;
  categories: LocalizedPublishedCatalogCategoryV2[];
}) {
  const labels = copy[locale];
  const [openCategorySlug, setOpenCategorySlug] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const publicCategories = useMemo(
    () =>
      categories
        .filter((category) => category.isEnabled)
        .map((category) => ({
          ...category,
          products: category.products.filter(isPublicProduct)
        })),
    [categories]
  );
  const selectedProduct = publicCategories
    .flatMap((category) => category.products)
    .find((product) => product.id === selectedProductId);

  function toggleCategory(categorySlug: string) {
    setOpenCategorySlug((current) =>
      current === categorySlug ? null : categorySlug
    );
    setSelectedProductId(null);
  }

  return (
    <div className="product-catalog">
      {publicCategories.map((category) => {
        const isOpen = openCategorySlug === category.slug;
        const visibleCount = visibleCounts[category.slug] ?? 12;
        return (
          <section
            className="product-category"
            data-testid="public-product-category"
            key={category.id}
          >
            <button
              aria-expanded={isOpen}
              className="product-category-trigger"
              onClick={() => toggleCategory(category.slug)}
              type="button"
            >
              <span>
                <strong>{category.content.name}</strong>
                <small>{category.content.description}</small>
              </span>
              <span className="product-category-action">
                {labels.count(category.products.length)}
                {isOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
              </span>
            </button>

            {isOpen ? (
              <div className="product-category-content">
                {category.products.length ? (
                  <div className="product-grid">
                    {category.products.slice(0, visibleCount).map((product) => {
                      const primaryImage =
                        product.images.find((image) => image.isPrimary) ??
                        product.images[0];
                      return (
                        <button
                          aria-label={labels.view(product.content.name)}
                          className={
                            selectedProductId === product.id
                              ? "product-card is-selected"
                              : "product-card"
                          }
                          key={product.id}
                          onClick={() => setSelectedProductId(product.id)}
                          type="button"
                        >
                          {primaryImage ? (
                            <Image
                              alt={primaryImage.altText}
                              height={520}
                              src={primaryImage.variants.thumbnail ?? primaryImage.url}
                              unoptimized
                              width={520}
                            />
                          ) : null}
                          <span>{product.content.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p>{labels.noProducts}</p>
                )}

                {visibleCount < category.products.length ? (
                  <button
                    className="button button-ghost load-more"
                    onClick={() =>
                      setVisibleCounts((current) => ({
                        ...current,
                        [category.slug]: (current[category.slug] ?? 12) + 12
                      }))
                    }
                    type="button"
                  >
                    {labels.loadMore}
                  </button>
                ) : null}

                {selectedProduct?.category.slug === category.slug ? (
                  <ProductDetail
                    key={selectedProduct.id}
                    locale={locale}
                    onClose={() => setSelectedProductId(null)}
                    product={selectedProduct}
                  />
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function ProductDetail({
  locale,
  product,
  onClose
}: {
  locale: Locale;
  product: LocalizedProductRecordV2;
  onClose: () => void;
}) {
  const labels = copy[locale];
  const primaryImage =
    product.images.find((image) => image.isPrimary) ?? product.images[0];
  const [selectedImageId, setSelectedImageId] = useState(primaryImage?.id ?? null);
  const selectedImage =
    product.images.find((image) => image.id === selectedImageId) ?? primaryImage;

  return (
    <article className="product-detail">
      <button
        aria-label={labels.collapse}
        className="icon-button product-detail-close"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden />
      </button>
      <div
        className="product-detail-gallery"
        style={{ alignSelf: "start", minWidth: 0 }}
      >
        {selectedImage ? (
          <Image
            alt={selectedImage.altText}
            data-testid="public-product-main-image"
            height={720}
            src={selectedImage.url}
            style={{ height: "auto", objectFit: "cover", width: "100%" }}
            unoptimized
            width={720}
          />
        ) : null}
        {product.images.length > 1 ? (
          <div
            aria-label={labels.gallery}
            style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 10 }}
          >
            {product.images.map((image, index) => (
              <button
                aria-label={labels.viewImage(index + 1)}
                aria-pressed={selectedImage?.id === image.id}
                key={image.id}
                onClick={() => setSelectedImageId(image.id)}
                style={{
                  background: "transparent",
                  border:
                    selectedImage?.id === image.id
                      ? "2px solid #7f2c38"
                      : "1px solid #d8ceca",
                  padding: 2
                }}
                type="button"
              >
                <Image
                  alt=""
                  height={72}
                  src={image.variants.thumbnail ?? image.url}
                  style={{ display: "block", height: 72, objectFit: "cover", width: 72 }}
                  unoptimized
                  width={72}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="product-detail-copy">
        <h3>{product.content.name}</h3>
        <p>{product.content.description}</p>
        <dl>
          <div>
            <dt>{labels.code}</dt>
            <dd dir="ltr">{product.code}</dd>
          </div>
          {product.specifications.map((specification) => (
            <div key={specification.id}>
              <dt>{specification.labelText}</dt>
              <dd>{specification.valueText}</dd>
            </div>
          ))}
          <div>
            <dt>{labels.colors}</dt>
            <dd>{product.content.colors}</dd>
          </div>
          <div>
            <dt>{labels.material}</dt>
            <dd>{product.content.material}</dd>
          </div>
          <div>
            <dt>{labels.customizationScope}</dt>
            <dd>{product.content.customizationScope}</dd>
          </div>
        </dl>
        <a
          className="button button-primary"
          href="#inquiry"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("select-inquiry-product", {
                detail: {
                  productId: product.id,
                  categoryId: product.categoryId,
                  categorySlug: product.category.slug
                }
              })
            );
          }}
        >
          {labels.inquiry}
        </a>
      </div>
    </article>
  );
}
