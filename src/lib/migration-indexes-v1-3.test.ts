import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/202607270004_foreign_key_indexes_v1_3.sql"),
  "utf8",
);

describe("Supabase foreign-key index migration V1.3", () => {
  it.each([
    "audit_logs_actor_idx",
    "email_outbox_inquiry_idx",
    "inquiry_followups_author_idx",
    "product_images_media_idx",
    "profile_groups_group_idx",
    "published_versions_publisher_idx",
    "site_settings_updated_by_idx",
  ])("creates %s", (index) => {
    expect(sql).toContain(index);
  });

  it("revokes direct execution of the image-limit trigger", () => {
    expect(sql).toContain("public.enforce_product_image_limit()");
    expect(sql).toContain("from public, anon, authenticated");
  });
});
