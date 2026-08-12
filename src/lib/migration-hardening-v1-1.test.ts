import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/202607270002_security_hardening_v1_1.sql"),
  "utf8",
);

describe("Supabase security hardening migration V1.1", () => {
  it("removes broad management policies", () => {
    expect(sql).toContain("drop policy if exists pages_manage");
    expect(sql).toContain("create policy pages_delete");
    expect(sql).toContain("has_permission('pages', 'delete')");
  });

  it("prevents public invocation of trigger functions", () => {
    expect(sql).toContain(
      "revoke all on function public.handle_new_user() from public",
    );
    expect(sql).toContain(
      "revoke all on function public.protect_system_owner() from public",
    );
  });

  it("protects the system owner", () => {
    expect(sql).toContain("profiles_single_system_owner_idx");
    expect(sql).toContain("system owner cannot be deleted, demoted, or disabled");
  });
});
