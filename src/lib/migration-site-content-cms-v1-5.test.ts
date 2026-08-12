import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/202607290006_site_content_cms_v1_5.sql"),
  "utf8",
).toLowerCase();

const saveFunctionMarker =
  "create or replace function public.save_site_content_v1(p_payload jsonb, p_baseline jsonb)";
const saveFunctionStart = sql.indexOf(saveFunctionMarker);
const saveFunctionEndMarker = saveFunctionStart === -1 ? -1 : sql.indexOf("\n$$;", saveFunctionStart);
const saveFunctionSql =
  saveFunctionStart === -1 || saveFunctionEndMarker === -1
    ? ""
    : sql.slice(saveFunctionStart, saveFunctionEndMarker + 4);

describe("site content CMS migration v1.5", () => {
  it("creates the section and dynamic category schema with RLS", () => {
    expect(sql).toContain("create table public.site_sections");
    expect(sql).toContain("create table public.product_categories");
    expect(sql).toContain("create table public.product_category_translations");
    expect(sql).toContain("constraint site_sections_sort_unique unique (sort_order) deferrable initially deferred");
    expect(sql).toContain("alter table public.site_sections enable row level security");
    expect(sql).toContain("alter table public.product_categories enable row level security");
    expect(sql).toContain("alter table public.product_category_translations enable row level security");
    expect(sql).toContain("to anon, authenticated");
    expect(sql).toContain("has_permission('pages','edit')");
    expect(sql).toMatch(/create table public\.product_category_translations[\s\S]*description text not null/);
    expect(sql).toMatch(/check \(length\(trim\(description\)\) > 0\)/);
    expect(sql).not.toMatch(
      /create policy [^\n]+\n\s+on public\.(site_sections|product_categories|product_category_translations) for (insert|update|delete)/,
    );
  });

  it("migrates products to required category foreign keys in a safe order", () => {
    const createCategories = sql.indexOf("create table public.product_categories");
    const seedCategories = sql.indexOf("insert into public.product_categories");
    const addNullableCategoryId = sql.indexOf("add column category_id uuid");
    const backfillProducts = sql.indexOf("update public.products");
    const rejectMissingCategory = sql.indexOf("product_category_backfill_failed");
    const requireCategoryId = sql.indexOf("alter column category_id set not null");
    const handleLegacyCategory = sql.indexOf("create or replace function public.sync_product_category_v1");

    expect(seedCategories).toBeGreaterThan(createCategories);
    expect(addNullableCategoryId).toBeGreaterThan(seedCategories);
    expect(backfillProducts).toBeGreaterThan(addNullableCategoryId);
    expect(rejectMissingCategory).toBeGreaterThan(backfillProducts);
    expect(requireCategoryId).toBeGreaterThan(rejectMissingCategory);
    expect(handleLegacyCategory).toBeGreaterThan(requireCategoryId);
    expect(sql).toContain("drop constraint if exists products_category_check");
    expect(sql).toContain("create trigger sync_product_category_v1");
    expect(sql).toContain("create index products_category_public_idx");
    expect(sql).toContain("create index products_category_id_idx");
    expect(sql).toContain("create index site_sections_media_id_idx");
    expect(sql).toContain("create index site_sections_updated_by_idx");
  });

  it("seeds and backfills every category allowed by the legacy schema", () => {
    for (const slug of ["bra-pads", "cups", "custom-development"]) {
      expect(sql).toContain(`'${slug}'`);
    }
    expect(sql).toContain("where category.slug = product.category");
    expect(sql).toContain("where category.slug = inquiry.product_category");
    expect(sql.indexOf("'custom-development'")).toBeLessThan(
      sql.indexOf("product_category_backfill_failed"),
    );
  });

  it("rebuilds product and inquiry RPCs around trusted category records", () => {
    for (const functionName of [
      "product_payload",
      "list_published_products",
      "get_published_product",
      "publish_product_version",
      "rollback_product_version",
    ]) {
      expect(sql).toContain(`create or replace function public.${functionName}`);
    }

    expect(sql).toContain("category_name_snapshot");
    expect(sql).toContain("category_id uuid references public.product_categories(id) on delete set null");
    expect(sql).toMatch(
      /create or replace function public\.accept_inquiry\(\s*p_id uuid,\s*p_payload jsonb,\s*p_country_code text,\s*p_owner_email text,\s*p_category_id uuid\s*\)/,
    );
    expect(sql).toContain("from public.product_category_translations");
    expect(sql).toContain("not v_category.is_enabled");
    expect(sql).not.toContain("p_payload->>'categorynamesnapshot'");
    expect(sql).toContain("translation.description");
  });

  it("atomically saves five sections with optimistic locking and category protection", () => {
    expect(saveFunctionSql).toContain("returns timestamptz");
    expect(saveFunctionSql).toContain("security definer");
    expect(saveFunctionSql).toContain("set search_path=''");
    expect(saveFunctionSql).toContain("if not public.has_permission('pages','edit') then");
    expect(saveFunctionSql).toContain("message = 'forbidden'");
    expect(saveFunctionSql).toContain("jsonb_array_length(p_payload->'sections') <> 5");
    expect(saveFunctionSql).toContain("array['home','about','products','advantages','contact']");
    expect(saveFunctionSql).toContain("fixed_sections_cannot_be_disabled");
    expect(saveFunctionSql).toContain("invalid_section_sort_order");
    expect(saveFunctionSql).toContain("invalid_section_layout");
    expect(saveFunctionSql).toContain("invalid_home_section");
    expect(saveFunctionSql).toContain("invalid_about_section");
    expect(saveFunctionSql).toContain("invalid_products_section");
    expect(saveFunctionSql).toContain("invalid_advantages_section");
    expect(saveFunctionSql).toContain("invalid_contact_section");
    expect(saveFunctionSql).toContain("array['eyebrow','title','description']");
    expect(saveFunctionSql).toContain("array['eyebrow','title','companyname','address']");
    expect(saveFunctionSql).toContain("v_section->'shared'->>'phone'");
    expect(saveFunctionSql).toContain("v_section->'shared'->>'email'");
    expect(saveFunctionSql).toContain("'companyname', v_section->'content'->'zh'->'companyname'");
    expect(saveFunctionSql).not.toContain("'addressLabel','telephoneLabel','mailLabel'");
    expect(saveFunctionSql).toContain("incomplete_section_translation");
    expect(saveFunctionSql).toContain("invalid_category_translation");
    expect(saveFunctionSql).toContain("category->>'productreferencecount'");
    const translationUpsert = saveFunctionSql.slice(
      saveFunctionSql.indexOf("insert into public.product_category_translations"),
      saveFunctionSql.indexOf("delete from public.product_categories"),
    );
    expect(translationUpsert).toContain("category_id, locale, name, description");
    expect(translationUpsert).toContain("description = excluded.description");
    expect(translationUpsert).not.toContain("coalesce(");
    expect(saveFunctionSql).toContain("p_baseline");
    expect(saveFunctionSql).toContain("updated_at is distinct from");
    expect(saveFunctionSql).toContain("message = 'site_content_conflict'");
    expect(saveFunctionSql).toContain("message = 'category_in_use'");
    expect(saveFunctionSql).toContain("insert into public.audit_logs");
    expect(saveFunctionSql).toContain("return v_saved_at");
    expect(saveFunctionSql).toContain("media_id = case");
    expect(saveFunctionSql).toContain("v_section->'media'->>'mediaid'");
    expect(saveFunctionSql.indexOf("fixed_sections_cannot_be_disabled")).toBeLessThan(
      saveFunctionSql.indexOf("update public.site_sections"),
    );
  });

  it("restricts the save RPC to authenticated callers", () => {
    expect(sql).toContain(
      "revoke all on function public.save_site_content_v1(jsonb,jsonb) from public",
    );
    expect(sql).toContain(
      "revoke all on function public.save_site_content_v1(jsonb,jsonb) from anon",
    );
    expect(sql).toContain(
      "grant execute on function public.save_site_content_v1(jsonb,jsonb) to authenticated",
    );
  });

  it("exposes service-role-only ACL introspection and atomic seed media binding", () => {
    expect(sql).toContain("create or replace function public.verify_site_content_setup_v1()");
    expect(sql).not.toContain("pg_has_function_privilege");
    expect(sql).toMatch(
      /pg_catalog\.has_function_privilege\(\s*'anon'::name,\s*'public\.save_site_content_v1\(jsonb,jsonb\)'::regprocedure,\s*'execute'\s*\)/,
    );
    expect(sql).toContain("create or replace function public.set_site_content_seed_media_v1(");
    expect(sql).toContain("message = 'site_content_seed_media_invalid'");
    expect(sql).toContain("jsonb_set(section.content, '{media,image}'");
    expect(sql).toContain("updated_at = v_saved_at");
    for (const signature of [
      "public.verify_site_content_setup_v1()",
      "public.set_site_content_seed_media_v1(uuid,text,uuid,text)",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function ${signature} to service_role`);
    }
  });
});
