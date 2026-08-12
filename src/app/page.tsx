import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolveLocale } from "@/lib/i18n";

export default async function RootPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale({ cookieLocale: cookieStore.get("sf_locale")?.value, countryCode: headerStore.get("x-vercel-ip-country") ?? undefined });
  redirect(`/${locale}`);
}
