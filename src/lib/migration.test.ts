import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/202607270001_initial_schema_v1.sql"), "utf8");
const protectedTables = ["profiles","permission_groups","group_permissions","profile_groups","pages","page_translations","products","product_translations","media","product_images","product_specifications","customization_dimensions","published_versions","site_settings","inquiries","inquiry_followups","inquiry_rate_limits","email_outbox","audit_logs"];

describe("initial Supabase migration", () => {
  it.each(protectedTables)("enables RLS for %s", (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
  });

  it("does not grant anonymous access to private operational tables", () => {
    expect(sql).not.toMatch(/grant[^;]+(?:inquiries|profiles|audit_logs|email_outbox)[^;]+to anon/i);
  });

  it("creates immutable publish and rollback history paths", () => {
    expect(sql).toContain("publish_page_version");
    expect(sql).toContain("rollback_page_version");
    expect(sql).toContain("publish_product_version");
    expect(sql).toContain("rollback_product_version");
  });
});
