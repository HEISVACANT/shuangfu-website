import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const VALID_MODES = new Set(["preflight", "verify"]);
const EXPECTED_ENUM_VALUES = ["unpublished", "published", "archived"];
const EXPECTED_RLS_TABLES = [
  "products",
  "product_translations",
  "product_images",
  "product_specifications",
  "media",
  "product_categories",
  "product_category_translations",
];
const ADMIN_OPENAPI_RPCS = [
  "list_admin_products_v2",
  "get_admin_product_v2",
  "list_product_categories_v2",
];
const PUBLIC_GET_RPCS = ["list_published_catalog_v2", "get_published_product_v2"];
const TABLES = {
  product_categories: {
    key: (row) => String(row.id),
    order: ["id"],
    preflight: ["id", "slug", "sort_order", "is_enabled", "created_at", "updated_at"],
    verify: ["id", "slug", "sort_order", "is_enabled", "created_at", "updated_at"],
    v2: ["id", "slug", "sort_order", "is_enabled", "created_at", "updated_at"],
  },
  product_category_translations: {
    key: (row) => `${row.category_id}|${row.locale}`,
    order: ["category_id", "locale"],
    preflight: ["category_id", "locale", "name", "description"],
    verify: ["category_id", "locale", "name", "description"],
    v2: ["category_id", "locale", "name", "description"],
  },
  products: {
    key: (row) => String(row.id),
    order: ["id"],
    preflight: [
      "id", "slug", "category", "status", "sort_order", "version",
      "deleted_at", "created_at", "updated_at", "code", "category_id", "status_v2",
    ],
    verify: [
      "id", "slug", "category", "status", "sort_order", "version",
      "deleted_at", "created_at", "updated_at", "code", "category_id", "status_v2",
    ],
    v2: ["code", "category_id", "status_v2"],
  },
  product_translations: {
    key: (row) => `${row.product_id}|${row.locale}`,
    order: ["product_id", "locale"],
    preflight: [
      "product_id", "locale", "name", "summary", "description",
      "colors", "material", "customization_scope",
    ],
    verify: [
      "product_id", "locale", "name", "summary", "description",
      "colors", "material", "customization_scope",
    ],
    v2: ["colors", "material", "customization_scope"],
  },
  product_specifications: {
    key: (row) => String(row.id),
    order: ["id"],
    preflight: ["id", "product_id", "label", "value", "sort_order"],
    verify: ["id", "product_id", "label", "value", "sort_order"],
    v2: [],
  },
  product_images: {
    key: (row) => String(row.id),
    order: ["id"],
    preflight: ["id", "product_id", "media_id", "sort_order", "alt_text", "is_primary"],
    verify: ["id", "product_id", "media_id", "sort_order", "alt_text", "is_primary"],
    v2: ["is_primary"],
  },
  media: {
    key: (row) => String(row.id),
    order: ["id"],
    preflight: null,
    verify: ["id", "deleted_at"],
  },
};
const PREFLIGHT_TABLES = Object.keys(TABLES).filter((table) => TABLES[table].preflight);
const VERIFY_TABLES = Object.keys(TABLES);
const DEFAULT_ARTIFACT_PATH = path.join(
  process.cwd(),
  "artifacts/product-catalog-admin-v2.0/preflight-backup-v2.0.json",
);

class VerifierError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VerifierError";
    this.code = code;
  }
}

function assertMode(mode) {
  if (!VALID_MODES.has(mode)) {
    throw new VerifierError("INVALID_MODE", "Mode must be preflight or verify");
  }
}

function isMissingRelation(error) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function safeErrorCode(error) {
  if (typeof error?.code === "string" && /^[A-Z0-9_]{2,32}$/i.test(error.code)) return error.code;
  return "READ_FAILED";
}

function productStatusEnumFromOpenApi(document) {
  const schemas = [document?.components?.schemas, document?.definitions];
  for (const collection of schemas) {
    if (!collection || typeof collection !== "object") continue;
    for (const name of ["product_status", "public.product_status"]) {
      const values = collection[name]?.enum;
      if (Array.isArray(values) && values.every((entry) => typeof entry === "string")) {
        return values;
      }
    }
  }
  return null;
}

function tableColumnsFromOpenApi(document, tableNames) {
  const collections = [document?.definitions, document?.components?.schemas].filter(
    (collection) => collection && typeof collection === "object",
  );
  if (collections.length === 0) return null;
  const tables = {};
  for (const table of tableNames) {
    const schema = collections.map((collection) => collection[table]).find(Boolean);
    if (!schema) {
      tables[table] = { exists: false, columns: [] };
      continue;
    }
    if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) return null;
    tables[table] = { exists: true, columns: Object.keys(schema.properties) };
  }
  return { source: "data-api-openapi", tables };
}

function rpcUrl(apiUrl, name, args) {
  const url = new URL(`${apiUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`);
  for (const [key, value] of Object.entries(args ?? {})) {
    if (value === undefined) continue;
    if (value === null) url.searchParams.set(key, "null");
    else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(key, String(value));
    } else {
      url.searchParams.set(key, JSON.stringify(value));
    }
  }
  return url.toString();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createSupabaseReadTransport({ client, role, apiUrl, apiKey, fetchImpl = fetch }) {
  let openApiDocumentPromise;
  async function readOpenApiDocument() {
    if (!openApiDocumentPromise) {
      openApiDocumentPromise = (async () => {
        try {
          const response = await fetchImpl(`${apiUrl.replace(/\/$/, "")}/rest/v1/`, {
            method: "GET",
            headers: {
              apikey: apiKey,
              authorization: `Bearer ${apiKey}`,
              accept: "application/openapi+json",
            },
          });
          if (!response.ok) return null;
          const document = await response.json();
          return document && typeof document === "object" ? document : null;
        } catch {
          return null;
        }
      })();
    }
    return openApiDocumentPromise;
  }

  return {
    async selectPage({ table, columns, order = [], from, to }) {
      let query = client.from(table).select(columns, { count: "exact" });
      for (const column of order) query = query.order(column, { ascending: true });
      const { data, count, error } = await query.range(from, to);
      if (isMissingRelation(error)) return { exists: false, count: 0, rows: [] };
      if (error) {
        throw new VerifierError(
          safeErrorCode(error),
          `Read-only SELECT failed for ${table}; no credentials or response values were logged`,
        );
      }
      if (!Number.isInteger(count) || count < 0) {
        throw new VerifierError("COUNT_UNAVAILABLE", `Exact count unavailable for ${table}`);
      }
      return { exists: true, count, rows: Array.isArray(data) ? data : [] };
    },

    async callReadOnlyRpcGet(name, args = {}) {
      let response;
      try {
        response = await fetchImpl(rpcUrl(apiUrl, name, args), {
          method: "GET",
          headers: {
            apikey: apiKey,
            authorization: `Bearer ${apiKey}`,
            accept: "application/json",
          },
        });
      } catch {
        return { exists: null, safeGet: false, rows: [], errorCode: "NETWORK_UNAVAILABLE" };
      }
      const body = await safeJson(response);
      if (response.ok) {
        if (!Array.isArray(body)) {
          return {
            exists: true,
            safeGet: true,
            rows: null,
            rawBody: body,
            errorCode: "INVALID_RPC_PAYLOAD",
          };
        }
        return { exists: true, safeGet: true, rows: body, rawBody: body };
      }
      const code = safeErrorCode(body);
      if (response.status === 404 || code === "PGRST202" || code === "42883") {
        return { exists: false, safeGet: true, rows: [], errorCode: code };
      }
      // PostgREST only permits GET for stable/immutable functions. Never retry an unsafe GET as POST.
      return { exists: null, safeGet: false, rows: [], errorCode: code };
    },

    async inspectSchema() {
      const document = await readOpenApiDocument();
      if (!document) {
        return {
          enumValues: null,
          rpcNames: null,
          rlsEnabledTables: null,
          source: "data-api-openapi-unavailable",
        };
      }
      return {
        enumValues: productStatusEnumFromOpenApi(document),
        rpcNames: Object.keys(document?.paths ?? {})
          .filter((entry) => entry.startsWith("/rpc/"))
          .map((entry) => entry.slice("/rpc/".length)),
        // PostgREST does not expose pg_class.relrowsecurity. Never infer this flag from row results.
        rlsEnabledTables: null,
        source: `data-api-openapi-${role}`,
      };
    },

    async inspectTableColumns(tableNames) {
      const document = await readOpenApiDocument();
      return document ? tableColumnsFromOpenApi(document, tableNames) : null;
    },
  };
}

function createDefaultTransports(mode, env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !adminKey) {
    throw new VerifierError(
      "NEEDS_CONTEXT",
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or server-side Supabase key",
    );
  }
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const transport = createSupabaseReadTransport({
    client: createClient(url, adminKey, options),
    role: "admin",
    apiUrl: url,
    apiKey: adminKey,
  });
  if (mode === "preflight") return { transport, publicTransport: null };

  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publicKey) {
    throw new VerifierError(
      "NEEDS_CONTEXT",
      "Missing publishable/anon Supabase key required for public visibility verification",
    );
  }
  return {
    transport,
    publicTransport: createSupabaseReadTransport({
      client: createClient(url, publicKey, options),
      role: "public",
      apiUrl: url,
      apiKey: publicKey,
    }),
  };
}

function projectRow(row, columns) {
  return Object.fromEntries(columns.filter((column) => Object.hasOwn(row, column)).map((column) => [column, row[column]]));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function snapshotDigest(table, rows) {
  const descriptor = TABLES[table];
  const keyedRows = rows.map((row) => ({ key: descriptor.key(row), row })).sort((left, right) => left.key.localeCompare(right.key));
  const keys = keyedRows.map((entry) => entry.key);
  if (new Set(keys).size !== keys.length) {
    throw new VerifierError("PAGINATION_DUPLICATE_KEY", `PAGINATION_DUPLICATE_KEY: duplicate stable key in ${table}`);
  }
  return {
    keys,
    digest: createHash("sha256").update(stableJson(keyedRows)).digest("hex"),
  };
}

async function readCompleteTable(transport, table, pageSize, purpose, selectedColumns) {
  const descriptor = TABLES[table];
  const columns = selectedColumns ?? descriptor[purpose];
  let expectedCount = null;
  let exists = true;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const page = await transport.selectPage({
      table,
      columns: columns.join(","),
      order: descriptor.order,
      from,
      to: from + pageSize - 1,
    });
    if (!page.exists) {
      exists = false;
      expectedCount = 0;
      break;
    }
    if (!Number.isInteger(page.count) || page.count < 0) {
      throw new VerifierError("COUNT_UNAVAILABLE", `Exact count unavailable for ${table}`);
    }
    if (expectedCount === null) expectedCount = page.count;
    if (page.count !== expectedCount) {
      throw new VerifierError(
        "COUNT_CHANGED_DURING_BACKUP",
        `Count changed while paging ${table}; retry the read-only verification`,
      );
    }
    rows.push(...page.rows.map((row) => projectRow(row, columns)));
    if (rows.length >= expectedCount) break;
    if (page.rows.length === 0) {
      throw new VerifierError("PAGINATION_TRUNCATED", `Pagination stopped before ${table} was complete`);
    }
  }

  if (rows.length !== expectedCount) {
    throw new VerifierError(
      "PAGINATION_COUNT_MISMATCH",
      `Read row count does not match the exact count for ${table}`,
    );
  }
  const identity = snapshotDigest(table, rows);
  return { exists, count: expectedCount, rows, ...identity };
}

async function readSnapshot(transport, tableNames, pageSize, purpose, columnSelections) {
  const snapshot = {};
  for (const table of tableNames) {
    snapshot[table] = await readCompleteTable(transport, table, pageSize, purpose, columnSelections?.[table]);
  }
  return snapshot;
}

function assertStableSnapshots(first, second, tableNames) {
  for (const table of tableNames) {
    const before = first[table];
    const after = second[table];
    if (
      before.exists !== after.exists ||
      before.count !== after.count ||
      before.digest !== after.digest ||
      stableJson(before.keys) !== stableJson(after.keys)
    ) {
      throw new VerifierError("SNAPSHOT_CHANGED", `SNAPSHOT_CHANGED: ${table} changed between read-only passes`);
    }
  }
}

async function readStableSnapshot(transport, tableNames, pageSize, purpose, columnSelections) {
  const first = await readSnapshot(transport, tableNames, pageSize, purpose, columnSelections);
  const second = await readSnapshot(transport, tableNames, pageSize, purpose, columnSelections);
  assertStableSnapshots(first, second, tableNames);
  return second;
}

function publicTableShape(snapshot, tableMetadata = {}) {
  return Object.fromEntries(Object.entries(snapshot).map(([table, value]) => [table, {
    exists: value.exists,
    count: value.count,
    rows: value.rows,
    ...(tableMetadata[table] ?? {}),
  }]));
}

function affectedRowsFor(backup, tableNames) {
  const affectedRows = Object.fromEntries(tableNames.map((table) => [table, backup[table].count]));
  affectedRows.total = Object.values(affectedRows).reduce((sum, count) => sum + count, 0);
  return affectedRows;
}

function preflightColumnPlan(inspection) {
  if (!inspection || typeof inspection !== "object" || !inspection.tables || typeof inspection.tables !== "object") {
    throw new VerifierError("NEEDS_CONTEXT", "Data API OpenAPI columns are unavailable; no table SELECT was attempted");
  }
  const selections = {};
  const metadata = {};
  const presentTables = [];
  for (const table of PREFLIGHT_TABLES) {
    const descriptor = TABLES[table];
    const tableSchema = inspection.tables[table];
    if (
      !tableSchema || typeof tableSchema.exists !== "boolean" || !Array.isArray(tableSchema.columns) ||
      tableSchema.columns.some((column) => typeof column !== "string")
    ) {
      throw new VerifierError("NEEDS_CONTEXT", `OpenAPI could not prove the available columns for ${table}`);
    }
    const actualColumns = new Set(tableSchema.columns);
    const selectedColumns = tableSchema.exists
      ? descriptor.preflight.filter((column) => actualColumns.has(column))
      : [];
    const missingExpectedColumns = descriptor.preflight.filter((column) => !actualColumns.has(column));
    if (tableSchema.exists && descriptor.order.some((column) => !selectedColumns.includes(column))) {
      throw new VerifierError(
        "NEEDS_CONTEXT",
        `OpenAPI does not expose the stable pagination key required for ${table}`,
      );
    }
    const presentV2ColumnCount = descriptor.v2.filter((column) => actualColumns.has(column)).length;
    const schemaVariant = !tableSchema.exists
      ? "absent"
      : missingExpectedColumns.length === 0
        ? "full-v2"
        : presentV2ColumnCount === 0
          ? "v1"
          : "partial-v2";
    metadata[table] = {
      selectedColumns,
      missingExpectedColumns,
      schemaVariant,
      schemaSource: inspection.source ?? "data-api-openapi",
    };
    if (tableSchema.exists) {
      presentTables.push(table);
      selections[table] = selectedColumns;
    }
  }
  return { selections, metadata, presentTables };
}

async function runPreflight({ transport, artifactPath, pageSize, now, logger }) {
  if (typeof transport.inspectTableColumns !== "function") {
    throw new VerifierError("NEEDS_CONTEXT", "Data API OpenAPI column inspection is required before preflight SELECT");
  }
  const inspection = await transport.inspectTableColumns(PREFLIGHT_TABLES);
  const plan = preflightColumnPlan(inspection);
  const presentSnapshot = await readStableSnapshot(
    transport,
    plan.presentTables,
    pageSize,
    "preflight",
    plan.selections,
  );
  const stable = Object.fromEntries(PREFLIGHT_TABLES.map((table) => [table, presentSnapshot[table] ?? {
    exists: false,
    count: 0,
    rows: [],
    keys: [],
    digest: snapshotDigest(table, []).digest,
  }]));
  const backup = publicTableShape(stable, plan.metadata);
  const affectedRows = affectedRowsFor(backup, PREFLIGHT_TABLES);
  const report = {
    artifactVersion: "2.0",
    mode: "preflight",
    status: "READY_FOR_MIGRATION_REVIEW",
    generatedAt: now().toISOString(),
    readOnly: true,
    consistency: {
      model: "optimistic-read-only-stable-snapshot",
      databaseTransactionSnapshot: false,
      passes: 2,
      note: "Two complete ordered snapshots matched by stable keys and SHA-256 content digest; this is not a database transaction snapshot",
    },
    affectedRows,
    backup,
    redaction: {
      secrets: "excluded-by-explicit-column-allowlist",
      authUsersAndProfiles: "excluded",
      scope: PREFLIGHT_TABLES,
    },
  };
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(artifactPath, 0o600);
  logger.log(`PREFLIGHT_READY affected_rows=${affectedRows.total}`);
  return report;
}

function countProductStates(products) {
  const counts = { unpublished: 0, published: 0, archived: 0, deleted: 0 };
  for (const product of products) {
    if (Object.hasOwn(counts, product.status_v2)) counts[product.status_v2] += 1;
    if (product.deleted_at != null) counts.deleted += 1;
  }
  return counts;
}

function countCategoryStates(categories) {
  return categories.reduce(
    (counts, category) => {
      counts[category.is_enabled ? "enabled" : "disabled"] += 1;
      return counts;
    },
    { enabled: 0, disabled: 0 },
  );
}

function countOrphans(tables) {
  const productIds = new Set(tables.products.rows.map((row) => row.id));
  const categoryIds = new Set(tables.product_categories.rows.map((row) => row.id));
  const mediaIds = new Set(tables.media.rows.map((row) => row.id));
  const counts = {
    productsWithoutCategory: tables.products.rows.filter((row) => !categoryIds.has(row.category_id)).length,
    categoryTranslationsWithoutCategory: tables.product_category_translations.rows.filter((row) => !categoryIds.has(row.category_id)).length,
    productTranslationsWithoutProduct: tables.product_translations.rows.filter((row) => !productIds.has(row.product_id)).length,
    specificationsWithoutProduct: tables.product_specifications.rows.filter((row) => !productIds.has(row.product_id)).length,
    imagesWithoutProduct: tables.product_images.rows.filter((row) => !productIds.has(row.product_id)).length,
    imagesWithoutMedia: tables.product_images.rows.filter((row) => !mediaIds.has(row.media_id)).length,
  };
  return { counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}

function duplicateCodeCount(products) {
  const frequencies = new Map();
  for (const product of products) {
    const code = typeof product.code === "string" ? product.code.trim().toLocaleLowerCase("en") : "";
    if (code) frequencies.set(code, (frequencies.get(code) ?? 0) + 1);
  }
  return [...frequencies.values()].filter((count) => count > 1).length;
}

function slugIntegrity(products) {
  const frequencies = new Map();
  let missingSlugCount = 0;
  for (const product of products) {
    const slug = typeof product.slug === "string" ? product.slug.trim().toLocaleLowerCase("en") : "";
    if (!slug) {
      missingSlugCount += 1;
      continue;
    }
    frequencies.set(slug, (frequencies.get(slug) ?? 0) + 1);
  }
  return {
    missingSlugCount,
    duplicateSlugCount: [...frequencies.values()].filter((count) => count > 1).length,
  };
}

function imageIntegrity(products, images, media) {
  const liveMediaIds = new Set(media.filter((row) => row.deleted_at == null).map((row) => row.id));
  const liveImages = images.filter((image) => liveMediaIds.has(image.media_id));
  const imagesByProduct = new Map();
  for (const image of liveImages) {
    const group = imagesByProduct.get(image.product_id) ?? [];
    group.push(image);
    imagesByProduct.set(image.product_id, group);
  }
  const imageLimitViolationCount = [...imagesByProduct.values()].filter((group) => group.length > 10).length;
  const invalidPublishedPrimaryImageCount = products.filter((product) => {
    if (product.status_v2 !== "published" || product.deleted_at != null) return false;
    const primaryCount = (imagesByProduct.get(product.id) ?? []).filter((image) => image.is_primary).length;
    return primaryCount !== 1;
  }).length;
  return { imageLimitViolationCount, invalidPublishedPrimaryImageCount };
}

function sortedRowKeys(table, rows) {
  return rows.map((row) => TABLES[table].key(row)).sort();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function expectedPublicRows(adminTables) {
  const enabledCategoryIds = new Set(adminTables.product_categories.rows.filter((row) => row.is_enabled).map((row) => row.id));
  const productRows = adminTables.products.rows.filter(
    (row) => row.status_v2 === "published" && row.deleted_at == null && enabledCategoryIds.has(row.category_id),
  );
  const publicProductIds = new Set(productRows.map((row) => row.id));
  const imageRows = adminTables.product_images.rows.filter((row) => publicProductIds.has(row.product_id));
  const publicMediaIds = new Set(imageRows.map((row) => row.media_id));
  return {
    product_categories: adminTables.product_categories.rows.filter((row) => row.is_enabled),
    product_category_translations: adminTables.product_category_translations.rows.filter((row) => enabledCategoryIds.has(row.category_id)),
    products: productRows,
    product_translations: adminTables.product_translations.rows.filter((row) => publicProductIds.has(row.product_id)),
    product_specifications: adminTables.product_specifications.rows.filter((row) => publicProductIds.has(row.product_id)),
    product_images: imageRows,
    media: adminTables.media.rows.filter((row) => row.deleted_at == null && publicMediaIds.has(row.id)),
  };
}

function visibilityReport(adminTables, publicTables) {
  const expected = expectedPublicRows(adminTables);
  const byTable = {};
  for (const table of EXPECTED_RLS_TABLES) {
    const expectedIds = sortedRowKeys(table, expected[table]);
    const actualIds = sortedRowKeys(table, publicTables[table].rows);
    byTable[table] = {
      expectedCount: expectedIds.length,
      actualCount: actualIds.length,
      unexpectedIds: difference(actualIds, expectedIds),
      missingIds: difference(expectedIds, actualIds),
    };
  }
  return {
    exclusionsVerified: Object.values(byTable).every((result) => result.unexpectedIds.length === 0 && result.missingIds.length === 0),
    unexpectedProductIds: byTable.products.unexpectedIds,
    missingProductIds: byTable.products.missingIds,
    byTable,
  };
}

function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && expected.every((entry) => actual.includes(entry));
}

function unwrapPayloadRows(rows) {
  if (!Array.isArray(rows)) return null;
  const payloads = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("payload" in row)) return null;
    if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
    payloads.push(row.payload);
  }
  return payloads;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function membershipObject(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

function validateCatalogPayloads(payloads, adminTables) {
  const expected = expectedPublicRows(adminTables);
  const expectedCategories = new Map(expected.product_categories.map((category) => [String(category.id), category]));
  const expectedProducts = new Map(expected.products.map((product) => [String(product.id), product]));
  const adminProducts = new Map(adminTables.products.rows.map((product) => [String(product.id), product]));
  const expectedMembership = new Map([...expectedCategories.keys()].map((categoryId) => [categoryId, []]));
  for (const product of expected.products) {
    expectedMembership.get(String(product.category_id))?.push(String(product.id));
  }
  for (const productIds of expectedMembership.values()) productIds.sort();

  const actualMembership = new Map();
  const productsById = new Map();
  let semanticMismatch = false;
  for (const category of payloads) {
    if (
      !category || typeof category !== "object" || Array.isArray(category) ||
      !isNonEmptyString(category.id) || !isNonEmptyString(category.slug) ||
      typeof category.isEnabled !== "boolean" || !Array.isArray(category.products)
    ) {
      return { valid: false, errorCode: "INVALID_RPC_PAYLOAD", expectedMembership, actualMembership, productsById };
    }
    const categoryId = category.id;
    if (actualMembership.has(categoryId)) {
      return { valid: false, errorCode: "INVALID_RPC_PAYLOAD", expectedMembership, actualMembership, productsById };
    }
    const productIds = [];
    actualMembership.set(categoryId, productIds);
    const expectedCategory = expectedCategories.get(categoryId);
    if (!expectedCategory || category.slug !== expectedCategory.slug || category.isEnabled !== true) semanticMismatch = true;

    for (const product of category.products) {
      if (
        !product || typeof product !== "object" || Array.isArray(product) ||
        !isNonEmptyString(product.id) || !isNonEmptyString(product.slug) ||
        !isNonEmptyString(product.categoryId) || !isNonEmptyString(product.status) ||
        !Object.hasOwn(product, "deletedAt") ||
        !product.category || typeof product.category !== "object" || Array.isArray(product.category) ||
        !isNonEmptyString(product.category.id) || typeof product.category.isEnabled !== "boolean"
      ) {
        return { valid: false, errorCode: "INVALID_RPC_PAYLOAD", expectedMembership, actualMembership, productsById };
      }
      if (productsById.has(product.id)) {
        return { valid: false, errorCode: "INVALID_RPC_PAYLOAD", expectedMembership, actualMembership, productsById };
      }
      productsById.set(product.id, product);
      productIds.push(product.id);
      const adminProduct = adminProducts.get(product.id);
      if (
        !adminProduct || !expectedProducts.has(product.id) ||
        product.slug !== adminProduct.slug || product.categoryId !== String(adminProduct.category_id) ||
        product.categoryId !== categoryId || product.category.id !== categoryId ||
        product.status !== "published" || product.deletedAt != null || product.category.isEnabled !== true
      ) {
        semanticMismatch = true;
      }
    }
    productIds.sort();
  }

  if (stableJson(membershipObject(actualMembership)) !== stableJson(membershipObject(expectedMembership))) {
    semanticMismatch = true;
  }
  return {
    valid: !semanticMismatch,
    errorCode: semanticMismatch ? "CATALOG_MEMBERSHIP_MISMATCH" : undefined,
    expectedMembership,
    actualMembership,
    productsById,
  };
}

function detailPayloadMatches(payload, product, catalogProduct) {
  return payload.id === String(product.id) &&
    payload.slug === product.slug &&
    payload.categoryId === String(product.category_id) &&
    catalogProduct?.id === payload.id &&
    catalogProduct?.slug === payload.slug &&
    catalogProduct?.categoryId === payload.categoryId;
}

function isValidDetailPayload(payload) {
  return isNonEmptyString(payload?.id) &&
    isNonEmptyString(payload?.slug) &&
    isNonEmptyString(payload?.categoryId);
}

async function verifyPublicRpc(transport, adminTables) {
  const expected = expectedPublicRows(adminTables);
  const expectedPublicIds = new Set(expected.products.map((row) => String(row.id)));
  const catalogResult = await transport.callReadOnlyRpcGet("list_published_catalog_v2", {});
  const base = {
    safeGetState: catalogResult.safeGet ? "confirmed" : "unknown",
    catalogExists: catalogResult.exists,
    catalogRows: catalogResult.rows,
    catalogMatchesExpected: false,
    detailMatchesExpected: false,
    excludedDetailIsNull: false,
    detailRows: [],
    excludedDetailRows: [],
    detailChecks: [],
    membershipByCategory: { expected: {}, actual: {} },
    failed: false,
    errorCode: catalogResult.errorCode,
  };
  if (!catalogResult.safeGet) return base;
  if (!catalogResult.exists) {
    return { ...base, safeGetState: "confirmed", failed: true, errorCode: catalogResult.errorCode ?? "RPC_NOT_FOUND" };
  }
  const catalogPayloads = unwrapPayloadRows(catalogResult.rows);
  const catalogValidation = catalogPayloads
    ? validateCatalogPayloads(catalogPayloads, adminTables)
    : { ...validateCatalogPayloads([], adminTables), valid: false, errorCode: "INVALID_RPC_PAYLOAD" };
  const membershipByCategory = {
    expected: membershipObject(catalogValidation.expectedMembership),
    actual: membershipObject(catalogValidation.actualMembership),
  };

  const productsWithSlugs = adminTables.products.rows.filter((product) => isNonEmptyString(product.slug));
  const detailTargets = productsWithSlugs.length > 0
    ? productsWithSlugs
    : [{ id: null, slug: "__product_catalog_v2_verification_missing__", category_id: null }];
  const detailChecks = [];
  let safeGetState = "confirmed";
  let errorCode = catalogValidation.errorCode;
  let definitiveDetailFailure = false;
  for (const product of detailTargets) {
    const expectedPublic = product.id != null && expectedPublicIds.has(String(product.id));
    const result = await transport.callReadOnlyRpcGet("get_published_product_v2", { p_slug: product.slug });
    const payloads = unwrapPayloadRows(result.rows);
    let passed = false;
    let checkErrorCode;
    if (!result.safeGet) {
      safeGetState = "unknown";
      checkErrorCode = result.errorCode ?? "SAFE_GET_UNAVAILABLE";
    } else if (!result.exists) {
      checkErrorCode = result.errorCode ?? "RPC_NOT_FOUND";
      definitiveDetailFailure = true;
    } else if (!payloads) {
      checkErrorCode = "INVALID_RPC_PAYLOAD";
      definitiveDetailFailure = true;
    } else if (expectedPublic) {
      if (payloads.length !== 1) {
        checkErrorCode = payloads.length > 1 ? "INVALID_RPC_PAYLOAD" : "DETAIL_MISMATCH";
        definitiveDetailFailure = true;
      } else if (!isValidDetailPayload(payloads[0])) {
        checkErrorCode = "INVALID_RPC_PAYLOAD";
        definitiveDetailFailure = true;
      } else if (!detailPayloadMatches(payloads[0], product, catalogValidation.productsById.get(String(product.id)))) {
        checkErrorCode = "DETAIL_MISMATCH";
        definitiveDetailFailure = true;
      } else {
        passed = true;
      }
    } else if (payloads.length !== 0) {
      checkErrorCode = payloads.every(isValidDetailPayload) ? "NONPUBLIC_DETAIL_LEAK" : "INVALID_RPC_PAYLOAD";
      definitiveDetailFailure = true;
    } else {
      passed = true;
    }
    if (!errorCode && checkErrorCode) errorCode = checkErrorCode;
    detailChecks.push({
      productId: product.id == null ? null : String(product.id),
      slug: product.slug,
      categoryId: product.category_id == null ? null : String(product.category_id),
      expectedPublic,
      rows: result.rows,
      passed,
      errorCode: checkErrorCode,
    });
  }

  const publicChecks = detailChecks.filter((check) => check.expectedPublic);
  const excludedChecks = detailChecks.filter((check) => !check.expectedPublic);
  const detailMatchesExpected = detailChecks.every((check) => check.passed);
  const excludedDetailIsNull = excludedChecks.every((check) => check.passed);
  return {
    safeGetState,
    catalogExists: catalogResult.exists,
    catalogRows: catalogResult.rows,
    catalogMatchesExpected: catalogValidation.valid,
    membershipByCategory,
    detailRows: publicChecks[0]?.rows ?? [],
    detailMatchesExpected,
    excludedDetailRows: excludedChecks[0]?.rows ?? [],
    excludedDetailIsNull,
    detailChecks,
    failed: !catalogValidation.valid || definitiveDetailFailure,
    errorCode,
  };
}

async function runVerify({ transport, publicTransport, pageSize, now, logger }) {
  if (!publicTransport) throw new VerifierError("NEEDS_CONTEXT", "Public Supabase reader is required for verify mode");
  const adminTables = await readStableSnapshot(transport, VERIFY_TABLES, pageSize, "verify");
  const publicTables = await readStableSnapshot(publicTransport, VERIFY_TABLES, pageSize, "verify");
  const metadata = typeof transport.inspectSchema === "function"
    ? await transport.inspectSchema()
    : { enumValues: null, rpcNames: null, rlsEnabledTables: null, source: "unavailable" };
  const enumState = metadata.enumValues == null
    ? "unknown"
    : sameMembers(metadata.enumValues, EXPECTED_ENUM_VALUES) ? "confirmed" : "failed";
  const rlsEnabledState = metadata.rlsEnabledTables == null
    ? "unknown"
    : EXPECTED_RLS_TABLES.every((table) => metadata.rlsEnabledTables.includes(table)) ? "confirmed" : "failed";
  const adminRpcMetadataState = metadata.rpcNames == null
    ? "unknown"
    : ADMIN_OPENAPI_RPCS.every((name) => metadata.rpcNames.includes(name)) ? "confirmed" : "failed";
  const adminRpcExistence = Object.fromEntries(ADMIN_OPENAPI_RPCS.map((name) => [name, metadata.rpcNames?.includes(name) ?? null]));
  const publicRpc = await verifyPublicRpc(transport, adminTables);

  const orphans = countOrphans(adminTables);
  const integrity = {
    orphanCount: orphans.total,
    orphanCounts: orphans.counts,
    duplicateCodeCount: duplicateCodeCount(adminTables.products.rows),
    ...slugIntegrity(adminTables.products.rows),
    ...imageIntegrity(adminTables.products.rows, adminTables.product_images.rows, adminTables.media.rows),
  };
  const publicVisibility = visibilityReport(adminTables, publicTables);
  const schemaCounts = Object.fromEntries(VERIFY_TABLES.map((table) => [table, {
    exists: adminTables[table].exists,
    count: adminTables[table].count,
  }]));
  const missingTables = Object.entries(schemaCounts).filter(([, value]) => !value.exists).map(([table]) => table);
  const schemaFailure = [enumState, rlsEnabledState, adminRpcMetadataState].includes("failed") || missingTables.length > 0;
  const metadataUnknown = [enumState, rlsEnabledState, adminRpcMetadataState].includes("unknown");
  const publicRpcFailure = publicRpc.failed;
  const publicRpcUnknown = publicRpc.safeGetState === "unknown" || publicRpc.catalogExists == null;
  const integrityFailure =
    integrity.orphanCount > 0 || integrity.duplicateCodeCount > 0 ||
    integrity.missingSlugCount > 0 || integrity.duplicateSlugCount > 0 ||
    integrity.imageLimitViolationCount > 0 || integrity.invalidPublishedPrimaryImageCount > 0;
  const failed = schemaFailure || publicRpcFailure || integrityFailure || !publicVisibility.exclusionsVerified;
  const status = failed ? "FAILED" : metadataUnknown || publicRpcUnknown ? "NEEDS_CONTEXT" : "VERIFIED";
  const report = {
    artifactVersion: "2.0",
    mode: "verify",
    status,
    generatedAt: now().toISOString(),
    readOnly: true,
    consistency: {
      model: "optimistic-read-only-stable-snapshot",
      databaseTransactionSnapshot: false,
      passes: 2,
    },
    schemaCounts,
    schema: {
      enumValues: metadata.enumValues,
      enumState,
      adminRpcExistence,
      adminRpcMetadataState,
      publicGetRpcs: PUBLIC_GET_RPCS,
      rlsEnabledState,
      metadataSource: metadata.source,
      note: rlsEnabledState === "unknown"
        ? "Exact pg_class.relrowsecurity state is not exposed by the Data API and was not inferred"
        : undefined,
    },
    stateCounts: {
      products: countProductStates(adminTables.products.rows),
      categories: countCategoryStates(adminTables.product_categories.rows),
    },
    integrity,
    publicVisibility,
    publicRpc,
    redaction: { secrets: "excluded", authUsersAndProfiles: "excluded" },
  };
  logger.log(`VERIFY_${status} products=${schemaCounts.products.count}`);
  return report;
}

export async function runProductCatalogVerification({
  mode,
  transport,
  publicTransport,
  artifactPath = DEFAULT_ARTIFACT_PATH,
  pageSize = 500,
  env = process.env,
  now = () => new Date(),
  logger = console,
} = {}) {
  assertMode(mode);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new VerifierError("INVALID_PAGE_SIZE", "pageSize must be an integer between 1 and 1000");
  }
  if (!transport) {
    const defaults = createDefaultTransports(mode, env);
    transport = defaults.transport;
    publicTransport = defaults.publicTransport;
  }
  if (mode === "preflight") return runPreflight({ transport, artifactPath, pageSize, now, logger });
  return runVerify({ transport, publicTransport, pageSize, now, logger });
}

export async function main(argv = process.argv.slice(2)) {
  return runProductCatalogVerification({ mode: argv[0] });
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof VerifierError ? error.code : "UNEXPECTED_FAILURE";
    console.error(`PRODUCT_CATALOG_V2_VERIFIER_${code}`);
    process.exitCode = 1;
  });
}
