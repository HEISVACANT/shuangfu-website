import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listPublishedProductCatalogMock } = vi.hoisted(() => ({
  listPublishedProductCatalogMock: vi.fn()
}));

vi.mock("@/lib/products-repository", () => ({
  listPublishedProductCatalog: listPublishedProductCatalogMock
}));

vi.mock("@/components/admin/page-content-preview-v1", () => ({
  PageContentPreviewV1: ({
    channelId,
    productsByCategory
  }: {
    channelId: string;
    productsByCategory: Record<string, Array<{ translations: { en: { name: string } } }>>;
  }) => (
    <div data-testid="preview-consumer">
      <span>{channelId}</span>
      <span>{productsByCategory["b8c8fe47-2268-4f88-bf2a-3d751c2fa001"]?.[0]?.translations.en.name}</span>
      <span>{productsByCategory["bra-pads"]?.[0]?.translations.en.name}</span>
    </div>
  )
}));

import PageContentPreviewPage from "@/app/admin/(dashboard)/pages/preview/page";
import { sampleProducts } from "@/lib/site-content";

describe("page content preview route", () => {
  beforeEach(() => {
    listPublishedProductCatalogMock.mockReset();
  });

  it("loads published products server-side and groups compatible category identities", async () => {
    const product = {
      ...structuredClone(sampleProducts[0]),
      categoryId: "b8c8fe47-2268-4f88-bf2a-3d751c2fa001",
      categorySlug: "bra-pads"
    };
    listPublishedProductCatalogMock.mockResolvedValue([product]);

    render(await PageContentPreviewPage({
      searchParams: Promise.resolve({ channel: "11111111-1111-4111-8111-111111111111" })
    }));

    expect(listPublishedProductCatalogMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(product.translations.en.name)).toHaveLength(2);
    expect(screen.getByText("11111111-1111-4111-8111-111111111111")).toBeInTheDocument();
  });

  it("does not query products for an invalid channel id", async () => {
    render(await PageContentPreviewPage({
      searchParams: Promise.resolve({ channel: "not-a-channel" })
    }));

    expect(listPublishedProductCatalogMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("preview-consumer")).toBeInTheDocument();
    expect(screen.getByText("not-a-channel")).toBeInTheDocument();
  });

  it("still mounts the preview consumer with no products when product reads fail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    listPublishedProductCatalogMock.mockRejectedValue(new Error("database unavailable"));

    render(await PageContentPreviewPage({
      searchParams: Promise.resolve({ channel: "11111111-1111-4111-8111-111111111111" })
    }));

    expect(listPublishedProductCatalogMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("preview-consumer")).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith("page_content_preview_products_read_failed");
    errorSpy.mockRestore();
  });
});
