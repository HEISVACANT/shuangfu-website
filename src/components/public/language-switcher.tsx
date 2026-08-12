"use client";

import { ChevronDown, Globe2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type { Locale } from "@/lib/i18n";
import { localizePath } from "@/lib/i18n";

const localeLabels: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
  zh: "中文",
};

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <label className="language-switcher">
      <span className="sr-only">Language</span>
      <Globe2 aria-hidden data-language-icon="globe" />
      <span aria-hidden className="language-switcher-label">{localeLabels[locale]}</span>
      <ChevronDown aria-hidden data-language-icon="chevron" />
      <select aria-label="Language" onChange={async (event) => {
        const nextLocale = event.target.value as Locale;
        await fetch("/api/preferences/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: nextLocale, returnTo: pathname }), redirect: "manual" });
        router.push(localizePath(pathname, nextLocale));
      }} value={locale}>
        <option value="zh">中文</option>
        <option value="en">English</option>
        <option value="ar">العربية</option>
      </select>
    </label>
  );
}
