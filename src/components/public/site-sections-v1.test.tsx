import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageContentPreviewV1 } from "@/components/admin/page-content-preview-v1";
import { SiteSectionsV1 } from "@/components/public/site-sections-v1";
import {
  defaultSiteContentConfigV1,
  getSectionConfigV1,
  sectionLayoutOptionsV1,
  type SiteContentConfigV1,
  type SiteSectionKeyV1
} from "@/lib/site-content-config-v1";
import { sampleProducts } from "@/lib/site-content";

const previewChannelId = "11111111-1111-4111-8111-111111111111";

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  readonly close = vi.fn();
  readonly name: string;
  readonly postMessage = vi.fn();
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }
}

function reorderedConfigV1() {
  const config = structuredClone(defaultSiteContentConfigV1);
  const order: SiteSectionKeyV1[] = ["home", "products", "about", "advantages", "contact"];
  config.sections = order.map((key, sortOrder) => ({
    ...getSectionConfigV1(config, key),
    sortOrder
  })) as SiteContentConfigV1["sections"];
  getSectionConfigV1(config, "home").layout = "image-left";
  return config;
}

describe("SiteSectionsV1", () => {
  it("renders sections in persisted order with the selected layouts", () => {
    render(<SiteSectionsV1 config={reorderedConfigV1()} locale="en" productsByCategory={{}} />);

    expect(screen.getAllByTestId("site-section").map((node) => node.id)).toEqual([
      "home", "products", "about", "advantages", "contact"
    ]);
    expect(screen.getByTestId("section-home")).toHaveAttribute("data-layout", "image-left");
  });

  it("loads persisted remote section images directly in the browser", () => {
    const config = structuredClone(defaultSiteContentConfigV1);
    const home = getSectionConfigV1(config, "home");
    home.media.image =
      "https://project.supabase.co/storage/v1/object/public/media/site-content-v1/home/hero.png";

    render(<SiteSectionsV1 config={config} locale="zh" productsByCategory={{}} />);

    expect(within(screen.getByTestId("section-home")).getByAltText(home.media.alt.zh)).toHaveAttribute(
      "src",
      home.media.image
    );
  });

  it("provides a stable layout contract for all fifteen supported layouts", () => {
    const config = structuredClone(defaultSiteContentConfigV1);
    for (const [key, layouts] of Object.entries(sectionLayoutOptionsV1) as [SiteSectionKeyV1, readonly string[]][]) {
      for (const layout of layouts) {
        const section = getSectionConfigV1(config, key);
        section.layout = layout as typeof section.layout;
        const { unmount } = render(<SiteSectionsV1 config={config} locale="zh" productsByCategory={{}} />);
        expect(screen.getByTestId(`section-${key}`)).toHaveAttribute("data-layout", layout);
        unmount();
      }
    }
  });

  it("uses RTL direction and renders enabled persisted product categories", () => {
    const config = structuredClone(defaultSiteContentConfigV1);
    getSectionConfigV1(config, "products").categories[1].enabled = false;

    render(<SiteSectionsV1 config={config} locale="ar" productsByCategory={{}} />);

    expect(screen.getByTestId("site-sections")).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("section-contact")).toHaveClass("contact");
    const products = screen.getByTestId("section-products");
    expect(within(products).getByText("حشوات الصدر")).toBeInTheDocument();
    expect(within(products).queryByText("أكواب الصدر")).not.toBeInTheDocument();
  });

  it("keeps the published product catalog detail and inquiry interactions", async () => {
    const user = userEvent.setup();
    const config = structuredClone(defaultSiteContentConfigV1);
    const productsSection = getSectionConfigV1(config, "products");
    const category = productsSection.categories[0];
    const product = {
      ...structuredClone(sampleProducts[0]),
      categoryId: category.id,
      categorySlug: category.slug
    };

    render(<SiteSectionsV1
      config={config}
      locale="zh"
      productsByCategory={{ [category.id]: [product] }}
    />);

    await user.click(screen.getByRole("button", { name: new RegExp(category.translations.zh.name) }));
    await user.click(screen.getByRole("button", { name: `查看 ${product.translations.zh.name}` }));

    expect(screen.getByRole("heading", { name: product.translations.zh.name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "咨询该产品" })).toHaveAttribute("href", "#inquiry");
  });

  it("defines a dense mobile style contract independent of the browser viewport", () => {
    const css = readFileSync(resolve("src/components/public/site-sections-v1.module.css"), "utf8");

    expect(css).toContain('.sections[data-viewport="mobile"] .section { padding: 48px 20px; }');
    expect(css).toContain('.sections[data-viewport="mobile"] .section h1 { font-size: 42px; }');
    expect(css).toContain('.sections[data-viewport="mobile"] .section h2 { font-size: 32px; }');
    expect(css).toContain('.sections[data-viewport="mobile"] .lead { font-size: 16px; line-height: 1.65; }');
    expect(css).toContain('.sections[data-viewport="mobile"] .home,');
    expect(css).toContain('gap: 30px; grid-template-columns: 1fr; min-height: 0;');
  });
});

describe("PageContentPreviewV1", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeBroadcastChannel.instances = [];
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a missing-preview message when the one-time channel does not respond", async () => {
    render(<PageContentPreviewV1 channelId={previewChannelId} timeoutMs={10} />);
    expect(FakeBroadcastChannel.instances[0].postMessage).toHaveBeenCalledWith({ type: "ready" });

    await act(() => vi.advanceTimersByTimeAsync(10));

    expect(screen.getByText("没有可预览的未保存内容")).toBeInTheDocument();
    expect(FakeBroadcastChannel.instances[0].close).toHaveBeenCalledOnce();
  });

  it("rejects a non-UUID channel identifier without opening a broadcast channel", () => {
    render(<PageContentPreviewV1 channelId="expired-channel" timeoutMs={10} />);

    expect(screen.getByText("没有可预览的未保存内容")).toBeInTheDocument();
    expect(FakeBroadcastChannel.instances).toHaveLength(0);
  });

  it("ignores invalid payloads and accepts one schema-valid config", async () => {
    render(<PageContentPreviewV1 channelId={previewChannelId} timeoutMs={5000} />);
    const channel = FakeBroadcastChannel.instances[0];

    act(() => channel.onmessage?.({ data: { type: "config", payload: { sections: [] } } } as MessageEvent));
    expect(screen.getByText("正在读取未保存的页面配置…")).toBeInTheDocument();

    act(() => channel.onmessage?.({
      data: { type: "config", payload: structuredClone(defaultSiteContentConfigV1) }
    } as MessageEvent));

    expect(screen.getByRole("heading", { name: /贴近身体的柔软/ })).toBeInTheDocument();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it("switches locale and preview viewport after receiving the config", async () => {
    render(<PageContentPreviewV1
      channelId={previewChannelId}
      productsByCategory={{ "bra-pads": [sampleProducts[0]] }}
    />);
    const channel = FakeBroadcastChannel.instances[0];
    act(() => channel.onmessage?.({
      data: { type: "config", payload: structuredClone(defaultSiteContentConfigV1) }
    } as MessageEvent));

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "移动端" }));

    expect(screen.getByRole("heading", { name: /Softness close to the body/ })).toBeInTheDocument();
    expect(screen.getByTestId("page-content-preview-frame")).toHaveAttribute("data-viewport", "mobile");
    expect(screen.getByTestId("site-sections")).toHaveAttribute("data-viewport", "mobile");
    fireEvent.click(screen.getByRole("button", {
      name: new RegExp(getSectionConfigV1(defaultSiteContentConfigV1, "products").categories[0].translations.en.name)
    }));
    expect(screen.getByText(sampleProducts[0].translations.en.name)).toBeInTheDocument();
  });
});
