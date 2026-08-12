import "server-only";

import {
  defaultSiteContentConfigV1,
  type ProductCategoryV1,
  siteContentConfigSchemaV1,
  type SiteContentConfigV1,
  type SiteSectionKeyV1
} from "@/lib/site-content-config-v1";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase/admin";

type SiteContentTableV1 =
  | "site_sections"
  | "product_categories"
  | "product_category_translations";

export interface SiteContentSupabaseQueryResultV1 {
  data: unknown;
  error: unknown;
}

export interface SiteContentSupabaseClientV1 {
  from(table: SiteContentTableV1): {
    select(columns: string): PromiseLike<SiteContentSupabaseQueryResultV1>;
  };
}

export interface SiteContentRepositoryDepsV1 {
  client?: SiteContentSupabaseClientV1;
}

export interface SiteContentBaselineV1 {
  sections: Array<{ key: SiteSectionKeyV1; updatedAt: string }>;
}

export interface SiteContentLoadResultV1 {
  config: SiteContentConfigV1;
  baseline: SiteContentBaselineV1;
  source: "supabase" | "fallback";
}

export class SiteContentRepositoryErrorV1 extends Error {
  readonly code = "PRODUCT_CATEGORIES_READ_FAILED";

  constructor() {
    super("Unable to read product categories.");
    this.name = "SiteContentRepositoryErrorV1";
  }
}

const fallbackResultV1: SiteContentLoadResultV1 = {
  config: defaultSiteContentConfigV1,
  baseline: { sections: [] },
  source: "fallback"
};

export async function getSiteContentConfigV1(
  deps: SiteContentRepositoryDepsV1 = {}
): Promise<SiteContentLoadResultV1> {
  if (!deps.client && !hasSupabaseAdminConfig()) return fallbackResultV1;

  try {
    const client = deps.client ?? (createSupabaseAdminClient() as unknown as SiteContentSupabaseClientV1);
    return {
      ...await readAndParseSiteContentV1(client),
      source: "supabase"
    };
  } catch (error) {
    console.error("site_content_read_failed", normalizeRepositoryError(error));
    return fallbackResultV1;
  }
}

export async function listProductCategoriesV1(
  input: { includeDisabled: boolean },
  deps: SiteContentRepositoryDepsV1 = {}
): Promise<ProductCategoryV1[]> {
  if (!deps.client && !hasSupabaseAdminConfig()) {
    return filterProductCategoriesV1(defaultProductCategoriesV1(), input.includeDisabled);
  }

  try {
    const client = deps.client ?? (createSupabaseAdminClient() as unknown as SiteContentSupabaseClientV1);
    const categories = await readProductCategoriesV1(client);
    return filterProductCategoriesV1(categories, input.includeDisabled);
  } catch (error) {
    console.error("product_categories_read_failed", normalizeRepositoryError(error));
    throw new SiteContentRepositoryErrorV1();
  }
}

async function readAndParseSiteContentV1(client: SiteContentSupabaseClientV1): Promise<{
  config: SiteContentConfigV1;
  baseline: SiteContentBaselineV1;
}> {
  const [sectionRows, categoryRows, translationRows] = await Promise.all([
    readRowsV1(
      client,
      "site_sections",
      "key, sort_order, layout_key, content, media_id, updated_at"
    ),
    readRowsV1(
      client,
      "product_categories",
      "id, slug, sort_order, is_enabled, products(count)"
    ),
    readRowsV1(
      client,
      "product_category_translations",
      "category_id, locale, name, description"
    )
  ]);

  if (sectionRows.length === 0) throw new Error("site_sections_empty");
  const categories = parseProductCategoriesV1(categoryRows, translationRows);
  const sections = sectionRows
    .map(parseSectionRowV1)
    .sort((left, right) =>
      Number(left.sortOrder) - Number(right.sortOrder) || String(left.key).localeCompare(String(right.key))
    );
  const products = sections.find((section) => section.key === "products");
  if (!products) throw new Error("products_section_missing");
  products.categories = categories;
  const config = siteContentConfigSchemaV1.parse({ sections });
  const baseline = {
    sections: sectionRows
      .map((row) => ({
        section: parseBaselineSectionV1(row),
        sortOrder: requireRecordV1(row, "site_section_row_invalid").sort_order
      }))
      .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder))
      .map(({ section }) => section)
  } satisfies SiteContentBaselineV1;
  return { config, baseline };
}

async function readProductCategoriesV1(client: SiteContentSupabaseClientV1): Promise<ProductCategoryV1[]> {
  const [categoryRows, translationRows] = await Promise.all([
    readRowsV1(client, "product_categories", "id, slug, sort_order, is_enabled, products(count)"),
    readRowsV1(client, "product_category_translations", "category_id, locale, name, description")
  ]);
  return parseProductCategoriesV1(categoryRows, translationRows);
}

async function readRowsV1(
  client: SiteContentSupabaseClientV1,
  table: SiteContentTableV1,
  columns: string
): Promise<unknown[]> {
  const { data, error } = await client.from(table).select(columns);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error(`${table}_rows_invalid`);
  return data;
}

function parseSectionRowV1(row: unknown) {
  const record = requireRecordV1(row, "site_section_row_invalid");
  const content = requireRecordV1(record.content, "site_section_content_invalid");
  const section = {
    ...content,
    key: record.key,
    sortOrder: record.sort_order,
    layout: record.layout_key
  } as Record<string, unknown>;
  if ("media" in section) {
    section.media = {
      ...requireRecordV1(section.media, "site_section_media_invalid"),
      mediaId: record.media_id ?? null
    };
  }
  return section;
}

function parseBaselineSectionV1(row: unknown): { key: SiteSectionKeyV1; updatedAt: string } {
  const record = requireRecordV1(row, "site_section_row_invalid");
  if (!isSectionKeyV1(record.key)) throw new Error("site_section_key_invalid");
  if (typeof record.updated_at !== "string") throw new Error("site_section_updated_at_invalid");
  const timestamp = new Date(record.updated_at);
  if (Number.isNaN(timestamp.getTime())) throw new Error("site_section_updated_at_invalid");
  return { key: record.key, updatedAt: record.updated_at };
}

function parseProductCategoriesV1(categoryRows: unknown[], translationRows: unknown[]): ProductCategoryV1[] {
  const translationsByCategory = new Map<string, Record<string, unknown>>();
  for (const row of translationRows) {
    const translation = requireRecordV1(row, "product_category_translation_invalid");
    if (typeof translation.category_id !== "string" || typeof translation.locale !== "string") {
      throw new Error("product_category_translation_identity_invalid");
    }
    const existing = translationsByCategory.get(translation.category_id) ?? {};
    if (translation.locale in existing) throw new Error("product_category_translation_duplicate");
    existing[translation.locale] = {
      name: translation.name,
      description: translation.description
    };
    translationsByCategory.set(translation.category_id, existing);
  }

  const categories = categoryRows
    .map((row) => {
      const category = requireRecordV1(row, "product_category_row_invalid");
      if (typeof category.id !== "string") throw new Error("product_category_id_invalid");
      return {
        id: category.id,
        slug: category.slug,
        enabled: category.is_enabled,
        sortOrder: category.sort_order,
        productReferenceCount: productReferenceCountV1(category),
        translations: translationsByCategory.get(category.id)
      };
    })
    .sort((left, right) =>
      Number(left.sortOrder) - Number(right.sortOrder) || String(left.slug).localeCompare(String(right.slug))
    );
  const config = structuredClone(defaultSiteContentConfigV1);
  const products = config.sections.find((section) => section.key === "products");
  if (!products) throw new Error("products_section_missing");
  products.categories = categories as never;
  return siteContentConfigSchemaV1.parse(config).sections.find((section) => section.key === "products")!.categories;
}

function productReferenceCountV1(category: Record<string, unknown>): unknown {
  if (typeof category.product_reference_count === "number") return category.product_reference_count;
  const products = category.products;
  const count = Array.isArray(products) ? products[0]?.count : requireOptionalRecordV1(products)?.count;
  return count ?? 0;
}

function defaultProductCategoriesV1(): ProductCategoryV1[] {
  const products = defaultSiteContentConfigV1.sections.find((section) => section.key === "products");
  return products ? products.categories : [];
}

function filterProductCategoriesV1(categories: ProductCategoryV1[], includeDisabled: boolean) {
  return categories
    .filter((category) => includeDisabled || category.enabled)
    .toSorted((left, right) => left.sortOrder - right.sortOrder || left.slug.localeCompare(right.slug));
}

function requireRecordV1(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireOptionalRecordV1(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isSectionKeyV1(value: unknown): value is SiteSectionKeyV1 {
  return value === "home" || value === "about" || value === "products" || value === "advantages" || value === "contact";
}

export function normalizeRepositoryError(error: unknown) {
  const record = requireOptionalRecordV1(error);
  const code = typeof record?.code === "string" ? sanitizeErrorFieldV1(record.code) : undefined;
  const name = error instanceof Error
    ? sanitizeErrorFieldV1(error.name)
    : typeof record?.name === "string"
      ? sanitizeErrorFieldV1(record.name)
      : record ? "SupabaseError" : "RepositoryError";
  const message = error instanceof Error
    ? error.message
    : typeof record?.message === "string"
      ? record.message
      : "unknown_error";
  return {
    ...(code ? { code } : {}),
    name,
    message: redactSensitiveValuesV1(message).slice(0, 200)
  };
}

function sanitizeErrorFieldV1(value: string) {
  return redactSensitiveValuesV1(value).replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80) || "RepositoryError";
}

function redactSensitiveValuesV1(message: string) {
  return message
    .replace(quotedSensitiveValuePatternV1, '$1"[redacted]"')
    .replace(/\b(bearer)\s+\S+/gi, "$1 [redacted]")
    .replace(unquotedSensitiveValuePatternV1, "$1[redacted]");
}

const credentialFieldPatternV1 =
  "(?:[a-z0-9_-]*)(?:service[_ -]?role[_ -]?key|access[_ -]?token|auth[_ -]?token|refresh[_ -]?token|api[_ -]?key|secret[_ -]?key|password|token|secret)";
const quotedSensitiveValuePatternV1 = new RegExp(
  `((["'])${credentialFieldPatternV1}\\2\\s*:\\s*)(["'])(?:\\\\.|[\\s\\S])*?\\3`,
  "gi"
);
const unquotedSensitiveValuePatternV1 = new RegExp(
  `(\\b${credentialFieldPatternV1}\\b\\s*(?:=|:)\\s*)[^\\r\\n;,]*`,
  "gi"
);
