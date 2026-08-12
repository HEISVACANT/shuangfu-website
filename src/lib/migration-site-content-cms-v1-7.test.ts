import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  "supabase/migrations/202608020008_site_content_media_helper_private_v1_7.sql",
);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8").toLowerCase() : "";

describe("site content CMS media helper migration v1.7", () => {
  it("moves the public media helper into an internal schema", () => {
    expect(sql).toContain("create schema if not exists private");
    expect(sql).toContain("create or replace function private.is_public_media_v1_7");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke all on schema private from public");
    expect(sql).toContain("grant usage on schema private to anon, authenticated");
    expect(sql).toContain(
      "grant execute on function private.is_public_media_v1_7(uuid) to anon, authenticated",
    );
    expect(sql).toContain("drop function if exists public.is_public_media_v1_6(uuid)");
  });

  it("keeps media policies limited to active, non-deleted records", () => {
    expect(sql).toContain("drop policy if exists media_public_read on public.media");
    expect(sql).toContain("drop policy if exists media_authenticated_read on public.media");
    expect(sql).toMatch(
      /create policy media_public_read[\s\S]*?to anon[\s\S]*?deleted_at is null[\s\S]*?private\.is_public_media_v1_7\(media\.id\)/,
    );
    expect(sql).toMatch(
      /create policy media_authenticated_read[\s\S]*?to authenticated[\s\S]*?deleted_at is null[\s\S]*?private\.is_public_media_v1_7\(media\.id\)/,
    );
  });
});
