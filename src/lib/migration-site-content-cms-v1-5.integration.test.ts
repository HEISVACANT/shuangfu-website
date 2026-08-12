import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const actorId = "10000000-0000-4000-8000-000000000001";
const legacyInquiryId = "20000000-0000-4000-8000-000000000001";
const firstMediaId = "30000000-0000-4000-8000-000000000001";
const secondMediaId = "30000000-0000-4000-8000-000000000002";
const missingMediaId = "30000000-0000-4000-8000-000000000099";
const braPadsCategoryId = "b8c8fe47-2268-4f88-bf2a-3d751c2fa001";
const cupsCategoryId = "b8c8fe47-2268-4f88-bf2a-3d751c2fa002";
const dynamicCategoryId = "b8c8fe47-2268-4f88-bf2a-3d751c2fa004";

const trackedMigrationFiles = [
  "202607270001_initial_schema_v1.sql",
  "202607290005_product_catalog_import_v1_4.sql",
  "202607290006_site_content_cms_v1_5.sql",
  "202607300007_site_content_cms_hardening_v1_6.sql",
  "202608020008_site_content_media_helper_private_v1_7.sql"
] as const;

type Locale = "zh" | "en" | "ar";

interface CategoryPayload {
  id: string;
  slug: string;
  enabled: boolean;
  sortOrder: number;
  productReferenceCount: number;
  translations: Record<Locale, { name: string; description: string }>;
}

interface SectionPayload {
  key: string;
  enabled: boolean;
  sortOrder: number;
  layout: string;
  content: Record<Locale, Record<string, string | string[]>>;
  media?: {
    mediaId: string | null;
    image: string;
    alt: Record<Locale, string>;
  };
  categories?: CategoryPayload[];
  facts?: unknown[];
  steps?: unknown[];
  shared?: { phone: string; email: string };
}

interface SiteContentPayload {
  sections: SectionPayload[];
}

interface SiteContentBaseline {
  sections: Array<{ key: string; updatedAt: string }>;
}

interface SectionRow {
  key: string;
  sort_order: number;
  layout_key: string;
  content: Record<string, unknown>;
  media_id: string | null;
  updated_at: Date | string;
}

interface CategoryRow {
  id: string;
  slug: string;
  sort_order: number;
  is_enabled: boolean;
  product_reference_count: number;
  translations: CategoryPayload["translations"];
}

let db: PGlite;

function migrationSql(file: (typeof trackedMigrationFiles)[number]) {
  return readFileSync(resolve("supabase/migrations", file), "utf8");
}

async function createMigrationDatabase() {
  const database = new PGlite();

  // Supabase provisions these roles and schemas before project migrations run.
  // This local fixture supplies only that platform-owned surface; it deliberately
  // applies the exact tracked 001, 005 and 006 files and never reads 002/003/004.
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(
      id uuid primary key,
      raw_user_meta_data jsonb default jsonb_build_object(),
      email text
    );
    create function auth.uid() returns uuid language sql stable
    as $$ select '${actorId}'::uuid $$;
    create schema storage;
    create table storage.buckets(
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects(
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text
    );
    alter table storage.objects enable row level security;
  `);

  // PGlite already provides gen_random_uuid(); it does not ship the pgcrypto
  // extension control file used by hosted Supabase.
  await database.exec(
    migrationSql(trackedMigrationFiles[0]).replace(
      "create extension if not exists pgcrypto;",
      ""
    )
  );
  await database.exec(migrationSql(trackedMigrationFiles[1]));

  await database.query(
    `insert into public.products(slug, category, status, sort_order)
     values ('legacy-custom-product', 'custom-development', 'draft', 900)`,
  );
  await database.query(
    `insert into public.inquiries(
       id, name, company, country_code, email, phone_whatsapp, product_category,
       estimated_quantity, locale, privacy_consent
     ) values ($1, 'Legacy inquiry', 'Legacy company', 'CN', 'legacy@example.com',
       '15500000000', 'custom-development', '1000', 'en', true)`,
    [legacyInquiryId]
  );

  await database.exec(migrationSql(trackedMigrationFiles[2]));
  await database.exec(migrationSql(trackedMigrationFiles[3]));
  await database.exec(migrationSql(trackedMigrationFiles[4]));
  await database.query(
    `insert into auth.users(id, raw_user_meta_data, email)
     values ($1, jsonb_build_object('display_name', 'Migration Tester'), 'migration@example.com')`,
    [actorId]
  );
  await database.query(
    "update public.profiles set is_system_owner=true where id=$1",
    [actorId]
  );

  return database;
}

function timestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function currentSiteContent(database: PGlite) {
  const sectionResult = await database.query<SectionRow>(`
    select key, sort_order, layout_key, content, media_id, updated_at
    from public.site_sections
    order by sort_order
  `);
  const categoryResult = await database.query<CategoryRow>(`
    select
      category.id::text,
      category.slug,
      category.sort_order,
      category.is_enabled,
      (
        select count(*)::integer
        from public.products product
        where product.category_id=category.id
      ) as product_reference_count,
      jsonb_object_agg(
        translation.locale,
        jsonb_build_object(
          'name', translation.name,
          'description', translation.description
        )
      ) as translations
    from public.product_categories category
    join public.product_category_translations translation
      on translation.category_id=category.id
    group by category.id
    order by category.sort_order
  `);

  const sections = sectionResult.rows.map((row) => {
    const section = {
      ...row.content,
      key: row.key,
      sortOrder: row.sort_order,
      layout: row.layout_key
    } as unknown as SectionPayload;
    if (section.media) section.media.mediaId = row.media_id;
    if (section.key === "products") {
      section.categories = categoryResult.rows.map((category) => ({
        id: category.id,
        slug: category.slug,
        enabled: category.is_enabled,
        sortOrder: category.sort_order,
        productReferenceCount: category.product_reference_count,
        translations: category.translations
      }));
    }
    return section;
  });

  return {
    payload: { sections } satisfies SiteContentPayload,
    baseline: {
      sections: sectionResult.rows.map((row) => ({
        key: row.key,
        updatedAt: timestamp(row.updated_at)
      }))
    } satisfies SiteContentBaseline
  };
}

async function asRole<T>(
  database: PGlite,
  role: "anon" | "authenticated" | "service_role",
  action: () => Promise<T>
) {
  await database.exec(`set role ${role}`);
  try {
    return await action();
  } finally {
    await database.exec("reset role");
  }
}

async function saveAsAuthenticated(
  database: PGlite,
  payload: SiteContentPayload,
  baseline: SiteContentBaseline
) {
  return asRole(database, "authenticated", () =>
    database.query<{ saved_at: Date | string }>(
      "select public.save_site_content_v1($1::jsonb, $2::jsonb) as saved_at",
      [JSON.stringify(payload), JSON.stringify(baseline)]
    )
  );
}

async function databaseSnapshot(database: PGlite) {
  const result = await database.query<{
    sections: unknown;
    categories: unknown;
    translations: unknown;
    audit_count: number;
  }>(`
    select
      (select jsonb_agg(to_jsonb(section_row) order by section_row.key)
       from public.site_sections section_row) as sections,
      (select jsonb_agg(to_jsonb(category_row) order by category_row.slug)
       from public.product_categories category_row) as categories,
      (select jsonb_agg(to_jsonb(translation_row)
          order by translation_row.category_id, translation_row.locale)
       from public.product_category_translations translation_row) as translations,
      (select count(*)::integer from public.audit_logs
       where resource_type='site_content') as audit_count
  `);
  return result.rows[0];
}

function catalogImportPayload() {
  const source = JSON.parse(
    readFileSync(resolve("data/product-catalog-v1.json"), "utf8")
  ) as {
    products: Array<{
      slug: string;
      category: string;
      sortOrder: number;
      translations: Record<Locale, { name: string; summary: string; description: string }>;
      images: Array<{ fileName: string; alt: Record<Locale, string> }>;
      specifications: unknown[];
    }>;
  };
  const categoryIds = new Map<string, string>([
    ["bra-pads", braPadsCategoryId],
    ["cups", cupsCategoryId]
  ]);
  return {
    version: "1.0",
    products: source.products.map((product) => ({
      ...product,
      categoryId: categoryIds.get(product.category),
      categorySlug: product.category,
      images: product.images.map((image) => ({
        storagePath: `catalog-v1/${image.fileName}`,
        publicUrl: `https://example.test/storage/${image.fileName}`,
        mimeType: "image/webp",
        byteSize: 100,
        width: 10,
        height: 10,
        alt: image.alt
      }))
    }))
  };
}

beforeEach(async () => {
  db = await createMigrationDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("site content CMS migrations v1.5 and v1.6 database integration", () => {
  it("upgrades legacy custom-development products and inquiries", async () => {
    const result = await db.query<{
      product_category_slug: string;
      inquiry_category_slug: string;
      inquiry_snapshot: string;
    }>(`
      select
        (select category.slug
         from public.products product
         join public.product_categories category on category.id=product.category_id
         where product.slug='legacy-custom-product') as product_category_slug,
        (select category.slug
         from public.inquiries inquiry
         join public.product_categories category on category.id=inquiry.category_id
         where inquiry.id=$1) as inquiry_category_slug,
        (select category_name_snapshot from public.inquiries where id=$1) as inquiry_snapshot
    `, [legacyInquiryId]);

    expect(result.rows[0]).toEqual({
      product_category_slug: "custom-development",
      inquiry_category_slug: "custom-development",
      inquiry_snapshot: "Custom development"
    });
  });

  it("makes category ids authoritative for catalog replace and restore", async () => {
    await db.query(
      `insert into public.product_categories(id, slug, sort_order, is_enabled)
       values ($1, 'swimwear-cups', 3, true)`,
      [dynamicCategoryId]
    );
    const payload = catalogImportPayload();
    payload.products[0].category = "swimwear-cups";
    payload.products[0].categorySlug = "swimwear-cups";
    payload.products[0].categoryId = dynamicCategoryId;

    const mismatchedPayload = structuredClone(payload);
    mismatchedPayload.products[0].categoryId = cupsCategoryId;
    await expect(
      db.query("select public.replace_product_catalog_v1($1::jsonb)", [JSON.stringify(mismatchedPayload)])
    ).rejects.toThrow(/category id and slug do not match/i);

    await db.query("select public.replace_product_catalog_v1($1::jsonb)", [JSON.stringify(payload)]);
    const replaced = await db.query<{ category_id: string; category: string }>(
      `select category_id::text, category from public.products
       where slug='teardrop-cup-pad'`
    );
    expect(replaced.rows[0]).toEqual({
      category_id: dynamicCategoryId,
      category: "swimwear-cups"
    });

    const exported = await db.query<{ snapshot: Record<string, unknown> }>(
      "select public.export_product_catalog_snapshot_v1() as snapshot"
    );
    const snapshot = exported.rows[0].snapshot;
    await db.query(
      `update public.products set category_id=$1 where slug='teardrop-cup-pad'`,
      [braPadsCategoryId]
    );
    await db.query(
      "select public.restore_product_catalog_snapshot_v1($1::jsonb)",
      [JSON.stringify(snapshot)]
    );
    const restored = await db.query<{ category_id: string; category: string }>(
      `select category_id::text, category from public.products
       where slug='teardrop-cup-pad'`
    );
    expect(restored.rows[0]).toEqual({
      category_id: dynamicCategoryId,
      category: "swimwear-cups"
    });

    const legacySlugOnlySnapshot = structuredClone(snapshot) as {
      products: Array<Record<string, unknown>>;
    };
    for (const product of legacySlugOnlySnapshot.products) delete product.category_id;
    await db.query(
      `update public.products set category_id=$1 where slug='teardrop-cup-pad'`,
      [braPadsCategoryId]
    );
    await db.query(
      "select public.restore_product_catalog_snapshot_v1($1::jsonb)",
      [JSON.stringify(legacySlugOnlySnapshot)]
    );
    const legacyRestored = await db.query<{ category_id: string; category: string }>(
      `select category_id::text, category from public.products
       where slug='teardrop-cup-pad'`
    );
    expect(legacyRestored.rows[0]).toEqual({
      category_id: dynamicCategoryId,
      category: "swimwear-cups"
    });

    const unknownSlugSnapshot = structuredClone(legacySlugOnlySnapshot);
    unknownSlugSnapshot.products[0].category = "missing-category";
    await expect(
      db.query("select public.restore_product_catalog_snapshot_v1($1::jsonb)", [JSON.stringify(unknownSlugSnapshot)])
    ).rejects.toThrow(/category slug not found/i);

    const mismatchedSnapshot = structuredClone(snapshot) as {
      products: Array<Record<string, unknown>>;
    };
    mismatchedSnapshot.products[0].category_id = cupsCategoryId;
    await expect(
      db.query("select public.restore_product_catalog_snapshot_v1($1::jsonb)", [JSON.stringify(mismatchedSnapshot)])
    ).rejects.toThrow(/category id and slug do not match/i);
  });

  it("enables RLS and exposes only the intended read policies", async () => {
    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity
      from pg_class
      where relnamespace='public'::regnamespace
        and relname in (
          'site_sections',
          'product_categories',
          'product_category_translations'
        )
      order by relname
    `);
    expect(rls.rows).toEqual([
      { relname: "product_categories", relrowsecurity: true },
      { relname: "product_category_translations", relrowsecurity: true },
      { relname: "site_sections", relrowsecurity: true }
    ]);

    const policies = await db.query<{ policyname: string; cmd: string }>(`
      select policyname, cmd
      from pg_policies
      where schemaname='public'
        and tablename in (
          'site_sections',
          'product_categories',
          'product_category_translations'
        )
      order by policyname
    `);
    expect(policies.rows).toEqual([
      { policyname: "product_categories_anon_read", cmd: "SELECT" },
      { policyname: "product_categories_authenticated_read", cmd: "SELECT" },
      { policyname: "product_category_translations_anon_read", cmd: "SELECT" },
      { policyname: "product_category_translations_authenticated_read", cmd: "SELECT" },
      { policyname: "site_sections_public_read", cmd: "SELECT" }
    ]);

    await db.exec(
      "update public.product_categories set is_enabled=false where slug='custom-development'"
    );
    const anonCounts = await asRole(db, "anon", () =>
      db.query<{ section_count: number; category_count: number; translation_count: number }>(`
        select
          (select count(*)::integer from public.site_sections) as section_count,
          (select count(*)::integer from public.product_categories) as category_count,
          (select count(*)::integer from public.product_category_translations) as translation_count
      `)
    );
    expect(anonCounts.rows[0]).toEqual({
      section_count: 5,
      category_count: 2,
      translation_count: 6
    });

    const authenticatedCategories = await asRole(db, "authenticated", () =>
      db.query<{ count: number }>(
        "select count(*)::integer as count from public.product_categories"
      )
    );
    expect(authenticatedCategories.rows[0].count).toBe(3);
    await expect(
      asRole(db, "anon", () =>
        db.exec("update public.site_sections set layout_key='centered' where key='home'")
      )
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it("lets anonymous readers fetch active home/about media but never deleted media", async () => {
    const deletedMediaId = "30000000-0000-4000-8000-000000000003";
    const unattachedMediaId = "30000000-0000-4000-8000-000000000004";
    await db.query(
      `insert into public.media(id, storage_path, mime_type, byte_size, width, height, deleted_at)
       values
         ($1, '/media/home.webp', 'image/webp', 100, 10, 10, null),
         ($2, '/media/deleted-about.webp', 'image/webp', 100, 10, 10, now()),
         ($3, '/media/unattached.webp', 'image/webp', 100, 10, 10, null)`,
      [firstMediaId, deletedMediaId, unattachedMediaId],
    );
    await db.query(
      `update public.site_sections
       set media_id = case key when 'home' then $1::uuid else $2::uuid end
       where key in ('home', 'about')`,
      [firstMediaId, deletedMediaId],
    );

    const anonymous = await asRole(db, "anon", () =>
      db.query<{ id: string }>("select id::text from public.media order by id"),
    );
    expect(anonymous.rows).toEqual([{ id: firstMediaId }]);

    const administrator = await asRole(db, "authenticated", () =>
      db.query<{ id: string }>("select id::text from public.media order by id"),
    );
    expect(administrator.rows).toEqual([
      { id: firstMediaId },
      { id: unattachedMediaId },
    ]);
  });

  it("accepts the exact page-text and phone length boundaries", async () => {
    const current = await currentSiteContent(db);
    current.payload.sections.find((section) => section.key === "home")!
      .content.en.text = "x".repeat(3000);
    current.payload.sections.find((section) => section.key === "contact")!
      .shared!.phone = "1".repeat(60);

    await expect(
      saveAsAuthenticated(db, current.payload, current.baseline),
    ).resolves.toBeTruthy();
  });

  it.each([
    {
      name: "3001-character page text",
      error: "site_content_text_too_long",
      mutate(payload: SiteContentPayload) {
        payload.sections.find((section) => section.key === "home")!
          .content.en.text = "x".repeat(3001);
      },
    },
    {
      name: "61-character phone",
      error: "site_content_phone_too_long",
      mutate(payload: SiteContentPayload) {
        payload.sections.find((section) => section.key === "contact")!
          .shared!.phone = "1".repeat(61);
      },
    },
    {
      name: "255-character email",
      error: "site_content_email_too_long",
      mutate(payload: SiteContentPayload) {
        payload.sections.find((section) => section.key === "contact")!
          .shared!.email = `${"a".repeat(243)}@example.com`;
      },
    },
    ...[2, 4].map((count) => ({
      name: `${count} about facts`,
      error: "invalid_about_fact_count",
      mutate(payload: SiteContentPayload) {
        const about = payload.sections.find((section) => section.key === "about")!;
        about.facts = Array.from({ length: count }, (_, index) => ({
          id: `fact-${index}`,
          sortOrder: index,
          value: { zh: "1", en: "1", ar: "1" },
          label: { zh: "一", en: "one", ar: "واحد" },
        }));
      },
    })),
  ])("rejects $name without changing persisted content", async ({ error, mutate }) => {
    const current = await currentSiteContent(db);
    const before = await databaseSnapshot(db);
    mutate(current.payload);

    await expect(
      saveAsAuthenticated(db, current.payload, current.baseline),
    ).rejects.toThrow(error);
    expect(await databaseSnapshot(db)).toEqual(before);
  });

  it("saves valid content and rolls a stale write back atomically", async () => {
    const initial = await currentSiteContent(db);
    const validPayload = structuredClone(initial.payload);
    validPayload.sections[0].content.en.title = "First atomic save";

    const saved = await saveAsAuthenticated(db, validPayload, initial.baseline);
    expect(saved.rows[0].saved_at).toBeTruthy();

    const beforeStale = await databaseSnapshot(db);
    const stalePayload = structuredClone(validPayload);
    stalePayload.sections[1].content.en.title = "This stale write must roll back";
    stalePayload.sections.find((section) => section.key === "products")!.categories!.push({
      id: "temporary-category",
      slug: "stale-category",
      enabled: true,
      sortOrder: 3,
      productReferenceCount: 0,
      translations: {
        zh: { name: "过期分类", description: "不应写入。" },
        en: { name: "Stale category", description: "Must not be persisted." },
        ar: { name: "فئة قديمة", description: "يجب عدم حفظها." }
      }
    });

    await expect(
      saveAsAuthenticated(db, stalePayload, initial.baseline)
    ).rejects.toThrow("site_content_conflict");
    expect(await databaseSnapshot(db)).toEqual(beforeStale);
  });

  it("refuses to remove a category referenced by a product", async () => {
    const current = await currentSiteContent(db);
    const products = current.payload.sections.find((section) => section.key === "products")!;
    products.categories = products.categories!
      .filter((category) => category.slug !== "custom-development")
      .map((category, index) => ({ ...category, sortOrder: index }));

    await expect(
      saveAsAuthenticated(db, current.payload, current.baseline)
    ).rejects.toThrow("category_in_use");
    const categoryCount = await db.query<{ count: number }>(
      "select count(*)::integer as count from public.product_categories"
    );
    expect(categoryCount.rows[0].count).toBe(3);
  });

  it("writes, replaces and clears section media ids while enforcing the foreign key", async () => {
    await db.query(
      `insert into public.media(id, storage_path, mime_type, byte_size, width, height)
       values
         ($1, '/media/first.webp', 'image/webp', 100, 10, 10),
         ($2, '/media/second.webp', 'image/webp', 100, 10, 10)`,
      [firstMediaId, secondMediaId]
    );

    const initial = await currentSiteContent(db);
    initial.payload.sections.find((section) => section.key === "home")!.media!.mediaId =
      firstMediaId;
    initial.payload.sections.find((section) => section.key === "about")!.media!.mediaId =
      secondMediaId;
    await saveAsAuthenticated(db, initial.payload, initial.baseline);

    const persisted = await db.query<{ key: string; media_id: string | null }>(`
      select key, media_id::text
      from public.site_sections
      where key in ('home','about')
      order by key
    `);
    expect(persisted.rows).toEqual([
      { key: "about", media_id: secondMediaId },
      { key: "home", media_id: firstMediaId }
    ]);

    const replacement = await currentSiteContent(db);
    replacement.payload.sections.find((section) => section.key === "home")!.media!.mediaId =
      secondMediaId;
    replacement.payload.sections.find((section) => section.key === "about")!.media!.mediaId =
      null;
    await saveAsAuthenticated(db, replacement.payload, replacement.baseline);

    const replaced = await db.query<{ key: string; media_id: string | null }>(`
      select key, media_id::text
      from public.site_sections
      where key in ('home','about')
      order by key
    `);
    expect(replaced.rows).toEqual([
      { key: "about", media_id: null },
      { key: "home", media_id: secondMediaId }
    ]);

    const invalid = await currentSiteContent(db);
    invalid.payload.sections.find((section) => section.key === "home")!.media!.mediaId =
      missingMediaId;
    const beforeInvalid = await databaseSnapshot(db);
    await expect(
      saveAsAuthenticated(db, invalid.payload, invalid.baseline)
    ).rejects.toThrow(/foreign key|site_sections_media_id_fkey/i);
    expect(await databaseSnapshot(db)).toEqual(beforeInvalid);
  });

  it("introspects the real save ACL and atomically binds both seeded media references", async () => {
    const homeUrl = "https://example.test/storage/site-content-v1/home/hero-products-placeholder-v1.png";
    const aboutUrl = "https://example.test/storage/site-content-v1/about/company-craft-placeholder-v1.png";
    await db.query(
      `insert into public.media(id, storage_path, mime_type, byte_size, width, height)
       values
         ($1, $2, 'image/png', 100, 10, 10),
         ($3, $4, 'image/png', 100, 10, 10)`,
      [firstMediaId, homeUrl, secondMediaId, aboutUrl]
    );

    const acl = await asRole(db, "service_role", () =>
      db.query<{ public_execute: boolean }>(
        "select public.verify_site_content_setup_v1() as public_execute"
      )
    );
    expect(acl.rows[0].public_execute).toBe(false);
    await db.exec("grant execute on function public.save_site_content_v1(jsonb,jsonb) to anon");
    const unsafeAcl = await asRole(db, "service_role", () =>
      db.query<{ public_execute: boolean }>(
        "select public.verify_site_content_setup_v1() as public_execute"
      )
    );
    expect(unsafeAcl.rows[0].public_execute).toBe(true);
    await db.exec("revoke all on function public.save_site_content_v1(jsonb,jsonb) from anon");
    await expect(
      asRole(db, "anon", () => db.query("select public.verify_site_content_setup_v1()"))
    ).rejects.toThrow(/permission denied/i);

    const beforeFailure = await db.query<{
      key: string;
      media_id: string | null;
      image: string;
      updated_at: Date | string;
    }>(`
      select key, media_id::text, content->'media'->>'image' as image, updated_at
      from public.site_sections where key in ('home','about') order by key
    `);
    await expect(asRole(db, "service_role", () =>
      db.query(
        "select public.set_site_content_seed_media_v1($1,$2,$3,$4)",
        [firstMediaId, homeUrl, missingMediaId, aboutUrl]
      )
    )).rejects.toThrow(/site_content_seed_media_invalid/i);
    const afterFailure = await db.query(`
      select key, media_id::text, content->'media'->>'image' as image, updated_at
      from public.site_sections where key in ('home','about') order by key
    `);
    expect(afterFailure.rows).toEqual(beforeFailure.rows);

    const saved = await asRole(db, "service_role", () =>
      db.query<{ saved_at: Date | string }>(
        "select public.set_site_content_seed_media_v1($1,$2,$3,$4) as saved_at",
        [firstMediaId, homeUrl, secondMediaId, aboutUrl]
      )
    );
    const savedAt = timestamp(saved.rows[0].saved_at);
    const persisted = await db.query<{
      key: string;
      media_id: string;
      image: string;
      updated_at: Date | string;
    }>(`
      select key, media_id::text, content->'media'->>'image' as image, updated_at
      from public.site_sections where key in ('home','about') order by key
    `);
    expect(persisted.rows.map((row) => ({
      key: row.key,
      media_id: row.media_id,
      image: row.image,
      updated_at: timestamp(row.updated_at)
    }))).toEqual([
      { key: "about", media_id: secondMediaId, image: aboutUrl, updated_at: savedAt },
      { key: "home", media_id: firstMediaId, image: homeUrl, updated_at: savedAt }
    ]);

    const rerun = await asRole(db, "service_role", () =>
      db.query<{ saved_at: Date | string }>(
        "select public.set_site_content_seed_media_v1($1,$2,$3,$4) as saved_at",
        [firstMediaId, homeUrl, secondMediaId, aboutUrl]
      )
    );
    expect(timestamp(rerun.rows[0].saved_at)).toBe(savedAt);
  });

  it.each([
    {
      name: "a disabled fixed section",
      error: "fixed_sections_cannot_be_disabled",
      mutate(payload: SiteContentPayload) {
        payload.sections[0].enabled = false;
      }
    },
    {
      name: "a missing category locale",
      error: "invalid_category_translation",
      mutate(payload: SiteContentPayload) {
        const category = payload.sections.find((section) => section.key === "products")!
          .categories![0];
        delete (category.translations as Partial<CategoryPayload["translations"]>).ar;
      }
    },
    {
      name: "an empty category description",
      error: "invalid_category_translation",
      mutate(payload: SiteContentPayload) {
        payload.sections.find((section) => section.key === "products")!
          .categories![0].translations.en.description = " ";
      }
    },
    {
      name: "a layout outside the section whitelist",
      error: "invalid_section_layout",
      mutate(payload: SiteContentPayload) {
        payload.sections[0].layout = "tabs-grid";
      }
    },
    {
      name: "a missing advantages introduction",
      error: "incomplete_section_translation",
      mutate(payload: SiteContentPayload) {
        delete payload.sections.find((section) => section.key === "advantages")!
          .content.en.description;
      }
    },
    {
      name: "a missing localized company name",
      error: "incomplete_section_translation",
      mutate(payload: SiteContentPayload) {
        delete payload.sections.find((section) => section.key === "contact")!
          .content.ar.companyName;
      }
    },
    {
      name: "a missing shared phone",
      error: "invalid_contact_section",
      mutate(payload: SiteContentPayload) {
        delete (payload.sections.find((section) => section.key === "contact")!.shared as Partial<{
          phone: string;
          email: string;
        }>).phone;
      }
    },
    {
      name: "an invalid shared email",
      error: "invalid_contact_section",
      mutate(payload: SiteContentPayload) {
        payload.sections.find((section) => section.key === "contact")!.shared!.email = "a..b@example.com";
      }
    }
  ])("rejects $name", async ({ error, mutate }) => {
    const current = await currentSiteContent(db);
    const before = await databaseSnapshot(db);
    mutate(current.payload);

    await expect(
      saveAsAuthenticated(db, current.payload, current.baseline)
    ).rejects.toThrow(error);
    expect(await databaseSnapshot(db)).toEqual(before);
  });

  it("strips legacy duplicated contact fields before persistence", async () => {
    const current = await currentSiteContent(db);
    const contact = current.payload.sections.find((section) => section.key === "contact")!;
    Object.assign(contact.content.zh, {
      addressLabel: "legacy address label",
      phone: "legacy locale phone",
      email: "legacy-locale@example.com"
    });
    Object.assign(contact.shared!, { footer: "legacy footer" });

    await saveAsAuthenticated(db, current.payload, current.baseline);

    const stored = await db.query<{ content: Record<string, unknown> }>(
      "select content from public.site_sections where key='contact'"
    );
    const persisted = stored.rows[0].content as {
      content: Record<Locale, Record<string, unknown>>;
      shared: Record<string, unknown>;
    };
    expect(persisted.content.zh).toEqual({
      eyebrow: expect.any(String),
      title: expect.any(String),
      companyName: expect.any(String),
      address: expect.any(String)
    });
    expect(persisted.shared).toEqual({
      phone: expect.any(String),
      email: expect.any(String)
    });
  });
});
