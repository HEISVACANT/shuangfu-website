"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import {
  DraftingCompass,
  Layers3,
  Mail,
  MapPin,
  MessageCircleMore,
  PackageCheck,
  Palette,
  Phone,
  ShieldCheck
} from "lucide-react";

import { InquiryForm } from "@/components/public/inquiry-form";
import { ProductCatalog } from "@/components/public/product-catalog";
import type { ProductRecord } from "@/lib/content";
import type { PreviewProductsByCategoryV1 } from "@/lib/page-content-preview-v1";
import {
  type SiteContentConfigV1,
  type SiteSectionV1
} from "@/lib/site-content-config-v1";
import type { Locale } from "@/lib/i18n";
import type { LocalizedPublishedCatalogCategoryV2 } from "@/lib/products-repository";
import styles from "@/components/public/site-sections-v1.module.css";

export type ProductsByCategoryV1 = PreviewProductsByCategoryV1;
export type SiteSectionsCountryOptionV1 = { code: string; name: string };

export function SiteSectionsV1({
  config,
  catalogV2,
  locale,
  productsByCategory,
  countryOptions = previewCountryOptionsV1(locale),
  viewport = "responsive"
}: {
  config: SiteContentConfigV1;
  catalogV2?: LocalizedPublishedCatalogCategoryV2[];
  locale: Locale;
  productsByCategory: ProductsByCategoryV1;
  countryOptions?: readonly SiteSectionsCountryOptionV1[];
  viewport?: "responsive" | "desktop" | "mobile";
}) {
  const productCategories = config.sections.find((section) => section.key === "products")?.categories ?? [];
  const inquiryProducts = deduplicateProductsV1(
    Object.values(productsByCategory).flatMap((products) => products ?? [])
  );
  return (
    <div className={styles.sections} data-testid="site-sections" data-viewport={viewport} dir={locale === "ar" ? "rtl" : "ltr"}>
      {config.sections.toSorted((left, right) => left.sortOrder - right.sortOrder).map((section) => {
        switch (section.key) {
          case "home":
            return <HomeSectionV1 key={section.key} locale={locale} section={section} />;
          case "about":
            return <AboutSectionV1 key={section.key} locale={locale} section={section} />;
          case "products":
            return <ProductsSectionV1 catalogV2={catalogV2} key={section.key} locale={locale} products={inquiryProducts} section={section} />;
          case "advantages":
            return <AdvantagesSectionV1 key={section.key} locale={locale} section={section} />;
          case "contact":
            return <ContactSectionV1 categories={productCategories} countryOptions={countryOptions} key={section.key} locale={locale} products={inquiryProducts} section={section} />;
        }
      })}
    </div>
  );
}

function HomeSectionV1({ section, locale }: SectionPropsV1<"home">) {
  const content = section.content[locale];
  return (
    <SectionFrameV1 className={styles.home} layout={section.layout} sectionKey="home">
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h1>{multilineTitleV1(content.title)}</h1>
        <p className={styles.lead}>{content.text}</p>
        <div className={styles.actions}>
          <a className={styles.primaryButton} href="#products">{content.cta}</a>
          <a className={styles.secondaryButton} href="#inquiry">{content.contactCta}</a>
        </div>
      </div>
      <SectionImageV1 alt={section.media.alt[locale]} image={section.media.image} priority />
    </SectionFrameV1>
  );
}

function AboutSectionV1({ section, locale }: SectionPropsV1<"about">) {
  const content = section.content[locale];
  return (
    <SectionFrameV1 className={styles.about} layout={section.layout} sectionKey="about">
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h2>{content.title}</h2>
        <p className={styles.lead}>{content.text}</p>
        <div className={styles.facts}>
          {section.facts.toSorted(bySortOrderV1).map((fact) => (
            <div key={fact.id}><strong>{fact.value[locale]}</strong><span>{fact.label[locale]}</span></div>
          ))}
        </div>
      </div>
      <SectionImageV1 alt={section.media.alt[locale]} image={section.media.image} />
    </SectionFrameV1>
  );
}

function ProductsSectionV1({ section, locale, products, catalogV2 }: SectionPropsV1<"products"> & {
  products: ProductRecord[];
  catalogV2?: LocalizedPublishedCatalogCategoryV2[];
}) {
  const content = section.content[locale];
  const categories = section.categories.filter((category) => category.enabled).toSorted(bySortOrderV1);
  return (
    <SectionFrameV1 className={styles.products} layout={section.layout} sectionKey="products">
      <header className={styles.heading}>
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h2>{content.title}</h2>
        <p className={styles.lead}>{content.text}</p>
      </header>
      <div className={styles.catalog}>
        <ProductCatalog
          categories={catalogV2 ?? previewCatalogV2(categories, products, locale)}
          locale={locale}
        />
      </div>
    </SectionFrameV1>
  );
}

function AdvantagesSectionV1({ section, locale }: SectionPropsV1<"advantages">) {
  const content = section.content[locale];
  return (
    <SectionFrameV1 className={styles.advantages} layout={section.layout} sectionKey="advantages">
      <header className={styles.heading}>
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h2>{content.title}</h2>
        <p className={styles.lead}>{content.description}</p>
      </header>
      <div className={styles.stepList}>
        {section.steps.toSorted(bySortOrderV1).map((step, index) => {
          const Icon = advantageIconsV1[step.icon];
          return (
            <article className={styles.step} key={step.id}>
              <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
              <Icon aria-hidden="true" />
              <h3>{step.title[locale]}</h3>
              <p>{step.text[locale]}</p>
            </article>
          );
        })}
      </div>
    </SectionFrameV1>
  );
}

function ContactSectionV1({ section, locale, categories, countryOptions, products }: SectionPropsV1<"contact"> & {
  categories: Extract<SiteSectionV1, { key: "products" }>["categories"];
  countryOptions: readonly SiteSectionsCountryOptionV1[];
  products: ProductRecord[];
}) {
  const content = section.content[locale];
  const labels = contactLabelsV1[locale];
  return (
    <SectionFrameV1 className={styles.contact} layout={section.layout} sectionKey="contact">
      <div className={styles.contactInfo}>
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h2>{content.title}</h2>
        <strong>{content.companyName}</strong>
        <dl>
          <div><MapPin aria-hidden="true" /><dt>{labels.address}</dt><dd>{content.address}</dd></div>
          <div><Phone aria-hidden="true" /><dt>{labels.phone}</dt><dd dir="ltr">{section.shared.phone}</dd></div>
          <div><Mail aria-hidden="true" /><dt>{labels.email}</dt><dd dir="ltr">{section.shared.email}</dd></div>
        </dl>
      </div>
      <div className={styles.inquiry} id="inquiry">
        <InquiryForm categories={categories} countryOptions={[...countryOptions]} locale={locale} products={products} />
      </div>
    </SectionFrameV1>
  );
}

function SectionImageV1({ image, alt, priority = false }: { image: string; alt: string; priority?: boolean }) {
  return (
    <figure className={styles.media}>
      {image ? <Image alt={alt} fill priority={priority} sizes="(max-width: 760px) 100vw, 50vw" src={image} unoptimized /> : <span aria-label={alt} role="img" />}
    </figure>
  );
}

function SectionFrameV1({
  children,
  className,
  layout,
  sectionKey
}: {
  children: ReactNode;
  className: string;
  layout: string;
  sectionKey: SiteSectionV1["key"];
}) {
  return (
    <div data-testid="site-section" id={sectionKey}>
      <section className={`${styles.section} ${className} ${sectionKey}`} data-layout={layout} data-testid={`section-${sectionKey}`}>
        {children}
      </section>
    </div>
  );
}

function multilineTitleV1(value: string) {
  return value.split("\n").map((line, index) => <span key={`${index}-${line}`}>{line}</span>);
}

function bySortOrderV1(left: { sortOrder: number }, right: { sortOrder: number }) {
  return left.sortOrder - right.sortOrder;
}

function previewCatalogV2(
  categories: Extract<SiteSectionV1, { key: "products" }>["categories"],
  products: ProductRecord[],
  locale: Locale
): LocalizedPublishedCatalogCategoryV2[] {
  return categories
    .filter((category) => category.enabled)
    .toSorted(bySortOrderV1)
    .map((category) => {
      const categoryV2 = {
        id: category.id,
        slug: category.slug,
        sortOrder: category.sortOrder,
        isEnabled: category.enabled,
        translations: category.translations
      };
      return {
        ...categoryV2,
        content: category.translations[locale],
        products: products
          .filter(
            (product) =>
              product.categoryId === category.id ||
              product.categorySlug === category.slug
          )
          .map((product) => {
            const translations = {
              zh: { ...product.translations.zh, colors: "", material: "", customizationScope: "" },
              en: { ...product.translations.en, colors: "", material: "", customizationScope: "" },
              ar: { ...product.translations.ar, colors: "", material: "", customizationScope: "" }
            };
            return {
              id: product.id,
              slug: product.slug,
              code: product.specifications[0]?.value[locale] ?? product.slug,
              categoryId: category.id,
              status: product.status === "published" ? "published" as const : "unpublished" as const,
              deletedAt: product.deletedAt,
              updatedAt: "",
              category: categoryV2,
              translations,
              content: translations[locale],
              images: product.images.map((image, index) => ({
                ...image,
                mediaId: image.id,
                variants: {},
                isPrimary: index === 0,
                altText: image.alt[locale]
              })),
              specifications: product.specifications.map((specification) => ({
                ...specification,
                labelText: specification.label[locale],
                valueText: specification.value[locale]
              }))
            };
          })
      };
    });
}

type SectionPropsV1<K extends SiteSectionV1["key"]> = {
  section: Extract<SiteSectionV1, { key: K }>;
  locale: Locale;
};

const advantageIconsV1 = {
  layers: Layers3,
  drafting: DraftingCompass,
  package: PackageCheck,
  message: MessageCircleMore,
  quality: ShieldCheck,
  design: Palette
};

const contactLabelsV1 = {
  zh: { address: "地址", phone: "电话", email: "邮箱" },
  en: { address: "Address", phone: "Telephone", email: "Email" },
  ar: { address: "العنوان", phone: "الهاتف", email: "البريد الإلكتروني" }
} satisfies Record<Locale, { address: string; phone: string; email: string }>;

function previewCountryOptionsV1(locale: Locale): SiteSectionsCountryOptionV1[] {
  const displayNames = new Intl.DisplayNames([locale], { type: "region" });
  return ["CN", "US", "GB", "DE", "FR", "AE", "SA", "EG"].map((code) => ({
    code,
    name: displayNames.of(code) ?? code
  }));
}

function deduplicateProductsV1(products: readonly ProductRecord[]) {
  return [...new Map(products.map((product) => [product.id, product])).values()];
}
