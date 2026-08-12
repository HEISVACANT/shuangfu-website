import { z } from "zod";

import { locales, type Locale } from "@/lib/i18n";

export const sectionKeysV1 = ["home", "about", "products", "advantages", "contact"] as const;
export const advantageIconKeysV1 = ["layers", "drafting", "package", "message", "quality", "design"] as const;

export const sectionLayoutOptionsV1 = {
  home: ["text-left", "image-left", "centered"],
  about: ["text-left", "image-left", "stacked"],
  products: ["tabs-grid", "accordion", "featured-grid"],
  advantages: ["cards", "two-column", "timeline"],
  contact: ["info-left", "form-left", "stacked"]
} as const;

export type SiteSectionKeyV1 = (typeof sectionKeysV1)[number];

const pageContentTextSchemaV1 = z.string().max(3000);

const localizedTextSchemaV1 = z.object({
  zh: pageContentTextSchemaV1,
  en: pageContentTextSchemaV1,
  ar: pageContentTextSchemaV1
}).strict();

const mediaSchemaV1 = z.object({
  mediaId: z.uuid().nullable(),
  image: pageContentTextSchemaV1,
  alt: localizedTextSchemaV1
}).strict();

const sortOrderSchemaV1 = z.number().int().nonnegative();
const emailPatternV1 = /^[A-Za-z0-9!#$%&'*+/=?^_{}|~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_{}|~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const emailSchemaV1 = z.string().max(254).refine(
  (value) => value.trim() === "" || emailPatternV1.test(value),
  "Invalid email address"
);

const homeSectionSchemaV1 = z.object({
  key: z.literal("home"),
  enabled: z.literal(true),
  sortOrder: sortOrderSchemaV1,
  layout: z.enum(sectionLayoutOptionsV1.home),
  content: z.object({
    zh: z.object({
      companyShort: pageContentTextSchemaV1,
      nav: z.array(pageContentTextSchemaV1).length(4),
      eyebrow: pageContentTextSchemaV1,
      title: pageContentTextSchemaV1,
      text: pageContentTextSchemaV1,
      cta: pageContentTextSchemaV1,
      contactCta: pageContentTextSchemaV1
    }).strict(),
    en: z.object({
      companyShort: pageContentTextSchemaV1,
      nav: z.array(pageContentTextSchemaV1).length(4),
      eyebrow: pageContentTextSchemaV1,
      title: pageContentTextSchemaV1,
      text: pageContentTextSchemaV1,
      cta: pageContentTextSchemaV1,
      contactCta: pageContentTextSchemaV1
    }).strict(),
    ar: z.object({
      companyShort: pageContentTextSchemaV1,
      nav: z.array(pageContentTextSchemaV1).length(4),
      eyebrow: pageContentTextSchemaV1,
      title: pageContentTextSchemaV1,
      text: pageContentTextSchemaV1,
      cta: pageContentTextSchemaV1,
      contactCta: pageContentTextSchemaV1
    }).strict()
  }).strict(),
  media: mediaSchemaV1
}).strict();

const aboutFactSchemaV1 = z.object({
  id: pageContentTextSchemaV1.min(1),
  sortOrder: sortOrderSchemaV1,
  value: localizedTextSchemaV1,
  label: localizedTextSchemaV1
}).strict();

const aboutSectionSchemaV1 = z.object({
  key: z.literal("about"),
  enabled: z.literal(true),
  sortOrder: sortOrderSchemaV1,
  layout: z.enum(sectionLayoutOptionsV1.about),
  content: z.object({
    zh: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, text: pageContentTextSchemaV1 }).strict(),
    en: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, text: pageContentTextSchemaV1 }).strict(),
    ar: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, text: pageContentTextSchemaV1 }).strict()
  }).strict(),
  facts: z.array(aboutFactSchemaV1).length(3),
  media: mediaSchemaV1
}).strict().superRefine((section, context) => {
  validateUniqueSortOrdersV1(section.facts, context, ["facts"]);
});

const productCategorySchemaV1 = z.object({
  id: z.uuid(),
  slug: pageContentTextSchemaV1.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  enabled: z.boolean(),
  sortOrder: sortOrderSchemaV1,
  productReferenceCount: z.number().int().nonnegative(),
  translations: z.object({
    zh: z.object({ name: pageContentTextSchemaV1, description: pageContentTextSchemaV1 }).strict(),
    en: z.object({ name: pageContentTextSchemaV1, description: pageContentTextSchemaV1 }).strict(),
    ar: z.object({ name: pageContentTextSchemaV1, description: pageContentTextSchemaV1 }).strict()
  }).strict()
}).strict();

export type ProductCategoryV1 = z.infer<typeof productCategorySchemaV1>;

const productsSectionSchemaV1 = z.object({
  key: z.literal("products"),
  enabled: z.literal(true),
  sortOrder: sortOrderSchemaV1,
  layout: z.enum(sectionLayoutOptionsV1.products),
  content: z.object({
    zh: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, text: pageContentTextSchemaV1 }).strict(),
    en: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, text: pageContentTextSchemaV1 }).strict(),
    ar: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, text: pageContentTextSchemaV1 }).strict()
  }).strict(),
  categories: z.array(productCategorySchemaV1).min(1)
}).strict().superRefine((section, context) => {
  validateUniqueSortOrdersV1(section.categories, context, ["categories"]);
  validateUniqueValuesV1(section.categories.map((category) => category.id), context, ["categories"]);
  validateUniqueValuesV1(section.categories.map((category) => category.slug), context, ["categories"]);
});

const advantageStepSchemaV1 = z.object({
  id: pageContentTextSchemaV1.min(1),
  sortOrder: sortOrderSchemaV1,
  icon: z.enum(advantageIconKeysV1),
  title: localizedTextSchemaV1,
  text: localizedTextSchemaV1
}).strict();

const advantagesSectionSchemaV1 = z.object({
  key: z.literal("advantages"),
  enabled: z.literal(true),
  sortOrder: sortOrderSchemaV1,
  layout: z.enum(sectionLayoutOptionsV1.advantages),
  content: z.object({
    zh: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, description: pageContentTextSchemaV1 }).strict(),
    en: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, description: pageContentTextSchemaV1 }).strict(),
    ar: z.object({ eyebrow: pageContentTextSchemaV1, title: pageContentTextSchemaV1, description: pageContentTextSchemaV1 }).strict()
  }).strict(),
  steps: z.array(advantageStepSchemaV1).min(1).max(8)
}).strict().superRefine((section, context) => {
  validateUniqueSortOrdersV1(section.steps, context, ["steps"]);
  validateUniqueValuesV1(section.steps.map((step) => step.id), context, ["steps"]);
});

const contactContentSchemaV1 = z.object({
  eyebrow: pageContentTextSchemaV1,
  title: pageContentTextSchemaV1,
  companyName: pageContentTextSchemaV1,
  address: pageContentTextSchemaV1
}).strict();

const contactSharedSchemaV1 = z.object({
  phone: z.string().max(60),
  email: emailSchemaV1
}).strict();

const contactSectionSchemaV1 = z.object({
  key: z.literal("contact"),
  enabled: z.literal(true),
  sortOrder: sortOrderSchemaV1,
  layout: z.enum(sectionLayoutOptionsV1.contact),
  content: z.object({
    zh: contactContentSchemaV1,
    en: contactContentSchemaV1,
    ar: contactContentSchemaV1
  }).strict(),
  shared: contactSharedSchemaV1
}).strict();

export const siteSectionSchemaV1 = z.discriminatedUnion("key", [
  homeSectionSchemaV1,
  aboutSectionSchemaV1,
  productsSectionSchemaV1,
  advantagesSectionSchemaV1,
  contactSectionSchemaV1
]);

export type SiteSectionV1 = z.infer<typeof siteSectionSchemaV1>;

export const siteContentConfigSchemaV1 = z.object({
  sections: z.array(siteSectionSchemaV1).length(sectionKeysV1.length)
}).strict().superRefine((config, context) => {
  const sectionKeys = new Set(config.sections.map((section) => section.key));
  const sortOrders = new Set(config.sections.map((section) => section.sortOrder));
  config.sections.forEach((section, index) => {
    if (index > 0 && section.sortOrder <= config.sections[index - 1].sortOrder) {
      context.addIssue({
        code: "custom",
        message: "Sections must be ordered by sort order",
        path: ["sections", index, "sortOrder"]
      });
    }
  });
  sectionKeysV1.forEach((key) => {
    if (!sectionKeys.has(key)) {
      context.addIssue({ code: "custom", message: `Missing section ${key}`, path: ["sections"] });
    }
  });
  for (let sortOrder = 0; sortOrder < sectionKeysV1.length; sortOrder += 1) {
    if (!sortOrders.has(sortOrder)) {
      context.addIssue({ code: "custom", message: `Missing sort order ${sortOrder}`, path: ["sections"] });
    }
  }
  if (sectionKeys.size !== sectionKeysV1.length) {
    context.addIssue({ code: "custom", message: "Section keys must be unique", path: ["sections"] });
  }
  if (sortOrders.size !== sectionKeysV1.length) {
    context.addIssue({ code: "custom", message: "Sort orders must be unique", path: ["sections"] });
  }
});

export type SiteContentConfigV1 = z.infer<typeof siteContentConfigSchemaV1>;

export interface MissingContentFieldV1 {
  section: SiteSectionKeyV1;
  locale?: Locale;
  field: string;
}

export function getSectionConfigV1<K extends SiteSectionKeyV1>(
  config: SiteContentConfigV1,
  key: K
): Extract<SiteSectionV1, { key: K }> {
  return config.sections.find(
    (section): section is Extract<SiteSectionV1, { key: K }> => section.key === key
  )!;
}

export function validateSiteContentForSave(config: SiteContentConfigV1): MissingContentFieldV1[] {
  return collectMissingRequiredFieldsV1(siteContentConfigSchemaV1.parse(config));
}

export const defaultSiteContentConfigV1: SiteContentConfigV1 = {
  sections: [
    {
      key: "home",
      enabled: true,
      sortOrder: 0,
      layout: "text-left",
      content: {
        zh: {
          companyShort: "双芙辅料",
          nav: ["企业介绍", "产品介绍", "合作优势", "联系我们"],
          eyebrow: "LINGERIE COMPONENTS · SINCE 2021",
          title: "贴近身体的柔软，\n始于看不见的工艺。",
          text: "专注胸垫、罩杯及服装服饰辅料制造，为品牌与制造商提供稳定、灵活且可持续迭代的产品支持。",
          cta: "探索产品",
          contactCta: "洽谈合作"
        },
        en: {
          companyShort: "Shuangfu Components",
          nav: ["Company", "Products", "Advantages", "Contact"],
          eyebrow: "LINGERIE COMPONENTS · SINCE 2021",
          title: "Softness close to the body\nbegins with unseen craft.",
          text: "Focused on bra pads, cups and apparel components, supporting brands and manufacturers with stable, flexible product development.",
          cta: "Explore products",
          contactCta: "Start a conversation"
        },
        ar: {
          companyShort: "شوانغفو للمستلزمات",
          nav: ["عن الشركة", "المنتجات", "مزايا التعاون", "اتصل بنا"],
          eyebrow: "مكونات الملابس الداخلية · منذ 2021",
          title: "النعومة القريبة من الجسم\nتبدأ بحرفة لا تُرى.",
          text: "نتخصص في حشوات الصدر والكؤوس ومستلزمات الملابس، وندعم العلامات والمصنعين بتطوير مرن وإنتاج مستقر.",
          cta: "استكشف المنتجات",
          contactCta: "ابدأ التعاون"
        }
      },
      media: {
        mediaId: null,
        image: "/images/hero-products-placeholder-v1.png",
        alt: {
          zh: "当前图片与产品内容为设计占位，正式发布前将替换为公司确认素材。",
          en: "Images and product content are design placeholders and must be replaced with company-approved materials before launch.",
          ar: "الصور ومحتوى المنتجات عناصر تصميم مؤقتة ويجب استبدالها بمواد معتمدة من الشركة قبل الإطلاق."
        }
      }
    },
    {
      key: "about",
      enabled: true,
      sortOrder: 1,
      layout: "text-left",
      content: {
        zh: {
          eyebrow: "ABOUT SHUANGFU",
          title: "以稳定制造，承接每一次贴身创意",
          text: "六安市双芙服装辅料有限公司成立于 2021 年，位于安徽六安。我们围绕胸垫、罩杯与相关辅料，提供从选型、打样到批量生产的协作支持。"
        },
        en: {
          eyebrow: "ABOUT SHUANGFU",
          title: "Reliable manufacturing for ideas worn close",
          text: "Founded in 2021 in Lu'an, Anhui, Shuangfu focuses on bra pads, cups and related apparel components, supporting selection, sampling and volume production."
        },
        ar: {
          eyebrow: "عن شوانغفو",
          title: "تصنيع موثوق لكل فكرة مريحة",
          text: "تأسست شركة شوانغفو في عام 2021 في ليوآن، آنهوي. نركز على الحشوات والكؤوس ومستلزمات الملابس ذات الصلة، من اختيار المنتج والعينات إلى الإنتاج الكمي."
        }
      },
      facts: [
        {
          id: "founded",
          sortOrder: 0,
          value: { zh: "2021", en: "2021", ar: "2021" },
          label: { zh: "成立年份", en: "Founded", ar: "سنة التأسيس" }
        },
        {
          id: "services",
          sortOrder: 1,
          value: { zh: "3", en: "3", ar: "3" },
          label: { zh: "核心服务方向", en: "Core services", ar: "مجالات الخدمة" }
        },
        {
          id: "development",
          sortOrder: 2,
          value: { zh: "多规格", en: "Flexible", ar: "مرنة" },
          label: { zh: "灵活开发能力", en: "Development capability", ar: "قدرة التطوير" }
        }
      ],
      media: {
        mediaId: null,
        image: "/images/company-craft-placeholder-v1.png",
        alt: {
          zh: "当前图片与产品内容为设计占位，正式发布前将替换为公司确认素材。",
          en: "Images and product content are design placeholders and must be replaced with company-approved materials before launch.",
          ar: "الصور ومحتوى المنتجات عناصر تصميم مؤقتة ويجب استبدالها بمواد معتمدة من الشركة قبل الإطلاق."
        }
      }
    },
    {
      key: "products",
      enabled: true,
      sortOrder: 2,
      layout: "tabs-grid",
      content: {
        zh: {
          eyebrow: "PRODUCTS",
          title: "从基础结构到定制开发",
          text: "点击类目查看产品图片、介绍和尺寸规格；每件产品均可直接带入合作咨询。"
        },
        en: {
          eyebrow: "PRODUCTS",
          title: "From essential structures to custom development",
          text: "Open a category to browse images, descriptions and size specifications, then attach any product to an inquiry."
        },
        ar: {
          eyebrow: "المنتجات",
          title: "من البنية الأساسية إلى التطوير المخصص",
          text: "افتح الفئة لمشاهدة الصور والوصف ومواصفات المقاس، ثم أرفق المنتج بالاستفسار."
        }
      },
      categories: [
        {
          id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001",
          slug: "bra-pads",
          enabled: true,
          sortOrder: 0,
          productReferenceCount: 14,
          translations: {
            zh: { name: "胸垫", description: "适用于文胸与贴身服饰的胸垫类产品。" },
            en: { name: "Bra pads", description: "Bra pad products for lingerie and close-fitting apparel." },
            ar: { name: "حشوات الصدر", description: "منتجات حشوات الصدر للملابس الداخلية والملابس الملاصقة للجسم." }
          }
        },
        {
          id: "b8c8fe47-2268-4f88-bf2a-3d751c2fa002",
          slug: "cups",
          enabled: true,
          sortOrder: 1,
          productReferenceCount: 14,
          translations: {
            zh: { name: "罩杯", description: "适用于内衣与服装结构的罩杯类产品。" },
            en: { name: "Cups", description: "Cup products for lingerie and structured apparel." },
            ar: { name: "أكواب الصدر", description: "منتجات أكواب الصدر للملابس الداخلية والملابس الهيكلية." }
          }
        }
      ]
    },
    {
      key: "advantages",
      enabled: true,
      sortOrder: 3,
      layout: "cards",
      content: {
        zh: { eyebrow: "WHY SHUANGFU", title: "把复杂的开发过程，变成可靠的协作", description: "从选型、打样到批量生产，以清晰沟通和稳定制造支持每一次合作。" },
        en: { eyebrow: "WHY SHUANGFU", title: "Turning complex development into dependable collaboration", description: "From selection and sampling to volume production, clear communication and reliable manufacturing support every collaboration." },
        ar: { eyebrow: "لماذا شوانغفو", title: "نحوّل التطوير المعقد إلى تعاون موثوق", description: "من الاختيار وإعداد العينات إلى الإنتاج الكمي، ندعم كل تعاون بتواصل واضح وتصنيع موثوق." }
      },
      steps: [
        {
          id: "focused-expertise",
          sortOrder: 0,
          icon: "layers",
          title: { zh: "专注品类", en: "Focused expertise", ar: "خبرة متخصصة" },
          text: {
            zh: "围绕胸垫、罩杯与贴身服饰辅料积累制造经验。",
            en: "Manufacturing experience centered on bra pads, cups and intimate-apparel components.",
            ar: "خبرة تصنيع تركز على الحشوات والكؤوس ومستلزمات الملابس الداخلية."
          }
        },
        {
          id: "flexible-sampling",
          sortOrder: 1,
          icon: "drafting",
          title: { zh: "灵活打样", en: "Flexible sampling", ar: "عينات مرنة" },
          text: {
            zh: "按结构、尺寸、厚度、面料与颜色协同开发。",
            en: "Collaborative development across structure, sizing, thickness, fabric and color.",
            ar: "تطوير تعاوني للبنية والمقاس والسماكة والقماش واللون."
          }
        },
        {
          id: "stable-delivery",
          sortOrder: 2,
          icon: "package",
          title: { zh: "稳定交付", en: "Stable delivery", ar: "تسليم مستقر" },
          text: {
            zh: "以明确规格和过程沟通支持持续生产。",
            en: "Clear specifications and process communication for ongoing production.",
            ar: "مواصفات واضحة وتواصل مستمر لدعم الإنتاج."
          }
        },
        {
          id: "responsive-service",
          sortOrder: 3,
          icon: "message",
          title: { zh: "快速响应", en: "Responsive service", ar: "استجابة سريعة" },
          text: {
            zh: "从产品咨询到开发确认，保持直接、清晰的沟通。",
            en: "Direct communication from first inquiry through development confirmation.",
            ar: "تواصل مباشر من الاستفسار الأول حتى تأكيد التطوير."
          }
        }
      ]
    },
    {
      key: "contact",
      enabled: true,
      sortOrder: 4,
      layout: "info-left",
      content: {
        zh: {
          eyebrow: "CONTACT",
          title: "从一个样品需求开始合作",
          companyName: "六安市双芙服装辅料有限公司",
          address: "安徽省六安市裕安区新安镇陈集村三棵松组"
        },
        en: {
          eyebrow: "CONTACT",
          title: "Start with a sample request",
          companyName: "Lu'an Shuangfu Garment Accessories Co., Ltd.",
          address: "Sankesong Group, Chenji Village, Xin'an Town, Yu'an District, Lu'an, Anhui, China"
        },
        ar: {
          eyebrow: "اتصل بنا",
          title: "ابدأ بطلب عينة",
          companyName: "شركة ليوآن شوانغفو لمستلزمات الملابس المحدودة",
          address: "مجموعة سانكيسونغ، قرية تشنجي، بلدة شينآن، حي يوآن، ليوآن، آنهوي، الصين"
        }
      },
      shared: { phone: "155 0564 1268", email: "15505641268@139.com" }
    }
  ]
};

function validateUniqueSortOrdersV1(
  values: Array<{ sortOrder: number }>,
  context: z.RefinementCtx,
  path: (string | number)[]
) {
  const seen = new Set<number>();
  values.forEach((value, index) => {
    if (seen.has(value.sortOrder)) {
      context.addIssue({
        code: "custom",
        message: "Sort orders must be unique",
        path: [...path, index, "sortOrder"]
      });
    }
    seen.add(value.sortOrder);
  });
}

function validateUniqueValuesV1(
  values: string[],
  context: z.RefinementCtx,
  path: (string | number)[]
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        message: "Values must be unique",
        path: [...path, index]
      });
    }
    seen.add(value);
  });
}

function collectMissingRequiredFieldsV1(config: SiteContentConfigV1): MissingContentFieldV1[] {
  const missing: MissingContentFieldV1[] = [];
  const home = getSectionConfigV1(config, "home");
  const about = getSectionConfigV1(config, "about");
  const products = getSectionConfigV1(config, "products");
  const advantages = getSectionConfigV1(config, "advantages");
  const contact = getSectionConfigV1(config, "contact");

  collectLocalizedFieldsV1(missing, "home", home.content, ["companyShort", "eyebrow", "title", "text", "cta", "contactCta"]);
  collectLocalizedArrayFieldsV1(missing, "home", home.content, "nav");
  collectMediaFieldsV1(missing, "home", home.media);

  collectLocalizedFieldsV1(missing, "about", about.content, ["eyebrow", "title", "text"]);
  about.facts.forEach((fact, index) => {
    collectLocalizedTextV1(missing, "about", fact.value, `facts.${index}.value`);
    collectLocalizedTextV1(missing, "about", fact.label, `facts.${index}.label`);
  });
  collectMediaFieldsV1(missing, "about", about.media);

  collectLocalizedFieldsV1(missing, "products", products.content, ["eyebrow", "title", "text"]);
  if (!products.categories.some((category) => category.enabled)) {
    missing.push({ section: "products", field: "categories" });
  }
  products.categories.forEach((category, index) => {
    locales.forEach((locale) => {
      (["name", "description"] as const).forEach((field) => {
        if (isMissingV1(category.translations[locale][field])) {
          missing.push({
            section: "products",
            locale,
            field: `categories.${index}.translations.${field}`
          });
        }
      });
    });
  });

  collectLocalizedFieldsV1(missing, "advantages", advantages.content, ["eyebrow", "title", "description"]);
  advantages.steps.forEach((step, index) => {
    collectLocalizedTextV1(missing, "advantages", step.title, `steps.${index}.title`);
    collectLocalizedTextV1(missing, "advantages", step.text, `steps.${index}.text`);
  });

  collectLocalizedFieldsV1(missing, "contact", contact.content, ["eyebrow", "title", "companyName", "address"]);
  (["phone", "email"] as const).forEach((field) => {
    if (isMissingV1(contact.shared[field])) {
      missing.push({ section: "contact", field: `shared.${field}` });
    }
  });

  return missing;
}

function collectLocalizedFieldsV1(
  missing: MissingContentFieldV1[],
  section: SiteSectionKeyV1,
  content: Record<Locale, Record<string, string | string[]>>,
  fields: string[]
) {
  fields.forEach((field) => {
    locales.forEach((locale) => {
      const value = content[locale][field];
      if (typeof value !== "string" || isMissingV1(value)) {
        missing.push({ section, locale, field });
      }
    });
  });
}

function collectLocalizedArrayFieldsV1(
  missing: MissingContentFieldV1[],
  section: SiteSectionKeyV1,
  content: Record<Locale, { nav: string[] }>,
  field: "nav"
) {
  locales.forEach((locale) => {
    const value = content[locale][field];
    if (value.length === 0 || value.some(isMissingV1)) {
      missing.push({ section, locale, field });
    }
  });
}

function collectMediaFieldsV1(
  missing: MissingContentFieldV1[],
  section: "home" | "about",
  media: { image: string; alt: Record<Locale, string> }
) {
  if (isMissingV1(media.image)) {
    missing.push({ section, field: "media.image" });
  }
  collectLocalizedTextV1(missing, section, media.alt, "media.alt");
}

function collectLocalizedTextV1(
  missing: MissingContentFieldV1[],
  section: SiteSectionKeyV1,
  content: Record<Locale, string>,
  field: string
) {
  locales.forEach((locale) => {
    if (isMissingV1(content[locale])) {
      missing.push({ section, locale, field });
    }
  });
}

function isMissingV1(value: string) {
  return value.trim().length === 0;
}
