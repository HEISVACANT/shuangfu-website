import { expect, test } from "@playwright/test";

test("renders the fallback V2 catalog in server order and expands complete product details", async ({ page }) => {
  await page.goto("/zh");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("贴近身体的柔软");
  await expect(page.getByTestId("public-product-category")).toHaveCount(2);
  await expect(page.getByTestId("public-product-category").nth(0)).toContainText("胸垫");
  await expect(page.getByTestId("public-product-category").nth(1)).toContainText("罩杯");
  await page.getByRole("button", { name: /胸垫/ }).click();
  await expect(page.locator(".product-card")).toHaveCount(12);
  await page.getByRole("button", { name: "加载更多" }).click();
  await expect(page.locator(".product-card")).toHaveCount(14);
  await page.locator(".product-card").first().click();
  const detail = page.locator(".product-detail");
  await expect(detail).toContainText("产品编号");
  await expect(detail).toContainText("BP-001");
  await expect(detail).toContainText("颜色");
  await expect(detail).toContainText("材质");
  await expect(detail).toContainText("定制范围");

  await detail.getByRole("link", { name: "咨询该产品" }).click();
  await expect(page.getByRole("combobox", { name: "意向类目" })).toHaveValue("bra-pads");
  await expect(page.locator(".selected-product-chips")).toContainText("胸垫 1");
});

test("product APIs accept repository categories and reject non-public lookups", async ({ request }) => {
  const catalogResponse = await request.get("/api/products?category=bra-pads&limit=12");
  expect(catalogResponse.status()).toBe(200);
  const catalog = await catalogResponse.json();
  expect(catalog.items).toHaveLength(12);
  expect(catalog.items.every((product: { status: string; deletedAt: string | null }) =>
    product.status === "published" && product.deletedAt === null
  )).toBe(true);

  const unknownCategory = await request.get("/api/products?category=custom-development");
  expect(unknownCategory.status()).toBe(400);

  const invalidLocale = await request.get("/api/products?category=bra-pads&locale=fr");
  expect(invalidLocale.status()).toBe(400);

  const expiredCursor = await request.get("/api/products?category=bra-pads&cursor=expired-product-id");
  expect(expiredCursor.status()).toBe(400);

  const missingProduct = await request.get("/api/products/not-a-public-product");
  expect(missingProduct.status()).toBe(404);
});

test("public header keeps the extracted symbol left of the locale wordmark", async ({ page }) => {
  await page.goto("/zh");

  const chineseBrand = page.locator(".site-header .brand-lockup");
  await expect(chineseBrand.getByAltText("双芙")).toHaveAttribute("src", /shuangfu-wordmark-zh-v1\.png/);
  const chineseSymbolBox = await chineseBrand.locator(".brand-symbol").boundingBox();
  const chineseWordmarkBox = await chineseBrand.locator(".brand-wordmark").boundingBox();
  expect(chineseSymbolBox).not.toBeNull();
  expect(chineseWordmarkBox).not.toBeNull();
  expect(chineseSymbolBox!.x).toBeLessThan(chineseWordmarkBox!.x);

  await page.goto("/ar");

  const arabicBrand = page.locator(".site-header .brand-lockup");
  await expect(arabicBrand.getByAltText("SHUANGFU")).toHaveAttribute("src", /shuangfu-wordmark-en-v1\.png/);
  const arabicSymbolBox = await arabicBrand.locator(".brand-symbol").boundingBox();
  const arabicWordmarkBox = await arabicBrand.locator(".brand-wordmark").boundingBox();
  expect(arabicSymbolBox).not.toBeNull();
  expect(arabicWordmarkBox).not.toBeNull();
  expect(arabicSymbolBox!.x).toBeLessThan(arabicWordmarkBox!.x);
});

test("language switcher presents a globe, locale label, and unified chevron", async ({ page }) => {
  await page.goto("/zh");

  const switcher = page.locator(".language-switcher");
  await expect(switcher.locator('[data-language-icon="globe"]')).toHaveCount(1);
  await expect(switcher.locator('[data-language-icon="chevron"]')).toHaveCount(1);
  await expect(switcher.locator(".language-switcher-label")).toHaveText("中文");
  await expect(switcher.locator("select")).toHaveCSS("appearance", "none");
});

test("all locales keep the five CMS anchors and fixed inquiry form", async ({ page }) => {
  for (const locale of ["zh", "en", "ar"]) {
    await page.goto(`/${locale}`);
    for (const anchor of ["home", "about", "products", "advantages", "contact"]) {
      await expect(page.locator(`#${anchor}`)).toHaveCount(1);
    }
    await expect(page.locator("#inquiry .inquiry-form")).toHaveCount(1);
  }
});

test("public header keeps the extracted symbol left of the locale wordmark", async ({ page }) => {
  await page.goto("/zh");

  const chineseBrand = page.locator(".site-header .brand-lockup");
  await expect(chineseBrand.getByAltText("双芙")).toHaveAttribute("src", /shuangfu-wordmark-zh-v1\.png/);
  const chineseSymbolBox = await chineseBrand.locator(".brand-symbol").boundingBox();
  const chineseWordmarkBox = await chineseBrand.locator(".brand-wordmark").boundingBox();
  expect(chineseSymbolBox).not.toBeNull();
  expect(chineseWordmarkBox).not.toBeNull();
  expect(chineseSymbolBox!.x).toBeLessThan(chineseWordmarkBox!.x);

  await page.goto("/ar");

  const arabicBrand = page.locator(".site-header .brand-lockup");
  await expect(arabicBrand.getByAltText("SHUANGFU")).toHaveAttribute("src", /shuangfu-wordmark-en-v1\.png/);
  const arabicSymbolBox = await arabicBrand.locator(".brand-symbol").boundingBox();
  const arabicWordmarkBox = await arabicBrand.locator(".brand-wordmark").boundingBox();
  expect(arabicSymbolBox).not.toBeNull();
  expect(arabicWordmarkBox).not.toBeNull();
  expect(arabicSymbolBox!.x).toBeLessThan(arabicWordmarkBox!.x);
});

test("language switcher presents a globe, locale label, and unified chevron", async ({ page }) => {
  await page.goto("/zh");

  const switcher = page.locator(".language-switcher");
  await expect(switcher.locator('[data-language-icon="globe"]')).toHaveCount(1);
  await expect(switcher.locator('[data-language-icon="chevron"]')).toHaveCount(1);
  await expect(switcher.locator(".language-switcher-label")).toHaveText("中文");
  await expect(switcher.locator("select")).toHaveCSS("appearance", "none");
});

test("Arabic route uses RTL and locale preference persists", async ({ page, context }) => {
  await page.goto("/ar");
  await expect(page.locator(".locale-shell")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("Language").selectOption("zh");
  await expect(page).toHaveURL(/\/zh$/);
  const cookie = (await context.cookies()).find((item) => item.name === "sf_locale");
  expect(cookie?.value).toBe("zh");
});

test("Arabic mobile contact keeps LTR values aligned with the RTL copy", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only assertion");
  await page.goto("/ar#contact");

  const ltrValues = page.locator('.contact dd[dir="ltr"]');
  await expect(ltrValues).toHaveCount(2);
  const textAlignments = await ltrValues.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).textAlign),
  );
  expect(textAlignments).toEqual(["right", "right"]);
});

test("inquiry selects share one arrow style and required marks use the theme color", async ({ page }) => {
  await page.goto("/zh#inquiry");

  const nativeSelects = page.locator(".inquiry-form select");
  await expect(nativeSelects).toHaveCount(2);
  const appearances = await nativeSelects.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).appearance),
  );
  expect(appearances).toEqual(["none", "none"]);

  await expect(page.locator(".select-control > svg")).toHaveCount(2);
  await expect(page.locator(".product-picker-trigger > svg")).toHaveCount(1);
  await expect(page.getByRole("option", { name: "定制开发" })).toHaveAttribute(
    "value",
    "custom-development"
  );

  const requiredMarks = page.locator(".inquiry-form .required-mark");
  await expect(requiredMarks).toHaveCount(8);
  const requiredMarkColors = await requiredMarks.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).color),
  );
  expect(new Set(requiredMarkColors)).toEqual(new Set(["rgb(139, 51, 72)"]));
});

test("mobile layout has no horizontal overflow and uses two product columns", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only assertion");
  await page.goto("/zh");
  await page.getByRole("button", { name: /胸垫/ }).click();
  const columns = await page.locator(".product-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("admin pages expose either the authenticated login gate or the local preview workspace", async ({ page }) => {
  await page.goto("/admin/pages");
  const loginGate = page.getByRole("heading", { name: "需要管理员登录" });
  const previewBanner = page.getByText("预览模式");
  await expect(loginGate.or(previewBanner)).toBeVisible();
  if (await loginGate.isVisible()) {
    await expect(page.getByRole("link", { name: "前往登录" })).toHaveAttribute("href", "/admin/login");
    return;
  }
  await expect(page.getByRole("link", { name: "产品目录" })).toBeVisible();
  await expect(page.getByRole("link", { name: "合作意向" })).toBeVisible();
  await expect(page.getByRole("link", { name: "用户与权限" })).toBeVisible();
});
