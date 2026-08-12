import path from "node:path";
import { pathToFileURL } from "node:url";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
const PROJECT_ROOT = process.cwd();
const MEDIA_BUCKET = "media";
const FIXED_SECTION_KEYS = ["home", "about", "products", "advantages", "contact"];
const REQUIRED_LOCALES = ["zh", "en", "ar"];
const ADVANTAGE_ICONS = new Set(["layers", "drafting", "package", "message", "quality", "design"]);
const SEEDED_MEDIA = {
  home: "site-content-v1/home/hero-products-placeholder-v1.png",
  about: "site-content-v1/about/company-craft-placeholder-v1.png"
};
const EMAIL_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_{}|~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_{}|~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, code) {
  if (!isRecord(value)) throw new Error(code);
  return value;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasLocalizedText(value) {
  return isRecord(value) && REQUIRED_LOCALES.every((locale) => isNonEmptyString(value[locale]));
}

function hasLocalizedFields(localized, fields) {
  return isRecord(localized) && REQUIRED_LOCALES.every((locale) => {
    const content = localized[locale];
    return isRecord(content) && fields.every((field) => isNonEmptyString(content[field]));
  });
}

function hasUniqueSortOrders(items) {
  const orders = items.map((item) => item?.sortOrder);
  return orders.every((order) => Number.isInteger(order) && order >= 0)
    && new Set(orders).size === orders.length;
}

function validHomeV1(content) {
  if (content.enabled !== true || !hasLocalizedFields(
    content.content,
    ["companyShort", "eyebrow", "title", "text", "cta", "contactCta"]
  )) return false;
  if (!REQUIRED_LOCALES.every((locale) => {
    const nav = content.content[locale].nav;
    return Array.isArray(nav) && nav.length === 4 && nav.every(isNonEmptyString);
  })) return false;
  return isRecord(content.media) && isNonEmptyString(content.media.image)
    && hasLocalizedText(content.media.alt);
}

function validAboutV1(content) {
  if (content.enabled !== true || !hasLocalizedFields(content.content, ["eyebrow", "title", "text"])) {
    return false;
  }
  if (!Array.isArray(content.facts) || content.facts.length < 1 || !hasUniqueSortOrders(content.facts)) {
    return false;
  }
  if (!content.facts.every((fact) => isRecord(fact) && isNonEmptyString(fact.id)
    && hasLocalizedText(fact.value) && hasLocalizedText(fact.label))) return false;
  return isRecord(content.media) && isNonEmptyString(content.media.image)
    && hasLocalizedText(content.media.alt);
}

function validProductsV1(content) {
  return content.enabled === true && hasLocalizedFields(content.content, ["eyebrow", "title", "text"]);
}

function validAdvantagesV1(content) {
  if (content.enabled !== true
    || !hasLocalizedFields(content.content, ["eyebrow", "title", "description"])) return false;
  if (!Array.isArray(content.steps) || content.steps.length < 1 || content.steps.length > 8
    || !hasUniqueSortOrders(content.steps)) return false;
  return content.steps.every((step) => isRecord(step) && isNonEmptyString(step.id)
    && ADVANTAGE_ICONS.has(step.icon) && hasLocalizedText(step.title) && hasLocalizedText(step.text));
}

function validContactV1(content) {
  return content.enabled === true
    && hasLocalizedFields(content.content, ["eyebrow", "title", "companyName", "address"])
    && isRecord(content.shared)
    && isNonEmptyString(content.shared.phone)
    && isNonEmptyString(content.shared.email)
    && EMAIL_PATTERN.test(content.shared.email);
}

function validateSectionContentV1(key, content) {
  const valid = key === "home" ? validHomeV1(content)
    : key === "about" ? validAboutV1(content)
      : key === "products" ? validProductsV1(content)
        : key === "advantages" ? validAdvantagesV1(content)
          : key === "contact" ? validContactV1(content)
            : false;
  if (!valid) throw new Error(`Section content contract is incomplete: ${key}`);
}

async function readAdminStateV1(adminClient) {
  const [sectionsResult, categoriesResult, translationsResult, aclResult] = await Promise.all([
    adminClient
      .from("site_sections")
      .select("key, sort_order, content, media_id, media:media!site_sections_media_id_fkey(id, storage_path, deleted_at)"),
    adminClient
      .from("product_categories")
      .select("id, slug, is_enabled")
      .eq("is_enabled", true),
    adminClient
      .from("product_category_translations")
      .select("category_id, locale, name, description"),
    adminClient.rpc("verify_site_content_setup_v1")
  ]);
  if (sectionsResult.error) throw new Error("site_content_verify_sections_read_failed");
  if (categoriesResult.error) throw new Error("site_content_verify_categories_read_failed");
  if (translationsResult.error) throw new Error("site_content_verify_translations_read_failed");
  if (aclResult.error || typeof aclResult.data !== "boolean") {
    throw new Error("site_content_verify_acl_read_failed");
  }
  if (aclResult.data) throw new Error("Expected public save function execute to be denied");
  return {
    sections: sectionsResult.data,
    categories: categoriesResult.data,
    translations: translationsResult.data,
    saveFunctionPublicExecute: aclResult.data
  };
}

function validateSectionsV1(rows) {
  if (!Array.isArray(rows) || rows.length !== FIXED_SECTION_KEYS.length) {
    throw new Error("Expected five fixed sections");
  }
  const byKey = new Map(rows.map((row) => [row?.key, row]));
  if (byKey.size !== FIXED_SECTION_KEYS.length || FIXED_SECTION_KEYS.some((key) => !byKey.has(key))) {
    throw new Error("Expected five fixed sections");
  }
  const sortOrders = new Set(rows.map((row) => row?.sort_order));
  if (sortOrders.size !== FIXED_SECTION_KEYS.length
    || FIXED_SECTION_KEYS.some((_key, index) => !sortOrders.has(index))) {
    throw new Error("Expected unique section ordering");
  }
  for (const key of FIXED_SECTION_KEYS) {
    const row = byKey.get(key);
    validateSectionContentV1(key, requireRecord(row.content, `Section content contract is incomplete: ${key}`));
  }
  return byKey;
}

function validateCategoriesV1(categories, translations) {
  if (!Array.isArray(categories) || categories.length < 1) {
    throw new Error("Expected at least one enabled category");
  }
  if (!Array.isArray(translations)) throw new Error("Expected three category translations");
  const translationsByCategory = new Map();
  for (const row of translations) {
    if (!isRecord(row) || !isNonEmptyString(row.category_id) || !REQUIRED_LOCALES.includes(row.locale)
      || !isNonEmptyString(row.name) || !isNonEmptyString(row.description)) {
      throw new Error("Expected complete category translations");
    }
    const byLocale = translationsByCategory.get(row.category_id) ?? new Map();
    if (byLocale.has(row.locale)) throw new Error("Expected complete category translations");
    byLocale.set(row.locale, row);
    translationsByCategory.set(row.category_id, byLocale);
  }
  for (const category of categories) {
    if (!isRecord(category) || !isNonEmptyString(category.id) || !isNonEmptyString(category.slug)) {
      throw new Error("Expected complete category translations");
    }
    const byLocale = translationsByCategory.get(category.id);
    if (!byLocale || REQUIRED_LOCALES.some((locale) => !byLocale.has(locale))) {
      throw new Error("Expected complete category translations");
    }
  }
}

async function storageObjectExistsV1(adminClient, storagePath) {
  const folder = path.posix.dirname(storagePath);
  const fileName = path.posix.basename(storagePath);
  const { data, error } = await adminClient.storage.from(MEDIA_BUCKET).list(folder, {
    limit: 100,
    offset: 0,
    search: fileName
  });
  if (error) throw new Error("Expected seeded Storage objects");
  return Array.isArray(data) && data.some((item) => item?.name === fileName);
}

async function validateSeededMediaV1(adminClient, sectionsByKey) {
  for (const key of ["home", "about"]) {
    const row = sectionsByKey.get(key);
    const storagePath = SEEDED_MEDIA[key];
    const publicUrl = adminClient.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath).data?.publicUrl;
    const content = requireRecord(row.content, "Expected seeded section media");
    const contentMedia = requireRecord(content.media, "Expected seeded section media");
    const mediaRow = Array.isArray(row.media) ? row.media[0] : row.media;
    if (!isNonEmptyString(publicUrl) || !isRecord(mediaRow)
      || !isNonEmptyString(row.media_id) || mediaRow.id !== row.media_id
      || mediaRow.deleted_at !== null || mediaRow.storage_path !== publicUrl
      || contentMedia.image !== publicUrl) {
      throw new Error("Expected seeded section media");
    }
    if (!await storageObjectExistsV1(adminClient, storagePath)) {
      throw new Error("Expected seeded Storage objects");
    }
  }
}

function translationLocalesByCategoryV1(rows) {
  const result = new Map();
  if (!Array.isArray(rows)) return result;
  for (const row of rows) {
    const locales = result.get(row?.category_id) ?? new Set();
    locales.add(row?.locale);
    result.set(row?.category_id, locales);
  }
  return result;
}

async function verifyPublicAccessV1(publicClient, enabledCategories) {
  const [sectionsResult, categoriesResult, translationsResult] = await Promise.all([
    publicClient.from("site_sections").select("key"),
    publicClient.from("product_categories").select("id").eq("is_enabled", true),
    publicClient.from("product_category_translations").select("category_id, locale")
  ]);
  const publicSectionKeys = new Set(
    Array.isArray(sectionsResult.data) ? sectionsResult.data.map((row) => row?.key) : []
  );
  const publicRead = !sectionsResult.error && !categoriesResult.error && !translationsResult.error
    && Array.isArray(sectionsResult.data) && sectionsResult.data.length === FIXED_SECTION_KEYS.length
    && publicSectionKeys.size === FIXED_SECTION_KEYS.length
    && FIXED_SECTION_KEYS.every((key) => publicSectionKeys.has(key))
    && Array.isArray(categoriesResult.data) && categoriesResult.data.length === enabledCategories.length;
  if (!publicRead) throw new Error("Expected public site content read access");
  const publicCategoryIds = new Set(categoriesResult.data.map((row) => row?.id));
  const localesByCategory = translationLocalesByCategoryV1(translationsResult.data);
  if (enabledCategories.some((category) => !publicCategoryIds.has(category.id)
    || REQUIRED_LOCALES.some((locale) => !localesByCategory.get(category.id)?.has(locale)))) {
    throw new Error("Expected public category translations for every enabled category");
  }
  return true;
}

export async function verifySiteContentStagingV1({ adminClient, publicClient }) {
  if (!adminClient || !publicClient) throw new Error("site_content_verify_clients_required");
  const state = await readAdminStateV1(adminClient);
  const sectionsByKey = validateSectionsV1(state.sections);
  validateCategoriesV1(state.categories, state.translations);
  await validateSeededMediaV1(adminClient, sectionsByKey);
  const publicRead = await verifyPublicAccessV1(publicClient, state.categories);
  return {
    sections: state.sections.length,
    locales: REQUIRED_LOCALES.join(","),
    enabledCategories: state.categories.length,
    mediaReady: true,
    publicRead,
    saveFunctionPublicExecute: state.saveFunctionPublicExecute
  };
}

export function formatVerificationReportV1(report) {
  return [
    `sections=${Number(report.sections)}`,
    `locales=${report.locales === "zh,en,ar" ? report.locales : ""}`,
    `enabledCategories=${Number(report.enabledCategories)}`,
    `mediaReady=${Boolean(report.mediaReady)}`,
    `publicRead=${Boolean(report.publicRead)}`,
    `saveFunctionPublicExecute=${Boolean(report.saveFunctionPublicExecute)}`
  ];
}

function firstNonEmptyV1(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function resolveVerificationEnvironmentV1(environment = process.env) {
  return {
    url: firstNonEmptyV1(environment.NEXT_PUBLIC_SUPABASE_URL),
    secret: firstNonEmptyV1(environment.SUPABASE_SECRET_KEY, environment.SUPABASE_SERVICE_ROLE_KEY),
    publishable: firstNonEmptyV1(
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  };
}

function createClientsV1() {
  loadEnvConfig(PROJECT_ROOT);
  const { url, secret, publishable } = resolveVerificationEnvironmentV1();
  if (!url || !secret || !publishable) {
    throw new Error("Supabase verification environment is incomplete");
  }
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    adminClient: createClient(url, secret, options),
    publicClient: createClient(url, publishable, options)
  };
}

async function main() {
  const report = await verifySiteContentStagingV1(createClientsV1());
  for (const line of formatVerificationReportV1(report)) console.log(line);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch(() => {
    console.error("site-content-staging-verification-failed");
    process.exitCode = 1;
  });
}
