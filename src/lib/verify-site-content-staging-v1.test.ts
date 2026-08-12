import { describe, expect, it } from "vitest";

import { defaultSiteContentConfigV1 } from "@/lib/site-content-config-v1";

// The verify CLI is an executable ESM artifact and intentionally has no TypeScript declarations.
// @ts-expect-error Runtime script module has no declaration file.
import { formatVerificationReportV1, resolveVerificationEnvironmentV1, verifySiteContentStagingV1 } from "../../scripts/verify-site-content-staging-v1.mjs";

const locales = ["zh", "en", "ar"] as const;
const homeMediaId = "30000000-0000-4000-8000-000000000001";
const aboutMediaId = "30000000-0000-4000-8000-000000000002";
const storagePaths = {
  home: "site-content-v1/home/hero-products-placeholder-v1.png",
  about: "site-content-v1/about/company-craft-placeholder-v1.png"
} as const;

function publicUrl(storagePath: string) {
  return `https://example.supabase.co/storage/v1/object/public/media/${storagePath}`;
}

function completeSections() {
  return structuredClone(defaultSiteContentConfigV1.sections).map((source) => {
    const key = source.key;
    const sortOrder = source.sortOrder;
    const persisted = source as unknown as Record<string, unknown>;
    delete persisted.key;
    delete persisted.sortOrder;
    delete persisted.layout;
    const mediaId = key === "home" ? homeMediaId : key === "about" ? aboutMediaId : null;
    let media = null;
    if (key === "home" || key === "about") {
      const contentMedia = persisted.media as Record<string, unknown>;
      delete contentMedia.mediaId;
      contentMedia.image = publicUrl(storagePaths[key]);
      media = { id: mediaId, storage_path: contentMedia.image, deleted_at: null };
    }
    if (key === "products") delete persisted.categories;
    return {
      key,
      sort_order: sortOrder,
      media_id: mediaId,
      media,
      content: persisted
    };
  });
}

function createVerifyClients({
  sections = completeSections(),
  aclPublicExecute = false,
  existingObjects = Object.values(storagePaths),
  adminTranslationsComplete = true,
  publicTranslationsComplete = true
}: {
  sections?: ReturnType<typeof completeSections>;
  aclPublicExecute?: boolean;
  existingObjects?: string[];
  adminTranslationsComplete?: boolean;
  publicTranslationsComplete?: boolean;
} = {}) {
  const categories = [{ id: "category-1", slug: "bra-pads", is_enabled: true }];
  const translations = locales.map((locale) => ({
    category_id: "category-1",
    locale,
    name: `name-${locale}`,
    description: adminTranslationsComplete || locale !== "zh" ? `description-${locale}` : ""
  }));
  const publicTranslations = publicTranslationsComplete ? translations : translations.slice(0, 2);
  const adminClient = {
    from: (table: string) => ({
      select: () => {
        if (table === "site_sections") return Promise.resolve({ data: sections, error: null });
        if (table === "product_category_translations") {
          return Promise.resolve({ data: translations, error: null });
        }
        if (table === "product_categories") {
          return { eq: async () => ({ data: categories, error: null }) };
        }
        throw new Error(`Unexpected admin table ${table}`);
      }
    }),
    storage: {
      from: () => ({
        list: async (folder: string) => ({
          data: existingObjects
            .filter((objectPath) => objectPath.startsWith(`${folder}/`))
            .map((objectPath) => ({ name: objectPath.slice(folder.length + 1) })),
          error: null
        }),
        getPublicUrl: (storagePath: string) => ({ data: { publicUrl: publicUrl(storagePath) } })
      })
    },
    rpc: async (name: string) => {
      if (name !== "verify_site_content_setup_v1") throw new Error(`Unexpected admin RPC ${name}`);
      return { data: aclPublicExecute, error: null };
    }
  };
  const publicClient = {
    from: (table: string) => ({
      select: () => {
        if (table === "site_sections") {
          return Promise.resolve({ data: sections.map(({ key }) => ({ key })), error: null });
        }
        if (table === "product_categories") return { eq: async () => ({ data: categories, error: null }) };
        if (table === "product_category_translations") {
          return Promise.resolve({ data: publicTranslations, error: null });
        }
        throw new Error(`Unexpected public table ${table}`);
      }
    }),
    rpc: async () => ({ data: null, error: { code: "42501", message: "forbidden inside function" } })
  };
  return { adminClient, publicClient };
}

describe("site content staging verification", () => {
  it("returns only bounded counts and booleans for a complete staging dataset", async () => {
    const report = await verifySiteContentStagingV1(createVerifyClients());
    expect(formatVerificationReportV1(report)).toEqual([
      "sections=5",
      "locales=zh,en,ar",
      "enabledCategories=1",
      "mediaReady=true",
      "publicRead=true",
      "saveFunctionPublicExecute=false"
    ]);
  });

  it("accepts any valid persisted ordering of the five fixed sections", async () => {
    const sections = completeSections();
    sections[0].sort_order = 1;
    sections[1].sort_order = 0;
    expect((await verifySiteContentStagingV1(createVerifyClients({ sections }))).sections).toBe(5);
  });

  it.each([
    ["home nav", (sections: ReturnType<typeof completeSections>) => {
      const home = sections.find((section) => section.key === "home")!;
      ((home.content.content as Record<string, Record<string, unknown>>).en.nav as string[]).pop();
    }],
    ["about facts", (sections: ReturnType<typeof completeSections>) => {
      sections.find((section) => section.key === "about")!.content.facts = [];
    }],
    ["products introduction", (sections: ReturnType<typeof completeSections>) => {
      const products = sections.find((section) => section.key === "products")!;
      (products.content.content as Record<string, Record<string, unknown>>).ar.text = " ";
    }],
    ["advantages steps", (sections: ReturnType<typeof completeSections>) => {
      sections.find((section) => section.key === "advantages")!.content.steps = [];
    }],
    ["contact shared fields", (sections: ReturnType<typeof completeSections>) => {
      const contact = sections.find((section) => section.key === "contact")!;
      (contact.content.shared as Record<string, unknown>).phone = "";
    }]
  ])("fails strict persisted contract validation for %s", async (_name, mutate) => {
    const sections = completeSections();
    mutate(sections);
    await expect(verifySiteContentStagingV1(createVerifyClients({ sections })))
      .rejects.toThrow(/section content contract/i);
  });

  it("rejects incomplete relational category translations", async () => {
    await expect(verifySiteContentStagingV1(createVerifyClients({
      adminTranslationsComplete: false
    }))).rejects.toThrow(/category translations/i);
  });

  it("rejects media row, content URL, or Storage object mismatches", async () => {
    const sections = completeSections();
    sections.find((section) => section.key === "home")!.media!.storage_path = "https://wrong.test/home.png";
    await expect(verifySiteContentStagingV1(createVerifyClients({ sections })))
      .rejects.toThrow(/seeded section media/i);
    await expect(verifySiteContentStagingV1(createVerifyClients({
      existingObjects: [storagePaths.home]
    }))).rejects.toThrow(/storage objects/i);
  });

  it("uses real ACL introspection and rejects the old internal-forbidden false positive", async () => {
    await expect(verifySiteContentStagingV1(createVerifyClients({ aclPublicExecute: true })))
      .rejects.toThrow(/public save function execute/i);
  });

  it("requires public three-language category translation reads", async () => {
    await expect(verifySiteContentStagingV1(createVerifyClients({ publicTranslationsComplete: false })))
      .rejects.toThrow(/public category translations/i);
  });

  it("falls back from blank preferred keys to trimmed legacy keys", () => {
    expect(resolveVerificationEnvironmentV1({
      NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co ",
      SUPABASE_SECRET_KEY: " ",
      SUPABASE_SERVICE_ROLE_KEY: " legacy-secret ",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "\t",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: " legacy-anon "
    })).toEqual({
      url: "https://example.supabase.co",
      secret: "legacy-secret",
      publishable: "legacy-anon"
    });
  });

  it("never formats injected key material or full content payloads", async () => {
    const secret = "secret-key-must-not-leak";
    const sections = completeSections();
    const report = await verifySiteContentStagingV1(createVerifyClients({ sections }));
    const output = formatVerificationReportV1(report, { ignoredKey: secret }).join("\n");
    expect(output).not.toContain(secret);
    expect(output).not.toContain(JSON.stringify(sections));
  });
});
