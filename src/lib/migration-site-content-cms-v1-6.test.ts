import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  "supabase/migrations/202607300007_site_content_cms_hardening_v1_6.sql",
);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8").toLowerCase() : "";

describe("site content CMS hardening migration v1.6", () => {
  it("extends anonymous media reads to active home/about section media only", () => {
    expect(sql).toContain("drop policy if exists media_public_read on public.media");
    expect(sql).toContain("drop policy if exists media_authenticated_read on public.media");
    expect(sql).toContain("create policy media_public_read");
    expect(sql).toContain("create policy media_authenticated_read");
    expect(sql).toContain("section.media_id = p_media_id");
    expect(sql).toContain("section.key in ('home', 'about')");
    expect(sql).toContain("create or replace function public.is_public_media_v1_6");
    expect(sql).toContain("security definer");
    expect(sql).toContain(
      "grant execute on function public.is_public_media_v1_6(uuid) to anon, authenticated",
    );
    expect(sql).toMatch(
      /create policy media_public_read[\s\S]*?to anon[\s\S]*?using\s*\(\s*deleted_at is null\s+and/,
    );
    expect(sql).toMatch(
      /create policy media_authenticated_read[\s\S]*?to authenticated[\s\S]*?using\s*\(\s*deleted_at is null\s+and[\s\S]*has_permission\('media',\s*'view'\)/,
    );
  });

  it("wraps the existing save RPC with mirrored payload limits", () => {
    expect(sql).toContain("alter function public.save_site_content_v1(jsonb, jsonb)");
    expect(sql).toContain("rename to save_site_content_v1_5");
    expect(sql).toContain("create or replace function public.validate_site_content_payload_v1_6");
    expect(sql).toContain("char_length(v_text) > 3000");
    expect(sql).toContain("char_length(v_phone) > 60");
    expect(sql).toContain("char_length(v_email) > 254");
    expect(sql).toContain("jsonb_array_length(v_about->'facts') <> 3");
    expect(sql).toContain("perform public.validate_site_content_payload_v1_6(p_payload)");
  });

  it("keeps the public save surface authenticated-only", () => {
    expect(sql).toMatch(
      /revoke all on function public\.save_site_content_v1\(jsonb,jsonb\)\s+from public, anon/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.save_site_content_v1\(jsonb,jsonb\)\s+to authenticated/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.save_site_content_v1_5\(jsonb,jsonb\)\s+from public, anon, authenticated/,
    );
  });
});
