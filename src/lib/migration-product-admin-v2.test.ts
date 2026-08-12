import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function resolveMigration(name: string): string {
  const matches = readdirSync(resolve("supabase/migrations"))
    .filter((file) => file.endsWith(`_${name}.sql`))
    .sort();

  expect(matches).toHaveLength(1);
  return resolve("supabase/migrations", matches[0]);
}

const sql = readFileSync(resolveMigration("product_catalog_admin_v2"), "utf8");

const writeRpcs = [
  "save_product_v2",
  "publish_product_v2",
  "archive_product_v2",
  "soft_delete_product_v2"
] as const;

const readRpcs = [
  "list_admin_products_v2",
  "get_admin_product_v2",
  "list_product_categories_v2",
  "list_published_catalog_v2",
  "get_published_product_v2"
] as const;

function functionSql(name: string): string {
  const marker = `create or replace function public.${name}`;
  const start = sql.indexOf(marker);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("create or replace function public.", start + marker.length);
  return sql.slice(start, next === -1 ? sql.length : next);
}

function doBlockContaining(marker: string): string {
  const markerIndex = sql.indexOf(marker);
  expect(markerIndex, `${marker} must exist`).toBeGreaterThanOrEqual(0);
  const start = sql.lastIndexOf("do $$", markerIndex);
  const end = sql.indexOf("$$;", markerIndex);
  expect(start, `${marker} must be inside a DO block`).toBeGreaterThanOrEqual(0);
  expect(end, `${marker} DO block must end`).toBeGreaterThan(markerIndex);
  return sql.slice(start, end + 3);
}

describe("Supabase product catalog admin migration V2", () => {
  it("guards the V2 enum and fills only missing lifecycle values", () => {
    expect(sql).toMatch(
      /if not exists \([\s\S]*pg_type[\s\S]*product_status[\s\S]*create type public\.product_status/,
    );
    for (const status of ["unpublished", "published", "archived"]) {
      expect(sql).toContain(
        `alter type public.product_status add value if not exists '${status}'`,
      );
    }
  });

  it("hardens the V2 category schema without recreating partial-staging tables", () => {
    expect(sql).toContain("create table if not exists public.product_categories");
    expect(sql).toContain(
      "create table if not exists public.product_category_translations",
    );
    for (const column of [
      "id uuid",
      "slug text",
      "sort_order integer",
      "is_enabled boolean",
      "created_at timestamptz",
      "updated_at timestamptz",
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    for (const column of [
      "category_id uuid",
      "locale text",
      "name text",
      "description text",
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    expect(sql.match(/enable row level security/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("accepts only the exact category primary-key columns and blocks unknown primary keys", () => {
    const categoriesPk = doBlockContaining(
      "add constraint product_categories_pkey primary key(id)",
    );
    expect(categoriesPk).toMatch(
      /con\.conkey=array\[\(select attnum[\s\S]*attname='id'\)\]::smallint\[\]/,
    );
    expect(categoriesPk).toContain(
      "raise exception 'product_categories has conflicting primary key'",
    );
    expect(categoriesPk).not.toContain(
      "drop constraint if exists product_categories_pkey",
    );

    const translationsPk = doBlockContaining(
      "add constraint product_category_translations_pkey primary key(category_id,locale)",
    );
    expect(translationsPk).toMatch(
      /con\.conkey=array\[\s*\(select attnum[\s\S]*attname='category_id'\),\s*\(select attnum[\s\S]*attname='locale'\)\s*\]::smallint\[\]/,
    );
    expect(translationsPk).toContain(
      "raise exception 'product_category_translations has conflicting primary key'",
    );
    expect(translationsPk).not.toContain(
      "drop constraint if exists product_category_translations_pkey",
    );
  });

  it("seeds missing categories and locales by case-insensitive slug without overwriting staging content", () => {
    expect(sql).toContain("'bra-pads'");
    expect(sql).toContain("'cups'");
    expect(sql).toContain("array['zh','en','ar']");
    expect(sql).toMatch(
      /insert into public\.product_categories[\s\S]*where not exists[\s\S]*lower\(c\.slug\)=lower\(seed\.slug\)/,
    );
    expect(sql).toMatch(
      /insert into public\.product_category_translations[\s\S]*join public\.product_categories c on lower\(c\.slug\)=lower\(seed\.slug\)[\s\S]*where not exists[\s\S]*t\.category_id=c\.id[\s\S]*t\.locale=seed\.locale/,
    );
    expect(sql).not.toMatch(
      /insert into public\.product_category_translations[\s\S]*00000000-0000-4000-8000-00000000000[123]/,
    );
    expect(sql).not.toMatch(/on conflict[\s\S]*do update/);
    expect(sql).not.toMatch(/update public\.product_categories\b/);
    expect(sql).not.toMatch(/update public\.product_category_translations\b/);
  });

  it("serializes category and locale seeds inside the main transaction", () => {
    const mainTransaction = sql.indexOf("commit;\nbegin;");
    const seedLock = sql.indexOf(
      "lock table public.product_categories,public.product_category_translations in share row exclusive mode",
    );
    const categorySeed = sql.indexOf("insert into public.product_categories");

    expect(mainTransaction).toBeGreaterThanOrEqual(0);
    expect(seedLock).toBeGreaterThan(mainTransaction);
    expect(seedLock).toBeLessThan(categorySeed);
  });

  it("keeps the pristine V1 data backfill behavior", () => {
    expect(sql).toContain("when 'draft' then 'unpublished'::public.product_status");
    expect(sql).toContain("when 'published' then 'published'::public.product_status");
    expect(sql.toLowerCase()).toContain("legacy-");
    expect(sql).toContain("left(replace(p.id::text,'-',''),8)");
    expect(sql).toMatch(/row_number\(\) over \(partition by product_id order by sort_order, id\)/);
  });

  it("maps the valid V1 custom-development category before enforcing the foreign key", () => {
    const notNull = sql.indexOf(
      "alter table public.products\n  alter column code set not null",
    );
    const legacyCategory = sql.indexOf("'custom-development'");
    expect(legacyCategory).toBeGreaterThanOrEqual(0);
    expect(legacyCategory).toBeLessThan(notNull);
    expect(sql).toMatch(
      /set category_id=c\.id\s+from public\.product_categories c\s+where lower\(c\.slug\)=lower\(p\.category\)/,
    );
  });

  it("adds missing partial-staging columns and ensures the product category FK separately", () => {
    for (const column of [
      "code text",
      "category_id uuid",
      "status_v2 public.product_status",
      "colors text",
      "material text",
      "customization_scope text",
      "is_primary boolean",
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    expect(sql).toContain("products_category_id_fkey");
    expect(sql).toMatch(
      /pg_constraint[\s\S]*contype='f'[\s\S]*alter table public\.products[\s\S]*add constraint products_category_id_fkey[\s\S]*references public\.product_categories\(id\)/,
    );
  });

  it("blocks conflicting foreign keys instead of stacking another category FK", () => {
    for (const { marker, message } of [
      {
        marker:
          "add constraint product_category_translations_category_id_fkey",
        message:
          "product_category_translations.category_id has conflicting foreign key",
      },
      {
        marker: "add constraint products_category_id_fkey",
        message: "products.category_id has conflicting foreign key",
      },
    ]) {
      const fkBlock = doBlockContaining(marker);
      expect(fkBlock).toContain("=any(con.conkey)");
      expect(fkBlock).toContain(`raise exception '${message}'`);
      expect(fkBlock).not.toContain("drop constraint if exists");
    }
  });

  it("reuses category foreign keys only when every default FK semantic matches", () => {
    for (const { marker, deleteAction } of [
      {
        marker:
          "add constraint product_category_translations_category_id_fkey",
        deleteAction: "con.confdeltype='c'",
      },
      {
        marker: "add constraint products_category_id_fkey",
        deleteAction: "con.confdeltype='a'",
      },
    ]) {
      const fkBlock = doBlockContaining(marker);
      for (const predicate of [
        deleteAction,
        "con.confupdtype='a'",
        "con.confmatchtype='s'",
        "not con.condeferrable",
        "not con.condeferred",
      ]) {
        expect(fkBlock.match(new RegExp(predicate, "g")) ?? []).toHaveLength(2);
      }
    }
  });

  it("removes the V1 fixed category check before V2 saves dynamic slugs", () => {
    const dropConstraint = sql.indexOf(
      "drop constraint if exists products_category_check",
    );
    expect(dropConstraint).toBeGreaterThanOrEqual(0);
    expect(dropConstraint).toBeLessThan(sql.indexOf("create or replace function public.save_product_v2"));
  });

  it("replaces the inquiry fixed category check with the same safe dynamic slug contract", () => {
    const dropConstraint = sql.indexOf(
      "drop constraint if exists inquiries_product_category_check",
    );
    const dynamicConstraint = sql.indexOf(
      "add constraint inquiries_product_category_slug_check",
    );

    expect(dropConstraint).toBeGreaterThanOrEqual(0);
    expect(dynamicConstraint).toBeGreaterThan(dropConstraint);
    expect(sql).toContain(
      "drop constraint if exists inquiries_product_category_slug_check",
    );
    expect(sql).toContain("length(product_category) between 1 and 80");
    expect(sql).toContain("product_category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
  });

  it("skips the legacy inquiry slug constraint after CMS migrated inquiries to category_id", () => {
    const inquiryConstraint = doBlockContaining(
      "add constraint inquiries_product_category_slug_check",
    );
    const conditionStart = inquiryConstraint.indexOf("if exists (");
    const branchStart = inquiryConstraint.indexOf(") then", conditionStart);
    const branchEnd = inquiryConstraint.indexOf("end if;", branchStart);

    expect(conditionStart).toBeGreaterThanOrEqual(0);
    expect(branchStart).toBeGreaterThan(conditionStart);
    expect(branchEnd).toBeGreaterThan(branchStart);
    expect(inquiryConstraint.slice(conditionStart, branchStart)).toMatch(
      /information_schema\.columns[\s\S]*table_schema='public'[\s\S]*table_name='inquiries'[\s\S]*column_name='product_category'/,
    );
    expect(inquiryConstraint.slice(branchStart, branchEnd)).toContain(
      "alter table public.inquiries",
    );
    expect(inquiryConstraint.slice(0, branchStart)).not.toContain(
      "alter table public.inquiries",
    );
    expect(inquiryConstraint.slice(branchEnd)).not.toContain(
      "alter table public.inquiries",
    );
    expect(sql.match(/alter table public\.inquiries/g) ?? []).toHaveLength(1);
  });

  it("adds case-insensitive uniqueness for category slug, product code, and product slug", () => {
    expect(sql).toMatch(/create unique index if not exists[\s\S]*lower\(slug\)/);
    expect(sql).toMatch(/create unique index if not exists[\s\S]*lower\(code\)/);
    expect(sql.match(/lower\(slug\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const index of [
      "product_categories_slug_ci_uidx",
      "products_code_ci_uidx",
      "products_slug_ci_uidx",
      "product_images_one_primary_uidx",
      "products_category_v2_idx",
    ]) {
      expect(sql).toMatch(new RegExp(`create (?:unique )?index if not exists ${index}`));
    }
  });

  it("drops every named V2 read policy before recreating it", () => {
    for (const policy of [
      "product_categories_public_read",
      "product_categories_authenticated_read",
      "product_category_translations_public_read",
      "product_category_translations_authenticated_read",
      "products_public_read",
      "products_authenticated_read",
      "product_translations_public_read",
      "product_translations_authenticated_read",
      "product_images_public_read",
      "product_images_authenticated_read",
      "product_specs_public_read",
      "product_specs_authenticated_read",
      "media_public_read",
      "media_authenticated_read",
    ]) {
      expect(sql).toContain(`drop policy if exists ${policy}`);
      expect(sql).toContain(`create policy ${policy}`);
    }
  });

  it("removes the CMS v1.5 anonymous category policies in a forward cleanup migration", () => {
    const legacyPolicies = [
      "product_categories_anon_read",
      "product_category_translations_anon_read",
    ];
    const cleanupSql = readFileSync(
      resolveMigration("product_catalog_admin_v2_cms_policy_cleanup"),
      "utf8",
    );

    for (const policy of legacyPolicies) {
      expect(cleanupSql).toContain(`drop policy if exists ${policy}`);
    }
    expect(cleanupSql).not.toContain("create policy");
  });

  it("creates every required read and write RPC", () => {
    for (const rpc of [...readRpcs, ...writeRpcs]) {
      expect(sql).toContain(`create or replace function public.${rpc}`);
    }
  });

  it("guards every write RPC with actor, permission, optimistic concurrency, and one audit insert", () => {
    for (const rpc of writeRpcs) {
      const body = functionSql(rpc);
      expect(body).toContain("p_expected_updated_at");
      expect(body).toContain("p_actor is distinct from (select auth.uid())");
      expect(body).toContain("public.has_permission('products'");
      expect(body).toMatch(/updated_at\s+is not distinct from\s+p_expected_updated_at/);
      expect(body.match(/insert into public\.audit_logs/g)).toHaveLength(1);
    }
  });

  it("enforces lifecycle-specific write rules", () => {
    const saveSql = functionSql("save_product_v2");
    expect(saveSql).toContain("cannot save a published product");
    expect(saveSql).not.toContain("p_payload->>'status'");
    expect(saveSql).toMatch(/status_v2\s*\)\s*values\([\s\S]*'unpublished'/);
    expect(saveSql).toMatch(
      /from public\.products where id=p_product_id and deleted_at is null for update/,
    );

    expect(functionSql("publish_product_v2")).toMatch(
      /status_v2 not in \('unpublished','archived'\)/,
    );
    expect(functionSql("archive_product_v2")).toMatch(
      /status_v2<>'published'/,
    );
    expect(functionSql("soft_delete_product_v2")).toContain("cannot delete a published product");

    const publishSql = functionSql("publish_product_v2");
    expect(publishSql).toContain("category is disabled");
    expect(publishSql).toContain("incomplete translations");
    expect(publishSql).toContain("invalid image count");
    expect(publishSql).toContain("exactly one primary image is required");
    expect(publishSql).toContain("incomplete image alt text");
    expect(publishSql).toContain("at least one complete specification is required");
  });

  it("requires enabled categories only for creates and category changes", () => {
    const saveSql = functionSql("save_product_v2");
    expect(saveSql).toMatch(
      /if p_product_id is null or v_requested_category_id is distinct from v_product\.category_id then[\s\S]*where c\.id=v_requested_category_id and c\.is_enabled[\s\S]*category is disabled[\s\S]*else[\s\S]*where c\.id=v_requested_category_id;[\s\S]*end if/,
    );
    expect(saveSql).toMatch(
      /insert into public\.products[\s\S]*v_requested_category_id,'unpublished'/,
    );
    expect(saveSql).toMatch(
      /update public\.products[\s\S]*category_id=v_requested_category_id/,
    );
  });

  it("validates every specification and only live media with structured details", () => {
    const publishSql = functionSql("publish_product_v2");
    expect(publishSql.match(/join public\.media m on m\.id=i\.media_id/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(publishSql.match(/m\.deleted_at is null/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(publishSql).toMatch(/if exists\([\s\S]*from public\.product_specifications[\s\S]*incomplete specification/);
    expect(publishSql).toContain("detail=v_details::text");
    for (const locale of ["zh", "en", "ar"]) {
      expect(publishSql).toContain(`'${locale}'`);
    }
    expect(publishSql).toContain("'translations.name'");
    expect(publishSql).toContain("'images.alt'");
    expect(publishSql).toContain("'specifications.label'");
  });

  it("does not create or read legacy product version snapshots", () => {
    expect(sql).not.toContain("insert into public.published_versions");
    for (const rpc of [...readRpcs, ...writeRpcs]) {
      expect(functionSql(rpc)).not.toContain("published_versions");
    }
    expect(functionSql("publish_product_v2")).not.toContain("version=version+1");
  });

  it("returns the complete admin product list without hidden pagination", () => {
    const listSql = functionSql("list_admin_products_v2");
    expect(listSql).not.toContain("p_limit");
    expect(listSql).not.toContain("p_offset");
    expect(listSql).not.toMatch(/\blimit\b/);
    expect(listSql).not.toMatch(/\boffset\b/);
  });

  it("keeps enabled public categories even when they contain no published products", () => {
    const catalogSql = functionSql("list_published_catalog_v2");
    const categoryFilter = catalogSql.slice(catalogSql.indexOf("from public.product_categories c"));
    expect(categoryFilter).toMatch(/where c\.is_enabled\s+order by/);
    expect(categoryFilter).not.toContain("exists(select 1 from public.products");
  });

  it("locks public rows to published, live products in enabled categories", () => {
    expect(sql).toContain("to anon");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("status_v2='published'");
    expect(sql).toContain("deleted_at is null");
    expect(sql).toContain("c.is_enabled");
    expect(sql).toContain(
      "revoke insert,update,delete on public.products,public.product_translations,public.product_images,public.product_specifications",
    );
  });

  it("revokes V1 product RPCs and grants only the intended V2 execution roles", () => {
    for (const signature of [
      "public.list_published_products(text,integer,integer,uuid)",
      "public.get_published_product(text)",
      "public.publish_product_version(uuid,integer,uuid)",
      "public.rollback_product_version(uuid,integer,integer,uuid)",
      "public.replace_product_catalog_v1(jsonb)",
      "public.export_product_catalog_snapshot_v1()",
      "public.restore_product_catalog_snapshot_v1(jsonb)"
    ]) {
      expect(sql).toContain(`revoke execute on function ${signature}`);
    }
    for (const rpc of [...readRpcs, ...writeRpcs]) {
      expect(sql).toContain(`revoke execute on function public.${rpc}`);
    }
    for (const rpc of readRpcs) {
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${rpc}\\([^;]*\\) to service_role`)
      );
    }
    for (const rpc of writeRpcs) {
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${rpc}\\([^;]+\\) to authenticated`)
      );
    }
    expect(sql).toContain("grant execute on function");
  });
});
