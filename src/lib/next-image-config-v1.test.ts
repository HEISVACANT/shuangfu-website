import { afterEach, describe, expect, it, vi } from "vitest";

import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";

const configuredProjectUrl = "https://aflclayrnqucbvhmpfgl.supabase.co";
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

afterEach(() => {
  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }
  vi.resetModules();
});

describe("Next image remote configuration", () => {
  it("allows only the configured Supabase project's public media bucket", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = configuredProjectUrl;
    vi.resetModules();

    const config = (await import("../../next.config")).default;
    const patterns = config.images?.remotePatterns ?? [];

    expect(
      hasRemoteMatch(
        [],
        patterns,
        new URL(`${configuredProjectUrl}/storage/v1/object/public/media/site-content-v1/home/hero.png`)
      )
    ).toBe(true);
    expect(
      hasRemoteMatch(
        [],
        patterns,
        new URL("https://other-project.supabase.co/storage/v1/object/public/media/hero.png")
      )
    ).toBe(false);
    expect(
      hasRemoteMatch(
        [],
        patterns,
        new URL(`${configuredProjectUrl}/storage/v1/object/public/private-media/hero.png`)
      )
    ).toBe(false);
  });
});
