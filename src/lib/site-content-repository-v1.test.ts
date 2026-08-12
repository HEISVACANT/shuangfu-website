import { describe, expect, it, vi } from "vitest";

import { defaultSiteContentConfigV1, getSectionConfigV1 } from "@/lib/site-content-config-v1";
import {
  getSiteContentConfigV1,
  listProductCategoriesV1,
  SiteContentRepositoryErrorV1,
  type SiteContentSupabaseClientV1
} from "@/lib/site-content-repository-v1";

type QueryResult = { data: unknown; error: unknown };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createFakeClient(
  results: Record<string, QueryResult | Promise<QueryResult>>
): SiteContentSupabaseClientV1 & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    from(table) {
      return {
        select() {
          calls.push(table);
          return Promise.resolve(results[table]);
        }
      };
    }
  };
}

function persistedRows() {
  const config = structuredClone(defaultSiteContentConfigV1);
  const home = getSectionConfigV1(config, "home");
  home.media.mediaId = "b8c8fe47-2268-4f88-bf2a-3d751c2fa001";

  const sections = config.sections
    .map((section) => {
      const { key, sortOrder, layout, ...content } = section;
      const mediaId = "media" in content ? content.media.mediaId : null;
      if ("media" in content) delete (content.media as { mediaId?: string | null }).mediaId;
      return {
        key,
        sort_order: sortOrder,
        layout_key: layout,
        content,
        media_id: mediaId,
        updated_at: `2026-07-29T12:00:0${sortOrder}.000Z`
      };
    })
    .toReversed();
  const categories = getSectionConfigV1(config, "products").categories
    .map((category) => ({
      id: category.id === "b8c8fe47-2268-4f88-bf2a-3d751c2fa001"
        ? "b8c8fe47-2268-4f88-bf2a-3d751c2fa001"
        : "b8c8fe47-2268-4f88-bf2a-3d751c2fa002",
      slug: category.slug,
      sort_order: category.sortOrder,
      is_enabled: category.enabled,
      products: [{ count: category.productReferenceCount }]
    }))
    .toReversed();
  const translations = getSectionConfigV1(config, "products").categories.flatMap((category) => {
    const categoryId = category.id === "b8c8fe47-2268-4f88-bf2a-3d751c2fa001"
      ? "b8c8fe47-2268-4f88-bf2a-3d751c2fa001"
      : "b8c8fe47-2268-4f88-bf2a-3d751c2fa002";
    return Object.entries(category.translations).map(([locale, translation]) => ({
      category_id: categoryId,
      locale,
      ...translation
    }));
  }).toReversed();

  return { sections, categories, translations };
}

describe("site content repository v1", () => {
  it("sorts persisted sections and categories, maps media ids, and returns the save baseline", async () => {
    const rows = persistedRows();
    const client = createFakeClient({
      site_sections: { data: rows.sections, error: null },
      product_categories: { data: rows.categories, error: null },
      product_category_translations: { data: rows.translations, error: null }
    });

    const result = await getSiteContentConfigV1({ client });

    expect(result.source).toBe("supabase");
    expect(result.config.sections.map((section) => section.key)).toEqual([
      "home", "about", "products", "advantages", "contact"
    ]);
    expect(getSectionConfigV1(result.config, "home").media.mediaId).toBe(
      "b8c8fe47-2268-4f88-bf2a-3d751c2fa001"
    );
    expect(getSectionConfigV1(result.config, "products").categories.map((category) => category.slug)).toEqual([
      "bra-pads", "cups"
    ]);
    expect(result.baseline.sections).toEqual([
      { key: "home", updatedAt: "2026-07-29T12:00:00.000Z" },
      { key: "about", updatedAt: "2026-07-29T12:00:01.000Z" },
      { key: "products", updatedAt: "2026-07-29T12:00:02.000Z" },
      { key: "advantages", updatedAt: "2026-07-29T12:00:03.000Z" },
      { key: "contact", updatedAt: "2026-07-29T12:00:04.000Z" }
    ]);
  });

  it("preserves database timestamp precision in the optimistic save baseline", async () => {
    const rows = persistedRows();
    rows.sections[0].updated_at = "2026-07-29T12:00:00.123456+00:00";
    const client = createFakeClient({
      site_sections: { data: rows.sections, error: null },
      product_categories: { data: rows.categories, error: null },
      product_category_translations: { data: rows.translations, error: null }
    });

    const result = await getSiteContentConfigV1({ client });

    expect(result.baseline.sections.find((section) => section.key === rows.sections[0].key)).toEqual({
      key: rows.sections[0].key,
      updatedAt: "2026-07-29T12:00:00.123456+00:00"
    });
  });

  it("returns a non-default fixed-key ordering from Supabase when rows are ordered by sort order", async () => {
    const rows = persistedRows();
    const sortOrders: Record<string, number> = {
      products: 0,
      home: 1,
      about: 2,
      advantages: 3,
      contact: 4
    };
    rows.sections.forEach((section) => {
      section.sort_order = sortOrders[section.key];
    });
    const client = createFakeClient({
      site_sections: { data: rows.sections, error: null },
      product_categories: { data: rows.categories, error: null },
      product_category_translations: { data: rows.translations, error: null }
    });

    const result = await getSiteContentConfigV1({ client });

    expect(result.source).toBe("supabase");
    expect(result.config.sections.map((section) => section.key)).toEqual([
      "products", "home", "about", "advantages", "contact"
    ]);
    expect(result.baseline.sections.map((section) => section.key)).toEqual([
      "products", "home", "about", "advantages", "contact"
    ]);
  });

  it("starts all three independent Supabase reads before waiting for any one of them", async () => {
    const rows = persistedRows();
    const sections = deferred<QueryResult>();
    const client = createFakeClient({
      site_sections: sections.promise,
      product_categories: { data: rows.categories, error: null },
      product_category_translations: { data: rows.translations, error: null }
    });

    const result = getSiteContentConfigV1({ client });

    expect(client.calls).toEqual([
      "site_sections", "product_categories", "product_category_translations"
    ]);
    sections.resolve({ data: rows.sections, error: null });
    await expect(result).resolves.toMatchObject({ source: "supabase" });
  });

  it("excludes disabled categories while preserving their ordered trilingual data for admins", async () => {
    const rows = persistedRows();
    rows.categories[0].is_enabled = false;
    const client = createFakeClient({
      site_sections: { data: rows.sections, error: null },
      product_categories: { data: rows.categories, error: null },
      product_category_translations: { data: rows.translations, error: null }
    });

    const publicCategories = await listProductCategoriesV1({ includeDisabled: false }, { client });
    const adminCategories = await listProductCategoriesV1({ includeDisabled: true }, { client });

    expect(publicCategories).toHaveLength(1);
    expect(publicCategories[0]).toMatchObject({ slug: "bra-pads", translations: { ar: { name: "حشوات الصدر" } } });
    expect(adminCategories.map((category) => category.slug)).toEqual(["bra-pads", "cups"]);
    expect(adminCategories[1].enabled).toBe(false);
  });

  it("uses the complete default config when a query fails", async () => {
    const error = new Error("database unavailable");
    const client = createFakeClient({
      site_sections: { data: null, error },
      product_categories: { data: [], error: null },
      product_category_translations: { data: [], error: null }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await getSiteContentConfigV1({ client });

    expect(result).toMatchObject({ source: "fallback", config: defaultSiteContentConfigV1 });
    expect(errorSpy).toHaveBeenCalledWith("site_content_read_failed", { name: "Error", message: "database unavailable" });
    errorSpy.mockRestore();
  });

  it("normalizes a plain Supabase error object without logging credential-bearing values", async () => {
    const error = {
      code: "42P01",
      message: "relation site_sections failed; SUPABASE_SECRET_KEY=super-secret-value; bearer private-token",
      details: "private details",
      hint: "private hint"
    };
    const client = createFakeClient({
      site_sections: { data: null, error },
      product_categories: { data: [], error: null },
      product_category_translations: { data: [], error: null }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getSiteContentConfigV1({ client })).resolves.toMatchObject({ source: "fallback" });

    const logged = errorSpy.mock.calls[0][1] as Record<string, string>;
    expect(logged).toMatchObject({ code: "42P01", name: "SupabaseError" });
    expect(logged.message).toContain("relation site_sections failed");
    expect(JSON.stringify(logged)).not.toContain("super-secret-value");
    expect(JSON.stringify(logged)).not.toContain("private-token");
    expect(JSON.stringify(logged)).not.toContain("private details");
    expect(JSON.stringify(logged)).not.toContain("private hint");
    errorSpy.mockRestore();
  });

  it("redacts quoted, JSON, multi-word, and bearer credentials without losing ordinary PostgREST context", async () => {
    const error = {
      code: "42P01",
      name: "PostgrestError",
      message: [
        "relation does not exist",
        '{"token":"json-secret"}',
        "{'api_key':'single-secret'}",
        "password: two word secret",
        '"service_role_key": "quoted-secret"',
        "Bearer bearer-secret",
        "x".repeat(240)
      ].join("; "),
      details: "private details",
      hint: "private hint"
    };
    const client = createFakeClient({
      site_sections: { data: null, error },
      product_categories: { data: [], error: null },
      product_category_translations: { data: [], error: null }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getSiteContentConfigV1({ client })).resolves.toMatchObject({ source: "fallback" });

    const logged = errorSpy.mock.calls[0][1] as Record<string, string>;
    expect(logged).toMatchObject({ code: "42P01", name: "PostgrestError" });
    expect(logged.message).toContain("relation does not exist");
    expect(logged.message.length).toBeLessThanOrEqual(200);
    for (const secret of ["json-secret", "single-secret", "two word secret", "quoted-secret", "bearer-secret"]) {
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
    }
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("private details");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("private hint");
    errorSpy.mockRestore();
  });

  it("redacts quoted and unquoted service-role, access, and auth fields without matching ordinary words", async () => {
    const error = {
      code: "42P01",
      name: "PostgrestError",
      message: [
        "relation does not exist",
        '"SUPABASE_SERVICE_ROLE_KEY":"quoted-service-role-secret"',
        "SUPABASE_SERVICE_ROLE_KEY=unquoted-service-role-secret",
        "access_token=access-token-secret",
        "auth_token: auth-token-secret, tokenization secretary monkey remain ordinary"
      ].join("; ")
    };
    const client = createFakeClient({
      site_sections: { data: null, error },
      product_categories: { data: [], error: null },
      product_category_translations: { data: [], error: null }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getSiteContentConfigV1({ client })).resolves.toMatchObject({ source: "fallback" });

    const logged = errorSpy.mock.calls[0][1] as Record<string, string>;
    expect(logged).toMatchObject({ code: "42P01", name: "PostgrestError" });
    expect(logged.message).toContain("relation does not exist");
    expect(logged.message).toContain("tokenization secretary monkey remain ordinary");
    for (const secret of [
      "quoted-service-role-secret",
      "unquoted-service-role-secret",
      "access-token-secret",
      "auth-token-secret"
    ]) {
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
    }
    errorSpy.mockRestore();
  });

  it("redacts refresh and prefixed access tokens through delimiters while preserving the next diagnostic", async () => {
    const error = {
      code: "42P01",
      name: "PostgrestError",
      message: [
        "relation does not exist",
        "refresh_token=refresh-token-secret",
        "my_access_token=prefix-access-token-secret",
        "password: two word secret; relation still missing, secretary and monkey remain ordinary"
      ].join("; ")
    };
    const client = createFakeClient({
      site_sections: { data: null, error },
      product_categories: { data: [], error: null },
      product_category_translations: { data: [], error: null }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getSiteContentConfigV1({ client })).resolves.toMatchObject({ source: "fallback" });

    const logged = errorSpy.mock.calls[0][1] as Record<string, string>;
    expect(logged).toMatchObject({ code: "42P01", name: "PostgrestError" });
    expect(logged.message).toContain("relation does not exist");
    expect(logged.message).toContain("relation still missing, secretary and monkey remain ordinary");
    for (const secret of [
      "refresh-token-secret",
      "prefix-access-token-secret",
      "two word secret"
    ]) {
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
    }
    errorSpy.mockRestore();
  });

  it.each([
    ["missing category translation", (rows: ReturnType<typeof persistedRows>) => rows.translations.pop()],
    ["empty section set", (rows: ReturnType<typeof persistedRows>) => { rows.sections = []; }],
    ["incomplete section set", (rows: ReturnType<typeof persistedRows>) => { rows.sections.pop(); }],
    ["malformed section content", (rows: ReturnType<typeof persistedRows>) => { rows.sections[0].content = {} as never; }]
  ])("uses the complete default config for %s", async (_reason, mutate) => {
    const rows = persistedRows();
    mutate(rows);
    const client = createFakeClient({
      site_sections: { data: rows.sections, error: null },
      product_categories: { data: rows.categories, error: null },
      product_category_translations: { data: rows.translations, error: null }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getSiteContentConfigV1({ client })).resolves.toMatchObject({
      source: "fallback",
      config: defaultSiteContentConfigV1
    });
    errorSpy.mockRestore();
  });

  it("uses the complete default config without an admin configuration", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(getSiteContentConfigV1()).resolves.toEqual({
      config: defaultSiteContentConfigV1,
      baseline: { sections: [] },
      source: "fallback"
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("throws a typed safe error for category query failures when a client was injected", async () => {
    const client = createFakeClient({
      product_categories: { data: null, error: { code: "42P01", message: "relation missing; token=private-token" } },
      product_category_translations: { data: [], error: null }
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(listProductCategoriesV1({ includeDisabled: false }, { client })).rejects.toMatchObject({
      name: "SiteContentRepositoryErrorV1",
      code: "PRODUCT_CATEGORIES_READ_FAILED",
      message: "Unable to read product categories."
    });
    expect(errorSpy).toHaveBeenCalledWith("product_categories_read_failed", expect.objectContaining({ code: "42P01" }));
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("private-token");
    errorSpy.mockRestore();
  });

  it("throws a typed safe error for category parse failures when a client was injected", async () => {
    const rows = persistedRows();
    rows.translations.pop();
    const client = createFakeClient({
      product_categories: { data: rows.categories, error: null },
      product_category_translations: { data: rows.translations, error: null }
    });

    await expect(listProductCategoriesV1({ includeDisabled: true }, { client })).rejects.toBeInstanceOf(
      SiteContentRepositoryErrorV1
    );
  });
});
