import { describe, expect, it } from "vitest";

import {
  defaultSiteContentConfigV1,
  getSectionConfigV1,
  siteContentConfigSchemaV1,
  validateSiteContentForSave
} from "@/lib/site-content-config-v1";

describe("site content config v1", () => {
  it("accepts exactly five fixed sections ordered by sort order", () => {
    const parsed = siteContentConfigSchemaV1.parse(defaultSiteContentConfigV1);

    expect(parsed.sections.map((section) => section.key)).toEqual([
      "home",
      "about",
      "products",
      "advantages",
      "contact"
    ]);
  });

  it("accepts a complete non-default key ordering when the array follows sort order", () => {
    const draft = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(draft, "products").sortOrder = 0;
    getSectionConfigV1(draft, "home").sortOrder = 1;
    getSectionConfigV1(draft, "about").sortOrder = 2;
    draft.sections.sort((left, right) => left.sortOrder - right.sortOrder);

    const parsed = siteContentConfigSchemaV1.parse(draft);

    expect(parsed.sections.map((section) => section.key)).toEqual([
      "products", "home", "about", "advantages", "contact"
    ]);
    expect(validateSiteContentForSave(parsed)).toEqual([]);
  });

  it("rejects any attempt to disable a fixed section", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "products").enabled = false as never;

    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it("allows empty copy while a page is being previewed", () => {
    const draft = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(draft, "home").content.en.title = "";

    expect(siteContentConfigSchemaV1.parse(draft)).toEqual(draft);
  });

  it("reports the exact section, locale and field missing before save", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "home").content.en.title = "";

    expect(validateSiteContentForSave(invalid)).toContainEqual({
      section: "home",
      locale: "en",
      field: "title"
    });
  });

  it("rejects duplicate section sort orders", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "contact").sortOrder = 0;

    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it("rejects a layout outside the section whitelist", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "home").layout = "tabs-grid" as never;

    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it("rejects an advantage icon outside the whitelist", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "advantages").steps[0].icon = "rocket" as never;

    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it.each([0, 9])("rejects %i advantage steps", (count) => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    const advantages = getSectionConfigV1(invalid, "advantages");
    advantages.steps = Array.from({ length: count }, (_, index) => ({
      ...structuredClone(advantages.steps[0]),
      id: `step-${index}`,
      sortOrder: index
    }));

    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it.each([2, 4])("rejects an about section with %i facts", (count) => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    const about = getSectionConfigV1(invalid, "about");
    about.facts = Array.from({ length: count }, (_, index) => ({
      ...structuredClone(about.facts[0]),
      id: `fact-${index}`,
      sortOrder: index,
    }));

    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it("accepts 3000-character page text and rejects 3001 characters", () => {
    const boundary = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(boundary, "home").content.en.text = "x".repeat(3000);
    expect(siteContentConfigSchemaV1.safeParse(boundary).success).toBe(true);

    getSectionConfigV1(boundary, "home").content.en.text = "x".repeat(3001);
    expect(siteContentConfigSchemaV1.safeParse(boundary).success).toBe(false);
  });

  it("accepts a 60-character phone and rejects 61 characters", () => {
    const boundary = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(boundary, "contact").shared.phone = "1".repeat(60);
    expect(siteContentConfigSchemaV1.safeParse(boundary).success).toBe(true);

    getSectionConfigV1(boundary, "contact").shared.phone = "1".repeat(61);
    expect(siteContentConfigSchemaV1.safeParse(boundary).success).toBe(false);
  });

  it("requires an enabled product category before save", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "products").categories.forEach((category) => {
      category.enabled = false;
    });

    expect(validateSiteContentForSave(invalid)).toContainEqual({
      section: "products",
      field: "categories"
    });
  });

  it("requires strict trilingual category names and descriptions", () => {
    const valid = structuredClone(defaultSiteContentConfigV1);
    const category = getSectionConfigV1(valid, "products").categories[0];

    expect(category).toMatchObject({
      translations: {
        zh: { name: expect.any(String), description: expect.any(String) },
        en: { name: expect.any(String), description: expect.any(String) },
        ar: { name: expect.any(String), description: expect.any(String) }
      }
    });

    const missingTranslations = structuredClone(defaultSiteContentConfigV1);
    delete (getSectionConfigV1(missingTranslations, "products").categories[0] as unknown as {
      translations?: unknown;
    }).translations;
    expect(siteContentConfigSchemaV1.safeParse(missingTranslations).success).toBe(false);
  });

  it.each(["name", "description"] as const)(
    "reports an empty category translation %s before save",
    (field) => {
      const invalid = structuredClone(defaultSiteContentConfigV1);
      getSectionConfigV1(invalid, "products").categories[0].translations.ar[field] = "   ";

      expect(validateSiteContentForSave(invalid)).toContainEqual({
        section: "products",
        locale: "ar",
        field: `categories.0.translations.${field}`
      });
    }
  );

  it("accepts a dynamically added category with stable identity and reference count", () => {
    const draft = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(draft, "products").categories.push({
      id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa004",
      slug: "swimwear-pads",
      enabled: true,
      sortOrder: 2,
      productReferenceCount: 0,
      translations: {
        zh: { name: "泳装胸垫", description: "适用于泳装产品。" },
        en: { name: "Swimwear pads", description: "Designed for swimwear products." },
        ar: { name: "حشوات ملابس السباحة", description: "مصممة لمنتجات ملابس السباحة." }
      }
    });

    const parsed = siteContentConfigSchemaV1.safeParse(draft);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(getSectionConfigV1(parsed.data, "products")).toMatchObject({
      categories: expect.arrayContaining([
        expect.objectContaining({
          id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa004",
          slug: "swimwear-pads",
          productReferenceCount: 0
        })
      ])
    });
  });

  it("rejects non-UUID product category identities", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "products").categories[0].id = "temporary-category";

    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it("rejects duplicate category ids even when slug and sort order differ", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    const categories = getSectionConfigV1(invalid, "products").categories;
    categories[1].id = categories[0].id;

    expect(categories[0].slug).not.toBe(categories[1].slug);
    expect(categories[0].sortOrder).not.toBe(categories[1].sortOrder);
    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it.each(["not-an-email", "a..b@example.com"])("rejects invalid contact email %s", (email) => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "contact").shared.email = email;

    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });

  it("requires an introduction for the advantages section in every locale", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "advantages").content.en.description = " ";

    expect(validateSiteContentForSave(invalid)).toContainEqual({
      section: "advantages",
      locale: "en",
      field: "description"
    });
  });

  it("models localized company details and shared contact channels", () => {
    const contact = getSectionConfigV1(defaultSiteContentConfigV1, "contact");

    expect(contact.content.en).toMatchObject({
      companyName: expect.any(String),
      address: expect.any(String)
    });
    expect(contact.content.ar.address).not.toContain("安徽省");
    expect(contact.shared).toEqual({
      phone: expect.any(String),
      email: expect.any(String)
    });
    expect(contact.content.zh).not.toHaveProperty("phone");
    expect(contact.content.zh).not.toHaveProperty("email");
  });

  it.each(["phone", "email"] as const)("reports a missing shared contact %s", (field) => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "contact").shared[field] = " ";

    expect(validateSiteContentForSave(invalid)).toContainEqual({
      section: "contact",
      field: `shared.${field}`
    });
  });

  it("reports a missing image media reference before save", () => {
    const invalid = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(invalid, "about").media.image = "";

    expect(validateSiteContentForSave(invalid)).toContainEqual({
      section: "about",
      field: "media.image"
    });
  });

  it("models the persisted media id explicitly and rejects malformed ids", () => {
    const valid = structuredClone(defaultSiteContentConfigV1);
    expect(getSectionConfigV1(valid, "home").media).toHaveProperty("mediaId", null);
    expect(getSectionConfigV1(valid, "about").media).toHaveProperty("mediaId", null);

    const invalid = structuredClone(defaultSiteContentConfigV1);
    Object.assign(getSectionConfigV1(invalid, "home").media, { mediaId: "not-a-uuid" });
    expect(siteContentConfigSchemaV1.safeParse(invalid).success).toBe(false);
  });
});
