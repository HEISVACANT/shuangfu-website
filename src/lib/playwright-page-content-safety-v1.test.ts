import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("page-content Playwright target safety", () => {
  it("uses an exclusive loopback port and never reuses an existing server", async () => {
    const config = await loadPlaywrightConfigV1();
    const webServer = getWebServerV1(config);

    expect(config.use?.baseURL).toBe("http://127.0.0.1:3101");
    expect(webServer.url).toBe("http://127.0.0.1:3101");
    expect(webServer.command).toContain("--hostname 127.0.0.1 --port 3101");
    expect(webServer.reuseExistingServer).toBe(false);
    expect(webServer.env?.E2E_PAGE_CONTENT_RUNTIME_PROBE).toBe("1");
  });

  it("removes a remote Supabase URL from the actual web-server environment", async () => {
    const config = await loadPlaywrightConfigV1("https://project.supabase.co");

    expect(getWebServerV1(config).env?.NEXT_PUBLIC_SUPABASE_URL).toBe("");
  });

  it("preserves an explicitly supplied IPv6 loopback Supabase URL", async () => {
    const localUrl = "http://[::1]:54321";
    const config = await loadPlaywrightConfigV1(localUrl);

    expect(getWebServerV1(config).env?.NEXT_PUBLIC_SUPABASE_URL).toBe(localUrl);
  });

  it("publishes the actual server runtime Supabase host only for the E2E probe", async () => {
    vi.stubEnv("E2E_PAGE_CONTENT_RUNTIME_PROBE", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://[::1]:54321");
    vi.resetModules();
    const nextConfig = (await import("../../next.config")).default;

    const routes = await nextConfig.headers?.();
    expect(routes).toEqual([
      {
        source: "/:path*",
        headers: [{ key: "X-E2E-Supabase-Host", value: "::1" }],
      },
    ]);
  });
});

async function loadPlaywrightConfigV1(supabaseUrl?: string) {
  if (supabaseUrl === undefined) {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
  }
  vi.resetModules();
  return (await import("../../playwright.config")).default;
}

function getWebServerV1(config: Awaited<ReturnType<typeof loadPlaywrightConfigV1>>) {
  const webServer = config.webServer;
  if (!webServer || Array.isArray(webServer)) throw new Error("expected one Playwright web server");
  return webServer;
}
