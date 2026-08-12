import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/202607270003_function_privileges_v1_2.sql"),
  "utf8",
);

describe("Supabase function privilege hardening migration V1.2", () => {
  it("explicitly revokes privileged RPCs from API roles", () => {
    expect(sql).toContain(
      "revoke execute on function public.accept_inquiry(uuid, jsonb, text, text) from anon, authenticated",
    );
    expect(sql).toContain(
      "revoke execute on function public.handle_new_user() from anon, authenticated",
    );
  });

  it("keeps publishing RPCs available only to signed-in administrators", () => {
    expect(sql).toContain(
      "grant execute on function public.publish_page_version(uuid, integer, uuid) to authenticated",
    );
    expect(sql).toContain(
      "revoke execute on function public.publish_page_version(uuid, integer, uuid) from anon",
    );
  });

  it("prevents anonymous bucket listing", () => {
    expect(sql).toContain(
      "drop policy if exists media_storage_public_read on storage.objects",
    );
  });
});
