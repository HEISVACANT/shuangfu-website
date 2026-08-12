import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  isLocalhostHostnameV1,
  pageContentE2eRuntimeHeaderV1,
} from "../src/lib/page-content-e2e-safety-v1";

const storageState = process.env.E2E_PAGE_CONTENT_STORAGE_STATE;

test.describe("page content CMS with an externally supplied admin session", () => {
  test.skip(
    !storageState,
    "requires E2E_PAGE_CONTENT_STORAGE_STATE for a pre-authenticated administrator; credentials are never stored in this repository",
  );

  if (storageState) test.use({ storageState });

  test("compares the Chinese, English, and Arabic editor baselines with the three public routes", async ({ page, context }) => {
    await page.goto("/admin/pages");
    await expect(page.getByRole("heading", { name: "首页" })).toBeVisible();
    const publicPage = await context.newPage();

    for (const [locale, label] of [["zh", "中文"], ["en", "English"], ["ar", "العربية"]] as const) {
      await page.getByRole("tab", { name: label }).click();
      const editorTitle = page.locator(`[data-field-path="home.${locale}.title"]`);
      const configuredTitle = await editorTitle.inputValue();
      expect(configuredTitle.trim()).not.toBe("");

      await publicPage.goto(`/${locale}`);
      await expect(publicPage.locator("#home")).toContainText(configuredTitle);
      if (locale === "ar") {
        await expect(publicPage.getByTestId("site-sections")).toHaveAttribute("dir", "rtl");
      }
    }
  });

  test("renders all home layouts, media, dynamic categories, inquiry categories, Arabic RTL, and the 390px preview", async ({ page, context }) => {
    await page.goto("/admin/pages");
    await expect(page.getByRole("heading", { name: "首页" })).toBeVisible();

    for (const [label, layout] of [
      ["A · 文左图右", "text-left"],
      ["B · 图左文右", "image-left"],
      ["C · 居中大标题", "centered"],
    ] as const) {
      await page.getByRole("radio", { name: label }).check();
      const previewPage = await openPreviewV1(page, context);
      await expect(previewPage.getByTestId("section-home")).toHaveAttribute("data-layout", layout);
      await expect(previewPage.locator("#home img")).toBeVisible();
      await previewPage.close();
    }

    const previewPage = await openPreviewV1(page, context);
    const previewFrame = previewPage.getByTestId("page-content-preview-frame");
    const inquiryCategory = previewPage.locator('#inquiry select[name="categoryId"]');
    await expect(inquiryCategory).toHaveCount(1);
    await expect(inquiryCategory.locator("option")).not.toHaveCount(0);
    await expect(previewPage.locator("#products .product-category")).not.toHaveCount(0);

    const previewArabic = previewPage.getByRole("button", { name: "العربية" });
    await expect(previewArabic).toHaveCount(1);
    await previewArabic.click();
    await expect(previewPage.getByTestId("site-sections")).toHaveAttribute("dir", "rtl");

    const previewMobile = previewPage.getByRole("button", { name: "移动端" });
    await expect(previewMobile).toHaveCount(1);
    await previewMobile.click();
    await expect(previewFrame).toHaveAttribute("data-viewport", "mobile");
    expect(await previewFrame.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  });

  test("edits ordering, categories, and advantage steps without persisting", async ({ page }) => {
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "下移 首页" }).click();
    await expect(page.getByTestId("page-content-section").first()).toContainText("企业介绍");

    await page.getByRole("button", { name: "编辑 产品介绍" }).click();
    const categories = page.locator('[data-testid^="product-category-"]');
    const categoryCount = await categories.count();
    await page.getByRole("button", { name: "新增分类" }).click();
    await expect(categories).toHaveCount(categoryCount + 1);
    const emptyCategory = categories.last();
    page.once("dialog", (dialog) => dialog.accept());
    await emptyCategory.getByRole("button", { name: "删除分类" }).click();
    await expect(categories).toHaveCount(categoryCount);

    const referencedCategory = categories.filter({ hasText: /已关联 \d+ 个产品/ }).first();
    await expect(referencedCategory).toBeVisible();
    await expect(referencedCategory.getByRole("button", { name: "删除分类" })).toBeDisabled();

    await page.getByRole("button", { name: "编辑 合作优势" }).click();
    const steps = page.locator('[data-testid^="advantage-step-"]');
    const stepCount = await steps.count();
    await page.getByRole("button", { name: "新增优势步骤" }).click();
    await expect(steps).toHaveCount(stepCount + 1);
    await expect(page.getByText("有未保存更改")).toBeVisible();
  });

  test("opens an unsaved preview in a new tab while the public page remains unchanged", async ({ page, context }) => {
    const draftTitle = "E2E preview only — not persisted";
    const publicPage = await context.newPage();
    await publicPage.goto("/zh");

    await page.goto("/admin/pages");
    await page.locator('[data-field-path="home.zh.title"]').fill(draftTitle);

    const previewPage = await openPreviewV1(page, context);
    await expect(previewPage.getByTestId("page-content-preview-frame")).toContainText(draftTitle);
    await expect(publicPage.locator("#home")).not.toContainText(draftTitle);
  });

  test("saves to a local Supabase target, publishes all locales, and restores the original titles", async ({ page, context }, testInfo) => {
    const runtimeResponse = await page.request.get("/admin/pages");
    const runtimeSupabaseHost =
      runtimeResponse.headers()[pageContentE2eRuntimeHeaderV1.toLowerCase()];
    test.skip(
      !runtimeSupabaseHost || !isLocalhostHostnameV1(runtimeSupabaseHost),
      "requires the exclusively started test server to confirm its runtime Supabase host is local",
    );
    test.skip(testInfo.project.name !== "desktop-chromium", "only one desktop project may mutate the isolated local target");

    const originals = new Map<string, string>();
    const drafts = new Map<string, string>();
    let saveAttempted = false;
    try {
      await page.goto("/admin/pages");
      for (const [locale, label] of [["zh", "中文"], ["en", "English"], ["ar", "العربية"]] as const) {
        await page.getByRole("tab", { name: label }).click();
        const title = page.locator(`[data-field-path="home.${locale}.title"]`);
        originals.set(locale, await title.inputValue());
        const draft = `E2E local ${locale} ${Date.now()}`;
        drafts.set(locale, draft);
        await title.fill(draft);
      }
      saveAttempted = true;
      await page.getByRole("button", { name: "保存并立即生效" }).click();
      await expect(page.getByText("已保存并生效。")).toBeVisible();

      const publicPage = await context.newPage();
      for (const locale of ["zh", "en", "ar"] as const) {
        await publicPage.goto(`/${locale}`);
        await expect(publicPage.locator("#home")).toContainText(drafts.get(locale)!);
      }
    } finally {
      if (saveAttempted) {
        await page.goto("/admin/pages");
        for (const [locale, label] of [["zh", "中文"], ["en", "English"], ["ar", "العربية"]] as const) {
          await page.getByRole("tab", { name: label }).click();
          await page.locator(`[data-field-path="home.${locale}.title"]`).fill(originals.get(locale)!);
        }
        await page.getByRole("button", { name: "保存并立即生效" }).click();
        await expect(page.getByText("已保存并生效。")).toBeVisible();
      }
    }
  });
});

async function openPreviewV1(page: Page, context: BrowserContext) {
  const previewPagePromise = context.waitForEvent("page");
  await page.getByTestId("page-content-preview-trigger").click();
  const previewPage = await previewPagePromise;
  await previewPage.waitForLoadState("domcontentloaded");
  await expect(previewPage.getByTestId("page-content-preview-frame")).toBeVisible();
  return previewPage;
}
