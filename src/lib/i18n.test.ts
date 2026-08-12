import { describe, expect, it } from "vitest";

import {
  isLocale,
  localeDirection,
  localizePath,
  resolveLocale
} from "@/lib/i18n";

describe("resolveLocale", () => {
  it("uses a manual locale before the IP country", () => {
    expect(resolveLocale({ cookieLocale: "ar", countryCode: "CN" })).toBe("ar");
  });

  it.each([
    ["CN", "zh"],
    ["HK", "zh"],
    ["MO", "zh"],
    ["TW", "zh"],
    ["SA", "ar"],
    ["AE", "ar"],
    ["EG", "ar"],
    ["US", "en"],
    [undefined, "en"]
  ] as const)("maps country %s to %s", (countryCode, expected) => {
    expect(resolveLocale({ countryCode })).toBe(expected);
  });

  it("ignores an unsupported manual locale", () => {
    expect(resolveLocale({ cookieLocale: "fr", countryCode: "CN" })).toBe("zh");
  });
});

describe("locale helpers", () => {
  it("recognizes only supported locales", () => {
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("uses RTL only for Arabic", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("zh")).toBe("ltr");
    expect(localeDirection("en")).toBe("ltr");
  });

  it("replaces an existing locale prefix without losing query or hash", () => {
    expect(localizePath("/zh?category=bra-pads#products", "ar")).toBe(
      "/ar?category=bra-pads#products"
    );
  });

  it("prefixes an unlocalized path", () => {
    expect(localizePath("/admin/login", "en")).toBe("/en/admin/login");
  });
});
