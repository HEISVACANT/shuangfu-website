export const pageContentE2ePortV1 = 3101;
export const pageContentE2eBaseUrlV1 = `http://127.0.0.1:${pageContentE2ePortV1}`;
export const pageContentE2eRuntimeHeaderV1 = "X-E2E-Supabase-Host";

export function localSupabaseUrlForE2eV1(value: string | undefined) {
  if (!value) return "";
  return localhostHostnameFromUrlV1(value) ? value : "";
}

export function localhostHostnameFromUrlV1(value: string) {
  try {
    const hostname = normalizeHostnameV1(new URL(value).hostname);
    return isLocalhostHostnameV1(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

export function isLocalhostHostnameV1(value: string) {
  const hostname = normalizeHostnameV1(value);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function runtimeSupabaseHostForE2eV1(
  environment: {
    E2E_PAGE_CONTENT_RUNTIME_PROBE?: string;
    NEXT_PUBLIC_SUPABASE_URL?: string;
  },
) {
  if (environment.E2E_PAGE_CONTENT_RUNTIME_PROBE !== "1") return null;
  return localhostHostnameFromUrlV1(environment.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

function normalizeHostnameV1(value: string) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}
