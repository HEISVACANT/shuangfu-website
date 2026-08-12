import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultSiteContentConfigV1,
  getSectionConfigV1,
  type SiteContentConfigV1,
  type SiteSectionKeyV1
} from "@/lib/site-content-config-v1";

const mocks = vi.hoisted(() => ({
  getSiteContentConfigV1: vi.fn(),
  listPublishedCatalogForSiteV2: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not found");
  })
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  usePathname: () => "/en",
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/site-content-repository-v1", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/site-content-repository-v1")>(),
  getSiteContentConfigV1: mocks.getSiteContentConfigV1
}));

vi.mock("@/lib/products-repository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/products-repository")>();
  return {
    ...original,
    listPublishedCatalogForSiteV2: mocks.listPublishedCatalogForSiteV2
  };
});

import HomePage, { generateMetadata } from "@/app/[locale]/page";

function configuredSiteV1() {
  const config = structuredClone(defaultSiteContentConfigV1);
  const order: SiteSectionKeyV1[] = ["home", "contact", "products", "about", "advantages"];
  config.sections = order.map((key, sortOrder) => ({
    ...getSectionConfigV1(config, key),
    sortOrder
  })) as SiteContentConfigV1["sections"];
  getSectionConfigV1(config, "home").layout = "centered";
  getSectionConfigV1(config, "home").content.en.title = "CMS English headline";
  getSectionConfigV1(config, "home").content.en.text = "CMS English description";
  const contact = getSectionConfigV1(config, "contact");
  contact.layout = "stacked";
  contact.content.en.companyName = "CMS Company Limited";
  contact.content.en.address = "CMS address";
  contact.shared.phone = "+86 123 4567";
  contact.shared.email = "cms@example.com";
  return config;
}

describe("public site CMS assembly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSiteContentConfigV1.mockResolvedValue({
      config: configuredSiteV1(),
      baseline: { sections: [] },
      source: "supabase"
    });
    mocks.listPublishedCatalogForSiteV2.mockResolvedValue([]);
  });

  it("renders repository content, persisted order, navigation and contact current source", async () => {
    render(await HomePage({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "CMS English headline" })).toBeInTheDocument();
    expect(screen.getAllByTestId("site-section").map((node) => node.id)).toEqual([
      "home", "contact", "products", "about", "advantages"
    ]);
    expect(screen.getByTestId("section-home")).toHaveAttribute("data-layout", "centered");
    expect(screen.getByTestId("section-contact")).toHaveAttribute("data-layout", "stacked");

    const navigation = screen.getByRole("navigation");
    expect(within(navigation).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "#contact", "#products", "#about", "#advantages"
    ]);
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Contact", "Products", "Company", "Advantages"
    ]);
    expect(screen.getByText("CMS Company Limited")).toBeInTheDocument();
    expect(within(document.querySelector("footer")!).getByText(/CMS Company Limited/)).toBeInTheDocument();
    expect(screen.getByText("CMS address")).toBeInTheDocument();
    expect(screen.getByText("+86 123 4567")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("cms@example.com")).toHaveAttribute("dir", "ltr");

    const organization = JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(organization).toMatchObject({
      name: "CMS Company Limited",
      email: "cms@example.com",
      telephone: "+86 123 4567",
      address: { streetAddress: "CMS address" }
    });
    expect(mocks.getSiteContentConfigV1).toHaveBeenCalledOnce();
    expect(mocks.listPublishedCatalogForSiteV2).toHaveBeenCalledWith("en");
  });

  it("derives metadata and social image from the current CMS configuration", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });

    expect(metadata.title).toEqual({ absolute: "CMS English headline | CMS Company Limited" });
    expect(metadata.description).toBe("CMS English description");
    expect(metadata.alternates).toEqual({
      canonical: "http://localhost:3000/en",
      languages: {
        "zh-CN": "http://localhost:3000/zh",
        en: "http://localhost:3000/en",
        ar: "http://localhost:3000/ar",
        "x-default": "http://localhost:3000/en"
      }
    });
    expect(metadata.openGraph).toMatchObject({
      title: "CMS English headline | CMS Company Limited",
      description: "CMS English description",
      images: ["/images/hero-products-placeholder-v1.png"]
    });
  });

  it("still renders all five sections when the catalog is empty", async () => {
    mocks.listPublishedCatalogForSiteV2.mockResolvedValue([]);

    render(await HomePage({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getAllByTestId("site-section").map((node) => node.id).toSorted()).toEqual([
      "about", "advantages", "contact", "home", "products"
    ]);
  });
});
