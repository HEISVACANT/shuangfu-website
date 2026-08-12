import { defineConfig, devices } from "@playwright/test";

import {
  localSupabaseUrlForE2eV1,
  pageContentE2eBaseUrlV1,
  pageContentE2ePortV1,
} from "./src/lib/page-content-e2e-safety-v1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: pageContentE2eBaseUrlV1,
    trace: "on-first-retry"
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${pageContentE2ePortV1}`,
    env: {
      E2E_PAGE_CONTENT_RUNTIME_PROBE: "1",
      NEXT_PUBLIC_SUPABASE_URL: localSupabaseUrlForE2eV1(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
      ),
    },
    url: pageContentE2eBaseUrlV1,
    reuseExistingServer: false
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } }
  ]
});
