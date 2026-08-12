import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202607290005_product_catalog_import_v1_4.sql", "utf8");
const exportMarker = "create or replace function public.export_product_catalog_snapshot_v1()";
const restoreMarker = "create or replace function public.restore_product_catalog_snapshot_v1(p_snapshot jsonb)";
const exportStart = sql.indexOf(exportMarker);
const restoreStart = sql.indexOf(restoreMarker);
const replaceSql = sql.slice(0, exportStart === -1 ? sql.length : exportStart);
const exportSql = exportStart === -1 ? "" : sql.slice(exportStart, restoreStart === -1 ? sql.length : restoreStart);
const restoreSql = restoreStart === -1 ? "" : sql.slice(restoreStart);

describe("product catalog import migration v1.4", () => {
  it("limits import RPC to service_role and soft-removes old products", () => {
    expect(sql).toContain("revoke all on function public.replace_product_catalog_v1(jsonb) from public");
    expect(sql).toContain("revoke all on function public.replace_product_catalog_v1(jsonb) from anon");
    expect(sql).toContain("revoke all on function public.replace_product_catalog_v1(jsonb) from authenticated");
    expect(sql).toContain("grant execute on function public.replace_product_catalog_v1(jsonb) to service_role");
    expect(sql).toMatch(/security definer\s+set search_path=''/);
    expect(sql).toMatch(/update public\.products[\s\S]*status='draft'[\s\S]*deleted_at=now\(\)/);
    expect(replaceSql).not.toMatch(/delete from public\.products/);
  });

  it("validates the fixed v1.0 catalog shape before rebuilding child rows", () => {
    expect(sql).toContain("p_payload->>'version'<>'1.0'");
    expect(sql).toContain("jsonb_array_length(p_payload->'products')<>10");
    expect(sql).toContain("v_image_count<>11");
    expect(sql).toContain("array['zh','en','ar']");
    expect(sql).toMatch(/delete from public\.product_translations/);
    expect(sql).toMatch(/delete from public\.product_images/);
    expect(sql).toMatch(/delete from public\.product_specifications/);
  });

  it("upserts media and returns the normalized import summary", () => {
    expect(replaceSql).toMatch(/insert into public\.media[\s\S]*on conflict\(storage_path\) do update/);
    expect(replaceSql).toContain("jsonb_build_object('version','1.0','productCount',10,'imageCount',11)");
  });

  it("exports all catalog tables from one security-definer snapshot RPC", () => {
    expect(exportSql).toContain("security definer");
    expect(exportSql).toContain("set search_path=''");
    for (const table of ["products", "product_translations", "media", "product_images", "product_specifications"]) {
      expect(exportSql).toContain(`from public.${table}`);
    }
    expect(exportSql).toContain("'capturedAt',now()");
  });

  it("restores arbitrary snapshot counts and exact product history fields", () => {
    expect(restoreSql).toContain("p_snapshot->'products'");
    expect(restoreSql).not.toContain("jsonb_array_length(p_snapshot->'products')<>10");
    expect(restoreSql).not.toContain("v_image_count<>11");
    expect(restoreSql).toContain("(v_product->>'id')::uuid");
    expect(restoreSql).toContain("(v_product->>'status')::public.content_status");
    expect(restoreSql).toContain("(v_product->>'version')::integer");
    expect(restoreSql).toContain("(v_product->>'deleted_at')::timestamptz");
    expect(restoreSql).toContain("(v_product->>'created_at')::timestamptz");
    expect(restoreSql).toContain("(v_product->>'updated_at')::timestamptz");
    expect(restoreSql).toMatch(/update public\.products[\s\S]*status='draft'[\s\S]*deleted_at=now\(\)/);
    const validationBoundary = restoreSql.indexOf("Snapshot validation complete");
    expect(validationBoundary).toBeGreaterThan(restoreSql.indexOf("invalid snapshot product specification"));
    expect(restoreSql.indexOf("update public.products")).toBeGreaterThan(validationBoundary);
    expect(restoreSql).toMatch(/insert into public\.media\(id,storage_path,mime_type,byte_size,width,height,variants,deleted_at,created_at\)/);
    expect(restoreSql.indexOf("snapshot slug conflicts with an unrelated product")).toBeLessThan(validationBoundary);
  });

  it("hard-deletes only a conflicting catalog-v1 import record and never storage objects", () => {
    expect(restoreSql).toContain("Only a conflicting record created by this catalog-v1 import may be hard-deleted");
    expect(restoreSql).toContain("v_conflicting_slug in (");
    expect(restoreSql).toContain("variants->>'storagePath' like 'catalog-v1/%'");
    expect(restoreSql).toContain("coalesce(m.variants->>'storagePath','') not like 'catalog-v1/%'");
    expect(restoreSql).toContain("v_validated_conflicting_product_ids uuid[]");
    expect(restoreSql).toMatch(/delete from public\.products\s+where id=any\(v_validated_conflicting_product_ids\)/);
    expect(restoreSql.match(/delete from public\.products/g)).toHaveLength(1);
    const postValidationSql = restoreSql.slice(restoreSql.indexOf("Snapshot validation complete"));
    expect(postValidationSql).not.toContain("where p.slug=");
    expect(restoreSql).not.toMatch(/delete from storage\.objects/);
  });

  it("checks non-empty trilingual image and specification values", () => {
    expect(replaceSql).toContain("v_image->'alt'->>v_locale");
    expect(replaceSql).toContain("v_specification->'label'->>v_locale");
    expect(replaceSql).toContain("v_specification->'value'->>v_locale");
    expect(restoreSql).not.toContain("v_image->'alt_text'->>v_locale");
    expect(restoreSql).not.toContain("v_specification->'label'->>v_locale");
    expect(restoreSql).not.toContain("v_specification->'value'->>v_locale");
    expect(restoreSql).toContain("not (v_media ? 'variants')");
    expect(restoreSql).toContain("not coalesce(v_image->'alt_text' ?& array['zh','en','ar'],false)");
    expect(restoreSql).toContain("not coalesce(v_specification->'label' ?& array['zh','en','ar'],false)");
    expect(restoreSql).toContain("not coalesce(v_specification->'value' ?& array['zh','en','ar'],false)");
  });

  it("revokes all API roles and grants only service_role for every catalog RPC", () => {
    for (const signature of [
      "public.replace_product_catalog_v1(jsonb)",
      "public.export_product_catalog_snapshot_v1()",
      "public.restore_product_catalog_snapshot_v1(jsonb)"
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public`);
      expect(sql).toContain(`revoke all on function ${signature} from anon`);
      expect(sql).toContain(`revoke all on function ${signature} from authenticated`);
      expect(sql).toContain(`grant execute on function ${signature} to service_role`);
    }
  });
});
