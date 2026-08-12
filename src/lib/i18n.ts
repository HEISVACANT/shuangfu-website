export const locales = ["zh", "en", "ar"] as const;

export type Locale = (typeof locales)[number];

const chineseCountryCodes = new Set(["CN", "HK", "MO", "TW"]);
const arabicCountryCodes = new Set([
  "AE",
  "BH",
  "DJ",
  "DZ",
  "EG",
  "EH",
  "IQ",
  "JO",
  "KM",
  "KW",
  "LB",
  "LY",
  "MA",
  "MR",
  "OM",
  "PS",
  "QA",
  "SA",
  "SD",
  "SO",
  "SY",
  "TD",
  "TN",
  "YE"
]);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function resolveLocale(input: {
  cookieLocale?: string;
  countryCode?: string;
}): Locale {
  if (isLocale(input.cookieLocale)) {
    return input.cookieLocale;
  }

  const countryCode = input.countryCode?.toUpperCase();
  if (countryCode && chineseCountryCodes.has(countryCode)) {
    return "zh";
  }
  if (countryCode && arabicCountryCodes.has(countryCode)) {
    return "ar";
  }
  return "en";
}

export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function localizePath(path: string, locale: Locale): string {
  const [pathAndQuery, hash] = path.split("#", 2);
  const queryIndex = pathAndQuery.indexOf("?");
  const pathname =
    queryIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : pathAndQuery.slice(queryIndex);
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const localizedPath = /^\/(zh|en|ar)(?=\/|$)/.test(normalizedPath)
    ? normalizedPath.replace(/^\/(zh|en|ar)(?=\/|$)/, `/${locale}`)
    : `/${locale}${normalizedPath === "/" ? "" : normalizedPath}`;

  return `${localizedPath}${query}${hash ? `#${hash}` : ""}`;
}
