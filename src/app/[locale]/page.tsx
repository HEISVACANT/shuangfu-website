import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BrandLockupV1 } from "@/components/public/brand-lockup-v1";
import { LanguageSwitcher } from "@/components/public/language-switcher";
import { SiteSectionsV1 } from "@/components/public/site-sections-v1";
import { getCountryOptionsV1 } from "@/lib/country-options-v1";
import { isLocale, type Locale } from "@/lib/i18n";
import {
  adaptCatalogV2ToLegacy,
  groupProductsByCategoryV1,
  listPublishedCatalogForSiteV2
} from "@/lib/products-repository";
import {
  getSectionConfigV1,
  type SiteContentConfigV1,
  type SiteSectionKeyV1
} from "@/lib/site-content-config-v1";
import { getSiteContentConfigV1 } from "@/lib/site-content-repository-v1";

const navigationSectionKeysV1 = ["about", "products", "advantages", "contact"] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const { config } = await getSiteContentConfigV1();
  const home = getSectionConfigV1(config, "home");
  const contact = getSectionConfigV1(config, "contact");
  const homeContent = home.content[locale];
  const contactContent = contact.content[locale];
  const title = `${homeContent.title.replace(/\s*\n\s*/g, " ")} | ${contactContent.companyName}`;
  const description = homeContent.text;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: `${base}/${locale}`,
      languages: {
        "zh-CN": `${base}/zh`,
        en: `${base}/en`,
        ar: `${base}/ar`,
        "x-default": `${base}/en`
      }
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${base}/${locale}`,
      images: [home.media.image || "/images/hero-products-placeholder-v1.png"]
    }
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const [{ config }, catalogV2] = await Promise.all([
    getSiteContentConfigV1(),
    listPublishedCatalogForSiteV2(locale)
  ]);
  const home = getSectionConfigV1(config, "home");
  const contact = getSectionConfigV1(config, "contact");
  const contactContent = contact.content[locale];
  const productsByCategory = groupProductsByCategoryV1(
    getSectionConfigV1(config, "products").categories,
    adaptCatalogV2ToLegacy(catalogV2)
  );
  const navigation = navigationItemsV1(config, locale);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: contactContent.companyName,
    email: contact.shared.email,
    telephone: contact.shared.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: contactContent.address,
      addressCountry: "CN"
    }
  };

  return <>
    <script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      type="application/ld+json"
    />
    <header className="site-header">
      <a
        aria-label={locale === "zh" ? `${home.content.zh.companyShort}首页` : `${home.content[locale].companyShort} home`}
        className="brand"
        href={`/${locale}`}
      >
        <BrandLockupV1 locale={locale} priority />
      </a>
      <nav>
        {navigation.map((item) => <a href={`#${item.key}`} key={item.key}>{item.label}</a>)}
      </nav>
      <LanguageSwitcher locale={locale} />
    </header>
    <main>
      <SiteSectionsV1
        catalogV2={catalogV2}
        config={config}
        countryOptions={getCountryOptionsV1(locale)}
        locale={locale}
        productsByCategory={productsByCategory}
      />
    </main>
    <footer>
      <div className="brand"><BrandLockupV1 locale={locale} /></div>
      <p>© {new Date().getFullYear()} {contactContent.companyName}</p>
      <p className="prelaunch-label">PRE-RELEASE · NOINDEX</p>
    </footer>
  </>;
}

function navigationItemsV1(config: SiteContentConfigV1, locale: Locale) {
  const labelsBySection = Object.fromEntries(
    navigationSectionKeysV1.map((key, index) => [
      key,
      getSectionConfigV1(config, "home").content[locale].nav[index]
    ])
  ) as Record<(typeof navigationSectionKeysV1)[number], string>;

  return config.sections
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .filter((section): section is typeof section & { key: Exclude<SiteSectionKeyV1, "home"> } => section.key !== "home")
    .map((section) => ({ key: section.key, label: labelsBySection[section.key] }));
}
