import type { NextConfig } from "next";

import {
  pageContentE2eRuntimeHeaderV1,
  runtimeSupabaseHostForE2eV1,
} from "./src/lib/page-content-e2e-safety-v1";

const e2eRuntimeSupabaseHost = runtimeSupabaseHostForE2eV1({
  E2E_PAGE_CONTENT_RUNTIME_PROBE:
    process.env.E2E_PAGE_CONTENT_RUNTIME_PROBE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
});

const supabaseProjectUrl = (() => {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co")
      ? url
      : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  ...(e2eRuntimeSupabaseHost
    ? {
        headers: async () => [
          {
            source: "/:path*",
            headers: [
              {
                key: pageContentE2eRuntimeHeaderV1,
                value: e2eRuntimeSupabaseHost,
              },
            ],
          },
        ],
      }
    : {}),
  images: {
    remotePatterns: supabaseProjectUrl
      ? [
          {
            protocol: "https",
            hostname: supabaseProjectUrl.hostname,
            port: "",
            pathname: "/storage/v1/object/public/media/**",
            search: "",
          },
        ]
      : [],
  },
  outputFileTracingIncludes: {
    "/api/admin/media": [
      "node_modules/sharp/**/*",
      "node_modules/@img/sharp-linux-x64/**/*",
      "node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
  poweredByHeader: false,
};

export default nextConfig;
