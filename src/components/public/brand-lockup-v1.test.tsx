import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLockupV1 } from "@/components/public/brand-lockup-v1";

describe("BrandLockupV1", () => {
  it.each([
    ["zh", "双芙", "brand-wordmark-zh"],
    ["en", "SHUANGFU", "brand-wordmark-en"],
    ["ar", "SHUANGFU", "brand-wordmark-en"]
  ] as const)("uses component-scoped horizontal sizing classes for %s", (locale, alt, globalWordmarkClass) => {
    render(<BrandLockupV1 locale={locale} />);

    const wordmark = screen.getByAltText(alt);
    const lockup = wordmark.closest("span")!;
    const symbol = lockup.querySelector(".brand-symbol")!;

    expect(lockup).toHaveClass("brand-lockup");
    expect(lockup.classList.length).toBeGreaterThan(1);
    expect(symbol.classList.length).toBeGreaterThan(1);
    expect(wordmark).toHaveClass(globalWordmarkClass);
    expect(wordmark.classList.length).toBeGreaterThan(2);
    expect(lockup).toHaveAttribute("dir", "ltr");
  });
});
