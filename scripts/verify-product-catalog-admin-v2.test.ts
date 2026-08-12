import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

// The verifier is an executable ESM artifact and intentionally has no TypeScript declarations.
// @ts-expect-error Runtime script module has no declaration file.
import { createSupabaseReadTransport, runProductCatalogVerification } from "./verify-product-catalog-admin-v2.mjs";

type Row = Record<string, unknown>;
type ReadCall = {
  operation: "select" | "rpc-get";
  role: "admin" | "public";
  table?: string;
  columns?: string;
  from?: number;
  to?: number;
  name?: string;
  args?: Record<string, unknown>;
};
type RpcResult = {
  safeGet?: boolean;
  exists?: boolean | null;
  rows?: Row[] | null;
  rawBody?: unknown;
  errorCode?: string;
};

const FULL_PREFLIGHT_COLUMNS = {
  product_categories: ["id", "slug", "sort_order", "is_enabled", "created_at", "updated_at"],
  product_category_translations: ["category_id", "locale", "name", "description"],
  products: [
    "id", "slug", "category", "status", "sort_order", "version",
    "deleted_at", "created_at", "updated_at", "code", "category_id", "status_v2",
  ],
  product_translations: [
    "product_id", "locale", "name", "summary", "description",
    "colors", "material", "customization_scope",
  ],
  product_specifications: ["id", "product_id", "label", "value", "sort_order"],
  product_images: ["id", "product_id", "media_id", "sort_order", "alt_text", "is_primary"],
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryArtifactPath() {
  const root = await mkdtemp(path.join(os.tmpdir(), "product-catalog-v2-verifier-"));
  temporaryRoots.push(root);
  return path.join(root, "preflight-backup-v2.0.json");
}

function sequenceRows(value: Row[] | Row[][], pass: number) {
  if (!Array.isArray(value[0])) return value as Row[];
  const snapshots = value as Row[][];
  return snapshots[Math.min(pass, snapshots.length - 1)];
}

function createTransport(
  role: "admin" | "public",
  tables: Record<string, Row[] | Row[][]>,
  calls: ReadCall[],
  rpcResults: Record<string, RpcResult | ((args: Record<string, unknown>) => RpcResult)> = {},
  schema = {
    enumValues: ["unpublished", "published", "archived"],
    rpcNames: [
      "list_admin_products_v2",
      "get_admin_product_v2",
      "list_product_categories_v2",
      "list_published_catalog_v2",
      "get_published_product_v2",
    ],
    rlsEnabledTables: [
      "products",
      "product_translations",
      "product_images",
      "product_specifications",
      "media",
      "product_categories",
      "product_category_translations",
    ],
    source: "test-read-only-inspector",
    tableColumns: FULL_PREFLIGHT_COLUMNS,
  } as {
    enumValues: string[] | null;
    rpcNames: string[] | null;
    rlsEnabledTables: string[] | null;
    source: string;
    tableColumns: Record<string, string[]> | null;
  },
) {
  const passes = new Map<string, number>();
  const activeRows = new Map<string, Row[]>();
  return {
    async selectPage({ table, columns, from, to }: { table: string; columns: string; from: number; to: number }) {
      calls.push({ operation: "select", role, table, columns, from, to });
      if (!(table in tables)) return { exists: false, count: 0, rows: [] };
      if (from === 0) {
        const pass = passes.get(table) ?? 0;
        activeRows.set(table, sequenceRows(tables[table], pass));
        passes.set(table, pass + 1);
      }
      const rows = activeRows.get(table) ?? [];
      return { exists: true, count: rows.length, rows: rows.slice(from, to + 1) };
    },
    async callReadOnlyRpcGet(name: string, args: Record<string, unknown>) {
      calls.push({ operation: "rpc-get", role, name, args });
      const configured = rpcResults[name];
      const result = typeof configured === "function"
        ? configured(args)
        : configured ?? { exists: false, safeGet: true, rows: [] };
      return {
        exists: result.exists ?? true,
        safeGet: result.safeGet ?? true,
        rows: result.rows === undefined ? [] : result.rows,
        rawBody: result.rawBody,
        errorCode: result.errorCode,
      };
    },
    async inspectSchema() {
      return schema;
    },
    async inspectTableColumns(tableNames: string[]) {
      if (schema.tableColumns == null) return null;
      return {
        source: schema.source,
        tables: Object.fromEntries(tableNames.map((table) => [table, {
          exists: Object.hasOwn(schema.tableColumns as Record<string, string[]>, table),
          columns: schema.tableColumns?.[table] ?? [],
        }])),
      };
    },
  };
}

function emptyPreflightTables(): Record<string, Row[] | Row[][]> {
  return {
    product_categories: [],
    product_category_translations: [],
    products: [],
    product_translations: [],
    product_specifications: [],
    product_images: [],
  };
}

function schemaWithTableColumns(tableColumns: Record<string, string[]> | null) {
  return {
    enumValues: ["unpublished", "published", "archived"],
    rpcNames: [
      "list_admin_products_v2", "get_admin_product_v2", "list_product_categories_v2",
      "list_published_catalog_v2", "get_published_product_v2",
    ],
    rlsEnabledTables: [
      "products", "product_translations", "product_images", "product_specifications",
      "media", "product_categories", "product_category_translations",
    ],
    source: tableColumns == null ? "data-api-openapi-unavailable" : "test-read-only-inspector",
    tableColumns,
  };
}

function completeVerificationFixture() {
  const categories = [
    { id: "enabled-a", slug: "bra-pads", is_enabled: true },
    { id: "enabled-b", slug: "cups", is_enabled: true },
    { id: "disabled", slug: "legacy", is_enabled: false },
  ];
  const products = [
    { id: "public-a", slug: "public-a", code: "PUB-A", category_id: "enabled-a", status_v2: "published", deleted_at: null },
    { id: "public-b", slug: "public-b", code: "PUB-B", category_id: "enabled-b", status_v2: "published", deleted_at: null },
    { id: "draft", slug: "draft", code: "DRAFT", category_id: "enabled-a", status_v2: "unpublished", deleted_at: null },
    { id: "archived", slug: "archived", code: "ARCH", category_id: "enabled-a", status_v2: "archived", deleted_at: null },
    { id: "deleted", slug: "deleted", code: "DEL", category_id: "enabled-a", status_v2: "published", deleted_at: "2026-01-01T00:00:00Z" },
    { id: "disabled-product", slug: "disabled-product", code: "DIS", category_id: "disabled", status_v2: "published", deleted_at: null },
  ];
  const payloadFor = (product: Row) => ({
    id: product.id,
    slug: product.slug,
    categoryId: product.category_id,
    status: product.status_v2,
    deletedAt: product.deleted_at,
    category: {
      id: product.category_id,
      isEnabled: product.category_id !== "disabled",
    },
  });
  const publicPayloads = [payloadFor(products[0]), payloadFor(products[1])];
  const adminTables = {
    product_categories: categories,
    product_category_translations: [],
    products,
    product_translations: [],
    product_specifications: [],
    product_images: [
      { id: "image-a", product_id: "public-a", media_id: "media-a", is_primary: true },
      { id: "image-b", product_id: "public-b", media_id: "media-b", is_primary: true },
      { id: "image-disabled", product_id: "disabled-product", media_id: "media-disabled", is_primary: true },
      { id: "image-deleted-media", product_id: "public-a", media_id: "deleted-media", is_primary: true },
    ],
    media: [
      { id: "media-a", deleted_at: null },
      { id: "media-b", deleted_at: null },
      { id: "media-disabled", deleted_at: null },
      { id: "deleted-media", deleted_at: "2026-01-01T00:00:00Z" },
    ],
  };
  const publicTables = {
    product_categories: categories.slice(0, 2),
    product_category_translations: [],
    products: products.slice(0, 2),
    product_translations: [],
    product_specifications: [],
    product_images: [adminTables.product_images[0], adminTables.product_images[1], adminTables.product_images[3]],
    media: [adminTables.media[0], adminTables.media[1]],
  };
  const catalogRows = [
    { payload: { id: "enabled-a", slug: "bra-pads", isEnabled: true, products: [publicPayloads[0]] } },
    { payload: { id: "enabled-b", slug: "cups", isEnabled: true, products: [publicPayloads[1]] } },
  ];
  const rpcResults = {
    list_published_catalog_v2: { rows: catalogRows },
    get_published_product_v2: (args: Record<string, unknown>) => {
      const index = products.findIndex((product) => product.slug === args.p_slug);
      return { rows: index >= 0 && index < 2 ? [{ payload: publicPayloads[index] }] : [] };
    },
  };
  return { adminTables, publicTables, products, publicPayloads, catalogRows, rpcResults, payloadFor };
}

describe("product catalog admin V2 verifier contract", () => {
  it("rejects every mode except preflight and verify", async () => {
    await expect(
      runProductCatalogVerification({ mode: "apply", transport: createTransport("admin", {}, []) }),
    ).rejects.toThrow("Mode must be preflight or verify");
  });

  it("writes a complete 0600 optimistic backup from two stable, explicit-column snapshots", async () => {
    const calls: ReadCall[] = [];
    const products = Array.from({ length: 1001 }, (_, index) => ({
      id: `product-${index}`,
      slug: `product-${index}`,
      category: "bra-pads",
      status: "draft",
      sort_order: index,
      version: 1,
      deleted_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      code: `CODE-${index}`,
      category_id: "category",
      status_v2: "unpublished",
      service_secret: "must-not-be-backed-up",
    }));
    const tables = {
      product_categories: [{ id: "category", slug: "bra-pads", sort_order: 1, is_enabled: true, service_secret: "drop" }],
      product_category_translations: [{ category_id: "category", locale: "zh", name: "胸垫", description: "", service_secret: "drop" }],
      products,
      product_translations: [{ product_id: "product-0", locale: "zh", name: "产品", summary: "", description: "", colors: "红", material: "棉", customization_scope: "尺寸", service_secret: "drop" }],
      product_specifications: [{ id: "spec", product_id: "product-0", label: {}, value: {}, sort_order: 0, service_secret: "drop" }],
      product_images: [{ id: "image", product_id: "product-0", media_id: "media", sort_order: 0, alt_text: {}, is_primary: true, service_secret: "drop" }],
    };
    const artifactPath = await temporaryArtifactPath();

    const report = await runProductCatalogVerification({
      mode: "preflight",
      transport: createTransport("admin", tables, calls),
      artifactPath,
      pageSize: 500,
      now: () => new Date("2026-08-02T10:00:00.000Z"),
      logger: { log() {} },
    });

    expect(new Set(calls.map((call) => call.operation))).toEqual(new Set(["select"]));
    expect(calls.filter((call) => call.table === "products").map(({ from, to }) => [from, to])).toEqual([
      [0, 499], [500, 999], [1000, 1499],
      [0, 499], [500, 999], [1000, 1499],
    ]);
    expect(calls.every((call) => call.columns !== "*")).toBe(true);
    expect(report.status).toBe("READY_FOR_MIGRATION_REVIEW");
    expect(report.consistency).toMatchObject({
      model: "optimistic-read-only-stable-snapshot",
      databaseTransactionSnapshot: false,
      passes: 2,
    });
    expect(report.affectedRows).toMatchObject({ products: 1001, total: 1006 });

    const artifactText = await readFile(artifactPath, "utf8");
    const artifact = JSON.parse(artifactText) as { backup: Record<string, { rows: Row[] }> };
    expect(artifact.backup.products.rows).toHaveLength(1001);
    expect(artifact.backup.products.rows[0]).toMatchObject({
      code: "CODE-0", category_id: "category", status_v2: "unpublished",
    });
    expect(artifact.backup.product_translations.rows[0]).toMatchObject({
      colors: "红", material: "棉", customization_scope: "尺寸",
    });
    expect(artifact.backup.product_images.rows[0]).toMatchObject({ is_primary: true });
    expect(artifact.backup.products).toMatchObject({
      selectedColumns: FULL_PREFLIGHT_COLUMNS.products,
      missingExpectedColumns: [],
      schemaVariant: "full-v2",
    });
    expect(artifactText).not.toContain("service_secret");
    expect(artifactText).not.toContain("must-not-be-backed-up");
    expect((await stat(artifactPath)).mode & 0o777).toBe(0o600);
  });

  it("backs up a pure V1 schema without querying V2-only columns", async () => {
    const calls: ReadCall[] = [];
    const tables = emptyPreflightTables();
    const v1Columns = {
      products: FULL_PREFLIGHT_COLUMNS.products.filter((column) => !["code", "category_id", "status_v2"].includes(column)),
      product_translations: FULL_PREFLIGHT_COLUMNS.product_translations.filter(
        (column) => !["colors", "material", "customization_scope"].includes(column),
      ),
      product_specifications: FULL_PREFLIGHT_COLUMNS.product_specifications,
      product_images: FULL_PREFLIGHT_COLUMNS.product_images.filter((column) => column !== "is_primary"),
    };
    const artifactPath = await temporaryArtifactPath();

    await runProductCatalogVerification({
      mode: "preflight",
      transport: createTransport("admin", tables, calls, {}, schemaWithTableColumns(v1Columns)),
      artifactPath,
      logger: { log() {} },
    });

    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    expect(artifact.backup.products).toMatchObject({
      exists: true,
      selectedColumns: v1Columns.products,
      missingExpectedColumns: ["code", "category_id", "status_v2"],
      schemaVariant: "v1",
    });
    expect(artifact.backup.product_categories).toMatchObject({
      exists: false,
      selectedColumns: [],
      schemaVariant: "absent",
    });
    expect(calls.filter((call) => call.table === "products").every((call) =>
      !call.columns?.includes("code") && !call.columns?.includes("category_id") && !call.columns?.includes("status_v2")
    )).toBe(true);
  });

  it("backs up only proven columns from a partial V2 schema", async () => {
    const calls: ReadCall[] = [];
    const tables = emptyPreflightTables();
    const partialColumns = {
      ...FULL_PREFLIGHT_COLUMNS,
      products: FULL_PREFLIGHT_COLUMNS.products.filter((column) => !["category_id", "status_v2"].includes(column)),
      product_translations: FULL_PREFLIGHT_COLUMNS.product_translations.filter(
        (column) => !["material", "customization_scope"].includes(column),
      ),
    };
    const artifactPath = await temporaryArtifactPath();

    await runProductCatalogVerification({
      mode: "preflight",
      transport: createTransport("admin", tables, calls, {}, schemaWithTableColumns(partialColumns)),
      artifactPath,
      logger: { log() {} },
    });

    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    expect(artifact.backup.products).toMatchObject({
      selectedColumns: partialColumns.products,
      missingExpectedColumns: ["category_id", "status_v2"],
      schemaVariant: "partial-v2",
    });
    expect(artifact.backup.product_translations).toMatchObject({
      missingExpectedColumns: ["material", "customization_scope"],
      schemaVariant: "partial-v2",
    });
    expect(calls.filter((call) => call.table === "products").every((call) =>
      call.columns?.includes("code") && !call.columns?.includes("category_id") && !call.columns?.includes("status_v2")
    )).toBe(true);
  });

  it("returns NEEDS_CONTEXT without SELECT when OpenAPI columns are unavailable", async () => {
    const calls: ReadCall[] = [];
    const artifactPath = await temporaryArtifactPath();

    await expect(runProductCatalogVerification({
      mode: "preflight",
      transport: createTransport("admin", emptyPreflightTables(), calls, {}, schemaWithTableColumns(null)),
      artifactPath,
      logger: { log() {} },
    })).rejects.toMatchObject({ code: "NEEDS_CONTEXT" });

    expect(calls).toEqual([]);
    await expect(access(artifactPath)).rejects.toThrow();
  });

  it("rejects a same-count row replacement and does not write a READY artifact", async () => {
    const artifactPath = await temporaryArtifactPath();
    const tables = emptyPreflightTables();
    tables.products = [
      [{ id: "one", slug: "one", category: "cups", status: "draft", sort_order: 0, version: 1, deleted_at: null, created_at: "a", updated_at: "a" }],
      [{ id: "two", slug: "two", category: "cups", status: "draft", sort_order: 0, version: 1, deleted_at: null, created_at: "a", updated_at: "a" }],
    ];

    await expect(runProductCatalogVerification({
      mode: "preflight",
      transport: createTransport("admin", tables, []),
      artifactPath,
      logger: { log() {} },
    })).rejects.toThrow("SNAPSHOT_CHANGED");
    await expect(access(artifactPath)).rejects.toThrow();
  });

  it("rejects duplicate stable keys even when the exact row count matches", async () => {
    const tables = emptyPreflightTables();
    tables.products = [
      { id: "duplicate", slug: "one", category: "cups", status: "draft", sort_order: 0, version: 1, deleted_at: null, created_at: "a", updated_at: "a" },
      { id: "duplicate", slug: "two", category: "cups", status: "draft", sort_order: 1, version: 1, deleted_at: null, created_at: "a", updated_at: "a" },
    ];

    await expect(runProductCatalogVerification({
      mode: "preflight",
      transport: createTransport("admin", tables, []),
      artifactPath: await temporaryArtifactPath(),
      logger: { log() {} },
    })).rejects.toThrow("PAGINATION_DUPLICATE_KEY");
  });

  it("never logs or persists Supabase environment values", async () => {
    const artifactPath = await temporaryArtifactPath();
    const logs: string[] = [];
    const sentinels = ["https://secret-project.supabase.co", "service-secret-value", "public-key-value"];

    const report = await runProductCatalogVerification({
      mode: "preflight",
      transport: createTransport("admin", emptyPreflightTables(), []),
      artifactPath,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: sentinels[0],
        SUPABASE_SECRET_KEY: sentinels[1],
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: sentinels[2],
      },
      logger: { log(value: unknown) { logs.push(String(value)); } },
    });

    const observableOutput = `${JSON.stringify(report)}\n${logs.join("\n")}\n${await readFile(artifactPath, "utf8")}`;
    for (const sentinel of sentinels) expect(observableOutput).not.toContain(sentinel);
  });

  it("uses HTTP GET for RPC reads and never exposes a POST or supabase-js rpc path", async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method ?? "GET" });
      return new Response(JSON.stringify([{ payload: { id: "category", products: [] } }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = { from: vi.fn() };
    const transport = createSupabaseReadTransport({
      client,
      role: "admin",
      apiUrl: "https://project.example.invalid",
      apiKey: "secret-value",
      fetchImpl,
    });

    const result = await transport.callReadOnlyRpcGet("list_published_catalog_v2", {});

    expect(result.rows).toEqual([{ payload: { id: "category", products: [] } }]);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://project.example.invalid/rest/v1/rpc/list_published_catalog_v2");
    expect("rpc" in client).toBe(false);
  });

  it("preserves a malformed HTTP 200 RPC body as INVALID_RPC_PAYLOAD", async () => {
    const rawBody = { payload: "not-an-array" };
    const transport = createSupabaseReadTransport({
      client: { from: vi.fn() },
      role: "admin",
      apiUrl: "https://project.example.invalid",
      apiKey: "secret-value",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify(rawBody), { status: 200 })),
    });

    await expect(transport.callReadOnlyRpcGet("list_published_catalog_v2", {})).resolves.toMatchObject({
      exists: true,
      safeGet: true,
      rows: null,
      rawBody,
      errorCode: "INVALID_RPC_PAYLOAD",
    });
  });

  it("binds enum inspection to the exact product_status schema", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      components: {
        schemas: {
          unrelated_status: { enum: ["unpublished", "published", "archived"] },
        },
      },
      paths: {},
    }), { status: 200 }));
    const transport = createSupabaseReadTransport({
      client: { from: vi.fn() },
      role: "admin",
      apiUrl: "https://project.example.invalid",
      apiKey: "secret-value",
      fetchImpl,
    });

    await expect(transport.inspectSchema()).resolves.toMatchObject({ enumValues: null });
  });

  it("derives exact table columns and absent relations from Data API OpenAPI", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      definitions: {
        products: { properties: { id: { type: "string" }, slug: { type: "string" }, code: { type: "string" } } },
        product_images: { properties: { id: { type: "string" }, is_primary: { type: "boolean" } } },
      },
      paths: {},
    }), { status: 200 }));
    const transport = createSupabaseReadTransport({
      client: { from: vi.fn() },
      role: "admin",
      apiUrl: "https://project.example.invalid",
      apiKey: "secret-value",
      fetchImpl,
    });

    await expect(transport.inspectTableColumns(["products", "product_images", "product_categories"])).resolves.toEqual({
      source: "data-api-openapi",
      tables: {
        products: { exists: true, columns: ["id", "slug", "code"] },
        product_images: { exists: true, columns: ["id", "is_primary"] },
        product_categories: { exists: false, columns: [] },
      },
    });
  });

  it("verifies every product detail, category membership, and ignores images whose media is deleted", async () => {
    const calls: ReadCall[] = [];
    const fixture = completeVerificationFixture();
    const transport = createTransport("admin", fixture.adminTables, calls, fixture.rpcResults);

    const report = await runProductCatalogVerification({
      mode: "verify",
      transport,
      publicTransport: createTransport("public", fixture.publicTables, calls),
      logger: { log() {} },
    });

    expect(report.status).toBe("VERIFIED");
    expect(report.schemaCounts.products).toEqual({ exists: true, count: 6 });
    expect(report.integrity).toMatchObject({
      imageLimitViolationCount: 0,
      invalidPublishedPrimaryImageCount: 0,
    });
    expect(report.publicRpc).toMatchObject({
      catalogMatchesExpected: true,
      detailMatchesExpected: true,
      excludedDetailIsNull: true,
      catalogRows: fixture.catalogRows,
    });
    const detailCalls = calls.filter((call) => call.name === "get_published_product_v2");
    expect(detailCalls).toHaveLength(6);
    expect(new Set(detailCalls.map((call) => call.args?.p_slug))).toEqual(new Set(fixture.products.map((product) => product.slug)));
    expect(report.publicRpc.detailChecks).toHaveLength(6);
    expect(calls.filter((call) => call.operation === "rpc-get").every((call) => call.role === "admin")).toBe(true);
  });

  it("fails when catalog membership assigns a public product to the wrong category", async () => {
    const fixture = completeVerificationFixture();
    const wrongCatalog = [
      { payload: { id: "enabled-a", slug: "bra-pads", isEnabled: true, products: [] } },
      { payload: { id: "enabled-b", slug: "cups", isEnabled: true, products: fixture.publicPayloads } },
    ];
    const report = await runProductCatalogVerification({
      mode: "verify",
      transport: createTransport("admin", fixture.adminTables, [], {
        ...fixture.rpcResults,
        list_published_catalog_v2: { rows: wrongCatalog },
      }),
      publicTransport: createTransport("public", fixture.publicTables, []),
      logger: { log() {} },
    });

    expect(report.status).toBe("FAILED");
    expect(report.publicRpc.catalogMatchesExpected).toBe(false);
    expect(report.publicRpc.errorCode).toBe("CATALOG_MEMBERSHIP_MISMATCH");
  });

  it("fails when any nonpublic product detail leaks", async () => {
    const fixture = completeVerificationFixture();
    const report = await runProductCatalogVerification({
      mode: "verify",
      transport: createTransport("admin", fixture.adminTables, [], {
        ...fixture.rpcResults,
        get_published_product_v2: (args: Record<string, unknown>) => {
          const product = fixture.products.find((item) => item.slug === args.p_slug);
          return { rows: product ? [{ payload: fixture.payloadFor(product) }] : [] };
        },
      }),
      publicTransport: createTransport("public", fixture.publicTables, []),
      logger: { log() {} },
    });

    expect(report.status).toBe("FAILED");
    expect(report.publicRpc.detailChecks.find((check: Row) => check.slug === "draft")).toMatchObject({
      expectedPublic: false,
      passed: false,
      errorCode: "NONPUBLIC_DETAIL_LEAK",
    });
  });

  it("fails empty-catalog verification on malformed catalog or detail payloads", async () => {
    const tables = {
      product_categories: [], product_category_translations: [], products: [],
      product_translations: [], product_specifications: [], product_images: [], media: [],
    };
    const malformedCatalog = await runProductCatalogVerification({
      mode: "verify",
      transport: createTransport("admin", tables, [], {
        list_published_catalog_v2: { rows: [{}] },
      }),
      publicTransport: createTransport("public", tables, []),
      logger: { log() {} },
    });
    expect(malformedCatalog.status).toBe("FAILED");
    expect(malformedCatalog.publicRpc.errorCode).toBe("INVALID_RPC_PAYLOAD");

    const malformedDetail = await runProductCatalogVerification({
      mode: "verify",
      transport: createTransport("admin", tables, [], {
        list_published_catalog_v2: { rows: [] },
        get_published_product_v2: { rows: [{ payload: { id: 7 } }] },
      }),
      publicTransport: createTransport("public", tables, []),
      logger: { log() {} },
    });
    expect(malformedDetail.status).toBe("FAILED");
    expect(malformedDetail.publicRpc.errorCode).toBe("INVALID_RPC_PAYLOAD");
  });

  it("fails integrity for missing or duplicate product slugs", async () => {
    const tables = {
      product_categories: [{ id: "enabled", slug: "cups", is_enabled: true }],
      product_category_translations: [],
      products: [
        { id: "missing", slug: "", code: "M", category_id: "enabled", status_v2: "unpublished", deleted_at: null },
        { id: "dup-a", slug: "duplicate", code: "A", category_id: "enabled", status_v2: "unpublished", deleted_at: null },
        { id: "dup-b", slug: "DUPLICATE", code: "B", category_id: "enabled", status_v2: "archived", deleted_at: null },
      ],
      product_translations: [], product_specifications: [], product_images: [], media: [],
    };
    const publicTables = { ...tables, products: [] };
    const report = await runProductCatalogVerification({
      mode: "verify",
      transport: createTransport("admin", tables, [], {
        list_published_catalog_v2: { rows: [{ payload: { id: "enabled", slug: "cups", isEnabled: true, products: [] } }] },
        get_published_product_v2: { rows: [] },
      }),
      publicTransport: createTransport("public", publicTables, []),
      logger: { log() {} },
    });

    expect(report.status).toBe("FAILED");
    expect(report.integrity).toMatchObject({ missingSlugCount: 1, duplicateSlugCount: 1 });
  });

  it("returns NEEDS_CONTEXT rather than executing a public RPC that cannot be safely GET", async () => {
    const tables = {
      product_categories: [], product_category_translations: [], products: [],
      product_translations: [], product_specifications: [], product_images: [], media: [],
    };
    const transport = createTransport("admin", tables, [], {
      list_published_catalog_v2: { safeGet: false, rows: [] },
      get_published_product_v2: { safeGet: false, rows: [] },
    });

    const report = await runProductCatalogVerification({
      mode: "verify",
      transport,
      publicTransport: createTransport("public", tables, []),
      logger: { log() {} },
    });

    expect(report.status).toBe("NEEDS_CONTEXT");
    expect(report.publicRpc.safeGetState).toBe("unknown");
  });
});
